import { parseGitHubRepositoryUrl } from "@/lib/github/parse-repository-url";
import type { GitHubRepository } from "@/lib/github/types";

const GITHUB_API = "https://api.github.com";
const REQUEST_TIMEOUT_MS = 8_000;
const MAX_REQUEST_BYTES = 4_096;

async function readJsonBody(request: Request) {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return { error: "too_large" as const };
  }

  const reader = request.body?.getReader();
  if (!reader) return { error: "invalid_json" as const };

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalBytes += value.byteLength;
      if (totalBytes > MAX_REQUEST_BYTES) {
        await reader.cancel();
        return { error: "too_large" as const };
      }
      chunks.push(value);
    }

    const bytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }

    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { body: JSON.parse(text) as unknown };
  } catch {
    return { error: "invalid_json" as const };
  } finally {
    reader.releaseLock();
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function POST(request: Request) {
  const parsedBody = await readJsonBody(request);
  if ("error" in parsedBody) {
    if (parsedBody.error === "too_large") {
      return Response.json(
        { error: "This request is too large. Submit a repository URL under 2,048 characters." },
        { status: 413 },
      );
    }
    return Response.json(
      { error: "Send a valid JSON request containing a repositoryUrl." },
      { status: 400 },
    );
  }

  const repositoryUrl =
    isRecord(parsedBody.body) ? parsedBody.body.repositoryUrl : undefined;

  if (typeof repositoryUrl !== "string" || repositoryUrl.length > 2_048) {
    return Response.json(
      { error: "Enter a GitHub repository URL to continue." },
      { status: 400 },
    );
  }

  const parsed = parseGitHubRepositoryUrl(repositoryUrl);
  if (!parsed) {
    return Response.json(
      {
        error:
          "That link does not look like a GitHub repository. Use a link such as https://github.com/owner/repository.",
      },
      { status: 400 },
    );
  }

  const apiUrl = new URL(
    `/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repository)}`,
    GITHUB_API,
  );

  let response: Response;
  try {
    response = await fetch(apiUrl, {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2026-03-10",
        "User-Agent": "StackShift",
      },
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    return Response.json(
      { error: "GitHub could not be reached. Check your connection and try again." },
      { status: 502 },
    );
  }

  if (response.status >= 300 && response.status < 400) {
    return Response.json(
      {
        error:
          "This repository link has moved. Open it on GitHub and submit its current URL.",
      },
      { status: 409 },
    );
  }

  if (response.status === 404) {
    return Response.json(
      {
        error:
          "GitHub could not find a public repository at that address. Check the link; private repositories are not supported yet.",
      },
      { status: 404 },
    );
  }

  if (response.status === 403 || response.status === 429) {
    const remaining = response.headers.get("x-ratelimit-remaining");
    const message = remaining === "0"
      ? "GitHub's public API rate limit has been reached. Please wait a little and try again."
      : "GitHub temporarily declined the request. Please wait a moment and try again.";
    return Response.json({ error: message }, { status: 429 });
  }

  if (!response.ok) {
    return Response.json(
      { error: "GitHub could not check this repository right now. Please try again." },
      { status: 502 },
    );
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    return Response.json(
      { error: "GitHub returned an unreadable response. Please try again." },
      { status: 502 },
    );
  }

  if (!isRecord(data) || !isRecord(data.owner)) {
    return Response.json(
      { error: "GitHub returned incomplete repository details. Please try again." },
      { status: 502 },
    );
  }

  const ownerLogin = data.owner.login;
  const name = data.name;
  const fullName = data.full_name;
  const defaultBranch = data.default_branch;
  const stars = data.stargazers_count;

  if (data.private === true) {
    return Response.json(
      {
        error:
          "GitHub could not find a public repository at that address. Check the link; private repositories are not supported yet.",
      },
      { status: 404 },
    );
  }

  if (
    data.private !== false ||
    typeof ownerLogin !== "string" ||
    typeof name !== "string" ||
    name.length === 0 ||
    name.length > 100 ||
    typeof fullName !== "string" ||
    typeof defaultBranch !== "string" ||
    defaultBranch.length === 0 ||
    typeof stars !== "number" ||
    !Number.isInteger(stars) ||
    stars < 0 ||
    !(data.description === null || typeof data.description === "string") ||
    !(data.language === null || typeof data.language === "string")
  ) {
    return Response.json(
      {
        error:
          "GitHub could not find a public repository with complete details at that address.",
      },
      { status: 502 },
    );
  }

  const repository: GitHubRepository = {
    name,
    fullName,
    url: `https://github.com/${encodeURIComponent(ownerLogin)}/${encodeURIComponent(name)}`,
    description: data.description,
    defaultBranch,
    language: data.language,
    stars,
  };

  return Response.json({ repository });
}
