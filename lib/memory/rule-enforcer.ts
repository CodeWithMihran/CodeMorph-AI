/**
 * Procedural Memory Batch Rule Enforcer Engine
 * Scans migrated project files against active procedural rules and .codemorph/rules.json,
 * computes multi-file diff previews, and executes sequential safe transformations.
 * Pure TypeScript, client-safe with zero host execution.
 */

import type { ZipEntry } from "@/lib/migration/zip";
import {
  evaluateRuleTransform,
  type StudioRule,
  type DiffLine,
} from "@/lib/memory/rule-studio";

export type RuleMatchResult = {
  id: string; // unique match identifier: `${ruleId}::${filePath}`
  ruleId: string;
  ruleName: string;
  category: string;
  resolution: string;
  filePath: string;
  originalContent: string;
  transformedContent: string;
  matchesCount: number;
  diff: DiffLine[];
  selected: boolean;
};

export type RuleSummaryItem = {
  ruleId: string;
  ruleName: string;
  category: string;
  resolution: string;
  matchCount: number;
  affectedFiles: string[];
};

export type BatchEnforcementPlan = {
  totalMatches: number;
  affectedFilesCount: number;
  matches: RuleMatchResult[];
  summaryByRule: RuleSummaryItem[];
};

/**
 * Scans a project's entries against a list of procedural rules.
 * Identifies applicable transformations, counts matches, and generates diff summaries.
 */
export function scanProjectForProceduralRules(
  entries: ZipEntry[],
  rules: StudioRule[]
): BatchEnforcementPlan {
  const matches: RuleMatchResult[] = [];
  const ruleMap = new Map<string, RuleSummaryItem>();

  // Filter out non-code files (e.g. binaries, assets, git metadata)
  const codeEntries = entries.filter((e) =>
    /\.(?:tsx?|jsx?|css|json|html|md)$/i.test(e.path) &&
    !e.path.startsWith(".git/") &&
    !e.path.startsWith(".codemorph/source-manifest")
  );

  for (const rule of rules) {
    if (!rule.pattern) continue;

    for (const entry of codeEntries) {
      // Evaluate rule transformation on this file
      const result = evaluateRuleTransform(entry.content, {
        pattern: rule.pattern,
        replacement: rule.replacement,
        isRegex: rule.isRegex,
        flags: rule.flags,
      });

      if (result.changed && result.matchesCount > 0) {
        const matchId = `${rule.id}::${entry.path}`;
        matches.push({
          id: matchId,
          ruleId: rule.id,
          ruleName: rule.name,
          category: rule.category,
          resolution: rule.resolution || rule.description,
          filePath: entry.path,
          originalContent: entry.content,
          transformedContent: result.transformed,
          matchesCount: result.matchesCount,
          diff: result.diff,
          selected: true, // Default to checked
        });

        // Update rule summary
        const existingSummary = ruleMap.get(rule.id);
        if (existingSummary) {
          existingSummary.matchCount += result.matchesCount;
          if (!existingSummary.affectedFiles.includes(entry.path)) {
            existingSummary.affectedFiles.push(entry.path);
          }
        } else {
          ruleMap.set(rule.id, {
            ruleId: rule.id,
            ruleName: rule.name,
            category: rule.category,
            resolution: rule.resolution || rule.description,
            matchCount: result.matchesCount,
            affectedFiles: [entry.path],
          });
        }
      }
    }
  }

  const affectedFilesSet = new Set(matches.map((m) => m.filePath));

  return {
    totalMatches: matches.reduce((acc, m) => acc + m.matchesCount, 0),
    affectedFilesCount: affectedFilesSet.size,
    matches,
    summaryByRule: Array.from(ruleMap.values()),
  };
}

/**
 * Applies selected rule matches to project entries in a sequential, deterministic order.
 * Handles multiple rules matching the same file without race conditions or overwriting.
 */
export function applyBatchRules(
  entries: ZipEntry[],
  selectedMatches: RuleMatchResult[],
  rules: StudioRule[]
): {
  updatedEntries: ZipEntry[];
  modifiedFilesCount: number;
  totalFixesApplied: number;
} {
  const activeMatches = selectedMatches.filter((m) => m.selected);
  if (activeMatches.length === 0) {
    return {
      updatedEntries: entries,
      modifiedFilesCount: 0,
      totalFixesApplied: 0,
    };
  }

  // Group active matches by filePath
  const matchesByFile = new Map<string, RuleMatchResult[]>();
  for (const match of activeMatches) {
    const list = matchesByFile.get(match.filePath) ?? [];
    list.push(match);
    matchesByFile.set(match.filePath, list);
  }

  // Create rule lookup map
  const rulesLookup = new Map(rules.map((r) => [r.id, r]));

  let totalFixesApplied = 0;
  let modifiedFilesCount = 0;

  const updatedEntries = entries.map((entry) => {
    const fileMatches = matchesByFile.get(entry.path);
    if (!fileMatches || fileMatches.length === 0) {
      return entry;
    }

    let currentContent = entry.content;
    let fileChanged = false;

    for (const match of fileMatches) {
      const rule = rulesLookup.get(match.ruleId);
      if (!rule) continue;

      const evalResult = evaluateRuleTransform(currentContent, {
        pattern: rule.pattern,
        replacement: rule.replacement,
        isRegex: rule.isRegex,
        flags: rule.flags,
      });

      if (evalResult.changed) {
        currentContent = evalResult.transformed;
        totalFixesApplied += evalResult.matchesCount;
        fileChanged = true;
      }
    }

    if (fileChanged) {
      modifiedFilesCount++;
      return {
        ...entry,
        content: currentContent,
      };
    }

    return entry;
  });

  return {
    updatedEntries,
    modifiedFilesCount,
    totalFixesApplied,
  };
}
