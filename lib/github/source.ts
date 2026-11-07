import { githubJson, GitHubApiError, isJsonRecord, MAX_PACKAGE_JSON_BYTES } from "@/lib/github/api";
import { containsSecret, redactSecretText } from "@/lib/security/secrets";

const MAX_TREE_FILES = 100_000;
const MAX_SOURCE_FILES = 16;
const MAX_FILE_BYTES = 16 * 1024;
const MAX_TOTAL_SOURCE_BYTES = 96 * 1024;

export type SourceFile = { path: string; content: string };

function shouldNeverRead(path: string) {
  const lower = path.toLowerCase();
  const segments = lower.split("/");
  return segments.some((segment) => ["node_modules", ".git", ".next", "dist", "build", "coverage", "vendor", "out", ".vercel"].includes(segment)) ||
    /(^|\/)(\.env(?:\..*)?|.*\.(?:pem|key|p12|pfx)|credentials?(?:\..*)?|secrets?(?:\..*)?)$/i.test(path) ||
    /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?)$/i.test(path) ||
    segments.some((segment) => segment.startsWith("."));
}

function sourcePriority(path: string) {
  const lower = path.toLowerCase();
  if (lower === "package.json") return 0;
  if (lower === "index.html") return 1;
  if (/^src\/(main|index|app)\.(tsx?|jsx?)$/.test(lower)) return 2;
  if (/^(src\/)?(app|pages)\/.*\.(tsx?|jsx?)$/.test(lower)) return 3;
  if (/\.(tsx?|jsx?)$/.test(lower) && /(^|\/)(components?|sections?)\//.test(lower)) return 4;
  if (/\.(css|scss|sass)$/.test(lower)) return 5;
  if (/\.(tsx?|jsx?|html)$/.test(lower)) return 6;
  return 10;
}

export function containsCredentialPattern(input: string) {
  return containsSecret(input);
}

function parseBlob(blob: unknown, expectedBytes: number, maxBytes = MAX_FILE_BYTES): string {
  if (!isJsonRecord(blob) || blob.encoding !== "base64" || typeof blob.content !== "string") {
    throw new GitHubApiError("GitHub returned an unreadable source file.", 502);
  }
  const content = Buffer.from(blob.content.replace(/\s/g, ""), "base64");
  if (content.byteLength !== expectedBytes || content.byteLength > maxBytes) {
    throw new GitHubApiError("A source file changed size or exceeded the safe inspection limit. Inspect the repository again.", 413);
  }
  const text = content.toString("utf8");
  if (text.includes("\u0000")) throw new GitHubApiError("A selected source file is binary and cannot be sent for code generation.", 422);
  return redactSecretText(text);
}

function sanitizePackageManifest(content: string) {
  try {
    const manifest: unknown = JSON.parse(content);
    if (!isJsonRecord(manifest)) return "{\"note\":\"package.json was present but could not be summarized\"}";
    const dependencies = isJsonRecord(manifest.dependencies) ? manifest.dependencies : {};
    const devDependencies = isJsonRecord(manifest.devDependencies) ? manifest.devDependencies : {};
    const pick = (source: Record<string, unknown>) => {
      const preferred = ["react", "vite", "next", "vue", "nuxt", "svelte", "@sveltejs/kit", "@angular/core", "angular"];
      const entries = Object.entries(source).filter(([name, version]) => name.length <= 120 && typeof version === "string");
      entries.sort(([left], [right]) => {
        const leftIndex = preferred.indexOf(left);
        const rightIndex = preferred.indexOf(right);
        return (leftIndex < 0 ? preferred.length : leftIndex) - (rightIndex < 0 ? preferred.length : rightIndex);
      });
      return Object.fromEntries(entries.slice(0, 60).map(([name, version]) => [name, (version as string).slice(0, 120)]));
    };
    return JSON.stringify({ name: typeof manifest.name === "string" ? manifest.name.slice(0, 100) : "website", dependencies: pick(dependencies), devDependencies: pick(devDependencies) }, null, 2);
  } catch {
    return "{\"note\":\"package.json is invalid JSON\"}";
  }
}

export async function readMigrationSource(owner: string, repository: string, commitSha: string, options: { includeSourceFiles?: boolean } = {}) {
  const prefix = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}`;
  const commit = await githubJson(`${prefix}/git/commits/${encodeURIComponent(commitSha)}`);
  if (!isJsonRecord(commit) || typeof commit.sha !== "string" || commit.sha.toLowerCase() !== commitSha.toLowerCase() || !isJsonRecord(commit.tree) || typeof commit.tree.sha !== "string") {
    throw new GitHubApiError("The selected repository commit could not be loaded.", 404);
  }
  const tree = await githubJson(`${prefix}/git/trees/${encodeURIComponent(commit.tree.sha)}?recursive=1`);
  if (!isJsonRecord(tree) || !Array.isArray(tree.tree) || tree.truncated || tree.tree.length > MAX_TREE_FILES) {
    throw new GitHubApiError("This repository is too large to read completely for this migration. Try a smaller repository.", 413);
  }

  const treeEntries = tree.tree.filter((entry): entry is Record<string, unknown> =>
    isJsonRecord(entry) && entry.type === "blob" && typeof entry.path === "string" && typeof entry.sha === "string" && typeof entry.size === "number" &&
    !shouldNeverRead(entry.path),
  );
  const manifestEntry = treeEntries.find((entry) => entry.path === "package.json");
  if (manifestEntry && ((manifestEntry.size as number) < 0 || (manifestEntry.size as number) > MAX_PACKAGE_JSON_BYTES)) {
    throw new GitHubApiError("The root package.json is too large to inspect safely.", 413);
  }
  const candidateEntries = treeEntries.filter((entry) =>
    entry.path !== "package.json" && /\.(html?|tsx?|jsx?|css|scss|sass|json)$/i.test(entry.path as string),
  );
  const entries = candidateEntries.filter((entry) => (entry.size as number) >= 0 && (entry.size as number) <= MAX_FILE_BYTES)
    .sort((a, b) => sourcePriority(a.path as string) - sourcePriority(b.path as string) || (a.path as string).localeCompare(b.path as string));

  let manifestFile: SourceFile | null = null;
  if (manifestEntry) {
    const blob = await githubJson(`${prefix}/git/blobs/${encodeURIComponent(manifestEntry.sha as string)}`, MAX_PACKAGE_JSON_BYTES * 2);
    manifestFile = {
      path: "package.json",
      content: sanitizePackageManifest(parseBlob(blob, manifestEntry.size as number, MAX_PACKAGE_JSON_BYTES)),
    };
  }

  const selected: Record<string, unknown>[] = [];
  let selectedBytes = manifestFile ? Buffer.byteLength(manifestFile.content, "utf8") : 0;
  for (const entry of entries) {
    const size = entry.size as number;
    if (selected.length + (manifestFile ? 1 : 0) >= MAX_SOURCE_FILES) break;
    if (selectedBytes + size > MAX_TOTAL_SOURCE_BYTES) continue;
    selected.push(entry);
    selectedBytes += size;
  }
  const result: SourceFile[] = manifestFile ? [manifestFile] : [];
  if (options.includeSourceFiles !== false) {
    for (let index = 0; index < selected.length; index += 4) {
      const batch = selected.slice(index, index + 4);
      const loaded = await Promise.all(batch.map(async (entry) => {
        const path = entry.path as string;
        const size = entry.size as number;
        const blob = await githubJson(`${prefix}/git/blobs/${encodeURIComponent(entry.sha as string)}`, MAX_FILE_BYTES * 2);
        const content = parseBlob(blob, size);
        return { path, content };
      }));
      result.push(...loaded);
    }
  }

  const assetPaths = tree.tree
    .filter((entry): entry is Record<string, unknown> => isJsonRecord(entry) && entry.type === "blob" && typeof entry.path === "string" && !shouldNeverRead(entry.path))
    .map((entry) => entry.path as string)
    .filter((path) => /\.(?:png|jpe?g|gif|webp|avif|woff2?|ttf|otf)$/i.test(path))
    .slice(0, 20);

  if (options.includeSourceFiles !== false && result.length === 0) throw new GitHubApiError("No small, readable source files were found for this migration.", 422);
  const keyFiles = [...(manifestFile ? [manifestFile.path] : []), ...selected.map((entry) => entry.path as string)];
  const routeCandidates = treeEntries
    .map((entry) => entry.path as string)
    .filter((path) => /(^|\/)(index|page)\.html?$|(^|\/)(pages|app)\/.*\.(tsx?|jsx?)$/.test(path))
    .filter((path) => !path.split("/").some((segment) => segment.startsWith(".")))
    .slice(0, 20);
  return {
    files: result,
    fileCount: result.length,
    repositoryFileCount: tree.tree.filter((entry) => isJsonRecord(entry) && entry.type === "blob" && typeof entry.path === "string").length,
    eligibleTextFileCount: candidateEntries.length + (manifestFile ? 1 : 0),
    totalBytes: result.reduce((total, file) => total + Buffer.byteLength(file.content, "utf8"), 0),
    excludedFileCount: Math.max(0, candidateEntries.length + (manifestFile ? 1 : 0) - keyFiles.length),
    assetPaths,
    keyFiles,
    routeCandidates,
  };
}
