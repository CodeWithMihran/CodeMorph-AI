import type { AuditReport } from "@/lib/audit/types";
import type { FeasibilityReport } from "@/lib/analysis/feasibility";
import type { RepositoryAnalysis } from "@/lib/github/analysis";

export type HistoryItemType = "audit" | "feasibility" | "migration";

export interface AuditHistoryRecord {
  id: string;
  type: "audit";
  timestamp: string;
  repository: string;
  branch?: string;
  revision: string;
  findingsCount: number;
  criticalCount: number;
  highCount: number;
  syntaxErrors: number;
  unresolvedImports: number;
  analysis?: RepositoryAnalysis;
  report: AuditReport;
  markdown?: string;
}

export interface FeasibilityHistoryRecord {
  id: string;
  type: "feasibility";
  timestamp: string;
  repository: string;
  target: "nextjs" | "expo";
  score: number;
  tier: "high" | "moderate" | "low" | "incompatible";
  summary: string;
  report: FeasibilityReport;
  analysis?: RepositoryAnalysis;
}

export interface MigrationHistoryRecord {
  id: string;
  type: "migration";
  timestamp: string;
  repository: string;
  target: string;
  fileCount: number;
  sourceFileCount: number;
  readiness: string;
  validation: string;
  memoryRulesUsed: number;
  routeChecksCount: number;
}

export type HistoryRecord =
  | AuditHistoryRecord
  | FeasibilityHistoryRecord
  | MigrationHistoryRecord;

const STORAGE_KEY = "codemorph_history_v1";
const RESTORE_KEY = "codemorph_restore_item";
const MAX_ITEMS = 25;

export function getHistory(): HistoryRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as HistoryRecord[];
  } catch {
    return [];
  }
}

export function saveHistoryRecord(
  item:
    | Omit<AuditHistoryRecord, "id" | "timestamp">
    | Omit<FeasibilityHistoryRecord, "id" | "timestamp">
    | Omit<MigrationHistoryRecord, "id" | "timestamp">
): HistoryRecord {
  if (typeof window === "undefined") {
    return { ...item, id: "temp", timestamp: new Date().toISOString() } as HistoryRecord;
  }

  const list = getHistory();
  const record: HistoryRecord = {
    ...item,
    id: `hist_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
  } as HistoryRecord;

  // Add new item to front, keeping unique recent evaluations
  const updated = [record, ...list].slice(0, MAX_ITEMS);

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    window.dispatchEvent(new Event("codemorph-history-updated"));
  } catch {
    // If quota exceeded, trim older records and retry
    try {
      const trimmed = updated.slice(0, 10);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
      window.dispatchEvent(new Event("codemorph-history-updated"));
    } catch {
      // Ignore if localStorage unavailable
    }
  }

  return record;
}

export function deleteHistoryRecord(id: string): void {
  if (typeof window === "undefined") return;
  const list = getHistory();
  const updated = list.filter((item) => item.id !== id);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    window.dispatchEvent(new Event("codemorph-history-updated"));
  } catch {
    // Ignore
  }
}

export function clearAllHistory(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new Event("codemorph-history-updated"));
  } catch {
    // Ignore
  }
}

export function setPendingRestore(item: HistoryRecord): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(RESTORE_KEY, JSON.stringify(item));
  } catch {
    // Ignore
  }
}

export function getPendingRestore(): HistoryRecord | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(RESTORE_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(RESTORE_KEY);
    return JSON.parse(raw) as HistoryRecord;
  } catch {
    return null;
  }
}
