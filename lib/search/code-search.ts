/**
 * Global Multi-File Code Search, Replace & Symbol Navigation Engine
 * Performs project-wide substring, whole-word, regex searches, atomic find-and-replace,
 * and AST-level export symbol definition resolution.
 * Pure TypeScript, client-safe with zero host execution.
 */

import type { ZipEntry } from "@/lib/migration/zip";
import { computeLineDiff, type DiffLine } from "@/lib/memory/rule-studio";

export type SearchMatch = {
  filePath: string;
  lineNumber: number;
  lineContent: string;
  matchStart: number;
  matchEnd: number;
  matchedText: string;
};

export type FileSearchResults = {
  filePath: string;
  matches: SearchMatch[];
  matchCount: number;
};

export type GlobalSearchQuery = {
  query: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  isRegex: boolean;
  fileFilter?: string;
};

export type GlobalSearchResult = {
  query: GlobalSearchQuery;
  fileResults: FileSearchResults[];
  totalMatches: number;
  totalFiles: number;
  searchTimeMs: number;
  isValidQuery: boolean;
  errorMessage?: string;
};

export type ReplacePreview = {
  filePath: string;
  originalContent: string;
  replacedContent: string;
  diff: DiffLine[];
  replacedCount: number;
};

export type GlobalReplaceResult = {
  previews: ReplacePreview[];
  totalReplacedCount: number;
  affectedFilesCount: number;
  updatedEntries: ZipEntry[];
};

export type SymbolDefinition = {
  symbolName: string;
  filePath: string;
  lineNumber: number;
  lineContent: string;
  kind: "function" | "const" | "type" | "interface" | "class" | "default_export";
};

/**
 * Checks if a file path matches an optional glob/wildcard filter (e.g. "*.tsx", "app/**", "!*.json")
 */
function matchesFileFilter(filePath: string, filter?: string): boolean {
  if (!filter || !filter.trim()) return true;

  const patterns = filter
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  let includeMatch = false;
  let hasIncludes = false;

  for (const pat of patterns) {
    const isNegation = pat.startsWith("!");
    const cleanPat = isNegation ? pat.slice(1) : pat;

    // Convert simple wildcard to regex
    const regexPattern = cleanPat
      .replace(/\./g, "\\.")
      .replace(/\*\*/g, ".*")
      .replace(/\*/g, "[^/]*");
    const regex = new RegExp(`^${regexPattern}$`, "i");

    if (isNegation) {
      if (regex.test(filePath)) return false; // Excluded
    } else {
      hasIncludes = true;
      if (regex.test(filePath)) includeMatch = true;
    }
  }

  return hasIncludes ? includeMatch : true;
}

/**
 * Builds a safe RegExp based on search parameters
 */
function buildSearchRegex(query: GlobalSearchQuery): RegExp {
  let pattern = query.query;

  if (!query.isRegex) {
    // Escape regex special chars
    pattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  if (query.wholeWord) {
    pattern = `\\b${pattern}\\b`;
  }

  const flags = query.caseSensitive ? "g" : "gi";
  return new RegExp(pattern, flags);
}

/**
 * Executes a global search across all project entries
 */
export function executeGlobalSearch(
  entries: ZipEntry[],
  searchQuery: GlobalSearchQuery
): GlobalSearchResult {
  const startTime = performance.now();

  if (!searchQuery.query || !searchQuery.query.trim()) {
    return {
      query: searchQuery,
      fileResults: [],
      totalMatches: 0,
      totalFiles: 0,
      searchTimeMs: 0,
      isValidQuery: true,
    };
  }

  let regex: RegExp;
  try {
    regex = buildSearchRegex(searchQuery);
  } catch (err) {
    return {
      query: searchQuery,
      fileResults: [],
      totalMatches: 0,
      totalFiles: 0,
      searchTimeMs: 0,
      isValidQuery: false,
      errorMessage: `Invalid regular expression: ${(err as Error).message}`,
    };
  }

  const fileResults: FileSearchResults[] = [];
  let totalMatches = 0;

  for (const entry of entries) {
    // Skip binary or manifest internal files
    if (entry.path.startsWith(".git/") || entry.path === ".codemorph/source-manifest.json") {
      continue;
    }

    if (!matchesFileFilter(entry.path, searchQuery.fileFilter)) {
      continue;
    }

    const lines = entry.content.split("\n");
    const matchesInFile: SearchMatch[] = [];

    for (let l = 0; l < lines.length; l++) {
      const lineContent = lines[l];
      regex.lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = regex.exec(lineContent)) !== null) {
        matchesInFile.push({
          filePath: entry.path,
          lineNumber: l + 1,
          lineContent,
          matchStart: match.index,
          matchEnd: match.index + match[0].length,
          matchedText: match[0],
        });

        // Prevent infinite loop on zero-width match
        if (match[0].length === 0) {
          regex.lastIndex++;
        }
      }
    }

    if (matchesInFile.length > 0) {
      fileResults.push({
        filePath: entry.path,
        matches: matchesInFile,
        matchCount: matchesInFile.length,
      });
      totalMatches += matchesInFile.length;
    }
  }

  const searchTimeMs = Math.round((performance.now() - startTime) * 100) / 100;

  return {
    query: searchQuery,
    fileResults,
    totalMatches,
    totalFiles: fileResults.length,
    searchTimeMs,
    isValidQuery: true,
  };
}

/**
 * Executes a global atomic replace across matched files
 */
export function executeGlobalReplace(
  entries: ZipEntry[],
  searchQuery: GlobalSearchQuery,
  replacement: string,
  selectedFiles?: string[]
): GlobalReplaceResult {
  if (!searchQuery.query) {
    return {
      previews: [],
      totalReplacedCount: 0,
      affectedFilesCount: 0,
      updatedEntries: entries,
    };
  }

  const regex = buildSearchRegex(searchQuery);
  const previews: ReplacePreview[] = [];
  let totalReplacedCount = 0;

  const targetFileSet = selectedFiles ? new Set(selectedFiles) : null;

  const updatedEntries = entries.map((entry) => {
    if (targetFileSet && !targetFileSet.has(entry.path)) {
      return entry;
    }

    if (!matchesFileFilter(entry.path, searchQuery.fileFilter)) {
      return entry;
    }

    regex.lastIndex = 0;
    const matches = entry.content.match(regex);
    if (!matches || matches.length === 0) {
      return entry;
    }

    const replacedContent = entry.content.replace(regex, replacement);
    const diff = computeLineDiff(entry.content, replacedContent);

    previews.push({
      filePath: entry.path,
      originalContent: entry.content,
      replacedContent,
      diff,
      replacedCount: matches.length,
    });

    totalReplacedCount += matches.length;

    return {
      ...entry,
      content: replacedContent,
    };
  });

  return {
    previews,
    totalReplacedCount,
    affectedFilesCount: previews.length,
    updatedEntries,
  };
}

/**
 * Resolves the declaration/definition location of an exported symbol across project files
 */
export function findSymbolDefinition(
  entries: ZipEntry[],
  symbolName: string
): SymbolDefinition | null {
  if (!symbolName || !symbolName.trim()) return null;
  const cleanSymbol = symbolName.trim();

  // Definition search regex patterns
  const patterns: Array<{ regex: RegExp; kind: SymbolDefinition["kind"] }> = [
    {
      regex: new RegExp(`(?:export\\s+(?:default\\s+)?function|function)\\s+${cleanSymbol}\\b`),
      kind: "function",
    },
    {
      regex: new RegExp(`export\\s+(?:const|let|var)\\s+${cleanSymbol}\\b`),
      kind: "const",
    },
    {
      regex: new RegExp(`export\\s+type\\s+${cleanSymbol}\\b`),
      kind: "type",
    },
    {
      regex: new RegExp(`export\\s+interface\\s+${cleanSymbol}\\b`),
      kind: "interface",
    },
    {
      regex: new RegExp(`export\\s+class\\s+${cleanSymbol}\\b`),
      kind: "class",
    },
    {
      regex: new RegExp(`export\\s+default\\s+${cleanSymbol}\\b`),
      kind: "default_export",
    },
  ];

  for (const entry of entries) {
    if (!/\.(?:tsx?|jsx?)$/.test(entry.path)) continue;

    const lines = entry.content.split("\n");
    for (let l = 0; l < lines.length; l++) {
      const line = lines[l];
      for (const { regex, kind } of patterns) {
        if (regex.test(line)) {
          return {
            symbolName: cleanSymbol,
            filePath: entry.path,
            lineNumber: l + 1,
            lineContent: line.trim(),
            kind,
          };
        }
      }
    }
  }

  return null;
}
