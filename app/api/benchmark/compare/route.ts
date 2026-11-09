import { GitHubApiError, isJsonRecord } from "@/lib/github/api";
import { assertSameOrigin } from "@/lib/security/origin";
import { assertRateLimit } from "@/lib/security/rate-limit";
import {
  compareBenchmarkProjects,
  generateComparativeDossier,
  type RawProjectInput,
} from "@/lib/benchmark/benchmark-engine";

const MAX_BODY_BYTES = 500_000;

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const rateHeaders = assertRateLimit(request, "analyze");

    const contentLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
      throw new GitHubApiError("The benchmark request is too large.", 413);
    }

    const body = (await request.json().catch(() => null)) as unknown;
    if (!isJsonRecord(body) || !Array.isArray(body.projects)) {
      throw new GitHubApiError("Provide a valid array of projects to benchmark.", 400);
    }

    if (body.projects.length < 2 || body.projects.length > 4) {
      throw new GitHubApiError("Comparative benchmark requires between 2 and 4 projects.", 400);
    }

    const projects: RawProjectInput[] = [];
    for (const item of body.projects) {
      if (!isJsonRecord(item) || typeof item.name !== "string" || !Array.isArray(item.files)) {
        throw new GitHubApiError("Each project must include a name and file entries.", 400);
      }
      const validFiles: Array<{ path: string; content: string }> = [];
      for (const file of item.files) {
        if (
          isJsonRecord(file) &&
          typeof file.path === "string" &&
          typeof file.content === "string" &&
          !file.path.startsWith("/") &&
          !file.path.includes("..")
        ) {
          validFiles.push({ path: file.path, content: file.content.slice(0, 60_000) });
        }
      }
      projects.push({
        id: typeof item.id === "string" ? item.id : `proj_${projects.length + 1}`,
        name: item.name.slice(0, 100),
        files: validFiles,
        target: item.target === "expo" ? "expo" : "nextjs",
      });
    }

    const result = compareBenchmarkProjects(projects);
    const markdown = generateComparativeDossier(result);

    return Response.json(
      { result, markdown },
      { headers: { "Cache-Control": "no-store", ...rateHeaders } }
    );
  } catch (error) {
    if (error instanceof GitHubApiError) {
      return Response.json({ error: error.message }, { status: error.status, headers: error.headers });
    }
    const message = error instanceof Error ? error.message : "Benchmark calculation failed.";
    return Response.json({ error: message }, { status: 422 });
  }
}
