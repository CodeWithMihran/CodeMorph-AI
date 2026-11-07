import { githubJson, GitHubApiError, isJsonRecord } from "@/lib/github/api";
import { classifySource } from "@/lib/github/classify-source";
import { parseGitHubRepositoryUrl } from "@/lib/github/parse-repository-url";
import { readMigrationSource } from "@/lib/github/source";

export type AuthoritativeMigrationSource = Awaited<ReturnType<typeof readMigrationSource>> & {
  repository: string;
  sourceType: "static" | "react-vite" | "unsupported";
  framework: string;
  keyFiles: string[];
  routeCandidates: string[];
};

/** Rebuild the migration facts from GitHub instead of trusting browser-supplied profile data. */
export async function inspectMigrationSource(input: {
  repositoryUrl: string;
  expectedFullName: string;
  commitSha: string;
  includeSourceFiles?: boolean;
}): Promise<AuthoritativeMigrationSource> {
  const parsed = parseGitHubRepositoryUrl(input.repositoryUrl);
  if (!parsed) throw new GitHubApiError("The repository URL is invalid. Inspect the repository again.", 400);

  const urlFullName = `${parsed.owner}/${parsed.repository}`;
  if (urlFullName.toLowerCase() !== input.expectedFullName.toLowerCase()) {
    throw new GitHubApiError("The repository identity changed. Inspect the repository again.", 409);
  }

  const metadata = await githubJson(`/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repository)}`);
  if (
    !isJsonRecord(metadata) || metadata.private !== false || typeof metadata.full_name !== "string" ||
    metadata.full_name.toLowerCase() !== urlFullName.toLowerCase() ||
    metadata.full_name.toLowerCase() !== input.expectedFullName.toLowerCase()
  ) {
    throw new GitHubApiError("GitHub could not confirm this public repository identity. Inspect the repository again.", 409);
  }

  const source = await readMigrationSource(parsed.owner, parsed.repository, input.commitSha, { includeSourceFiles: input.includeSourceFiles });
  const packageFile = source.files.find((file) => file.path === "package.json");
  let manifest: Record<string, unknown> | null = null;
  if (packageFile) {
    try {
      const parsedManifest: unknown = JSON.parse(packageFile.content);
      if (isJsonRecord(parsedManifest)) manifest = parsedManifest;
    } catch {
      // The source reader provides a sanitized note for malformed package manifests.
    }
  }
  const classification = classifySource(new Set([...source.keyFiles, ...source.routeCandidates]), manifest);

  return {
    ...source,
    repository: metadata.full_name,
    ...classification,
    keyFiles: source.keyFiles,
    routeCandidates: source.routeCandidates,
  };
}
