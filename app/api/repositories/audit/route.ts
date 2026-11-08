import { GitHubApiError, isJsonRecord } from "@/lib/github/api";
import { downloadPinnedGitHubArchive } from "@/lib/github/archive";
import { auditSourceFiles, renderAuditMarkdown } from "@/lib/audit/engine";
import { auditDependencyAdvisories } from "@/lib/audit/dependencies";
import type { RepositoryAnalysis } from "@/lib/github/analysis";
import { readZipSourceManifest } from "@/lib/source/zip";
import { assertSameOrigin } from "@/lib/security/origin";
import { assertRateLimit } from "@/lib/security/rate-limit";

const MAX_REQUEST_BYTES = 8_000;

async function readBody(request: Request): Promise<unknown> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    throw new GitHubApiError("The audit request is too large.", 413);
  }
  if (!request.body) throw new GitHubApiError("Inspect a repository before starting its audit.", 400);

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_REQUEST_BYTES) {
        await reader.cancel();
        throw new GitHubApiError("The audit request is too large.", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } catch {
    throw new GitHubApiError("Send a valid JSON request containing the inspected repository.", 400);
  }
}

function errorResponse(error: unknown) {
  if (error instanceof GitHubApiError) {
    return Response.json({ error: error.message }, { status: error.status, headers: error.headers });
  }
  if (error instanceof Error && error.name === "TimeoutError") {
    return Response.json({ error: "GitHub took too long to read the source files. Please try again." }, { status: 504 });
  }
  return Response.json({ error: "The source audit could not be completed. Please try again." }, { status: 502 });
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const rateHeaders = assertRateLimit(request, "audit");
    const body = await readBody(request);
    if (!isJsonRecord(body) || !isJsonRecord(body.analysis) || !isJsonRecord(body.analysis.repository) || !isJsonRecord(body.analysis.revision)) {
      throw new GitHubApiError("Inspect a repository before starting its audit.", 400);
    }
    const analysis = body.analysis as unknown as RepositoryAnalysis;
    if (
      typeof analysis.repository.url !== "string" || analysis.repository.url.length > 2_048 ||
      typeof analysis.repository.fullName !== "string" || analysis.repository.fullName.length > 200 ||
      typeof analysis.revision.commitSha !== "string" || !/^[a-f\d]{40,64}$/i.test(analysis.revision.commitSha)
    ) {
      throw new GitHubApiError("The repository identity or pinned commit is invalid. Inspect the repository again.", 400);
    }

    const archive = await downloadPinnedGitHubArchive({
      repositoryUrl: analysis.repository.url,
      expectedFullName: analysis.repository.fullName,
      commitSha: analysis.revision.commitSha,
    });
    const manifest = readZipSourceManifest(archive, `${analysis.repository.fullName}.zip`, {
      kind: "github",
      label: analysis.repository.fullName,
      revision: analysis.revision.commitSha,
    });
    const staticReport = auditSourceFiles({ manifest });
    const report = await auditDependencyAdvisories(manifest, staticReport);

    return Response.json({ report, markdown: renderAuditMarkdown(report) }, { headers: { "Cache-Control": "no-store", ...rateHeaders } });
  } catch (error) {
    return errorResponse(error);
  }
}
