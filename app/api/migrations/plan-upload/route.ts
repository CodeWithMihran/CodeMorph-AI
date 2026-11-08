import { GitHubApiError } from "@/lib/github/api";
import { createMigrationPlan } from "@/lib/migration/plan";
import { readZipSourceManifest, ZIP_LIMITS } from "@/lib/source/zip";
import { prepareZipMigration } from "@/lib/source/zip-migration";
import { assertSameOrigin } from "@/lib/security/origin";
import { assertRateLimit } from "@/lib/security/rate-limit";
import { evaluateFeasibility } from "@/lib/analysis/feasibility";

const MAX_MULTIPART_BYTES = ZIP_LIMITS.archiveBytes + 1024 * 1024;
const MAX_GOAL_LENGTH = 500;

async function readCappedBody(request: Request) {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_MULTIPART_BYTES) {
    throw new GitHubApiError("The upload exceeds the maximum request size.", 413);
  }
  if (!request.body) throw new GitHubApiError("Choose a ZIP archive to plan migration.", 400);
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
    const rateHeaders = assertRateLimit(request, "plan");
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
    const upload = form.get("file");
    if (!(upload instanceof File)) throw new GitHubApiError("Choose a ZIP file in the upload field.", 400);
    if (!upload.name.toLowerCase().endsWith(".zip")) throw new GitHubApiError("Only .zip archives are supported.", 415);
    if (upload.size > ZIP_LIMITS.archiveBytes) {
      throw new GitHubApiError(`The compressed ZIP exceeds the ${ZIP_LIMITS.archiveBytes / (1024 * 1024)} MiB upload limit.`, 413);
    }

    const goal = form.get("goal");
    const targetRaw = (typeof form.get("target") === "string" ? String(form.get("target")) : "").toLowerCase();
    const target = targetRaw.includes("expo") ? "expo" : "nextjs";
    if (typeof goal !== "string" || goal.trim().length < 8 || goal.length > MAX_GOAL_LENGTH) {
      throw new GitHubApiError("Describe the desired application in 8 to 500 characters.", 400);
    }

    const manifest = readZipSourceManifest(Buffer.from(await upload.arrayBuffer()), upload.name);
    const prepared = prepareZipMigration(manifest, target);
    if (prepared.sourceType === "unsupported") {
      throw new GitHubApiError(`This ZIP repository does not match a supported static HTML or React + Vite project: ${prepared.supportReason}`, 422);
    }

    const plan = createMigrationPlan({
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

    const feasibility = evaluateFeasibility({
      sourceType: prepared.sourceType,
      framework: prepared.framework,
      supportReason: prepared.supportReason,
      filePaths: prepared.files.map((f) => f.path),
      keyFiles: prepared.keyFiles,
      routeCandidates: prepared.routeCandidates,
      files: prepared.files,
      target,
    });

    return Response.json({ plan, feasibility }, { headers: { "Cache-Control": "no-store", ...rateHeaders } });
  } catch (error) {
    if (error instanceof GitHubApiError) {
      return Response.json({ error: error.message }, { status: error.status, headers: error.headers });
    }
    return Response.json({ error: "The migration plan could not be created from this ZIP. Please try again." }, { status: 502 });
  }
}
