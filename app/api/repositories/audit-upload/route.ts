import { GitHubApiError } from "@/lib/github/api";
import { auditSourceFiles, renderAuditMarkdown } from "@/lib/audit/engine";
import { auditDependencyAdvisories } from "@/lib/audit/dependencies";
import { readZipSourceManifest, ZIP_LIMITS } from "@/lib/source/zip";

const MAX_MULTIPART_BYTES = ZIP_LIMITS.archiveBytes + 1024 * 1024;

async function readCappedBody(request: Request) {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_MULTIPART_BYTES) {
    throw new GitHubApiError("The upload exceeds the maximum request size.", 413);
  }
  if (!request.body) throw new GitHubApiError("Choose a ZIP archive to audit.", 400);
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

    const manifest = readZipSourceManifest(Buffer.from(await upload.arrayBuffer()), upload.name);
    const staticReport = auditSourceFiles({ manifest });
    const report = await auditDependencyAdvisories(manifest, staticReport);
    return Response.json({ report, markdown: renderAuditMarkdown(report) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof GitHubApiError) return Response.json({ error: error.message }, { status: error.status });
    return Response.json({ error: "The ZIP audit could not be completed. Please check the archive and try again." }, { status: 422 });
  }
}
