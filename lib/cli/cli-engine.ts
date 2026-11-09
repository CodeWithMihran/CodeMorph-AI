import fs from "node:fs";
import path from "node:path";
import { classifySource, type ClassifiedSource } from "@/lib/github/classify-source";
import { evaluateFeasibility, type FeasibilityReport } from "@/lib/analysis/feasibility";
import { auditSourceFiles, renderAuditMarkdown } from "@/lib/audit/engine";
import { auditDependencyAdvisories } from "@/lib/audit/dependencies";
import type { AuditReport } from "@/lib/audit/types";
import {
  createSourceManifest,
  isAuditableSourcePath,
  isDependencyMetadataPath,
  type SourceManifest,
} from "@/lib/source/manifest";
import { readZipSourceManifest } from "@/lib/source/zip";
import { unpackStoredZip } from "@/lib/migration/zip";
import { scaffold, type ScaffoldConfig } from "@/lib/migration/scaffold";
import type { MigrationTarget } from "@/lib/migration/plan";
import { detectApplicableCodemods } from "@/lib/codemods/engine";
import { runMigrationDoctor, type DoctorReport } from "@/lib/doctor/health-doctor";

export interface LoadedSource {
  targetPath: string;
  isZip: boolean;
  manifest: SourceManifest;
  files: Array<{ path: string; content: string }>;
  filePaths: string[];
  profile: ClassifiedSource;
  packageJson: Record<string, unknown> | null;
}

const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  ".turbo",
  ".codemorph",
  "coverage",
  ".expo",
]);
const MAX_LOCAL_FILES = 10_000;
const MAX_LOCAL_TEXT_BYTES = 100 * 1024 * 1024;
const MAX_LOCAL_DEPTH = 64;

/**
 * Reads a local project directory or ZIP archive into an in-memory normalized source structure.
 */
export function readLocalSource(targetPath: string): LoadedSource {
  const resolved = path.resolve(process.cwd(), targetPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Target path does not exist: ${targetPath}`);
  }

  const stat = fs.statSync(resolved);
  if (stat.isFile()) {
    if (!resolved.toLowerCase().endsWith(".zip")) {
      throw new Error(`File is not a supported ZIP archive: ${targetPath}`);
    }
    const buffer = fs.readFileSync(resolved);
    const manifest = readZipSourceManifest(buffer, path.basename(resolved));
    const files = unpackStoredZip(buffer);
    const filePaths = files.map((f) => f.path);
    const manifestFile = files.find((f) => f.path === "package.json");
    let packageJson: Record<string, unknown> | null = null;
    if (manifestFile) {
      try {
        packageJson = JSON.parse(manifestFile.content);
      } catch {
        packageJson = { note: "invalid manifest" };
      }
    }
    const rootFiles = new Set(filePaths.filter((p) => !p.includes("/")));
    const profile = classifySource(rootFiles, packageJson);

    return {
      targetPath: resolved,
      isZip: true,
      manifest,
      files,
      filePaths,
      profile,
      packageJson,
    };
  }

  if (!stat.isDirectory()) {
    throw new Error(`Path is neither a directory nor a ZIP file: ${targetPath}`);
  }

  // Scan directory recursively
  const collectedFiles: Array<{ path: string; content: string }> = [];
  const auditableFiles: Array<{ path: string; content: string }> = [];
  const metadataFiles: Array<{ path: string; content: string }> = [];
  let repositoryFileCount = 0;
  let analyzedBytes = 0;

  function walk(currentDir: string, depth = 0) {
    if (depth > MAX_LOCAL_DEPTH) {
      throw new Error(`Project directory nesting exceeds the ${MAX_LOCAL_DEPTH}-level scan limit.`);
    }
    const items = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const item of items) {
      if (IGNORED_DIRS.has(item.name)) continue;
      const fullPath = path.join(currentDir, item.name);
      if (item.isSymbolicLink()) continue;

      if (item.isDirectory()) {
        walk(fullPath, depth + 1);
      } else if (item.isFile()) {
        repositoryFileCount++;
        if (repositoryFileCount > MAX_LOCAL_FILES) {
          throw new Error(`Project contains more than ${MAX_LOCAL_FILES.toLocaleString()} files; reduce the input size and retry.`);
        }
        const relPath = path.relative(resolved, fullPath).split(path.sep).join("/");
        try {
          const fileBytes = fs.statSync(fullPath).size;
          if (analyzedBytes + fileBytes > MAX_LOCAL_TEXT_BYTES) {
            throw new Error(`Project text exceeds the ${Math.round(MAX_LOCAL_TEXT_BYTES / (1024 * 1024))} MiB scan limit.`);
          }
          const content = fs.readFileSync(fullPath, "utf8");
          analyzedBytes += fileBytes;
          const entry = { path: relPath, content };
          collectedFiles.push(entry);

          if (isDependencyMetadataPath(relPath)) {
            metadataFiles.push(entry);
          } else if (isAuditableSourcePath(relPath)) {
            auditableFiles.push(entry);
          }
        } catch (error) {
          if (error instanceof Error && /scan limit/.test(error.message)) throw error;
          // Non-UTF8 binary files are skipped from text analysis
        }
      }
    }
  }

  walk(resolved);

  const filePaths = collectedFiles.map((f) => f.path);
  const manifestFile = collectedFiles.find((f) => f.path === "package.json");
  let packageJson: Record<string, unknown> | null = null;
  if (manifestFile) {
    try {
      packageJson = JSON.parse(manifestFile.content);
    } catch {
      packageJson = { note: "invalid manifest" };
    }
  }

  const rootFiles = new Set(filePaths.filter((p) => !p.includes("/")));
  const profile = classifySource(rootFiles, packageJson);

  const manifest = createSourceManifest({
    origin: {
      kind: "github", // Local filesystem mapped to standard origin schema
      label: path.basename(resolved),
      revision: "local-workspace",
    },
    files: auditableFiles,
    metadataFiles,
    metadataFilePaths: metadataFiles.map((m) => m.path),
    repositoryFileCount,
    eligibleTextFileCount: auditableFiles.length,
    omittedEligibleFiles: 0,
    exclusions: Array.from(IGNORED_DIRS),
  });

  return {
    targetPath: resolved,
    isZip: false,
    manifest,
    files: collectedFiles,
    filePaths,
    profile,
    packageJson,
  };
}

// ---------------------------------------------------------------------------
// 1. AUDIT CLI COMMAND
// ---------------------------------------------------------------------------

export interface AuditCliOptions {
  format?: "pretty" | "json" | "markdown";
  output?: string;
  failOnCritical?: boolean;
  skipDependencies?: boolean;
}

export interface AuditCliResult {
  report: AuditReport;
  markdown: string;
  exitCode: number;
}

export async function runAudit(
  targetPath: string,
  options: AuditCliOptions = {}
): Promise<AuditCliResult> {
  const loaded = readLocalSource(targetPath);
  const staticReport = auditSourceFiles({ manifest: loaded.manifest });

  let finalReport = staticReport;
  if (!options.skipDependencies) {
    try {
      finalReport = await auditDependencyAdvisories(loaded.manifest, staticReport);
    } catch {
      // Offline fallback: keep static report
    }
  }

  const markdown = renderAuditMarkdown(finalReport);
  const hasCriticalOrHigh =
    (finalReport.summary.critical ?? 0) > 0 || (finalReport.summary.high ?? 0) > 0;
  const exitCode = options.failOnCritical && hasCriticalOrHigh ? 1 : 0;

  if (options.output) {
    const outPath = path.resolve(process.cwd(), options.output);
    const content =
      options.format === "json"
        ? JSON.stringify(finalReport, null, 2)
        : options.format === "markdown"
        ? markdown
        : formatPrettyAudit(finalReport);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, content, "utf8");
  }

  return {
    report: finalReport,
    markdown,
    exitCode,
  };
}

// ---------------------------------------------------------------------------
// 2. FEASIBILITY CLI COMMAND
// ---------------------------------------------------------------------------

export interface FeasibilityCliOptions {
  target?: MigrationTarget;
  format?: "pretty" | "json";
  failUnder?: number;
  output?: string;
}

export interface FeasibilityCliResult {
  report: FeasibilityReport;
  profile: ClassifiedSource;
  exitCode: number;
}

export function runFeasibility(
  targetPath: string,
  options: FeasibilityCliOptions = {}
): FeasibilityCliResult {
  const loaded = readLocalSource(targetPath);
  const target = options.target ?? "nextjs";
  const keyFiles = ["package.json", "index.html", "src/main.tsx", "src/App.tsx"].filter((p) =>
    loaded.filePaths.includes(p)
  );

  const routeCandidates = loaded.filePaths.filter((p) =>
    /(?:pages|routes|screens)\/|\bApp\.tsx|\bmain\.tsx/i.test(p)
  );

  const report = evaluateFeasibility({
    sourceType: loaded.profile.sourceType,
    framework: loaded.profile.framework,
    supportReason: loaded.profile.supportReason,
    filePaths: loaded.filePaths,
    keyFiles,
    routeCandidates,
    manifest: loaded.packageJson,
    files: loaded.files,
    target,
  });

  const exitCode = options.failUnder !== undefined && report.score < options.failUnder ? 1 : 0;

  if (options.output) {
    const outPath = path.resolve(process.cwd(), options.output);
    const content =
      options.format === "json"
        ? JSON.stringify(report, null, 2)
        : formatPrettyFeasibility(report);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, content, "utf8");
  }

  return {
    report,
    profile: loaded.profile,
    exitCode,
  };
}

// ---------------------------------------------------------------------------
// 3. SCAFFOLD CLI COMMAND
// ---------------------------------------------------------------------------

export interface ScaffoldCliOptions {
  target?: MigrationTarget;
  out?: string;
  styling?: "tailwind" | "nativewind" | "standard-css";
  strictTs?: boolean;
  packageManager?: "npm" | "pnpm" | "yarn" | "bun";
  noTests?: boolean;
  format?: "pretty" | "json";
}

export interface ScaffoldCliResult {
  target: MigrationTarget;
  entries: Array<{ path: string; content: string }>;
  filesCount: number;
  writtenTo?: string;
  exitCode: number;
}

export function runScaffold(
  targetPath: string,
  options: ScaffoldCliOptions = {}
): ScaffoldCliResult {
  const loaded = readLocalSource(targetPath);
  const target = options.target ?? "nextjs";

  const config: Partial<ScaffoldConfig> = {
    styling: options.styling ?? (target === "expo" ? "standard-css" : "tailwind"),
    strictTypeScript: options.strictTs !== false,
    packageManager: options.packageManager ?? "npm",
    includeTestSuite: options.noTests !== true,
  };

  const summary = `CLI Autonomous Migration Scaffold for ${loaded.profile.framework}`;
  const goal = `Scaffold ${target === "expo" ? "Expo mobile" : "Next.js web"} target architecture.`;
  const entries = scaffold(summary, goal, target, config, loaded.files);

  let writtenTo: string | undefined;
  if (options.out) {
    const outDir = path.resolve(process.cwd(), options.out);
    fs.mkdirSync(outDir, { recursive: true });
    for (const entry of entries) {
      const full = path.join(outDir, entry.path);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, entry.content, "utf8");
    }
    writtenTo = outDir;
  }

  return {
    target,
    entries,
    filesCount: entries.length,
    writtenTo,
    exitCode: 0,
  };
}

// ---------------------------------------------------------------------------
// 4. CODEMOD CLI COMMAND
// ---------------------------------------------------------------------------

export interface CodemodCliOptions {
  type?: "all" | "react-router" | "use-client" | "next-image" | "expo-primitives";
  fix?: boolean;
  target?: MigrationTarget;
  format?: "pretty" | "json";
}

export interface CodemodCliResult {
  totalFiles: number;
  modifiedFilesCount: number;
  transforms: Array<{
    file: string;
    action: string;
    description: string;
  }>;
  exitCode: number;
}

export function runCodemod(
  targetPath: string,
  options: CodemodCliOptions = {}
): CodemodCliResult {
  const loaded = readLocalSource(targetPath);
  const target = options.target ?? (loaded.profile.framework.includes("Native") ? "expo" : "nextjs");
  const transforms: Array<{ file: string; action: string; description: string }> = [];
  const modifiedFiles = new Set<string>();

  for (const file of loaded.files) {
    if (!/\.(?:tsx?|jsx?)$/i.test(file.path)) continue;
    let currentContent = file.content;
    const actions = detectApplicableCodemods(file.path, currentContent, target);

    for (const action of actions) {
      if (options.type && options.type !== "all" && action.id !== options.type) {
        continue;
      }
      const res = action.apply(currentContent);
      if (res.changed) {
        currentContent = res.code;
        modifiedFiles.add(file.path);
        transforms.push({
          file: file.path,
          action: action.label,
          description: res.description,
        });
      }
    }

    if (options.fix && !loaded.isZip && modifiedFiles.has(file.path)) {
      const full = path.join(loaded.targetPath, file.path);
      fs.writeFileSync(full, currentContent, "utf8");
    }
  }

  return {
    totalFiles: loaded.files.length,
    modifiedFilesCount: modifiedFiles.size,
    transforms,
    exitCode: 0,
  };
}

// ---------------------------------------------------------------------------
// TERMINAL PRETTY FORMATTERS
// ---------------------------------------------------------------------------

export function formatPrettyAudit(report: AuditReport): string {
  const lines: string[] = [];
  lines.push("\n  🛡  CodeMorph AI Security & Code Audit");
  lines.push("  " + "━".repeat(50));
  lines.push(`  Source:     ${report.source.label}`);
  lines.push(`  Scanned:    ${report.coverage.scannedFiles} files (${report.coverage.scannedBytes} bytes)`);
  lines.push(`  Generated:  ${new Date(report.generatedAt).toLocaleString()}`);
  lines.push("");

  lines.push("  Findings Summary:");
  lines.push(`    • Critical: ${report.summary.critical}`);
  lines.push(`    • High:     ${report.summary.high}`);
  lines.push(`    • Medium:   ${report.summary.medium}`);
  lines.push(`    • Low:      ${report.summary.low}`);
  lines.push(`    • Info:     ${report.summary.info}`);
  lines.push("");

  lines.push("  Structural Architecture Metrics:");
  lines.push(`    • Parsed JS/TS Files:         ${report.structure.parsedFiles}`);
  lines.push(`    • Syntax Errors:               ${report.structure.syntaxErrors}`);
  lines.push(`    • Resolved Internal Imports:   ${report.structure.resolvedInternalImports}`);
  lines.push(`    • Unresolved Internal Imports: ${report.structure.unresolvedInternalImports}`);
  lines.push(`    • Undeclared Package Imports:  ${report.structure.undeclaredPackageImports}`);
  lines.push("");

  if (report.findings.length > 0) {
    lines.push("  Top Diagnostic Findings:");
    for (const f of report.findings.slice(0, 10)) {
      const tag = `[${f.severity.toUpperCase()}]`.padEnd(10);
      lines.push(`    ${tag} ${f.file}${f.line ? `:${f.line}` : ""} - ${f.title}`);
    }
    if (report.findings.length > 10) {
      lines.push(`    ... and ${report.findings.length - 10} more findings.`);
    }
    lines.push("");
  } else {
    lines.push("  ✔ No security or syntax violations found across scanned files.\n");
  }

  return lines.join("\n");
}

export function formatPrettyFeasibility(report: FeasibilityReport): string {
  const lines: string[] = [];
  const tierEmoji =
    report.tier === "high"
      ? "🟢"
      : report.tier === "moderate"
      ? "🟡"
      : report.tier === "low"
      ? "🟠"
      : "🔴";

  lines.push("\n  ⚡ CodeMorph AI Migration Feasibility Scorecard");
  lines.push("  " + "━".repeat(50));
  lines.push(`  Overall Portability: ${tierEmoji} ${report.score}% [${report.tier.toUpperCase()}]`);
  lines.push(`  Summary:             ${report.summary}`);
  lines.push("");

  lines.push("  Dimensional Breakdown:");
  lines.push(`    • Routes:       ${report.dimensions.routes.score}%  (Weight: ${Math.round(report.dimensions.routes.weight * 100)}%) — ${report.dimensions.routes.detail}`);
  lines.push(`    • Components:   ${report.dimensions.components.score}%  (Weight: ${Math.round(report.dimensions.components.weight * 100)}%) — ${report.dimensions.components.detail}`);
  lines.push(`    • Dependencies: ${report.dimensions.dependencies.score}%  (Weight: ${Math.round(report.dimensions.dependencies.weight * 100)}%) — ${report.dimensions.dependencies.detail}`);
  lines.push(`    • Structure:    ${report.dimensions.structure.score}%  (Weight: ${Math.round(report.dimensions.structure.weight * 100)}%) — ${report.dimensions.structure.detail}`);
  lines.push("");

  if (report.breakdown.automatic.length > 0) {
    lines.push("  Automated Capabilities:");
    for (const a of report.breakdown.automatic) lines.push(`    ✔ ${a}`);
    lines.push("");
  }

  if (report.breakdown.risks.length > 0) {
    lines.push("  Identified Migration Risks:");
    for (const r of report.breakdown.risks) lines.push(`    ⚠ ${r}`);
    lines.push("");
  }

  return lines.join("\n");
}

export function formatPrettyScaffold(result: ScaffoldCliResult): string {
  const lines: string[] = [];
  lines.push("\n  🚀 CodeMorph AI Autonomous Scaffold Generator");
  lines.push("  " + "━".repeat(50));
  lines.push(`  Target Framework:   ${result.target === "expo" ? "Expo Router (React Native) + TypeScript" : "Next.js App Router + TypeScript"}`);
  lines.push(`  Synthesized Files:  ${result.filesCount} entries`);
  if (result.writtenTo) {
    lines.push(`  Output Location:    ${result.writtenTo}`);
  }
  lines.push("");
  lines.push("  Planned & Synthesized Architecture Files:");
  for (const entry of result.entries) {
    lines.push(`    • ${entry.path}`);
  }
  lines.push("");
  return lines.join("\n");
}

export function formatPrettyCodemod(result: CodemodCliResult): string {
  const lines: string[] = [];
  lines.push("\n  ⚡ CodeMorph AI Deterministic Text Codemod Engine");
  lines.push("  " + "━".repeat(50));
  lines.push(`  Scanned Source Files:   ${result.totalFiles}`);
  lines.push(`  Files with Transforms:  ${result.modifiedFilesCount}`);
  lines.push(`  Total Text Transforms:  ${result.transforms.length}`);
  lines.push("");

  if (result.transforms.length > 0) {
    lines.push("  Applicable Codemod Transformations:");
    for (const t of result.transforms) {
      lines.push(`    • [${t.action}] ${t.file}`);
      lines.push(`      ↳ ${t.description}`);
    }
    lines.push("");
  } else {
    lines.push("  ✔ No pending text transformations needed across scanned source files.\n");
  }

  return lines.join("\n");
}

export function runDoctorOnSource(
  source: LoadedSource,
  targetFramework: string = "Next.js App Router"
): DoctorReport {
  return runMigrationDoctor(source.files, targetFramework);
}

export function formatPrettyDoctor(report: DoctorReport): string {
  const lines: string[] = [];
  lines.push("\n  🩺 CodeMorph AI Migration Health Doctor Report");
  lines.push("  " + "━".repeat(50));
  lines.push(`  Overall Health Score:   ${report.overallScore}/100  (Grade ${report.grade})`);
  lines.push(`  Total Issues Detected:  ${report.issues.length} (${report.criticalCount} critical, ${report.warningCount} warnings)`);
  lines.push(`  Automated 1-Click Fixes: ${report.totalFixable} available`);
  lines.push("");

  lines.push("  Category Breakdown:");
  for (const cat of report.categories) {
    const status = cat.totalIssues === 0 ? "✔ Pristine" : `⚠ ${cat.totalIssues} issue(s)`;
    lines.push(`    • ${cat.title.padEnd(28)}: ${cat.score}%  (${status})`);
  }
  lines.push("");

  if (report.issues.length > 0) {
    lines.push("  Detected Issues & Diagnostics:");
    for (const iss of report.issues) {
      const fixTag = iss.canAutofix ? " [⚡ Autofixable]" : "";
      lines.push(`    • [${iss.severity.toUpperCase()}] ${iss.title}${fixTag}`);
      lines.push(`      File: ${iss.filePath}${iss.line ? `:${iss.line}` : ""}`);
      lines.push(`      ↳ ${iss.description}`);
    }
    lines.push("");
  } else {
    lines.push("  ✔ All architectural health check suites passed with 100% compliance.\n");
  }

  return lines.join("\n");
}
