import { createHash } from "node:crypto";
import { inflateRawSync } from "node:zlib";
import { GitHubApiError } from "@/lib/github/api";
import { createSourceManifest, isAuditableSourcePath, isDependencyMetadataPath, type SourceManifest, type SourceOrigin } from "./manifest";

export const ZIP_LIMITS = {
  archiveBytes: 10 * 1024 * 1024,
  expandedBytes: 30 * 1024 * 1024,
  entries: 2_000,
  fileBytes: 5 * 1024 * 1024,
  sourceFileBytes: 256 * 1024,
  sourceFiles: 500,
  sourceBytes: 4 * 1024 * 1024,
  metadataFiles: 50,
  metadataBytes: 5 * 1024 * 1024,
  pathDepth: 32,
  pathBytes: 512,
  compressionRatio: 200,
} as const;

type Entry = {
  path: string;
  isDirectory: boolean;
  flags: number;
  method: number;
  crc: number;
  compressedSize: number;
  uncompressedSize: number;
  localOffset: number;
  externalAttributes: number;
};

type ParsedEntry = Entry & { localStart: number; recordEnd: number; dataStart: number };

function invalid(message: string): never {
  throw new GitHubApiError(message, 422);
}

function crc32(bytes: Buffer) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function decodeName(bytes: Buffer, utf8: boolean) {
  if (bytes.includes(0)) invalid("The ZIP contains a file name with a null byte.");
  if (!utf8 && bytes.some((byte) => byte > 0x7f)) invalid("ZIP file names must use UTF-8 encoding.");
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return invalid("The ZIP contains an invalid UTF-8 file name.");
  }
}

function normalizePath(raw: string, isDirectory: boolean) {
  if (!raw || Buffer.byteLength(raw, "utf8") > ZIP_LIMITS.pathBytes || raw.includes("\\") || raw.startsWith("/") || /^[a-zA-Z]:/.test(raw)) {
    invalid("The ZIP contains an absolute, ambiguous, or overlong path.");
  }
  const withoutTrailingSlash = isDirectory && raw.endsWith("/") ? raw.slice(0, -1) : raw;
  const parts = withoutTrailingSlash.split("/");
  if (parts.length > ZIP_LIMITS.pathDepth || parts.some((part) => !part || part === "." || part === ".." || part.includes(":") || /[. ]$/.test(part) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) {
    invalid("The ZIP contains a path traversal or invalid path segment.");
  }
  if (parts.some((part) => Buffer.byteLength(part, "utf8") > 255)) invalid("The ZIP contains an overlong path segment.");
  return parts.join("/");
}

function shouldExclude(path: string) {
  const parts = path.toLowerCase().split("/");
  const base = parts.at(-1) ?? "";
  if (parts.some((part) => [".git", "node_modules", ".next", "dist", "build", "coverage", "out", "vendor", ".vercel"].includes(part))) {
    return "generated or dependency directory";
  }
  if (/^\.env(?:\..*)?$/.test(base) || /^(?:credentials?|secrets?)(?:\..*)?$/.test(base) || /\.(?:pem|key|p12|pfx|p7b|p7c)$/i.test(base)) {
    return "secret or credential file";
  }
  if (isDependencyMetadataPath(path)) return null;
  if (!isAuditableSourcePath(path)) return "unsupported or non-source file type";
  return null;
}

function findEndOfCentralDirectory(bytes: Buffer) {
  const min = Math.max(0, bytes.length - 65_557);
  for (let offset = bytes.length - 22; offset >= min; offset -= 1) {
    if (bytes.readUInt32LE(offset) !== 0x06054b50) continue;
    const commentLength = bytes.readUInt16LE(offset + 20);
    if (offset + 22 + commentLength === bytes.length) return offset;
  }
  return invalid("The upload is not a valid ZIP archive or its directory is incomplete.");
}

function parseCentralDirectory(bytes: Buffer, eocdOffset: number): Entry[] {
  const disk = bytes.readUInt16LE(eocdOffset + 4);
  const centralDisk = bytes.readUInt16LE(eocdOffset + 6);
  const diskCount = bytes.readUInt16LE(eocdOffset + 8);
  const totalCount = bytes.readUInt16LE(eocdOffset + 10);
  const centralSize = bytes.readUInt32LE(eocdOffset + 12);
  const centralOffset = bytes.readUInt32LE(eocdOffset + 16);
  if (disk !== 0 || centralDisk !== 0 || diskCount !== totalCount) invalid("Multi-disk ZIP archives are not supported.");
  if (totalCount === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) invalid("ZIP64 archives are not supported by this upload path.");
  if (totalCount > ZIP_LIMITS.entries) invalid(`The ZIP exceeds the ${ZIP_LIMITS.entries}-entry limit.`);
  if (centralOffset + centralSize !== eocdOffset || centralOffset > bytes.length) invalid("The ZIP central directory has an invalid location or trailing data.");

  const entries: Entry[] = [];
  const seenPaths = new Set<string>();
  let offset = centralOffset;
  for (let index = 0; index < totalCount; index += 1) {
    if (offset + 46 > eocdOffset || bytes.readUInt32LE(offset) !== 0x02014b50) invalid("The ZIP central directory contains an invalid entry.");
    const flags = bytes.readUInt16LE(offset + 8);
    const method = bytes.readUInt16LE(offset + 10);
    const crc = bytes.readUInt32LE(offset + 16);
    const compressedSize = bytes.readUInt32LE(offset + 20);
    const uncompressedSize = bytes.readUInt32LE(offset + 24);
    const nameLength = bytes.readUInt16LE(offset + 28);
    const extraLength = bytes.readUInt16LE(offset + 30);
    const commentLength = bytes.readUInt16LE(offset + 32);
    const startDisk = bytes.readUInt16LE(offset + 34);
    const externalAttributes = bytes.readUInt32LE(offset + 38);
    const localOffset = bytes.readUInt32LE(offset + 42);
    const end = offset + 46 + nameLength + extraLength + commentLength;
    if (end > eocdOffset || startDisk !== 0) invalid("The ZIP contains a split or truncated entry.");
    if ([compressedSize, uncompressedSize, localOffset].includes(0xffffffff)) invalid("ZIP64 entries are not supported by this upload path.");
    if ((flags & 0x0001) !== 0) invalid("Encrypted ZIP entries are not supported.");
    if ((flags & ~0x080e) !== 0) invalid("The ZIP uses unsupported general-purpose flags.");
    if (method !== 0 && method !== 8) invalid("The ZIP uses an unsupported compression method.");
    if (compressedSize > ZIP_LIMITS.archiveBytes || uncompressedSize > ZIP_LIMITS.fileBytes) invalid("A ZIP entry exceeds the per-file size limit.");
    if (compressedSize === 0 ? uncompressedSize !== 0 : uncompressedSize / compressedSize > ZIP_LIMITS.compressionRatio) {
      invalid("A ZIP entry exceeds the allowed compression ratio.");
    }

    const nameBytes = bytes.subarray(offset + 46, offset + 46 + nameLength);
    const rawName = decodeName(nameBytes, (flags & 0x0800) !== 0);
    const isDirectory = rawName.endsWith("/");
    const path = normalizePath(rawName, isDirectory);
    const foldedPath = path.toLocaleLowerCase("en-US");
    if (seenPaths.has(foldedPath)) invalid("The ZIP contains duplicate or case-colliding paths.");
    seenPaths.add(foldedPath);

    const unixMode = externalAttributes >>> 16;
    const unixType = unixMode & 0xf000;
    if ((externalAttributes & 0x0400) !== 0) invalid("Reparse-point files are not allowed in uploaded ZIP archives.");
    if (unixType === 0xa000) invalid("Symbolic links are not allowed in uploaded ZIP archives.");
    if (unixType !== 0 && unixType !== 0x8000 && unixType !== 0x4000) invalid("The ZIP contains a special file type that cannot be uploaded.");
    if (isDirectory && (uncompressedSize !== 0 || (unixType !== 0 && unixType !== 0x4000))) invalid("The ZIP contains an invalid directory entry.");
    if (!isDirectory && unixType === 0x4000) invalid("The ZIP contains a directory entry without a directory path.");

    const extraStart = offset + 46 + nameLength;
    for (let cursor = extraStart; cursor < extraStart + extraLength;) {
      if (cursor + 4 > extraStart + extraLength) invalid("The ZIP contains a malformed extra field.");
      const fieldId = bytes.readUInt16LE(cursor);
      const fieldSize = bytes.readUInt16LE(cursor + 2);
      if (cursor + 4 + fieldSize > extraStart + extraLength) invalid("The ZIP contains a malformed extra field.");
      if (fieldId === 0x0001) invalid("ZIP64 extra fields are not supported by this upload path.");
      if (fieldId === 0x7075) invalid("Unicode path override fields are not supported.");
      cursor += 4 + fieldSize;
    }

    entries.push({ path, isDirectory, flags, method, crc, compressedSize, uncompressedSize, localOffset, externalAttributes });
    offset = end;
  }
  if (offset !== eocdOffset) invalid("The ZIP central directory size does not match its entries.");
  return entries;
}

function readLocalEntry(bytes: Buffer, entry: Entry, centralOffset: number): ParsedEntry {
  const offset = entry.localOffset;
  if (offset + 30 > centralOffset || bytes.readUInt32LE(offset) !== 0x04034b50) invalid("A ZIP local file header is invalid.");
  const localFlags = bytes.readUInt16LE(offset + 6);
  const localMethod = bytes.readUInt16LE(offset + 8);
  const localNameLength = bytes.readUInt16LE(offset + 26);
  const localExtraLength = bytes.readUInt16LE(offset + 28);
  if (localFlags !== entry.flags || localMethod !== entry.method) invalid("A ZIP local header disagrees with its directory entry.");
  const nameStart = offset + 30;
  const dataStart = nameStart + localNameLength + localExtraLength;
  if (dataStart + entry.compressedSize > centralOffset) invalid("A ZIP entry overlaps or extends into its central directory.");
  const localName = bytes.subarray(nameStart, nameStart + localNameLength);
  const utf8 = (entry.flags & 0x0800) !== 0;
  if (decodeName(localName, utf8) !== (entry.isDirectory ? `${entry.path}/` : entry.path)) invalid("A ZIP local filename does not match its directory entry.");
  for (let cursor = nameStart + localNameLength; cursor < dataStart;) {
    if (cursor + 4 > dataStart) invalid("A ZIP local header has a malformed extra field.");
    const fieldId = bytes.readUInt16LE(cursor);
    const fieldSize = bytes.readUInt16LE(cursor + 2);
    if (cursor + 4 + fieldSize > dataStart) invalid("A ZIP local header has a malformed extra field.");
    if (fieldId === 0x0001 || fieldId === 0x7075) invalid("The ZIP local header contains an unsupported extra field.");
    cursor += 4 + fieldSize;
  }

  const hasDescriptor = (entry.flags & 0x0008) !== 0;
  if (!hasDescriptor) {
    const localCrc = bytes.readUInt32LE(offset + 14);
    const localCompressed = bytes.readUInt32LE(offset + 18);
    const localUncompressed = bytes.readUInt32LE(offset + 22);
    if (localCrc !== entry.crc || localCompressed !== entry.compressedSize || localUncompressed !== entry.uncompressedSize) {
      invalid("A ZIP local header has inconsistent sizes or checksum.");
    }
  } else {
    const localCrc = bytes.readUInt32LE(offset + 14);
    const localCompressed = bytes.readUInt32LE(offset + 18);
    const localUncompressed = bytes.readUInt32LE(offset + 22);
    if ((localCrc !== 0 && localCrc !== entry.crc) || (localCompressed !== 0 && localCompressed !== entry.compressedSize) || (localUncompressed !== 0 && localUncompressed !== entry.uncompressedSize)) {
      invalid("A ZIP local header disagrees with its data descriptor.");
    }
  }

  let recordEnd = dataStart + entry.compressedSize;
  if (hasDescriptor) {
    let descriptor = recordEnd;
    if (descriptor + 12 > centralOffset) invalid("A ZIP data descriptor is truncated.");
    if (bytes.readUInt32LE(descriptor) === 0x08074b50) descriptor += 4;
    if (descriptor + 12 > centralOffset || bytes.readUInt32LE(descriptor) !== entry.crc || bytes.readUInt32LE(descriptor + 4) !== entry.compressedSize || bytes.readUInt32LE(descriptor + 8) !== entry.uncompressedSize) {
      invalid("A ZIP data descriptor does not match its directory entry.");
    }
    recordEnd = descriptor + 12;
  }
  return { ...entry, localStart: offset, recordEnd, dataStart };
}

function unpackEntry(bytes: Buffer, entry: ParsedEntry) {
  const compressed = bytes.subarray(entry.dataStart, entry.dataStart + entry.compressedSize);
  let output: Buffer;
  try {
    output = entry.method === 0
      ? Buffer.from(compressed)
      : inflateRawSync(compressed, { maxOutputLength: entry.uncompressedSize + 1 });
  } catch {
    return invalid("A ZIP entry could not be safely decompressed within its declared size.");
  }
  if (output.byteLength !== entry.uncompressedSize || crc32(output) !== entry.crc) invalid("A ZIP entry has an invalid expanded size or checksum.");
  return output;
}

function safeLabel(filename: string) {
  const base = filename.split(/[\\/]/).at(-1) || "uploaded-project.zip";
  return base.replace(/[\r\n\u0000]/g, "").slice(0, 120) || "uploaded-project.zip";
}

export function readZipSourceManifest(archive: Buffer, filename: string, originOverride?: SourceOrigin): SourceManifest {
  if (archive.byteLength === 0) invalid("Choose a non-empty ZIP archive.");
  if (archive.byteLength > ZIP_LIMITS.archiveBytes) invalid(`The compressed ZIP exceeds the ${ZIP_LIMITS.archiveBytes / (1024 * 1024)} MiB upload limit.`);
  const eocdOffset = findEndOfCentralDirectory(archive);
  const centralOffset = archive.readUInt32LE(eocdOffset + 16);
  const entries = parseCentralDirectory(archive, eocdOffset);
  let expandedTotal = 0;
  let sourceBytes = 0;
  let eligibleTextFiles = 0;
  const files: Array<{ path: string; content: string }> = [];
  const metadataFiles: Array<{ path: string; content: string }> = [];
  const metadataFilePaths: string[] = [];
  let metadataBytes = 0;
  const exclusions = new Map<string, number>();
  const parsedEntries = entries.map((entry) => readLocalEntry(archive, entry, centralOffset)).sort((a, b) => a.localStart - b.localStart);
  const fileEntries = parsedEntries.filter((entry) => !entry.isDirectory);
  const firstSegments = new Set(fileEntries.map((entry) => entry.path.split("/")[0]));
  const commonRoot = firstSegments.size === 1 && fileEntries.every((entry) => entry.path.includes("/"))
    ? `${fileEntries[0].path.split("/")[0]}/`
    : "";
  for (let index = 1; index < parsedEntries.length; index += 1) {
    if (parsedEntries[index - 1].recordEnd > parsedEntries[index].localStart) invalid("ZIP entries overlap in the archive data.");
  }

  for (const entry of parsedEntries) {
    if (entry.isDirectory) continue;
    const projectPath = commonRoot && entry.path.startsWith(commonRoot) ? entry.path.slice(commonRoot.length) : entry.path;
    expandedTotal += entry.uncompressedSize;
    if (expandedTotal > ZIP_LIMITS.expandedBytes) invalid(`The expanded ZIP exceeds the ${ZIP_LIMITS.expandedBytes / (1024 * 1024)} MiB safety limit.`);
    const output = unpackEntry(archive, entry);
    const excludedReason = shouldExclude(projectPath);
    if (excludedReason) {
      exclusions.set(excludedReason, (exclusions.get(excludedReason) ?? 0) + 1);
      continue;
    }

    if (isDependencyMetadataPath(projectPath)) {
      metadataFilePaths.push(projectPath);
      if (metadataFiles.length >= ZIP_LIMITS.metadataFiles || metadataBytes + entry.uncompressedSize > ZIP_LIMITS.metadataBytes) {
        exclusions.set("dependency metadata omitted by analysis limits", (exclusions.get("dependency metadata omitted by analysis limits") ?? 0) + 1);
        continue;
      }
      if (output.includes(0)) {
        exclusions.set("binary or non-UTF-8 dependency metadata", (exclusions.get("binary or non-UTF-8 dependency metadata") ?? 0) + 1);
        continue;
      }
      try {
        const content = new TextDecoder("utf-8", { fatal: true }).decode(output);
        metadataFiles.push({ path: projectPath, content });
        metadataBytes += output.byteLength;
      } catch {
        exclusions.set("binary or non-UTF-8 dependency metadata", (exclusions.get("binary or non-UTF-8 dependency metadata") ?? 0) + 1);
      }
      continue;
    }

    eligibleTextFiles += 1;
    if (entry.uncompressedSize > ZIP_LIMITS.sourceFileBytes || files.length >= ZIP_LIMITS.sourceFiles || sourceBytes + entry.uncompressedSize > ZIP_LIMITS.sourceBytes) {
      exclusions.set("text source omitted by analysis limits", (exclusions.get("text source omitted by analysis limits") ?? 0) + 1);
      continue;
    }
    if (output.includes(0)) {
      exclusions.set("binary or non-UTF-8 file", (exclusions.get("binary or non-UTF-8 file") ?? 0) + 1);
      eligibleTextFiles -= 1;
      continue;
    }
    let content: string;
    try {
      content = new TextDecoder("utf-8", { fatal: true }).decode(output);
    } catch {
      exclusions.set("binary or non-UTF-8 file", (exclusions.get("binary or non-UTF-8 file") ?? 0) + 1);
      eligibleTextFiles -= 1;
      continue;
    }
    sourceBytes += output.byteLength;
    files.push({ path: projectPath, content });
  }

  if (files.length === 0 && metadataFiles.length === 0) invalid("The ZIP contains no small, readable source or dependency files supported by the current audit.");

  const omittedEligibleFiles = Math.max(0, eligibleTextFiles - files.length);
  const archiveHash = createHash("sha256").update(archive).digest("hex");
  const exclusionSummary = [...exclusions.entries()].map(([reason, count]) => `${count} file(s): ${reason}`);
  return createSourceManifest({
    origin: originOverride ?? { kind: "zip", label: safeLabel(filename), revision: archiveHash },
    files,
    metadataFiles,
    metadataFilePaths,
    repositoryFileCount: entries.filter((entry) => !entry.isDirectory).length,
    eligibleTextFileCount: eligibleTextFiles,
    omittedEligibleFiles,
    exclusions: exclusionSummary,
  });
}
