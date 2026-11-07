import { createHash } from "node:crypto";

export type SourceOrigin = {
  kind: "github" | "zip";
  label: string;
  revision: string;
};

export type ManifestFile = {
  path: string;
  content: string;
  sizeBytes: number;
  sha256: string;
};

export type SourceManifest = {
  version: "source-manifest-v1";
  origin: SourceOrigin;
  files: ManifestFile[];
  metadataFiles: ManifestFile[];
  metadataFilePaths: string[];
  repositoryFileCount: number;
  eligibleTextFileCount: number;
  omittedEligibleFiles: number;
  totalBytes: number;
  exclusions: string[];
};

export function isAuditableSourcePath(path: string) {
  return !isDependencyMetadataPath(path) && /\.(?:[cm]?[jt]sx?|html?|css|scss|sass|json)$/i.test(path);
}

export function isDependencyMetadataPath(path: string) {
  return /(^|\/)(?:package\.json|package-lock\.json|npm-shrinkwrap\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?)$/i.test(path);
}

export function createSourceManifest(input: {
  origin: SourceOrigin;
  files: Array<{ path: string; content: string }>;
  metadataFiles?: Array<{ path: string; content: string }>;
  metadataFilePaths?: string[];
  repositoryFileCount: number;
  eligibleTextFileCount: number;
  omittedEligibleFiles: number;
  exclusions?: string[];
}): SourceManifest {
  let totalBytes = 0;
  const hashFiles = (inputFiles: Array<{ path: string; content: string }>) => inputFiles.map((file) => {
    const bytes = Buffer.from(file.content, "utf8");
    totalBytes += bytes.byteLength;
    return {
      path: file.path,
      content: file.content,
      sizeBytes: bytes.byteLength,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
  });
  const files = hashFiles(input.files);
  const metadataFiles = hashFiles(input.metadataFiles ?? []);
  return {
    version: "source-manifest-v1",
    origin: input.origin,
    files,
    metadataFiles,
    metadataFilePaths: input.metadataFilePaths ?? metadataFiles.map((file) => file.path),
    repositoryFileCount: input.repositoryFileCount,
    eligibleTextFileCount: input.eligibleTextFileCount,
    omittedEligibleFiles: input.omittedEligibleFiles,
    totalBytes,
    exclusions: input.exclusions ?? [],
  };
}
