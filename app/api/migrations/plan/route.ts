import { GitHubApiError, isJsonRecord } from "@/lib/github/api";
import { inspectMigrationSource } from "@/lib/github/migration-source";
import { createMigrationPlan, type PlanInput } from "@/lib/migration/plan";

const MAX_BODY_BYTES = 12_000;
const MAX_GOAL_LENGTH = 500;

async function readBody(request: Request): Promise<unknown> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) throw new GitHubApiError("The migration request is too large.", 413);
  if (!request.body) throw new GitHubApiError("Send the inspected repository profile and a migration goal.", 400);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new GitHubApiError("The migration request is too large.", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown; }
  catch { throw new GitHubApiError("Send a valid JSON request.", 400); }
}

export async function POST(request: Request) {
  try {
    const body = await readBody(request);
    if (!isJsonRecord(body) || !isJsonRecord(body.analysis) || !isJsonRecord(body.analysis.repository) || !isJsonRecord(body.analysis.revision) || !isJsonRecord(body.analysis.profile)) {
      throw new GitHubApiError("The inspected repository identity is missing or invalid. Inspect the repository again.", 400);
    }

    const { repository, revision, profile } = body.analysis;
    const goal = body.goal;
    if (typeof goal !== "string" || goal.trim().length < 8 || goal.length > MAX_GOAL_LENGTH) {
      throw new GitHubApiError("Describe the desired application in 8 to 500 characters.", 400);
    }
    if (typeof repository.fullName !== "string" || repository.fullName.length > 200 || typeof repository.url !== "string" || repository.url.length > 2_048 || typeof revision.commitSha !== "string" || !/^[a-f\d]{40,64}$/i.test(revision.commitSha)) {
      throw new GitHubApiError("The repository profile is missing valid source identity details. Inspect it again.", 400);
    }

    const source = await inspectMigrationSource({
      repositoryUrl: repository.url,
      expectedFullName: repository.fullName,
      commitSha: revision.commitSha,
      includeSourceFiles: false,
    });
    if (source.sourceType === "unsupported") {
      throw new GitHubApiError("This repository does not match a supported static HTML or React + Vite source project.", 422);
    }
    if (profile.supported !== true || profile.sourceType !== source.sourceType || profile.framework !== source.framework) {
      throw new GitHubApiError("The inspected source profile no longer matches the repository. Inspect it again.", 409);
    }

    const input: PlanInput = {
      sourceType: source.sourceType,
      repository: source.repository,
      framework: source.framework,
      commitSha: revision.commitSha,
      goal: goal.trim(),
      keyFiles: source.keyFiles,
      routeCandidates: source.routeCandidates,
    };
    return Response.json({ plan: createMigrationPlan(input) });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    const aborted = error instanceof Error && error.name === "AbortError";
    const known = error instanceof GitHubApiError;
    const message = known
      ? error.message
      : timedOut
        ? "GitHub took too long to recheck this repository. Please try again."
        : "Could not create a migration plan because the source could not be rechecked. Please try again.";
    const status = known ? error.status : timedOut ? 504 : aborted ? 502 : 502;
    return Response.json({ error: message }, { status });
  }
}
