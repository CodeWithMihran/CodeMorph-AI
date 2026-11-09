import { GitHubApiError, isJsonRecord } from "@/lib/github/api";
import { findRelevantRules, recordRuleOutcomes, recordVerifiedRepair } from "@/lib/memory/rules-store";
import { generatedRoutePaths, validateGeneratedFiles } from "@/lib/migration/generated-output";
import { generateWithOpenAI, ModelError } from "@/lib/migration/model";
import { createMigrationPlan, type MigrationPlan } from "@/lib/migration/plan";
import { migrationReport, repairContext, scaffold, type ScaffoldConfig } from "@/lib/migration/scaffold";
import { validateGeneratedProject } from "@/lib/migration/validation";
import { createZip } from "@/lib/migration/zip";
import { readZipSourceManifest, ZIP_LIMITS } from "@/lib/source/zip";
import { prepareZipMigration } from "@/lib/source/zip-migration";
import { assertSameOrigin } from "@/lib/security/origin";
import { assertRateLimit, withConcurrencyLimit } from "@/lib/security/rate-limit";
import { evaluateFeasibility } from "@/lib/analysis/feasibility";

const MAX_MULTIPART_BYTES = ZIP_LIMITS.archiveBytes + 1024 * 1024;
const MAX_GOAL_LENGTH = 500;

async function readCappedBody(request: Request) {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_MULTIPART_BYTES) {
    throw new GitHubApiError("The upload exceeds the maximum request size.", 413);
  }
  if (!request.body) throw new GitHubApiError("Send the approved plan and project archive.", 400);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_MULTIPART_BYTES) {
        await reader.cancel();
        throw new GitHubApiError("The upload exceeds the maximum request size.", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const rateHeaders = assertRateLimit(request, "generate");

    return await withConcurrencyLimit("generate", async () => {
      const contentType = request.headers.get("content-type") ?? "";
      if (!/^multipart\/form-data\s*;/i.test(contentType)) {
        throw new GitHubApiError("Upload a ZIP archive using multipart form data.", 415);
      }
      const body = await readCappedBody(request);
    let form: FormData;
    try {
      form = await new Request("http://localhost", { method: "POST", headers: { "Content-Type": contentType }, body }).formData();
    } catch {
      throw new GitHubApiError("The upload form could not be read. Choose a valid ZIP archive and try again.", 400);
    }

    const confirmed = form.get("confirmed");
    if (confirmed !== "true") {
      throw new GitHubApiError("Review the plan and inspect the repository before generating.", 400);
    }

    const upload = form.get("file");
    if (!(upload instanceof File)) throw new GitHubApiError("Choose a ZIP file in the upload field.", 400);
    if (!upload.name.toLowerCase().endsWith(".zip")) throw new GitHubApiError("Only .zip archives are supported.", 415);
    if (upload.size > ZIP_LIMITS.archiveBytes) {
      throw new GitHubApiError(`The compressed ZIP exceeds the ${ZIP_LIMITS.archiveBytes / (1024 * 1024)} MiB upload limit.`, 413);
    }

    const goal = form.get("goal");
    if (typeof goal !== "string" || goal.trim().length < 8 || goal.length > MAX_GOAL_LENGTH) {
      throw new GitHubApiError("Enter a migration goal between 8 and 500 characters.", 400);
    }

    const rawPlan = form.get("plan");
    if (typeof rawPlan !== "string") {
      throw new GitHubApiError("Send the approved migration plan as JSON.", 400);
    }
    let plan: MigrationPlan;
    try {
      const parsed = JSON.parse(rawPlan);
      if (!isJsonRecord(parsed) || !isJsonRecord(parsed.source) || parsed.planner !== "rules-based-v1" || (parsed.target !== "Next.js App Router + TypeScript" && parsed.target !== "Expo Router (React Native) + TypeScript")) {
        throw new Error("Invalid plan schema");
      }
      plan = parsed as unknown as MigrationPlan;
    } catch {
      throw new GitHubApiError("The migration plan is invalid. Please create a new plan.", 400);
    }

    if (plan.requestedOutcome !== goal.trim()) {
      throw new GitHubApiError("The plan goal does not match the requested goal. Create a new plan.", 409);
    }

    if (!process.env.OPENAI_API_KEY) {
      throw new ModelError("Generation needs an OpenAI API key. Add OPENAI_API_KEY to your local .env.local file and restart the dev server.", 503);
    }

    const manifest = readZipSourceManifest(Buffer.from(await upload.arrayBuffer()), upload.name);
    if (manifest.origin.revision.toLowerCase() !== plan.source.commitSha.toLowerCase()) {
      throw new GitHubApiError("The approved plan does not match the uploaded archive fingerprint. Inspect the archive and create a new plan.", 409);
    }

    const target = (typeof plan.target === "string" && plan.target.includes("Expo")) ? "expo" : "nextjs";
    const prepared = prepareZipMigration(manifest, target);
    if (prepared.sourceType === "unsupported") {
      throw new GitHubApiError("This ZIP repository does not match a supported static HTML or React + Vite project.", 422);
    }
    const canonicalPlan = createMigrationPlan({
      sourceType: prepared.sourceType,
      repository: prepared.repository,
      framework: prepared.framework,
      commitSha: prepared.revision,
      goal: goal.trim(),
      keyFiles: prepared.keyFiles,
      routeCandidates: prepared.routeCandidates,
      routes: prepared.routes,
      target,
    });
    if (JSON.stringify(plan) !== JSON.stringify(canonicalPlan)) {
      throw new GitHubApiError("The approved plan differs from the server-generated plan. Inspect the repository and create a new plan.", 409);
    }

    const proceduralRules = await findRelevantRules({
      sourceFramework: prepared.framework,
      target: target === "expo" ? "expo-router-typescript" : "nextjs-app-router-typescript",
      sourceFiles: prepared.files,
    });

    const generated = await generateWithOpenAI({
      goal: goal.trim(),
      sourceFramework: prepared.framework,
      sourceFiles: prepared.files,
      availableAssets: prepared.assetPaths,
      proceduralRules,
      target,
    });
    let generatedFiles = validateGeneratedFiles(generated.files, target);
    let safeSummary = generated.summary.trim().slice(0, 500);
    const limitations = generated.limitations.filter((item): item is string => typeof item === "string").slice(0, 8).map((item) => item.slice(0, 300));
    const expectedRoutes = canonicalPlan.routes.required.map((route) => route.path);
    const generatedRoutes = new Set(generatedRoutePaths(generatedFiles, target));
    const missingRoutes = expectedRoutes.filter((route) => !generatedRoutes.has(route));
    if (missingRoutes.length) {
      await recordRuleOutcomes(proceduralRules.map((rule) => rule.id), "failed");
      throw new ModelError(`Generated project is missing required source route${missingRoutes.length === 1 ? "" : "s"}: ${missingRoutes.join(", ")}. Try generating again.`);
    }

    let scaffoldConfig: ScaffoldConfig | undefined;
    const rawScaffoldConfig = form.get("scaffoldConfig");
    if (typeof rawScaffoldConfig === "string") {
      try {
        const parsed = JSON.parse(rawScaffoldConfig);
        if (isJsonRecord(parsed)) {
          scaffoldConfig = parsed as unknown as ScaffoldConfig;
        }
      } catch {
        // Fall back to default
      }
    }

    let projectEntries = [...scaffold(safeSummary, goal.trim(), target, scaffoldConfig, generatedFiles), ...generatedFiles];
    let validation = target === "expo"
      ? {
          status: "not-run" as const,
          build: "not-run" as const,
          rootRoute: "not-run" as const,
          routeChecks: expectedRoutes.map((path) => ({ path, status: "not-run" as const })),
          durationMs: 0,
          message: "Mobile container checks pending: Expo target export requires an Expo-enabled container worker.",
          diagnostics: [],
        }
      : await validateGeneratedProject(projectEntries, expectedRoutes);
    let memoryRulesSaved = 0;
    let repairDiagnostics: string[] = [];
    if (validation.status === "failed" && validation.build === "failed") {
      repairDiagnostics = validation.diagnostics;
      const repaired = await generateWithOpenAI({
        goal: goal.trim(),
        sourceFramework: prepared.framework,
        sourceFiles: prepared.files,
        availableAssets: prepared.assetPaths,
        proceduralRules,
        repairContext: repairContext(generatedFiles, validation.diagnostics, target),
        target,
      });
      const repairedFiles = validateGeneratedFiles(repaired.files, target);
      const previousGenerated = generatedFiles;
      generatedFiles = [...new Map([...generatedFiles, ...repairedFiles].map((file) => [file.path, file])).values()];
      generatedFiles = validateGeneratedFiles(generatedFiles, target);
      const repairedRoutes = new Set(generatedRoutePaths(generatedFiles, target));
      const stillMissing = expectedRoutes.filter((route) => !repairedRoutes.has(route));
      if (stillMissing.length) {
        await recordRuleOutcomes(proceduralRules.map((rule) => rule.id), "failed");
        throw new ModelError(`The single build repair attempt removed required source route${stillMissing.length === 1 ? "" : "s"}: ${stillMissing.join(", ")}. No project ZIP was created.`, 422);
      }
      safeSummary = repaired.summary.trim().slice(0, 500) || safeSummary;
      projectEntries = [...scaffold(safeSummary, goal.trim(), target, scaffoldConfig, generatedFiles), ...generatedFiles];
      validation = await validateGeneratedProject(projectEntries, expectedRoutes);
      if (validation.status === "passed") {
        memoryRulesSaved = await recordVerifiedRepair({
          sourceFramework: prepared.framework,
          target: target === "expo" ? "expo-router-typescript" : "nextjs-app-router-typescript",
          sourceFiles: prepared.files,
          diagnostics: repairDiagnostics,
          filesBefore: previousGenerated,
          filesAfter: generatedFiles,
        });
      }
    }

    if (validation.status === "failed") {
      await recordRuleOutcomes(proceduralRules.map((rule) => rule.id), "failed");
      const category = validation.build === "failed" ? "The production build failed after one repair attempt." : "Required route checks failed.";
      throw new ModelError(`${category} No project ZIP was created. ${validation.message}${validation.diagnostics.length ? ` Diagnostics: ${validation.diagnostics.slice(-4).join(" | ").slice(0, 1_200)}` : ""}`, 422);
    }

    await recordRuleOutcomes(proceduralRules.map((rule) => rule.id), validation.status === "passed" ? "passed" : "not-run");
    const readiness = validation.status === "passed" ? "verified" : "unverified";
    const authoritativeFeasibility = evaluateFeasibility({
      sourceType: prepared.sourceType,
      framework: prepared.framework,
      supportReason: prepared.supportReason,
      filePaths: prepared.files.map((f) => f.path),
      keyFiles: prepared.keyFiles,
      routeCandidates: prepared.routeCandidates,
      files: prepared.files,
      target,
    });
    const sourceManifest = {
      framework: prepared.framework,
      sourceType: prepared.sourceType,
      files: prepared.files.map((file) => ({
        path: file.path,
        content: file.content,
      })),
      mappings: canonicalPlan.routes.required.map((route) => ({
        route: route.path,
        sourcePath: route.evidence[0] ?? "",
        targetPath: target === "expo"
          ? (route.path === "/" ? "app/index.tsx" : `app${route.path}.tsx`)
          : (route.path === "/" ? "app/page.tsx" : `app${route.path}/page.tsx`),
      })),
    };
    const entries = [
      ...projectEntries,
      {
        path: ".codemorph/source-manifest.json",
        content: JSON.stringify(sourceManifest, null, 2),
      },
      { path: "MIGRATION-REPORT.md", content: migrationReport({
        repository: prepared.repository,
        commitSha: prepared.revision,
        goal: goal.trim(),
        summary: safeSummary,
        limitations,
        sourceFileCount: prepared.fileCount,
        excludedFileCount: prepared.excludedFileCount,
        generatedFiles,
        validation,
        manualRoutes: canonicalPlan.routes.manual,
        memoryRulesUsed: proceduralRules.length,
        memoryRulesSaved,
        target,
        feasibility: authoritativeFeasibility,
        scaffoldConfig,
      }) },
    ];
    const zip = createZip(entries);
    if (zip.byteLength > 1_000_000) throw new ModelError("The generated ZIP exceeded the download size limit.");

    return new Response(new Uint8Array(zip), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="codemorph-migrated-project.zip"',
        "Cache-Control": "no-store",
        "X-CodeMorph-File-Count": String(entries.length),
        "X-CodeMorph-Source-Files": String(prepared.fileCount),
        "X-CodeMorph-Validation": validation.status,
        "X-CodeMorph-Readiness": readiness,
        "X-CodeMorph-Build": validation.build,
        "X-CodeMorph-Root-Route": validation.rootRoute,
        "X-CodeMorph-Route-Checks": JSON.stringify(validation.routeChecks),
        "X-CodeMorph-Memory-Rules-Used": String(proceduralRules.length),
        "X-CodeMorph-Memory-Rules-Saved": String(memoryRulesSaved),
        "X-CodeMorph-Feasibility": String(authoritativeFeasibility.score),
        "X-StackShift-File-Count": String(entries.length),
        "X-StackShift-Source-Files": String(prepared.fileCount),
        "X-StackShift-Validation": validation.status,
        "X-StackShift-Readiness": readiness,
        "X-StackShift-Build": validation.build,
        "X-StackShift-Root-Route": validation.rootRoute,
        "X-StackShift-Route-Checks": JSON.stringify(validation.routeChecks),
        ...rateHeaders,
      },
    });
    });
  } catch (error) {
    const known = error instanceof GitHubApiError || error instanceof ModelError;
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    const message = known
      ? error.message
      : timedOut
        ? "A required service took too long to respond. Please try again."
        : "ZIP project generation failed unexpectedly. Please try again.";
    const status = known ? error.status : timedOut ? 504 : 502;
    const headers = error instanceof GitHubApiError ? error.headers : undefined;
    return Response.json({ error: message }, { status, headers });
  }
}
