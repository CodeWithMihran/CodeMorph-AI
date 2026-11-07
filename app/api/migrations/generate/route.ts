import { GitHubApiError, isJsonRecord } from "@/lib/github/api";
import { inspectMigrationSource } from "@/lib/github/migration-source";
import type { RepositoryAnalysis } from "@/lib/github/analysis";
import { createMigrationPlan, type MigrationPlan } from "@/lib/migration/plan";
import { generateWithOpenAI, ModelError, type GeneratedFile } from "@/lib/migration/model";
import { containsCredentialPattern } from "@/lib/github/source";
import { createZip, type ZipEntry } from "@/lib/migration/zip";
import { validateGeneratedProject, type ValidationResult } from "@/lib/migration/validation";

const MAX_REQUEST_BYTES = 24_000;
const MAX_OUTPUT_FILES = 24;
const MAX_OUTPUT_FILE_BYTES = 40_000;
const MAX_OUTPUT_BYTES = 250_000;

async function readBody(request: Request): Promise<unknown> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) throw new GitHubApiError("The generation request is too large.", 413);
  if (!request.body) throw new GitHubApiError("Send the approved plan and repository profile.", 400);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_REQUEST_BYTES) {
        await reader.cancel();
        throw new GitHubApiError("The generation request is too large.", 413);
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown; }
  catch { throw new GitHubApiError("Send a valid JSON request.", 400); }
}

function validGeneratedPath(path: string) {
  if (path.length > 200 || path.startsWith("/") || path.includes("\\") || path.includes(":") || path.includes("\u0000")) return false;
  const segments = path.split("/");
  if (segments.some((part) => !part || part === "." || part === ".." || part.startsWith("."))) return false;
  if (!/^(?:app\/(?!api\/)[a-zA-Z0-9_./-]+|components\/[a-zA-Z0-9_./-]+)\.(?:tsx?|css)$/.test(path)) return false;
  if (["app/layout.tsx", "package.json", "tsconfig.json", "next.config.ts"].includes(path)) return false;
  return true;
}

function validateGeneratedFiles(value: unknown): GeneratedFile[] {
  if (!Array.isArray(value) || value.length < 2 || value.length > MAX_OUTPUT_FILES) {
    throw new ModelError("The model generated an incomplete or oversized file set. Try again with a smaller source.");
  }
  const files: GeneratedFile[] = [];
  const seen = new Set<string>();
  let totalBytes = 0;
  for (const item of value) {
    if (!isJsonRecord(item) || typeof item.path !== "string" || typeof item.content !== "string" || !validGeneratedPath(item.path)) {
      throw new ModelError("The model returned an invalid project file path. The output was blocked.");
    }
    if (seen.has(item.path)) throw new ModelError("The model returned duplicate project files. Try generating again.");
    if (Buffer.byteLength(item.content, "utf8") > MAX_OUTPUT_FILE_BYTES) throw new ModelError("A generated file exceeded the output size limit.");
    if (containsCredentialPattern(item.content)) throw new ModelError("The generated output contained a credential-like value and was blocked. Try again.");
    if (/\b(?:eval\s*\(|new\s+Function\s*\(|require\s*\(|from\s*["']node:|from\s*["'](?:child_process|fs|net|tls|http|https)["'])/i.test(item.content)) {
      throw new ModelError("The generated output used a blocked dynamic-code or operating-system API.");
    }
    totalBytes += Buffer.byteLength(item.content, "utf8");
    if (totalBytes > MAX_OUTPUT_BYTES) throw new ModelError("The generated project exceeded the total output size limit.");
    seen.add(item.path);
    files.push({ path: item.path, content: item.content });
  }
  if (!seen.has("app/page.tsx") || !seen.has("app/globals.css")) {
    throw new ModelError("The model did not return the required Next.js page and stylesheet. Try again.");
  }

  const available = new Set([...seen, "app/layout.tsx", "package.json", "tsconfig.json", "next.config.ts", ".gitignore", "README.md", "MIGRATION-REPORT.md"]);
  for (const file of files) {
    const imports = file.content.matchAll(/(?:from\s*|import\s*)["']([^"']+)["']/g);
    for (const match of imports) {
      const specifier = match[1];
      if (specifier === "react" || specifier === "react/jsx-runtime" || specifier === "next" || specifier.startsWith("next/")) continue;
      if (specifier.startsWith("@/components/")) {
        const stem = `components/${specifier.slice("@/components/".length)}`;
        if (![stem, `${stem}.tsx`, `${stem}.ts`, `${stem}.css`, `${stem}/index.tsx`, `${stem}/index.ts`].some((path) => available.has(path))) {
          throw new ModelError(`A generated file imports a component that was not included (${specifier}). Try generating again.`);
        }
        continue;
      }
      if (specifier.startsWith("./") || specifier.startsWith("../")) {
        const base = file.path.split("/").slice(0, -1).join("/");
        const stem = `${base}/${specifier}`.split("/").reduce<string[]>((segments, part) => {
          if (part === "..") segments.pop();
          else if (part !== "." && part) segments.push(part);
          return segments;
        }, []).join("/");
        if (![stem, `${stem}.tsx`, `${stem}.ts`, `${stem}.css`, `${stem}/index.tsx`, `${stem}/index.ts`].some((path) => available.has(path))) {
          throw new ModelError(`A generated file imports a file that was not included (${specifier}). Try generating again.`);
        }
        continue;
      }
      throw new ModelError(`The generated project requested an unsupported dependency (${specifier}). Try generating again.`);
    }
  }
  return files;
}

function scaffold(summary: string, goal: string): ZipEntry[] {
  const packageJson = {
    name: "stackshift-migrated-site",
    version: "0.1.0",
    private: true,
    scripts: { dev: "next dev", build: "next build", start: "next start" },
    dependencies: { next: "16.4.3", react: "19.3.0", "react-dom": "19.3.0" },
    devDependencies: { "@types/node": "^20", "@types/react": "^19", "@types/react-dom": "^19", typescript: "^5" },
  };
  return [
    { path: "package.json", content: `${JSON.stringify(packageJson, null, 2)}\n` },
    { path: "tsconfig.json", content: JSON.stringify({ compilerOptions: { target: "ES2017", lib: ["dom", "dom.iterable", "esnext"], allowJs: true, skipLibCheck: true, strict: true, noEmit: true, esModuleInterop: true, module: "esnext", moduleResolution: "bundler", resolveJsonModule: true, isolatedModules: true, jsx: "react-jsx", incremental: true, plugins: [{ name: "next" }], paths: { "@/*": ["./*"] } }, include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts", ".next/dev/types/**/*.ts", "**/*.mts"], exclude: ["node_modules"] }, null, 2) + "\n" },
    { path: "next.config.ts", content: 'import type { NextConfig } from "next";\n\nconst nextConfig: NextConfig = {};\n\nexport default nextConfig;\n' },
    { path: ".gitignore", content: "node_modules\n.next\n/out\n/build\n.env*\n*.tsbuildinfo\nnext-env.d.ts\n" },
    { path: "app/layout.tsx", content: 'import type { Metadata } from "next";\nimport type { ReactNode } from "react";\nimport "./globals.css";\n\nexport const metadata: Metadata = { title: "Migrated Website", description: "A website migration generated with StackShift." };\n\nexport default function RootLayout({ children }: { children: ReactNode }) {\n  return <html lang="en"><body>{children}</body></html>;\n}\n' },
    { path: "README.md", content: `# Migrated website\n\n${summary}\n\n## Run locally\n\n\`npm install\`\n\n\`npm run dev\`\n\n## Requested outcome\n\n${goal}\n\nSee MIGRATION-REPORT.md for what was generated and what remains unverified.\n` },
  ];
}

function migrationReport(input: { repository: string; commitSha: string; goal: string; summary: string; limitations: string[]; sourceFileCount: number; excludedFileCount: number; generatedFiles: GeneratedFile[]; validation: ValidationResult }) {
  const files = input.generatedFiles.map((file) => `- \`${file.path}\``).join("\n");
  const limitations = input.limitations.slice(0, 8).map((item) => `- ${item.replace(/[\r\n]/g, " ").slice(0, 300)}`).join("\n");
  const diagnostics = input.validation.diagnostics.map((line) => `- ${line}`).join("\n") || "- No worker diagnostics were returned.";
  return `# StackShift migration report\n\n- Source: ${input.repository}\n- Source commit: \`${input.commitSha}\`\n- Target: Next.js App Router + TypeScript\n- Source files provided to the model: ${input.sourceFileCount}\n- Additional eligible source files omitted by inspection limits: ${input.excludedFileCount}\n- Validation status: ${input.validation.status}\n- Production build: ${input.validation.build}\n- Root route HTTP check: ${input.validation.rootRoute}\n- Validation duration: ${input.validation.durationMs} ms\n\n## Requested outcome\n\n${input.goal}\n\n## Generation summary\n\n${input.summary.replace(/[\r\n]/g, " ").slice(0, 500)}\n\n## Generated files\n\n${files}\n\n## Validation result\n\n${input.validation.message}\n\n### Bounded diagnostics\n\n${diagnostics}\n\n## Limitations and manual work\n\n${limitations || "- Review the generated project and validation report before relying on it."}\n- Binary assets were not copied in this phase.\n- Build and route checks do not prove full feature parity or accessibility.\n- Check forms, links, responsive layouts, accessibility, and external service setup manually.\n`;
}

export async function POST(request: Request) {
  try {
    const body = await readBody(request);
    if (!isJsonRecord(body) || body.confirmed !== true || !isJsonRecord(body.analysis) || !isJsonRecord(body.analysis.repository) || !isJsonRecord(body.analysis.revision) || !isJsonRecord(body.analysis.profile) || !isJsonRecord(body.plan) || !isJsonRecord(body.plan.source)) {
      throw new GitHubApiError("Review the plan and inspect the repository before generating.", 400);
    }
    const analysis = body.analysis as unknown as RepositoryAnalysis;
    const plan = body.plan as unknown as MigrationPlan;
    if (typeof body.goal !== "string" || body.goal.trim().length < 8 || body.goal.length > 500) throw new GitHubApiError("Enter a migration goal between 8 and 500 characters.", 400);
    if (typeof analysis.repository.url !== "string" || typeof analysis.repository.fullName !== "string" || !/^[a-f\d]{40,64}$/i.test(analysis.revision.commitSha) || plan.planner !== "rules-based-v1" || plan.source.commitSha !== analysis.revision.commitSha || plan.source.repository !== analysis.repository.fullName || plan.target !== "Next.js App Router + TypeScript" || plan.requestedOutcome !== body.goal.trim()) {
      throw new GitHubApiError("The plan and source revision do not match. Inspect the repository and create a new plan.", 409);
    }
    if (!process.env.OPENAI_API_KEY) throw new ModelError("Generation needs an OpenAI API key. Add OPENAI_API_KEY to your local .env.local file and restart the dev server.", 503);

    const source = await inspectMigrationSource({
      repositoryUrl: analysis.repository.url,
      expectedFullName: analysis.repository.fullName,
      commitSha: analysis.revision.commitSha,
    });
    if (source.sourceType === "unsupported") throw new GitHubApiError("This repository does not match a supported static HTML or React + Vite source project.", 422);
    if (analysis.profile.supported !== true || analysis.profile.sourceType !== source.sourceType || analysis.profile.framework !== source.framework) {
      throw new GitHubApiError("The inspected source profile no longer matches the repository. Inspect it again.", 409);
    }

    const canonicalPlan = createMigrationPlan({
      sourceType: source.sourceType,
      repository: source.repository,
      framework: source.framework,
      commitSha: analysis.revision.commitSha,
      goal: body.goal.trim(),
      keyFiles: source.keyFiles,
      routeCandidates: source.routeCandidates,
    });
    if (JSON.stringify(plan) !== JSON.stringify(canonicalPlan)) {
      throw new GitHubApiError("The approved plan differs from the server-generated plan. Inspect the repository and create a new plan.", 409);
    }

    const generated = await generateWithOpenAI({
      goal: body.goal.trim(),
      sourceFramework: source.framework,
      sourceFiles: source.files,
      availableAssets: source.assetPaths,
    });
    const generatedFiles = validateGeneratedFiles(generated.files);
    const safeSummary = generated.summary.trim().slice(0, 500);
    const limitations = generated.limitations.filter((item): item is string => typeof item === "string").slice(0, 8).map((item) => item.slice(0, 300));
    const projectEntries = [
      ...scaffold(safeSummary, body.goal.trim()),
      ...generatedFiles,
    ];
    const validation = await validateGeneratedProject(projectEntries);
    const entries = [
      ...projectEntries,
      { path: "MIGRATION-REPORT.md", content: migrationReport({
        repository: source.repository,
        commitSha: analysis.revision.commitSha,
        goal: body.goal.trim(),
        summary: safeSummary,
        limitations,
        sourceFileCount: source.fileCount,
        excludedFileCount: source.excludedFileCount,
        generatedFiles,
        validation,
      }) },
    ];
    const zip = createZip(entries);
    if (zip.byteLength > 1_000_000) throw new ModelError("The generated ZIP exceeded the download size limit.");
    return new Response(new Uint8Array(zip), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="stackshift-migrated-project.zip"',
        "Cache-Control": "no-store",
        "X-StackShift-File-Count": String(entries.length),
        "X-StackShift-Source-Files": String(source.fileCount),
        "X-StackShift-Validation": validation.status,
        "X-StackShift-Build": validation.build,
        "X-StackShift-Root-Route": validation.rootRoute,
      },
    });
  } catch (error) {
    const known = error instanceof GitHubApiError || error instanceof ModelError;
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    const message = known
      ? error.message
      : timedOut
        ? "A required service took too long to respond. Please try again."
        : "Project generation failed unexpectedly. Please try again.";
    const status = known ? error.status : timedOut ? 504 : 502;
    return Response.json({ error: message }, { status });
  }
}
