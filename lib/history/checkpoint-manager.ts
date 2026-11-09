import { ZipEntry } from "@/lib/migration/zip";
import { computeLineDiff } from "@/lib/diff/line-diff";

export type CheckpointTrigger =
  | "initial_generation"
  | "codemod"
  | "manual_edit"
  | "scaffold"
  | "test_scaffold"
  | "procedural_rules"
  | "doctor_autofix"
  | "rollback";

export interface CheckpointMeta {
  fileCount: number;
  modifiedFiles: string[];
  totalAdditions: number;
  totalDeletions: number;
}

export interface Checkpoint {
  id: string;
  timestamp: string;
  label: string;
  triggerType: CheckpointTrigger;
  entries: ZipEntry[];
  meta: CheckpointMeta;
}

export interface CheckpointHistory {
  currentCheckpointId: string;
  checkpoints: Checkpoint[];
  maxCheckpoints: number;
}

export interface FileDiffDelta {
  path: string;
  status: "added" | "deleted" | "modified" | "unchanged";
  additions: number;
  deletions: number;
}

export interface CheckpointComparison {
  sourceId: string;
  targetId: string;
  fileDiffs: FileDiffDelta[];
  totalAdditions: number;
  totalDeletions: number;
  filesModifiedCount: number;
}

/**
 * Computes difference metadata between two collections of ZipEntries.
 */
export function computeEntryDiffStats(
  oldEntries: ZipEntry[],
  newEntries: ZipEntry[]
): CheckpointMeta {
  const oldMap = new Map(oldEntries.map((e) => [e.path, e.content]));
  const newMap = new Map(newEntries.map((e) => [e.path, e.content]));

  let totalAdditions = 0;
  let totalDeletions = 0;
  const modifiedFiles: string[] = [];

  const allPaths = new Set([...oldMap.keys(), ...newMap.keys()]);

  for (const path of allPaths) {
    const oldContent = oldMap.get(path);
    const newContent = newMap.get(path);

    if (oldContent === undefined && newContent !== undefined) {
      // Newly added file
      modifiedFiles.push(path);
      totalAdditions += newContent.split("\n").length;
    } else if (oldContent !== undefined && newContent === undefined) {
      // Deleted file
      modifiedFiles.push(path);
      totalDeletions += oldContent.split("\n").length;
    } else if (oldContent !== undefined && newContent !== undefined) {
      if (oldContent !== newContent) {
        modifiedFiles.push(path);
        const diff = computeLineDiff(oldContent, newContent);
        totalAdditions += diff.additions;
        totalDeletions += diff.deletions;
      }
    }
  }

  return {
    fileCount: newEntries.length,
    modifiedFiles,
    totalAdditions,
    totalDeletions,
  };
}

/**
 * Deep-clones zip entries to preserve snapshot immutability.
 */
function cloneEntries(entries: ZipEntry[]): ZipEntry[] {
  return entries.map((e) => ({ path: e.path, content: e.content }));
}

/**
 * Generates an idempotent, timestamped checkpoint identifier.
 */
function generateCheckpointId(index: number): string {
  return `chk_${Date.now()}_${index}_${Math.random().toString(36).substring(2, 7)}`;
}

/**
 * Initializes a new checkpoint history with an initial baseline generation.
 */
export function initCheckpointHistory(
  initialEntries: ZipEntry[],
  initialLabel = "Initial Generation Baseline",
  maxCheckpoints = 20
): CheckpointHistory {
  const id = generateCheckpointId(1);
  const baseline: Checkpoint = {
    id,
    timestamp: new Date().toISOString(),
    label: initialLabel,
    triggerType: "initial_generation",
    entries: cloneEntries(initialEntries),
    meta: {
      fileCount: initialEntries.length,
      modifiedFiles: initialEntries.map((e) => e.path),
      totalAdditions: initialEntries.reduce(
        (sum, e) => sum + e.content.split("\n").length,
        0
      ),
      totalDeletions: 0,
    },
  };

  return {
    currentCheckpointId: id,
    checkpoints: [baseline],
    maxCheckpoints,
  };
}

/**
 * Records a new checkpoint in the timeline, bounding history size while preserving the baseline.
 */
export function createCheckpoint(
  history: CheckpointHistory,
  label: string,
  triggerType: CheckpointTrigger,
  entries: ZipEntry[]
): CheckpointHistory {
  const current = history.checkpoints.find(
    (c) => c.id === history.currentCheckpointId
  ) || history.checkpoints[history.checkpoints.length - 1];

  const meta = current
    ? computeEntryDiffStats(current.entries, entries)
    : {
        fileCount: entries.length,
        modifiedFiles: [],
        totalAdditions: 0,
        totalDeletions: 0,
      };

  const newCheckpoint: Checkpoint = {
    id: generateCheckpointId(history.checkpoints.length + 1),
    timestamp: new Date().toISOString(),
    label,
    triggerType,
    entries: cloneEntries(entries),
    meta,
  };

  let updatedCheckpoints = [...history.checkpoints, newCheckpoint];

  // Keep history bounded to maxCheckpoints: preserve baseline (index 0) and slide the rest
  if (updatedCheckpoints.length > history.maxCheckpoints) {
    const baseline = updatedCheckpoints[0];
    const tail = updatedCheckpoints.slice(-(history.maxCheckpoints - 1));
    updatedCheckpoints = [baseline, ...tail];
  }

  return {
    ...history,
    currentCheckpointId: newCheckpoint.id,
    checkpoints: updatedCheckpoints,
  };
}

/**
 * Rolls back to a previous checkpoint by creating a non-destructive rollback entry.
 */
export function rollbackToCheckpoint(
  history: CheckpointHistory,
  targetCheckpointId: string
): { updatedHistory: CheckpointHistory; restoredEntries: ZipEntry[] } {
  const target = history.checkpoints.find((c) => c.id === targetCheckpointId);
  if (!target) {
    throw new Error(`Checkpoint with ID ${targetCheckpointId} not found in history`);
  }

  const restoredEntries = cloneEntries(target.entries);
  const updatedHistory = createCheckpoint(
    history,
    `Rollback to: ${target.label}`,
    "rollback",
    restoredEntries
  );

  return {
    updatedHistory,
    restoredEntries,
  };
}

/**
 * Compares two checkpoints and returns a structured diff manifest.
 */
export function compareCheckpoints(
  source: Checkpoint,
  target: Checkpoint
): CheckpointComparison {
  const sourceMap = new Map(source.entries.map((e) => [e.path, e.content]));
  const targetMap = new Map(target.entries.map((e) => [e.path, e.content]));

  const fileDiffs: FileDiffDelta[] = [];
  let totalAdditions = 0;
  let totalDeletions = 0;
  let filesModifiedCount = 0;

  const allPaths = Array.from(new Set([...sourceMap.keys(), ...targetMap.keys()])).sort();

  for (const path of allPaths) {
    const sourceContent = sourceMap.get(path);
    const targetContent = targetMap.get(path);

    if (sourceContent === undefined && targetContent !== undefined) {
      const adds = targetContent.split("\n").length;
      totalAdditions += adds;
      filesModifiedCount++;
      fileDiffs.push({
        path,
        status: "added",
        additions: adds,
        deletions: 0,
      });
    } else if (sourceContent !== undefined && targetContent === undefined) {
      const dels = sourceContent.split("\n").length;
      totalDeletions += dels;
      filesModifiedCount++;
      fileDiffs.push({
        path,
        status: "deleted",
        additions: 0,
        deletions: dels,
      });
    } else if (sourceContent !== undefined && targetContent !== undefined) {
      if (sourceContent === targetContent) {
        fileDiffs.push({
          path,
          status: "unchanged",
          additions: 0,
          deletions: 0,
        });
      } else {
        const diff = computeLineDiff(sourceContent, targetContent);
        totalAdditions += diff.additions;
        totalDeletions += diff.deletions;
        filesModifiedCount++;
        fileDiffs.push({
          path,
          status: "modified",
          additions: diff.additions,
          deletions: diff.deletions,
        });
      }
    }
  }

  return {
    sourceId: source.id,
    targetId: target.id,
    fileDiffs,
    totalAdditions,
    totalDeletions,
    filesModifiedCount,
  };
}
