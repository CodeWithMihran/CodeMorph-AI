const GITHUB_API = "https://api.github.com";
const TIMEOUT_MS = 8_000;
const MAX_JSON_BYTES = 8 * 1024 * 1024;
const MAX_PACKAGE_BYTES = 128 * 1024;

export class GitHubApiError extends Error {
  constructor(message: string, readonly status: number, readonly headers?: Record<string, string>) {
    super(message);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function readLimited(response: Response, maxBytes: number) {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new GitHubApiError("GitHub returned a repository response that is too large to inspect safely.", 413);
  }
  if (!response.body) throw new GitHubApiError("GitHub returned an empty response.", 502);

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new GitHubApiError("GitHub returned a repository response that is too large to inspect safely.", 413);
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
  return bytes;
}

export async function githubJson(path: string, maxBytes = MAX_JSON_BYTES): Promise<unknown> {
  // Paths are assembled from validated owner/repository values or Git object SHAs.
  const response = await fetch(new URL(path, GITHUB_API), {
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2026-03-10",
      "User-Agent": "CodeMorph-AI",
    },
    cache: "no-store",
    redirect: "manual",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (response.status >= 300 && response.status < 400) {
    throw new GitHubApiError("GitHub redirected this repository request. Submit its current GitHub URL.", 409);
  }
  if (response.status === 404) {
    throw new GitHubApiError("GitHub could not find a public repository at that address. Private repositories are not supported yet.", 404);
  }
  if (response.status === 403 || response.status === 429) {
    throw new GitHubApiError("GitHub's public API rate limit or access policy stopped this inspection. Please wait and try again.", 429);
  }
  if (!response.ok) {
    throw new GitHubApiError("GitHub could not inspect this repository right now. Please try again.", 502);
  }

  const bytes = await readLimited(response, maxBytes);
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } catch (error) {
    if (error instanceof GitHubApiError) throw error;
    throw new GitHubApiError("GitHub returned an unreadable repository response.", 502);
  }
}

export function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return isRecord(value);
}

export const MAX_PACKAGE_JSON_BYTES = MAX_PACKAGE_BYTES;
