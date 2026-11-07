import { githubJson, GitHubApiError, isJsonRecord } from "@/lib/github/api";
import { parseGitHubRepositoryUrl } from "@/lib/github/parse-repository-url";

const GITHUB_API = "https://api.github.com";
const MAX_ARCHIVE_BYTES = 10 * 1024 * 1024;

async function readArchiveLimited(response: Response) {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_ARCHIVE_BYTES) {
    throw new GitHubApiError("This repository archive exceeds the 10 MiB audit download limit.", 413);
  }
  if (!response.body) throw new GitHubApiError("GitHub returned an empty source archive.", 502);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_ARCHIVE_BYTES) {
        await reader.cancel();
        throw new GitHubApiError("This repository archive exceeds the 10 MiB audit download limit.", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), size);
}

function githubResponseError(status: number): GitHubApiError {
  if (status === 404) return new GitHubApiError("GitHub could not find the pinned public repository archive.", 404);
  if (status === 403 || status === 429) return new GitHubApiError("GitHub's public API rate limit or access policy stopped this audit. Please wait and try again.", 429);
  return new GitHubApiError("GitHub could not download the source archive right now.", 502);
}

export async function downloadPinnedGitHubArchive(input: {
  repositoryUrl: string;
  expectedFullName: string;
  commitSha: string;
}) {
  const parsed = parseGitHubRepositoryUrl(input.repositoryUrl);
  if (!parsed) throw new GitHubApiError("The repository URL is invalid. Inspect the repository again.", 400);
  const fullName = `${parsed.owner}/${parsed.repository}`;
  if (fullName.toLowerCase() !== input.expectedFullName.toLowerCase()) {
    throw new GitHubApiError("The repository identity changed. Inspect the repository again.", 409);
  }
  if (!/^[a-f\d]{40,64}$/i.test(input.commitSha)) throw new GitHubApiError("The pinned commit is invalid. Inspect the repository again.", 400);

  const prefix = `/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repository)}`;
  const repository = await githubJson(prefix);
  if (!isJsonRecord(repository) || repository.private !== false || typeof repository.full_name !== "string" || repository.full_name.toLowerCase() !== fullName.toLowerCase()) {
    throw new GitHubApiError("GitHub could not confirm this public repository identity.", 409);
  }
  const commit = await githubJson(`${prefix}/git/commits/${encodeURIComponent(input.commitSha)}`);
  if (!isJsonRecord(commit) || typeof commit.sha !== "string" || commit.sha.toLowerCase() !== input.commitSha.toLowerCase()) {
    throw new GitHubApiError("The selected repository commit could not be confirmed.", 409);
  }

  const archiveUrl = new URL(`${prefix}/zipball/${encodeURIComponent(input.commitSha)}`, GITHUB_API);
  let archiveResponse: Response;
  try {
    archiveResponse = await fetch(archiveUrl, {
      headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2026-03-10", "User-Agent": "StackShift" },
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(12_000),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") throw error;
    throw new GitHubApiError("GitHub could not be reached to start the archive download.", 502);
  }
  if (archiveResponse.status !== 302) {
    if (!archiveResponse.ok) throw githubResponseError(archiveResponse.status);
    throw new GitHubApiError("GitHub returned an unexpected response for the source archive.", 502);
  }

  const location = archiveResponse.headers.get("location");
  if (!location) throw new GitHubApiError("GitHub did not provide a source archive download location.", 502);
  let downloadUrl: URL;
  try {
    downloadUrl = new URL(location, archiveUrl);
  } catch {
    throw new GitHubApiError("GitHub provided an invalid source archive location.", 502);
  }
  if (downloadUrl.protocol !== "https:" || downloadUrl.hostname.toLowerCase() !== "codeload.github.com" || downloadUrl.username || downloadUrl.password || downloadUrl.port) {
    throw new GitHubApiError("GitHub provided an unsupported archive download host.", 502);
  }

  let downloadResponse: Response;
  try {
    downloadResponse = await fetch(downloadUrl, { cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(30_000) });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") throw error;
    throw new GitHubApiError("The public repository archive could not be reached.", 502);
  }
  if (downloadResponse.status !== 200) {
    if (!downloadResponse.ok) throw githubResponseError(downloadResponse.status);
    throw new GitHubApiError("The source archive download redirected unexpectedly.", 502);
  }
  return readArchiveLimited(downloadResponse);
}
