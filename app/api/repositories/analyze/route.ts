import { githubJson, GitHubApiError, isJsonRecord, MAX_PACKAGE_JSON_BYTES } from "@/lib/github/api";
import { parseGitHubRepositoryUrl } from "@/lib/github/parse-repository-url";
import type { RepositoryAnalysis } from "@/lib/github/analysis";
import { classifySource } from "@/lib/github/classify-source";

const MAX_REQUEST_BYTES = 4_096;
const MAX_TREE_ENTRIES = 100_000;

async function readRequest(request: Request): Promise<unknown> {
  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > MAX_REQUEST_BYTES) throw new GitHubApiError("Request is too large.", 413);
  if (!request.body) throw new GitHubApiError("Send a valid JSON request containing a repositoryUrl.", 400);
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
        throw new GitHubApiError("Request is too large.", 413);
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
  catch { throw new GitHubApiError("Send a valid JSON request containing a repositoryUrl.", 400); }
}

function packageManager(files: Set<string>) {
  if (files.has("pnpm-lock.yaml")) return "pnpm";
  if (files.has("yarn.lock")) return "yarn";
  if (files.has("bun.lock") || files.has("bun.lockb")) return "bun";
  if (files.has("package-lock.json")) return "npm";
  return null;
}

function statusFor(error: unknown) {
  if (error instanceof GitHubApiError) return error.status;
  return 502;
}

export async function POST(request: Request) {
  try {
    const body = await readRequest(request);
    const repositoryUrl = isJsonRecord(body) ? body.repositoryUrl : undefined;
    if (typeof repositoryUrl !== "string" || repositoryUrl.length > 2_048) {
      throw new GitHubApiError("Enter a GitHub repository URL to continue.", 400);
    }
    const parsed = parseGitHubRepositoryUrl(repositoryUrl);
    if (!parsed) throw new GitHubApiError("Use a public GitHub repository URL such as https://github.com/owner/repository.", 400);

    const owner = encodeURIComponent(parsed.owner);
    const repo = encodeURIComponent(parsed.repository);
    const repositoryData = await githubJson(`/repos/${owner}/${repo}`);
    if (!isJsonRecord(repositoryData) || repositoryData.private !== false || !isJsonRecord(repositoryData.owner)) {
      throw new GitHubApiError("GitHub could not find a public repository with complete details at that address.", 404);
    }
    const defaultBranch = repositoryData.default_branch;
    const fullName = repositoryData.full_name;
    const ownerLogin = repositoryData.owner.login;
    const stars = repositoryData.stargazers_count;
    if (typeof defaultBranch !== "string" || !defaultBranch || typeof fullName !== "string" || typeof ownerLogin !== "string" || typeof stars !== "number") {
      throw new GitHubApiError("GitHub returned incomplete repository details.", 502);
    }

    const commitData = await githubJson(`/repos/${owner}/${repo}/commits/${encodeURIComponent(defaultBranch)}`);
    if (!isJsonRecord(commitData) || typeof commitData.sha !== "string" || !isJsonRecord(commitData.commit) || !isJsonRecord(commitData.commit.tree) || typeof commitData.commit.tree.sha !== "string") {
      throw new GitHubApiError("GitHub could not resolve the repository's default branch to a commit.", 502);
    }
    const commitSha = commitData.sha;
    const treeData = await githubJson(`/repos/${owner}/${repo}/git/trees/${encodeURIComponent(commitData.commit.tree.sha)}?recursive=1`);
    if (!isJsonRecord(treeData) || !Array.isArray(treeData.tree) || typeof treeData.truncated !== "boolean") {
      throw new GitHubApiError("GitHub returned an incomplete source file listing.", 502);
    }
    if (treeData.truncated || treeData.tree.length > MAX_TREE_ENTRIES) {
      throw new GitHubApiError("This repository is too large for the current inspector to map completely. Try a smaller repository for now.", 413);
    }

    const entries = treeData.tree.filter((entry): entry is Record<string, unknown> => isJsonRecord(entry) && entry.type === "blob" && typeof entry.path === "string");
    const filePaths = entries.map((entry) => entry.path as string);
    const files = new Set(filePaths.filter((path) => !path.includes("/")));
    const packageEntry = entries.find((entry) => entry.path === "package.json");
    let manifest: Record<string, unknown> | null = null;
    if (packageEntry) {
      if (typeof packageEntry.size !== "number" || packageEntry.size > MAX_PACKAGE_JSON_BYTES || typeof packageEntry.sha !== "string") {
        throw new GitHubApiError("The root package.json is too large to inspect safely.", 413);
      }
      const blobData = await githubJson(`/repos/${owner}/${repo}/git/blobs/${encodeURIComponent(packageEntry.sha)}`, MAX_PACKAGE_JSON_BYTES + 8_192);
      if (!isJsonRecord(blobData) || blobData.encoding !== "base64" || typeof blobData.content !== "string") {
        throw new GitHubApiError("GitHub returned an unreadable package manifest.", 502);
      }
      try {
        const decoded = Buffer.from(blobData.content.replace(/\s/g, ""), "base64").toString("utf8");
        const value: unknown = JSON.parse(decoded);
        manifest = isJsonRecord(value) ? value : null;
      } catch {
        throw new GitHubApiError("The root package.json is not valid JSON.", 422);
      }
    }

    const classification = classifySource(files, manifest);
    const routeCandidates = filePaths
      .filter((path) => /(^|\/)(index|page)\.html?$|(^|\/)(pages|app)\/.*\.(tsx?|jsx?)$/.test(path))
      .filter((path) => !path.split("/").some((segment) => segment.startsWith(".")))
      .slice(0, 20);
    const keyFiles = ["package.json", "index.html", "vite.config.ts", "vite.config.js", "vite.config.mjs", "vite.config.mts", "src/main.tsx", "src/main.jsx", "src/App.tsx", "src/App.jsx"]
      .filter((path) => files.has(path) || entries.some((entry) => entry.path === path));

    const analysis: RepositoryAnalysis = {
      repository: {
        fullName,
        url: `https://github.com/${encodeURIComponent(ownerLogin)}/${encodeURIComponent(parsed.repository)}`,
        description: typeof repositoryData.description === "string" ? repositoryData.description : null,
        defaultBranch,
        stars,
        language: typeof repositoryData.language === "string" ? repositoryData.language : null,
      },
      revision: { commitSha },
      profile: {
        ...classification,
        packageManager: packageManager(files),
        fileCount: entries.length,
        keyFiles,
        routeCandidates,
        inspectedAt: new Date().toISOString(),
      },
    };
    return Response.json({ analysis });
  } catch (error) {
    if (!(error instanceof GitHubApiError) && error instanceof Error && error.name === "TimeoutError") {
      return Response.json({ error: "GitHub took too long to respond. Please try again." }, { status: 504 });
    }
    if (!(error instanceof GitHubApiError) && error instanceof Error && error.name === "AbortError") {
      return Response.json({ error: "GitHub inspection was interrupted. Please try again." }, { status: 502 });
    }
    const message = error instanceof GitHubApiError ? error.message : "Repository inspection failed. Please try again.";
    return Response.json({ error: message }, { status: statusFor(error) });
  }
}
