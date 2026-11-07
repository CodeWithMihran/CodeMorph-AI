export type ParsedGitHubRepositoryUrl = {
  owner: string;
  repository: string;
};

/** Accepts only a canonical GitHub repository URL, never an arbitrary host. */
export function parseGitHubRepositoryUrl(
  input: string,
): ParsedGitHubRepositoryUrl | null {
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > 2_048) return null;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  if (
    url.protocol !== "https:" ||
    !["github.com", "www.github.com"].includes(url.hostname.toLowerCase()) ||
    url.username ||
    url.password ||
    url.port ||
    url.search ||
    url.hash
  ) {
    return null;
  }

  const pathMatch = /^\/([^/]+)\/([^/]+)\/?$/.exec(url.pathname);
  if (!pathMatch) return null;

  let owner = pathMatch[1];
  let repository = pathMatch[2];
  try {
    owner = decodeURIComponent(owner);
    repository = decodeURIComponent(repository);
  } catch {
    return null;
  }

  if (
    !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(owner) ||
    !/^[A-Za-z0-9._-]+$/.test(repository) ||
    repository === "." ||
    repository === ".."
  ) {
    return null;
  }

  if (repository.toLowerCase().endsWith(".git")) {
    repository = repository.slice(0, -4);
  }

  if (!repository || repository.length > 100) return null;

  return { owner, repository };
}
