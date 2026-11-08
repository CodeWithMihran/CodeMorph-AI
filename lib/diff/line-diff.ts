export type DiffType = "unchanged" | "added" | "removed";

export interface DiffLine {
  type: DiffType;
  text: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

export interface SideBySideCell {
  number: number;
  text: string;
  type: "removed" | "added" | "unchanged";
}

export interface SideBySideRow {
  left?: SideBySideCell;
  right?: SideBySideCell;
}

export interface DiffSummary {
  additions: number;
  deletions: number;
  changes: number;
  isExactMatch: boolean;
  unified: DiffLine[];
  split: SideBySideRow[];
}

/**
 * Computes a line-by-line diff between two strings.
 * Uses prefix/suffix trimming + Longest Common Subsequence (LCS) algorithm.
 * Zero external dependencies, pure TypeScript, microsecond execution.
 */
export function computeLineDiff(oldText: string, newText: string): DiffSummary {
  if (oldText === newText) {
    const lines = oldText.split("\n");
    const unified: DiffLine[] = lines.map((text, idx) => ({
      type: "unchanged",
      text,
      oldLineNumber: idx + 1,
      newLineNumber: idx + 1,
    }));
    const split: SideBySideRow[] = lines.map((text, idx) => ({
      left: { number: idx + 1, text, type: "unchanged" },
      right: { number: idx + 1, text, type: "unchanged" },
    }));
    return {
      additions: 0,
      deletions: 0,
      changes: 0,
      isExactMatch: true,
      unified,
      split,
    };
  }

  const rawOldLines = oldText ? oldText.split("\n") : [];
  const rawNewLines = newText ? newText.split("\n") : [];

  // Trim common prefix
  let prefixCount = 0;
  const minLen = Math.min(rawOldLines.length, rawNewLines.length);
  while (prefixCount < minLen && rawOldLines[prefixCount] === rawNewLines[prefixCount]) {
    prefixCount++;
  }

  // Trim common suffix
  let suffixCount = 0;
  const maxSuffix = minLen - prefixCount;
  while (
    suffixCount < maxSuffix &&
    rawOldLines[rawOldLines.length - 1 - suffixCount] === rawNewLines[rawNewLines.length - 1 - suffixCount]
  ) {
    suffixCount++;
  }

  const middleOld = rawOldLines.slice(prefixCount, rawOldLines.length - suffixCount);
  const middleNew = rawNewLines.slice(prefixCount, rawNewLines.length - suffixCount);

  // Compute LCS on middle slice
  const n = middleOld.length;
  const m = middleNew.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (middleOld[i - 1] === middleNew[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack LCS to reconstruct diff steps
  const middleDiff: Array<{ type: DiffType; text: string; oldIdx?: number; newIdx?: number }> = [];
  let i = n;
  let j = m;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && middleOld[i - 1] === middleNew[j - 1]) {
      middleDiff.unshift({
        type: "unchanged",
        text: middleOld[i - 1],
        oldIdx: prefixCount + i - 1,
        newIdx: prefixCount + j - 1,
      });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      middleDiff.unshift({
        type: "added",
        text: middleNew[j - 1],
        newIdx: prefixCount + j - 1,
      });
      j--;
    } else if (i > 0) {
      middleDiff.unshift({
        type: "removed",
        text: middleOld[i - 1],
        oldIdx: prefixCount + i - 1,
      });
      i--;
    }
  }

  // Assemble full unified diff
  const unified: DiffLine[] = [];
  let additions = 0;
  let deletions = 0;

  // 1. Prefix
  for (let p = 0; p < prefixCount; p++) {
    unified.push({
      type: "unchanged",
      text: rawOldLines[p],
      oldLineNumber: p + 1,
      newLineNumber: p + 1,
    });
  }

  // 2. Middle
  for (const item of middleDiff) {
    if (item.type === "added") additions++;
    if (item.type === "removed") deletions++;

    unified.push({
      type: item.type,
      text: item.text,
      oldLineNumber: item.oldIdx !== undefined ? item.oldIdx + 1 : undefined,
      newLineNumber: item.newIdx !== undefined ? item.newIdx + 1 : undefined,
    });
  }

  // 3. Suffix
  const suffixStartOld = rawOldLines.length - suffixCount;
  const suffixStartNew = rawNewLines.length - suffixCount;
  for (let s = 0; s < suffixCount; s++) {
    unified.push({
      type: "unchanged",
      text: rawOldLines[suffixStartOld + s],
      oldLineNumber: suffixStartOld + s + 1,
      newLineNumber: suffixStartNew + s + 1,
    });
  }

  // Assemble Side-by-Side (split) rows
  const split: SideBySideRow[] = [];
  let u = 0;
  while (u < unified.length) {
    const item = unified[u];
    if (item.type === "unchanged") {
      split.push({
        left: { number: item.oldLineNumber!, text: item.text, type: "unchanged" },
        right: { number: item.newLineNumber!, text: item.text, type: "unchanged" },
      });
      u++;
    } else {
      // Gather contiguous block of removed and added
      const removedBlock: DiffLine[] = [];
      const addedBlock: DiffLine[] = [];

      while (u < unified.length && unified[u].type !== "unchanged") {
        if (unified[u].type === "removed") {
          removedBlock.push(unified[u]);
        } else if (unified[u].type === "added") {
          addedBlock.push(unified[u]);
        }
        u++;
      }

      const rowCount = Math.max(removedBlock.length, addedBlock.length);
      for (let r = 0; r < rowCount; r++) {
        const rem = removedBlock[r];
        const add = addedBlock[r];
        split.push({
          left: rem ? { number: rem.oldLineNumber!, text: rem.text, type: "removed" } : undefined,
          right: add ? { number: add.newLineNumber!, text: add.text, type: "added" } : undefined,
        });
      }
    }
  }

  return {
    additions,
    deletions,
    changes: additions + deletions,
    isExactMatch: additions === 0 && deletions === 0,
    unified,
    split,
  };
}
