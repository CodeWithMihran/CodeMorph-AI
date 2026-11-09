import { createHash } from "node:crypto";
import { copyFile, mkdir, open, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { redactSecretText } from "@/lib/security/secrets";
import type { GeneratedFile } from "@/lib/migration/model";
import { replayKnownRepair, verifyKnownRepair, type RuleFixtureId } from "@/lib/memory/rule-fixtures";

const STORE_VERSION = 3 as const;
const MAX_STORE_BYTES = 1_000_000;
const MAX_ENTRIES = 500;
const MAX_RULES_IN_PROMPT = 6;
const LOCK_WAIT_MS = 1_500;
const STALE_LOCK_MS = 30_000;
const DEFAULT_TARGET = "nextjs-app-router-typescript";
const VALID_TARGETS = new Set([DEFAULT_TARGET, "expo-router-typescript"]);

export type RuleRecord = {
  id: string;
  sourceFramework: string;
  target: string;
  trigger: string;
  errorSignature: string;
  resolution: string;
  verifiedRepairs: number;
  usageCount: number;
  passedUses: number;
  failedUses: number;
  notRunUses: number;
  lastUsedAt: string | null;
  createdAt: string;
  lastVerifiedAt: string;
};

export type RuleCandidate = RuleRecord & {
  state: "pending";
  replay: { status: "passed"; fixtureIds: RuleFixtureId[]; positiveCases: number; negativeCases: number; checkedAt: string };
};

export type PromptRule = Pick<RuleRecord, "id" | "sourceFramework" | "target" | "trigger" | "errorSignature" | "resolution" | "verifiedRepairs">;
type RuleStoreFile = { version: typeof STORE_VERSION; rules: RuleRecord[]; candidates: RuleCandidate[] };

function storePath() {
  const configured = process.env.CODEMORPH_RULES_PATH?.trim();
  return configured ? path.resolve(configured) : path.join(process.cwd(), ".codemorph", "procedural-rules.json");
}

function cleanHint(value: unknown) {
  if (typeof value !== "string") return null;
  const cleaned = redactSecretText(value).replace(/[\r\n\u0000]/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned || cleaned.length > 500 || /(?:ignore|disregard|override) (?:all |any )?(?:previous|prior|above)|system prompt|developer message|reveal (?:the )?(?:secret|key|prompt)|exfiltrat/i.test(cleaned)) return null;
  return cleaned;
}

function ruleId(input: Pick<RuleRecord, "sourceFramework" | "target" | "trigger" | "errorSignature" | "resolution">) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex").slice(0, 32);
}

function validBase(value: unknown): value is RuleRecord {
  if (!value || typeof value !== "object") return false;
  const rule = value as Record<string, unknown>;
  return typeof rule.id === "string" && rule.id.length <= 64 &&
    typeof rule.sourceFramework === "string" && rule.sourceFramework.length > 0 && rule.sourceFramework.length <= 100 &&
    typeof rule.target === "string" && VALID_TARGETS.has(rule.target) &&
    typeof rule.trigger === "string" && rule.trigger.length <= 120 && /^(?:@[a-z0-9._-]+\/)?[a-z0-9_$.-]+$/i.test(rule.trigger) &&
    typeof rule.errorSignature === "string" && rule.errorSignature.length <= 600 && cleanHint(rule.errorSignature) === rule.errorSignature &&
    typeof rule.resolution === "string" && rule.resolution.length <= 500 && cleanHint(rule.resolution) === rule.resolution &&
    Number.isSafeInteger(rule.verifiedRepairs) && (rule.verifiedRepairs as number) > 0 &&
    Number.isSafeInteger(rule.usageCount) && (rule.usageCount as number) >= 0 &&
    Number.isSafeInteger(rule.passedUses) && (rule.passedUses as number) >= 0 &&
    Number.isSafeInteger(rule.failedUses) && (rule.failedUses as number) >= 0 &&
    Number.isSafeInteger(rule.notRunUses) && (rule.notRunUses as number) >= 0 &&
    (rule.lastUsedAt === null || (typeof rule.lastUsedAt === "string" && Number.isFinite(Date.parse(rule.lastUsedAt)))) &&
    typeof rule.createdAt === "string" && Number.isFinite(Date.parse(rule.createdAt)) &&
    typeof rule.lastVerifiedAt === "string" && Number.isFinite(Date.parse(rule.lastVerifiedAt)) &&
    rule.id === ruleId({ sourceFramework: rule.sourceFramework as string, target: rule.target as string, trigger: rule.trigger as string, errorSignature: rule.errorSignature as string, resolution: rule.resolution as string });
}

function validCandidate(value: unknown): value is RuleCandidate {
  if (!validBase(value)) return false;
  const candidate = value as RuleCandidate;
  return candidate.state === "pending" && Array.isArray(candidate.replay?.fixtureIds) &&
    replayKnownRepair({ fixtureIds: candidate.replay.fixtureIds, sourceFramework: candidate.sourceFramework, target: candidate.target, trigger: candidate.trigger, resolution: candidate.resolution }) !== null &&
    candidate.replay?.status === "passed" && Number.isSafeInteger(candidate.replay.positiveCases) && candidate.replay.positiveCases >= 1 &&
    Number.isSafeInteger(candidate.replay.negativeCases) && candidate.replay.negativeCases >= 2 &&
    typeof candidate.replay.checkedAt === "string" && Number.isFinite(Date.parse(candidate.replay.checkedAt));
}

async function readStore(filePath: string): Promise<RuleStoreFile> {
  let text: string;
  try {
    const bytes = await readFile(filePath);
    if (bytes.byteLength > MAX_STORE_BYTES) throw new Error("The procedural memory file exceeds its size limit.");
    text = bytes.toString("utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { version: STORE_VERSION, rules: [], candidates: [] };
    throw error;
  }
  const parsed: unknown = JSON.parse(text);
  if (!parsed || typeof parsed !== "object") throw new Error("The procedural memory file has an invalid structure.");
  const value = parsed as Record<string, unknown>;
  if ((value.version === 1 || value.version === 2) && Array.isArray(value.rules) && value.rules.length <= MAX_ENTRIES && (value.version === 1 || (Array.isArray(value.candidates) && value.candidates.length <= MAX_ENTRIES))) {
    const legacyRules = value.version === 1 ? value.rules : [...value.rules, ...(value.candidates as unknown[])];
    const candidates: RuleCandidate[] = [];
    for (const raw of legacyRules) {
      if (!raw || typeof raw !== "object") continue;
      const old = raw as Record<string, unknown>;
      const base = { id: old.id, sourceFramework: old.sourceFramework, target: old.target, trigger: old.trigger, errorSignature: old.errorSignature, resolution: old.resolution, verifiedRepairs: old.verifiedRepairs, createdAt: old.createdAt, lastVerifiedAt: old.lastVerifiedAt };
      if (!validLegacyRule(base)) continue;
      const replay = replayKnownRepair({ fixtureIds: ["react-router-link-to-next-link-v1"], sourceFramework: base.sourceFramework, target: base.target, trigger: base.trigger, resolution: base.resolution });
      if (replay) candidates.push({ ...base, usageCount: 0, passedUses: 0, failedUses: 0, notRunUses: 0, lastUsedAt: null, state: "pending", replay });
    }
    return { version: STORE_VERSION, rules: [], candidates };
  }
  if (value.version !== STORE_VERSION || !Array.isArray(value.rules) || !Array.isArray(value.candidates) ||
    value.rules.length > MAX_ENTRIES || value.candidates.length > MAX_ENTRIES ||
    !value.rules.every(validBase) || !value.candidates.every(validCandidate)) {
    throw new Error("The procedural memory file has an unsupported or invalid schema.");
  }
  return value as RuleStoreFile;
}

function validLegacyRule(value: unknown): value is Omit<RuleRecord, "usageCount" | "passedUses" | "failedUses" | "notRunUses" | "lastUsedAt"> {
  if (!value || typeof value !== "object") return false;
  const rule = value as Record<string, unknown>;
  return typeof rule.id === "string" && rule.id.length <= 64 && typeof rule.sourceFramework === "string" && rule.sourceFramework.length > 0 && rule.sourceFramework.length <= 100 &&
    rule.target === DEFAULT_TARGET && typeof rule.trigger === "string" && rule.trigger.length <= 120 && /^(?:@[a-z0-9._-]+\/)?[a-z0-9_$.-]+$/i.test(rule.trigger) &&
    typeof rule.errorSignature === "string" && cleanHint(rule.errorSignature) === rule.errorSignature && typeof rule.resolution === "string" && cleanHint(rule.resolution) === rule.resolution &&
    Number.isSafeInteger(rule.verifiedRepairs) && (rule.verifiedRepairs as number) > 0 && typeof rule.createdAt === "string" && Number.isFinite(Date.parse(rule.createdAt)) &&
    typeof rule.lastVerifiedAt === "string" && Number.isFinite(Date.parse(rule.lastVerifiedAt)) &&
    rule.id === ruleId({ sourceFramework: rule.sourceFramework, target: rule.target, trigger: rule.trigger as string, errorSignature: rule.errorSignature, resolution: rule.resolution });
}

function signatureFromDiagnostics(diagnostics: string[]) {
  return diagnostics.map((line) => redactSecretText(line.replace(/\\/g, "/"))
    .replace(/(?:\.\/)?(?:[A-Za-z]:)?(?:[A-Za-z0-9_.@-]+\/)+[A-Za-z0-9_.@-]+\.(?:tsx?|jsx?|css|json)(?::\d+(?::\d+)?|\(\d+(?:,\d+)?\))/gi, "<file>")
    .replace(/\bline\s+\d+(?::\d+)?/gi, "line <n>").replace(/\s+/g, " ").trim())
    .filter(Boolean).slice(0, 4).join(" | ").slice(0, 600);
}

function triggerFromDiagnostics(diagnostics: string[], sourceFiles: Array<{ path: string; content: string }>) {
  const joined = diagnostics.join("\n");
  const moduleMatch = joined.match(/(?:cannot find module|could not resolve|module not found)[^\r\n]*?["']([^"']+)["']/i);
  const nameMatch = joined.match(/cannot find name\s+["']([A-Za-z_$][\w$]*)["']/i);
  const candidate = moduleMatch?.[1] ?? nameMatch?.[1];
  if (!candidate || candidate.length > 120 || !/^(?:@[a-z0-9._-]+\/)?[a-z0-9_$.-]+$/i.test(candidate)) return null;
  return sourceFiles.map((file) => file.content).join("\n").toLowerCase().includes(candidate.toLowerCase()) ? candidate : null;
}

async function withFileLock<T>(filePath: string, action: () => Promise<T>): Promise<T> {
  const lockPath = `${filePath}.lock`;
  const started = Date.now();
  let lockHandle: Awaited<ReturnType<typeof open>> | undefined;
  while (!lockHandle) {
    try {
      const candidate = await open(lockPath, "wx", 0o600);
      try { await candidate.writeFile(`${process.pid} ${Date.now()}\n`); }
      catch (error) { await candidate.close().catch(() => {}); await rm(lockPath, { force: true }).catch(() => {}); throw error; }
      lockHandle = candidate;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      try { const lockStat = await stat(lockPath); if (Date.now() - lockStat.mtimeMs > STALE_LOCK_MS) await rm(lockPath, { force: true }); }
      catch { /* Another writer released it while checking. */ }
      if (Date.now() - started >= LOCK_WAIT_MS) throw new Error("Timed out waiting for the procedural memory lock.");
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
  try { return await action(); }
  finally { await lockHandle.close().catch(() => {}); await rm(lockPath, { force: true }).catch(() => {}); }
}

async function writeStore(filePath: string, store: RuleStoreFile) {
  const directory = path.dirname(filePath);
  await mkdir(directory, { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
  try {
    await writeFile(tempPath, `${JSON.stringify(store, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
    try {
      await rename(tempPath, filePath);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (process.platform !== "win32" || !["EPERM", "EACCES", "EXDEV"].includes(code ?? "")) throw error;
      // Some Windows-backed filesystems do not permit replacing a destination with rename.
      // The caller holds the per-store lock, so copying the fully written temp file is safe.
      await copyFile(tempPath, filePath);
    }
  }
  finally { await rm(tempPath, { force: true }).catch(() => {}); }
}

export async function findRelevantRules(input: { sourceFramework: string; target?: string; sourceFiles: Array<{ path: string; content: string }> }): Promise<PromptRule[]> {
  try {
    const store = await readStore(storePath());
    const source = input.sourceFiles.map((file) => file.content).join("\n").toLowerCase();
    return store.rules.filter((rule) => rule.sourceFramework === input.sourceFramework && rule.target === (input.target ?? DEFAULT_TARGET) && source.includes(rule.trigger.toLowerCase()))
      .sort((left, right) => right.verifiedRepairs - left.verifiedRepairs || Date.parse(right.lastVerifiedAt) - Date.parse(left.lastVerifiedAt))
      .slice(0, MAX_RULES_IN_PROMPT)
      .map(({ id, sourceFramework, target, trigger, errorSignature, resolution, verifiedRepairs }) => ({ id, sourceFramework, target, trigger, errorSignature, resolution, verifiedRepairs }));
  } catch { return []; }
}

export async function listRuleMemory() {
  try {
    const { rules, candidates } = await readStore(storePath());
    return {
      rules: rules.map(({ id, sourceFramework, target, trigger, errorSignature, resolution, verifiedRepairs, createdAt, lastVerifiedAt, usageCount, passedUses, failedUses, notRunUses, lastUsedAt }) => ({ id, sourceFramework, target, trigger, errorSignature, resolution, verifiedRepairs, createdAt, lastVerifiedAt, usageCount, passedUses, failedUses, notRunUses, lastUsedAt })),
      candidates: candidates.filter((candidate) => candidate.state === "pending").map(({ id, sourceFramework, target, trigger, errorSignature, resolution, verifiedRepairs, createdAt, replay }) => ({ id, sourceFramework, target, trigger, errorSignature, resolution, verifiedRepairs, createdAt, replay })),
    };
  } catch { return { rules: [], candidates: [] }; }
}

/** Save a candidate after a successful repair. It is not eligible for model prompts until promoted. */
export async function recordVerifiedRepair(input: {
  sourceFramework: string; target?: string; sourceFiles: Array<{ path: string; content: string }>;
  diagnostics: string[]; filesBefore: GeneratedFile[]; filesAfter: GeneratedFile[];
}): Promise<number> {
  const target = input.target ?? DEFAULT_TARGET;
  const trigger = triggerFromDiagnostics(input.diagnostics, input.sourceFiles);
  const errorSignature = signatureFromDiagnostics(input.diagnostics);
  if (!VALID_TARGETS.has(target) || !input.sourceFramework || input.sourceFramework.length > 100 || !trigger || !errorSignature) return 0;
  const verified = verifyKnownRepair({ sourceFramework: input.sourceFramework, target, trigger, filesBefore: input.filesBefore, filesAfter: input.filesAfter });
  if (!verified) return 0;
  const now = new Date().toISOString();
  const base = { sourceFramework: input.sourceFramework, target, trigger, errorSignature, resolution: verified.resolution };
  const replay = replayKnownRepair({ fixtureIds: [verified.fixtureId], ...base });
  if (!replay) return 0;
  const candidate: RuleCandidate = { ...base, id: ruleId(base), verifiedRepairs: 1, usageCount: 0, passedUses: 0, failedUses: 0, notRunUses: 0, lastUsedAt: null, createdAt: now, lastVerifiedAt: now, state: "pending", replay };
  try {
    const filePath = storePath();
    await mkdir(path.dirname(filePath), { recursive: true });
    return await withFileLock(filePath, async () => {
      const store = await readStore(filePath);
      const existing = store.candidates.find((item) => item.id === candidate.id);
      if (!existing && !store.rules.some((item) => item.id === candidate.id)) store.candidates.push(candidate);
      else if (existing) {
        existing.verifiedRepairs = Math.min(10_000, existing.verifiedRepairs + 1);
        existing.lastVerifiedAt = now;
        existing.replay = replay;
      }
      store.candidates.sort((a, b) => Date.parse(b.lastVerifiedAt) - Date.parse(a.lastVerifiedAt));
      store.candidates = store.candidates.slice(0, MAX_ENTRIES);
      await writeStore(filePath, store);
      return 1;
    });
  } catch { return 0; }
}

export async function promoteRuleCandidate(id: string) {
  try {
    const filePath = storePath();
    return await withFileLock(filePath, async () => {
      const store = await readStore(filePath);
      const index = store.candidates.findIndex((candidate) => candidate.id === id && candidate.state === "pending");
      if (index < 0) return false;
      const candidate = store.candidates[index];
      if (!replayKnownRepair({ fixtureIds: candidate.replay.fixtureIds, sourceFramework: candidate.sourceFramework, target: candidate.target, trigger: candidate.trigger, resolution: candidate.resolution })) return false;
      const rule: RuleRecord = {
        id: candidate.id,
        sourceFramework: candidate.sourceFramework,
        target: candidate.target,
        trigger: candidate.trigger,
        errorSignature: candidate.errorSignature,
        resolution: candidate.resolution,
        verifiedRepairs: candidate.verifiedRepairs,
        usageCount: candidate.usageCount,
        passedUses: candidate.passedUses,
        failedUses: candidate.failedUses,
        notRunUses: candidate.notRunUses,
        lastUsedAt: candidate.lastUsedAt,
        createdAt: candidate.createdAt,
        lastVerifiedAt: candidate.lastVerifiedAt,
      };
      const existing = store.rules.find((item) => item.id === rule.id);
      if (existing) existing.verifiedRepairs = Math.min(10_000, existing.verifiedRepairs + rule.verifiedRepairs);
      else store.rules.push({ ...rule, usageCount: 0, passedUses: 0, failedUses: 0, notRunUses: 0, lastUsedAt: null });
      store.candidates.splice(index, 1);
      store.rules = store.rules.slice(-MAX_ENTRIES);
      await writeStore(filePath, store);
      return true;
    });
  } catch { return false; }
}

export async function recordRuleOutcomes(ids: string[], outcome: "passed" | "failed" | "not-run") {
  const uniqueIds = [...new Set(ids)].filter((id) => /^[a-f\d]{32}$/.test(id)).slice(0, MAX_RULES_IN_PROMPT);
  if (!uniqueIds.length) return;
  try {
    const filePath = storePath();
    await withFileLock(filePath, async () => {
      const store = await readStore(filePath);
      let changed = false;
      for (const rule of store.rules) {
        if (!uniqueIds.includes(rule.id)) continue;
        rule.usageCount = Math.min(1_000_000, rule.usageCount + 1);
        if (outcome === "passed") rule.passedUses = Math.min(1_000_000, rule.passedUses + 1);
        else if (outcome === "failed") rule.failedUses = Math.min(1_000_000, rule.failedUses + 1);
        else rule.notRunUses = Math.min(1_000_000, rule.notRunUses + 1);
        rule.lastUsedAt = new Date().toISOString();
        changed = true;
      }
      if (changed) await writeStore(filePath, store);
    });
  } catch { /* Outcome tracking cannot break a migration. */ }
}

export async function rejectRuleCandidate(id: string) {
  try {
    const filePath = storePath();
    return await withFileLock(filePath, async () => {
      const store = await readStore(filePath);
      const index = store.candidates.findIndex((item) => item.id === id && item.state === "pending");
      if (index < 0) return false;
      store.candidates.splice(index, 1);
      await writeStore(filePath, store);
      return true;
    });
  } catch { return false; }
}
