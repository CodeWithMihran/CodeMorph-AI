import type { SourceManifest } from "@/lib/source/manifest";
import type { AuditFinding, AuditReport } from "./types";

const OSV_API = "https://api.osv.dev";
const MAX_PACKAGES = 250;
const MAX_ADVISORIES = 100;
const MAX_JSON_BYTES = 1_000_000;
const EXACT_NPM_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

type LockedPackage = { name: string; version: string; type: "production" | "development" | "transitive" };

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function addPackage(target: Map<string, LockedPackage>, name: unknown, version: unknown, type: LockedPackage["type"]) {
  if (typeof name !== "string" || name.length > 214 || typeof version !== "string" || !EXACT_NPM_VERSION.test(version)) return;
  const key = `${name}\0${version}`;
  const existing = target.get(key);
  if (!existing || (existing.type === "transitive" && type !== "transitive")) target.set(key, { name, version, type });
}

function packageNameFromLockPath(lockPath: string) {
  const marker = lockPath.lastIndexOf("node_modules/");
  if (marker < 0) return null;
  return lockPath.slice(marker + "node_modules/".length);
}

function collectLockedPackages(lock: Record<string, unknown>, manifest: SourceManifest) {
  const found = new Map<string, LockedPackage>();
  const packages = asRecord(lock.packages);
  if (packages) {
    const root = asRecord(packages[""]);
    const directProd = new Set(root && asRecord(root.dependencies) ? Object.keys(root.dependencies as Record<string, unknown>) : []);
    const directDev = new Set(root && asRecord(root.devDependencies) ? Object.keys(root.devDependencies as Record<string, unknown>) : []);
    for (const [lockPath, value] of Object.entries(packages)) {
      if (!lockPath.includes("node_modules/")) continue;
      const record = asRecord(value);
      if (!record || record.link === true) continue;
      const name = typeof record.name === "string" ? record.name : packageNameFromLockPath(lockPath);
      if (!name) continue;
      const topLevel = lockPath.slice("node_modules/".length);
      const isDirect = !topLevel.includes("/node_modules/");
      const type: LockedPackage["type"] = isDirect && directProd.has(topLevel) ? "production"
        : isDirect && directDev.has(topLevel) ? "development" : "transitive";
      addPackage(found, name, record.version, type);
    }
  } else {
    const rootDependencies = asRecord(lock.dependencies);
    const rootPackage = manifest.metadataFiles.find((file) => file.path.toLowerCase().endsWith("package.json"));
    let packageManifest: Record<string, unknown> = {};
    try { packageManifest = rootPackage ? asRecord(JSON.parse(rootPackage.content)) ?? {} : {}; } catch { /* lockfile inventory is still usable */ }
    const directProd = new Set(packageManifest.dependencies && asRecord(packageManifest.dependencies) ? Object.keys(packageManifest.dependencies as Record<string, unknown>) : []);
    const directDev = new Set(packageManifest.devDependencies && asRecord(packageManifest.devDependencies) ? Object.keys(packageManifest.devDependencies as Record<string, unknown>) : []);
    const visit = (deps: Record<string, unknown> | null, depth: number) => {
      if (!deps || depth > 100) return;
      for (const [name, value] of Object.entries(deps)) {
        const record = asRecord(value);
        if (!record) continue;
        const type: LockedPackage["type"] = depth > 0 ? "transitive"
          : record.dev === true || directDev.has(name) ? "development" : directProd.has(name) ? "production" : "transitive";
        addPackage(found, typeof record.name === "string" ? record.name : name, record.version, type);
        visit(asRecord(record.dependencies), depth + 1);
      }
    };
    visit(rootDependencies, 0);
  }
  return [...found.values()];
}

async function readJsonLimited(response: Response) {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_JSON_BYTES) throw new Error("The advisory service response exceeded the audit limit.");
  if (!response.body) throw new Error("The advisory service returned an empty response.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_JSON_BYTES) {
        await reader.cancel();
        throw new Error("The advisory service response exceeded the audit limit.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
}

async function osvPost(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`OSV returned HTTP ${response.status}.`);
  return readJsonLimited(response);
}

async function osvGet(id: string) {
  const response = await fetch(`${OSV_API}/v1/vulns/${encodeURIComponent(id)}`, {
    headers: { Accept: "application/json" }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`OSV could not return advisory ${id}.`);
  return readJsonLimited(response);
}

function advisorySeverity(record: Record<string, unknown>): AuditFinding["severity"] {
  const labels: string[] = [];
  const database = asRecord(record.database_specific);
  if (typeof database?.severity === "string") labels.push(database.severity);
  if (Array.isArray(record.affected)) {
    for (const item of record.affected) {
      const affected = asRecord(item);
      const ecosystem = asRecord(affected?.ecosystem_specific);
      const specific = asRecord(affected?.database_specific);
      if (typeof ecosystem?.severity === "string") labels.push(ecosystem.severity);
      if (typeof specific?.severity === "string") labels.push(specific.severity);
    }
  }
  const severity = labels.map((label) => label.toUpperCase());
  if (severity.includes("CRITICAL")) return "critical";
  if (severity.includes("HIGH")) return "high";
  if (severity.includes("MODERATE") || severity.includes("MEDIUM")) return "medium";
  if (severity.includes("LOW")) return "low";
  return "info";
}

function fixedVersions(record: Record<string, unknown>) {
  const versions = new Set<string>();
  if (!Array.isArray(record.affected)) return [];
  for (const item of record.affected) {
    const affected = asRecord(item);
    if (!Array.isArray(affected?.ranges)) continue;
    for (const range of affected.ranges) {
      const rangeRecord = asRecord(range);
      if (!Array.isArray(rangeRecord?.events)) continue;
      for (const event of rangeRecord.events) {
        const eventRecord = asRecord(event);
        if (typeof eventRecord?.fixed === "string") versions.add(eventRecord.fixed);
      }
    }
  }
  return [...versions].slice(0, 5);
}

function cleanDescription(value: unknown) {
  return typeof value === "string" ? value.replace(/[\r\n\u0000]/g, " ").slice(0, 500) : "The OSV database reported a vulnerability affecting this exact locked package version.";
}

function dependencyFinding(pkg: LockedPackage, lockPath: string, id: string, record?: Record<string, unknown>): AuditFinding {
  const title = typeof record?.summary === "string" ? record.summary.replace(/[\r\n\u0000]/g, " ").slice(0, 140) : "Known vulnerability advisory match";
  const fixed = record ? fixedVersions(record) : [];
  return {
    id: `OSV:${pkg.name}@${pkg.version}:${id}`,
    ruleId: "DEP001",
    title,
    category: "security",
    severity: record ? advisorySeverity(record) : "info",
    confidence: "high",
    file: lockPath,
    evidence: `${pkg.name}@${pkg.version} matched advisory ${id}`,
    explanation: cleanDescription(record?.details),
    recommendation: fixed.length ? `Upgrade to a fixed version such as ${fixed.join(", ")}. Confirm compatibility and review the advisory.` : "Review the linked advisory and update to a version confirmed as fixed by the package maintainer.",
    provenance: "osv-advisory",
    advisoryId: id,
    advisoryUrl: `${OSV_API.replace("api.", "")}/vulnerability/${encodeURIComponent(id)}`,
    packageName: pkg.name,
    packageVersion: pkg.version,
    dependencyType: pkg.type,
  };
}

function reportWithoutLookup(report: AuditReport, status: AuditReport["dependencyAudit"]["status"], message: string, omittedPackages = 0): AuditReport {
  return {
    ...report,
    dependencyAudit: { status, database: null, checkedAt: null, queriedPackages: 0, vulnerablePackages: 0, omittedPackages, message },
    checksNotRun: [...report.checksNotRun.filter((item) => !item.startsWith("Dependency vulnerability database")), message],
  };
}

export async function auditDependencyAdvisories(manifest: SourceManifest, initial: AuditReport): Promise<AuditReport> {
  const lock = manifest.metadataFiles.find((file) => /(^|\/)(?:package-lock\.json|npm-shrinkwrap\.json)$/i.test(file.path));
  if (!lock) {
    const unsupported = manifest.metadataFilePaths.some((file) => /(^|\/)(?:pnpm-lock\.yaml|yarn\.lock|bun\.lockb?)$/i.test(file));
    return reportWithoutLookup(initial, "not-run", unsupported
      ? "Dependency advisory lookup was not run because this release only reads npm package-lock.json and npm-shrinkwrap.json."
      : "Dependency advisory lookup was not run because no supported npm lockfile was included.");
  }

  let lockObject: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(lock.content);
    const record = asRecord(parsed);
    if (!record) throw new Error("Invalid package lock");
    lockObject = record;
  } catch {
    return reportWithoutLookup(initial, "unavailable", `The supported lockfile ${lock.path} could not be parsed as JSON.`);
  }

  const allPackages = collectLockedPackages(lockObject, manifest);
  const packages = allPackages.slice(0, MAX_PACKAGES);
  const omittedPackages = Math.max(0, allPackages.length - packages.length);
  if (packages.length === 0) {
    return {
      ...initial,
      dependencyAudit: { status: omittedPackages ? "partial" : "checked", database: "OSV", checkedAt: new Date().toISOString(), queriedPackages: 0, vulnerablePackages: 0, omittedPackages, message: "The supported npm lockfile contained no exact semantic package versions to query." },
      checksNotRun: initial.checksNotRun.filter((item) => !item.startsWith("Dependency vulnerability database")),
    };
  }

  let payload: unknown;
  try {
    payload = await osvPost(`${OSV_API}/v1/querybatch`, {
      queries: packages.map((pkg) => ({ package: { name: pkg.name, ecosystem: "npm" }, version: pkg.version })),
    });
  } catch (error) {
    const detail = error instanceof Error && error.name === "TimeoutError" ? "The OSV advisory service timed out." : "The OSV advisory service could not be reached or returned an invalid response.";
    return reportWithoutLookup(initial, "unavailable", `${detail} Dependency status is unknown, not clean.`, omittedPackages);
  }
  const body = asRecord(payload);
  if (!body || !Array.isArray(body.results)) return reportWithoutLookup(initial, "unavailable", "The OSV advisory service returned an unexpected response. Dependency status is unknown, not clean.", omittedPackages);

  const advisoryByPackage: Array<{ pkg: LockedPackage; id: string }[]> = [];
  const ids = new Set<string>();
  for (let index = 0; index < packages.length; index += 1) {
    const result = asRecord(body.results[index]);
    const advisories: { pkg: LockedPackage; id: string }[] = [];
    if (Array.isArray(result?.vulns)) {
      for (const item of result.vulns) {
        const advisory = asRecord(item);
        if (typeof advisory?.id !== "string" || advisory.id.length > 128 || !/^[A-Za-z0-9._-]+$/.test(advisory.id)) continue;
        advisories.push({ pkg: packages[index], id: advisory.id });
        ids.add(advisory.id);
      }
    }
    advisoryByPackage.push(advisories);
  }

  const detailIds = [...ids].slice(0, MAX_ADVISORIES);
  const records = new Map<string, Record<string, unknown>>();
  let detailFailures = 0;
  for (let index = 0; index < detailIds.length; index += 8) {
    const batch = detailIds.slice(index, index + 8);
    const outcomes = await Promise.all(batch.map(async (id) => {
      try { return { id, value: asRecord(await osvGet(id)) }; }
      catch { return { id, value: null }; }
    }));
    for (const outcome of outcomes) {
      if (outcome.value) records.set(outcome.id, outcome.value);
      else detailFailures += 1;
    }
  }

  const findings: AuditFinding[] = [];
  const vulnerableNames = new Set<string>();
  for (const advisories of advisoryByPackage) {
    for (const item of advisories) {
      vulnerableNames.add(`${item.pkg.name}@${item.pkg.version}`);
      findings.push(dependencyFinding(item.pkg, lock.path, item.id, records.get(item.id)));
    }
  }
  const merged = [...initial.findings, ...findings].slice(0, 500);
  const summary: AuditReport["summary"] = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const finding of merged) summary[finding.severity] += 1;
  const truncatedAdvisories = Math.max(0, ids.size - detailIds.length);
  const partial = omittedPackages > 0 || body.results.length !== packages.length || detailFailures > 0 || truncatedAdvisories > 0;
  const checkMessage = `${partial ? "Partial" : "Complete"} OSV lookup: queried ${packages.length} exact npm package versions; ${vulnerableNames.size} package/version pair(s) matched advisories${truncatedAdvisories ? `, with ${truncatedAdvisories} advisory detail record(s) omitted by limits` : ""}${detailFailures ? `, ${detailFailures} advisory detail record(s) could not be fetched` : ""}${omittedPackages ? `, ${omittedPackages} package(s) omitted by limits` : ""}.`;
  return {
    ...initial,
    findings: merged,
    summary,
    coverage: {
      ...initial.coverage,
      findingsTruncated: initial.coverage.findingsTruncated || initial.findings.length + findings.length > 500,
      note: `${initial.coverage.note} ${initial.findings.length + findings.length > 500 ? "The combined audit output was capped at 500 findings." : ""}`,
    },
    dependencyAudit: {
      status: partial ? "partial" : "checked",
      database: "OSV",
      checkedAt: new Date().toISOString(),
      queriedPackages: packages.length,
      vulnerablePackages: vulnerableNames.size,
      omittedPackages,
      message: checkMessage,
    },
    checksNotRun: initial.checksNotRun.filter((item) => !item.startsWith("Dependency vulnerability database")),
  };
}
