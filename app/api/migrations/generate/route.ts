import { GitHubApiError, isJsonRecord } from "@/lib/github/api";
import { inspectMigrationSource } from "@/lib/github/migration-source";
import type { RepositoryAnalysis } from "@/lib/github/analysis";
import { createMigrationPlan, type MigrationPlan } from "@/lib/migration/plan";
import { generateWithOpenAI, ModelError } from "@/lib/migration/model";
import { generatedRoutePaths, validateGeneratedFiles } from "@/lib/migration/generated-output";
import { analyzeSourceRoutes } from "@/lib/migration/source-routes";
import { findRelevantRules, recordRuleOutcomes, recordVerifiedRepair } from "@/lib/memory/rules-store";
import { createZip } from "@/lib/migration/zip";
import { validateGeneratedProject } from "@/lib/migration/validation";
import { scaffold, migrationReport, repairContext, type ScaffoldConfig } from "@/lib/migration/scaffold";
import { assertSameOrigin } from "@/lib/security/origin";
import { assertRateLimit, withConcurrencyLimit } from "@/lib/security/rate-limit";
import { evaluateFeasibility } from "@/lib/analysis/feasibility";

const MAX_REQUEST_BYTES = 24_000;

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



export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const rateHeaders = assertRateLimit(request, "generate");

    return await withConcurrencyLimit("generate", async () => {
      const body = await readBody(request);
    if (!isJsonRecord(body) || body.confirmed !== true || !isJsonRecord(body.analysis) || !isJsonRecord(body.analysis.repository) || !isJsonRecord(body.analysis.revision) || !isJsonRecord(body.analysis.profile) || !isJsonRecord(body.plan) || !isJsonRecord(body.plan.source)) {
      throw new GitHubApiError("Review the plan and inspect the repository before generating.", 400);
    }
    const analysis = body.analysis as unknown as RepositoryAnalysis;
    const plan = body.plan as unknown as MigrationPlan;
    if (typeof body.goal !== "string" || body.goal.trim().length < 8 || body.goal.length > 500) throw new GitHubApiError("Enter a migration goal between 8 and 500 characters.", 400);
    const validTarget = plan.target === "Next.js App Router + TypeScript" || plan.target === "Expo Router (React Native) + TypeScript";
    if (typeof analysis.repository.url !== "string" || typeof analysis.repository.fullName !== "string" || !/^[a-f\d]{40,64}$/i.test(analysis.revision.commitSha) || plan.planner !== "rules-based-v1" || plan.source.commitSha !== analysis.revision.commitSha || plan.source.repository !== analysis.repository.fullName || !validTarget || plan.requestedOutcome !== body.goal.trim()) {
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

    const target = (typeof plan.target === "string" && plan.target.includes("Expo")) ? "expo" : "nextjs";
    const canonicalPlan = createMigrationPlan({
      sourceType: source.sourceType,
      repository: source.repository,
      framework: source.framework,
      commitSha: analysis.revision.commitSha,
      goal: body.goal.trim(),
      keyFiles: source.keyFiles,
      routeCandidates: source.routeCandidates,
      routes: analyzeSourceRoutes({ sourceType: source.sourceType, files: source.files, routeCandidates: source.routeCandidates }),
      target,
    });
    if (JSON.stringify(plan) !== JSON.stringify(canonicalPlan)) {
      throw new GitHubApiError("The approved plan differs from the server-generated plan. Inspect the repository and create a new plan.", 409);
    }

    const proceduralRules = await findRelevantRules({
      sourceFramework: source.framework,
      target: target === "expo" ? "expo-router-typescript" : "nextjs-app-router-typescript",
      sourceFiles: source.files,
    });

    const generated = await generateWithOpenAI({
      goal: body.goal.trim(),
      sourceFramework: source.framework,
      sourceFiles: source.files,
      availableAssets: source.assetPaths,
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
    const scaffoldConfig = isJsonRecord(body.scaffoldConfig)
      ? (body.scaffoldConfig as unknown as ScaffoldConfig)
      : undefined;
    let projectEntries = [...scaffold(safeSummary, body.goal.trim(), target, scaffoldConfig, generatedFiles), ...generatedFiles];
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
      const preRepairFiles = generatedFiles;
      const repaired = await generateWithOpenAI({
        goal: body.goal.trim(),
        sourceFramework: source.framework,
        sourceFiles: source.files,
        availableAssets: source.assetPaths,
        proceduralRules,
        repairContext: repairContext(generatedFiles, validation.diagnostics, target),
        target,
      });
      const repairedFiles = validateGeneratedFiles(repaired.files, target);
      generatedFiles = [...new Map([...generatedFiles, ...repairedFiles].map((file) => [file.path, file])).values()];
      generatedFiles = validateGeneratedFiles(generatedFiles, target);
      const repairedRoutes = new Set(generatedRoutePaths(generatedFiles, target));
      const stillMissing = expectedRoutes.filter((route) => !repairedRoutes.has(route));
      if (stillMissing.length) {
        await recordRuleOutcomes(proceduralRules.map((rule) => rule.id), "failed");
        throw new ModelError(`The single build repair attempt removed required source route${stillMissing.length === 1 ? "" : "s"}: ${stillMissing.join(", ")}. No project ZIP was created.`, 422);
      }
      safeSummary = repaired.summary.trim().slice(0, 500) || safeSummary;
      projectEntries = [...scaffold(safeSummary, body.goal.trim(), target, scaffoldConfig, generatedFiles), ...generatedFiles];
      validation = await validateGeneratedProject(projectEntries, expectedRoutes);
      if (validation.status === "passed") {
        memoryRulesSaved = await recordVerifiedRepair({
          sourceFramework: source.framework,
          target: target === "expo" ? "expo-router-typescript" : "nextjs-app-router-typescript",
          sourceFiles: source.files,
          diagnostics: repairDiagnostics,
          filesBefore: preRepairFiles,
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
      sourceType: source.sourceType,
      framework: source.framework,
      supportReason: "Supported source project.",
      filePaths: source.files.map((f) => f.path),
      keyFiles: source.keyFiles,
      routeCandidates: source.routeCandidates,
      files: source.files,
      target,
    });
    const sourceManifest = {
      framework: source.framework,
      sourceType: source.sourceType,
      files: source.files.map((file) => ({
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
        repository: source.repository,
        commitSha: analysis.revision.commitSha,
        goal: body.goal.trim(),
        summary: safeSummary,
        limitations,
        sourceFileCount: source.fileCount,
        excludedFileCount: source.excludedFileCount,
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
        "X-CodeMorph-Source-Files": String(source.fileCount),
        "X-CodeMorph-Validation": validation.status,
        "X-CodeMorph-Readiness": readiness,
        "X-CodeMorph-Memory-Rules-Used": String(proceduralRules.length),
        "X-CodeMorph-Memory-Rules-Saved": String(memoryRulesSaved),
        "X-CodeMorph-Build": validation.build,
        "X-CodeMorph-Root-Route": validation.rootRoute,
        "X-CodeMorph-Route-Checks": JSON.stringify(validation.routeChecks),
        "X-CodeMorph-Feasibility": String(authoritativeFeasibility.score),
        "X-StackShift-File-Count": String(entries.length),
        "X-StackShift-Source-Files": String(source.fileCount),
        "X-StackShift-Validation": validation.status,
        "X-StackShift-Readiness": readiness,
        "X-StackShift-Memory-Rules-Used": String(proceduralRules.length),
        "X-StackShift-Memory-Rules-Saved": String(memoryRulesSaved),
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
        : "Project generation failed unexpectedly. Please try again.";
    const status = known ? error.status : timedOut ? 504 : 502;
    const headers = error instanceof GitHubApiError ? error.headers : undefined;
    return Response.json({ error: message }, { status, headers });
  }
}
