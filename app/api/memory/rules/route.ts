import { GitHubApiError, isJsonRecord } from "@/lib/github/api";
import { listRuleMemory, promoteRuleCandidate, rejectRuleCandidate } from "@/lib/memory/rules-store";
import { assertSameOrigin } from "@/lib/security/origin";
import { assertRateLimit } from "@/lib/security/rate-limit";

export async function GET() {
  return Response.json(await listRuleMemory(), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request, "Rule review requests must come from this application.");
    const rateHeaders = assertRateLimit(request, "memory_review");
    const length = Number(request.headers.get("content-length"));
    if (Number.isFinite(length) && length > 2_000) throw new GitHubApiError("The rule review request is too large.", 413);
    if (!request.body) throw new GitHubApiError("Choose a valid candidate rule review action.", 400);
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 2_000) { await reader.cancel(); throw new GitHubApiError("The rule review request is too large.", 413); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    let body: unknown;
    try { body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown; }
    catch { throw new GitHubApiError("Send a valid rule review request.", 400); }
    if (!isJsonRecord(body) || typeof body.id !== "string" || !/^[a-f\d]{32}$/.test(body.id) || !["promote", "reject"].includes(String(body.action))) {
      throw new GitHubApiError("Choose a valid candidate rule review action.", 400);
    }
    const changed = body.action === "promote" ? await promoteRuleCandidate(body.id) : await rejectRuleCandidate(body.id);
    if (!changed) throw new GitHubApiError("That candidate could not be changed. It may have already been reviewed or the local memory store may be unavailable.", 409);
    return Response.json(await listRuleMemory(), { headers: { "Cache-Control": "no-store", ...rateHeaders } });
  } catch (error) {
    const known = error instanceof GitHubApiError;
    const headers = error instanceof GitHubApiError ? error.headers : undefined;
    return Response.json({ error: known ? error.message : "Rule memory could not be updated. Please try again." }, { status: known ? error.status : 400, headers });
  }
}
