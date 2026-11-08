import { isJsonRecord, GitHubApiError } from "@/lib/github/api";
import { classifySource, type ClassifiedSource } from "@/lib/github/classify-source";
import { sourcePriority, sanitizePackageManifest } from "@/lib/github/source";
import { analyzeSourceRoutes, type SourceRouteInventory } from "@/lib/migration/source-routes";
import { redactSecretText } from "@/lib/security/secrets";
import { evaluateFeasibility, type FeasibilityReport } from "@/lib/analysis/feasibility";
import type { SourceManifest, SourceOrigin } from "@/lib/source/manifest";

const MAX_SOURCE_FILES = 16;
const MAX_FILE_BYTES = 16 * 1024;
const MAX_TOTAL_SOURCE_BYTES = 96 * 1024;

export type ZipSourceProfile = ClassifiedSource & {
  packageManager: string | null;
  fileCount: number;
  keyFiles: string[];
  routeCandidates: string[];
  inspectedAt: string;
  feasibility?: FeasibilityReport;
};

export type ZipAnalysis = {
  source: SourceOrigin;
  profile: ZipSourceProfile;
};

export type PreparedZipMigration = {
  repository: string;
  revision: string;
  framework: string;
  sourceType: "static" | "react-vite" | "unsupported";
  supported: boolean;
  supportReason: string;
  files: Array<{ path: string; content: string }>;
  fileCount: number;
  totalBytes: number;
  excludedFileCount: number;
  assetPaths: string[];
  keyFiles: string[];
  routeCandidates: string[];
  routes: SourceRouteInventory;
  feasibility?: FeasibilityReport;
};

function detectPackageManager(metadataPaths: string[], filePaths: string[]) {
  const all = new Set([...metadataPaths, ...filePaths].map((p) => p.toLowerCase()));
  if (all.has("pnpm-lock.yaml")) return "pnpm";
  if (all.has("yarn.lock")) return "yarn";
  if (all.has("bun.lock") || all.has("bun.lockb")) return "bun";
  if (all.has("package-lock.json") || all.has("npm-shrinkwrap.json")) return "npm";
  return null;
}

function findRootPackageJson(manifest: SourceManifest): Record<string, unknown> | null {
  const candidate = manifest.metadataFiles.find((file) => file.path === "package.json") ??
    manifest.files.find((file) => file.path === "package.json");
  if (!candidate) return null;
  try {
    const parsed = JSON.parse(candidate.content);
    return isJsonRecord(parsed) ? parsed : null;
  } catch {
    return { note: "package.json is invalid JSON" };
  }
}

export function analyzeZipSource(manifest: SourceManifest): ZipAnalysis {
  const allPaths = [...manifest.files.map((file) => file.path), ...manifest.metadataFilePaths];
  const rootFiles = new Set(allPaths.filter((path) => !path.includes("/")));
  const parsedManifest = findRootPackageJson(manifest);
  const classification = classifySource(rootFiles, parsedManifest);

  const routeCandidates = allPaths
    .filter((path) => /(^|\/)(?:index|page)\.html?$|(^|\/)(?:pages|app)\/.*\.(?:tsx?|jsx?)$/i.test(path))
    .filter((path) => !path.split("/").some((segment) => segment.startsWith(".")))
    .slice(0, 20);

  const keyFiles = [
    "package.json", "index.html",
    "vite.config.ts", "vite.config.js", "vite.config.mjs", "vite.config.mts",
    "src/main.tsx", "src/main.jsx", "src/App.tsx", "src/App.jsx",
  ].filter((path) => rootFiles.has(path) || allPaths.includes(path));

  const feasibility = evaluateFeasibility({
    sourceType: classification.sourceType,
    framework: classification.framework,
    supportReason: classification.supportReason,
    filePaths: allPaths,
    keyFiles,
    routeCandidates,
    manifest: parsedManifest,
    files: manifest.files,
  });

  return {
    source: manifest.origin,
    profile: {
      ...classification,
      packageManager: detectPackageManager(manifest.metadataFilePaths, manifest.files.map((file) => file.path)),
      fileCount: manifest.repositoryFileCount,
      keyFiles,
      routeCandidates,
      inspectedAt: new Date().toISOString(),
      feasibility,
    },
  };
}

export function prepareZipMigration(manifest: SourceManifest, target: "nextjs" | "expo" = "nextjs"): PreparedZipMigration {
  const analysis = analyzeZipSource(manifest);
  if (analysis.profile.sourceType === "unsupported") {
    throw new GitHubApiError(`This ZIP project is not supported for migration: ${analysis.profile.supportReason}`, 422);
  }

  const rawPackageFile = manifest.metadataFiles.find((file) => file.path === "package.json") ??
    manifest.files.find((file) => file.path === "package.json");
  let manifestFile: { path: string; content: string } | null = null;
  if (rawPackageFile) {
    manifestFile = {
      path: "package.json",
      content: sanitizePackageManifest(rawPackageFile.content),
    };
  }

  const candidateEntries = manifest.files
    .filter((file) => file.path !== "package.json" && file.sizeBytes <= MAX_FILE_BYTES &&
      /\.(?:html?|tsx?|jsx?|css|scss|sass|json)$/i.test(file.path))
    .sort((a, b) => sourcePriority(a.path) - sourcePriority(b.path) || a.path.localeCompare(b.path));

  const selectedFiles: Array<{ path: string; content: string }> = manifestFile ? [manifestFile] : [];
  let totalBytes = manifestFile ? Buffer.byteLength(manifestFile.content, "utf8") : 0;

  for (const entry of candidateEntries) {
    if (selectedFiles.length >= MAX_SOURCE_FILES) break;
    const content = redactSecretText(entry.content);
    const size = Buffer.byteLength(content, "utf8");
    if (totalBytes + size > MAX_TOTAL_SOURCE_BYTES) continue;
    selectedFiles.push({ path: entry.path, content });
    totalBytes += size;
  }

  if (selectedFiles.length === 0) {
    throw new GitHubApiError("No small, readable source files were found in the uploaded ZIP for migration.", 422);
  }

  const assetPaths = manifest.files
    .map((file) => file.path)
    .filter((path) => /\.(?:png|jpe?g|gif|webp|avif|woff2?|ttf|otf|svg)$/i.test(path))
    .slice(0, 20);

  const routes = analyzeSourceRoutes({
    sourceType: analysis.profile.sourceType,
    files: selectedFiles,
    routeCandidates: analysis.profile.routeCandidates,
  });

  const allPaths = [...manifest.files.map((file) => file.path), ...manifest.metadataFilePaths];
  const targetFeasibility = evaluateFeasibility({
    sourceType: analysis.profile.sourceType,
    framework: analysis.profile.framework,
    supportReason: analysis.profile.supportReason,
    filePaths: allPaths,
    keyFiles: analysis.profile.keyFiles,
    routeCandidates: analysis.profile.routeCandidates,
    manifest: findRootPackageJson(manifest),
    files: manifest.files,
    target,
  });

  return {
    repository: manifest.origin.label,
    revision: manifest.origin.revision,
    framework: analysis.profile.framework,
    sourceType: analysis.profile.sourceType,
    supported: analysis.profile.supported,
    supportReason: analysis.profile.supportReason,
    files: selectedFiles,
    fileCount: selectedFiles.length,
    totalBytes,
    excludedFileCount: Math.max(0, manifest.eligibleTextFileCount - selectedFiles.length),
    assetPaths,
    keyFiles: analysis.profile.keyFiles,
    routeCandidates: analysis.profile.routeCandidates,
    routes,
    feasibility: targetFeasibility,
  };
}
