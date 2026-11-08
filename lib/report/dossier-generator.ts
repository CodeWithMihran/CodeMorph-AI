import type { AuditReport } from "@/lib/audit/types";
import type { FeasibilityReport } from "@/lib/analysis/feasibility";
import type { MigrationPlan } from "@/lib/migration/plan";
import type { ScaffoldConfig } from "@/lib/migration/scaffold";

export interface DossierInput {
  title?: string;
  repository: string;
  revision?: string;
  branch?: string;
  framework?: string;
  target?: string;
  sourceType?: string;
  generatedAt?: string;
  auditReport?: AuditReport | null;
  feasibilityReport?: FeasibilityReport | null;
  migrationPlan?: MigrationPlan | null;
  scaffoldConfig?: ScaffoldConfig | null;
  migrationResult?: {
    fileCount: number;
    sourceFileCount: number;
    readiness: string;
    validation: string;
    build?: string;
    rootRoute?: string;
    memoryRulesUsed?: number;
    memoryRulesSaved?: number;
    routeChecks?: Array<{ path: string; status: string }>;
  } | null;
}

/**
 * Synthesizes a comprehensive, publication-grade markdown Engineering Dossier
 * uniting security vulnerabilities, AST syntax, feasibility scoring, and route transformation.
 */
export function generateExecutiveDossier(input: DossierInput): string {
  const timestamp = input.generatedAt || new Date().toISOString();
  const repoName = input.repository || "Target Repository";
  const targetLabel = input.target || "Next.js App Router (TypeScript)";
  const framework = input.framework || "React SPA";
  const revision = input.revision || "HEAD";

  const lines: string[] = [];

  // 1. Header & Title
  lines.push("# CODEMORPH AI — EXECUTIVE ENGINEERING DOSSIER");
  lines.push("### Autonomous Codebase Audit, Feasibility Scorecard & Cross-Stack Transformation");
  lines.push("");
  lines.push(`*Generated on: \`${timestamp}\` by CodeMorph AI Engine v0.1.0*`);
  lines.push("");
  lines.push("---");
  lines.push("");

  // 2. Executive Overview Table
  lines.push("## 1. Executive Summary & Verification Classification");
  lines.push("");
  lines.push("| Dimension | Specification / Assessment |");
  lines.push("| :--- | :--- |");
  lines.push(`| **Source Repository** | \`${repoName}\` |`);
  lines.push(`| **Branch & Commit SHA** | \`${input.branch || "main"}\` (\`${revision.slice(0, 10)}\`) |`);
  lines.push(`| **Source Framework** | \`${framework}\` |`);
  lines.push(`| **Target Architecture** | \`${targetLabel}\` |`);

  if (input.feasibilityReport) {
    lines.push(
      `| **Migration Feasibility** | **${input.feasibilityReport.score} / 100** (${input.feasibilityReport.tier.toUpperCase()} FEASIBILITY) |`
    );
  }

  if (input.auditReport) {
    const crit = input.auditReport.summary.critical;
    const high = input.auditReport.summary.high;
    const med = input.auditReport.summary.medium;
    lines.push(`| **Security Vulnerabilities** | **${crit} Critical**, **${high} High**, **${med} Medium** |`);
    lines.push(`| **AST Unresolved Imports** | ${input.auditReport.structure.unresolvedInternalImports} |`);
    lines.push(`| **Syntax Parsing Errors** | ${input.auditReport.structure.syntaxErrors} |`);
  }

  if (input.migrationResult) {
    lines.push(`| **Transformation Readiness** | **${input.migrationResult.readiness.toUpperCase()}** |`);
    lines.push(`| **Output Package Files** | ${input.migrationResult.fileCount} files synthesized |`);
    lines.push(`| **Validation Checks** | ${input.migrationResult.validation.toUpperCase()} |`);
    if (input.migrationResult.memoryRulesUsed !== undefined) {
      lines.push(`| **Procedural Memory Rules** | ${input.migrationResult.memoryRulesUsed} active rules applied |`);
    }
  }

  lines.push("");
  lines.push("---");
  lines.push("");

  // 3. Security Vulnerability Posture (Google OSV)
  if (input.auditReport) {
    lines.push("## 2. Security Vulnerability Posture & Advisory Audit");
    lines.push("");
    lines.push(
      "Codebase dependencies were evaluated against real-time **Google Open Source Vulnerabilities (OSV)** databases. Findings summary:"
    );
    lines.push("");
    lines.push(`* **Critical Severities:** ${input.auditReport.summary.critical}`);
    lines.push(`* **High Severities:** ${input.auditReport.summary.high}`);
    lines.push(`* **Medium Severities:** ${input.auditReport.summary.medium}`);
    lines.push(`* **Low Severities:** ${input.auditReport.summary.low}`);
    lines.push("");

    const securityFindings = input.auditReport.findings.filter((f) => f.category === "security");
    if (securityFindings.length > 0) {
      lines.push("### Identified Advisory Vulnerabilities");
      lines.push("");
      lines.push("| Package | Version | Severity | Advisory ID | Recommendation |");
      lines.push("| :--- | :--- | :--- | :--- | :--- |");
      for (const f of securityFindings.slice(0, 15)) {
        const pkg = f.packageName || "Unknown";
        const ver = f.packageVersion || "Locked";
        const advId = f.advisoryId ? `[${f.advisoryId}](${f.advisoryUrl || "#"})` : "CVE";
        lines.push(`| \`${pkg}\` | \`${ver}\` | **${f.severity.toUpperCase()}** | ${advId} | ${f.recommendation} |`);
      }
      lines.push("");
    } else {
      lines.push("> **Security Clearance:** Zero Google OSV vulnerabilities or credentials detected in scanned locked manifests.");
      lines.push("");
    }

    lines.push("---");
    lines.push("");
  }

  // 4. Codebase Structural Health & AST Parser Diagnostics
  if (input.auditReport) {
    lines.push("## 3. Codebase Structural Health & AST Analysis");
    lines.push("");
    lines.push("| Metric | Count | Assessment |");
    lines.push("| :--- | :--- | :--- |");
    lines.push(`| **Parsed Source Files** | ${input.auditReport.structure.parsedFiles} | Scanned via TypeScript AST parser |`);
    lines.push(`| **Syntax & Parse Errors** | ${input.auditReport.structure.syntaxErrors} | ${input.auditReport.structure.syntaxErrors === 0 ? "Clean AST parse" : "Requires syntax cleanup"} |`);
    lines.push(`| **Resolved Relative Imports** | ${input.auditReport.structure.resolvedInternalImports} | Validated '@/' alias and relative imports |`);
    lines.push(`| **Unresolved Internal Imports** | ${input.auditReport.structure.unresolvedInternalImports} | ${input.auditReport.structure.unresolvedInternalImports === 0 ? "All internal modules resolved" : "Broken relative file references detected"} |`);
    lines.push(`| **External Package Imports** | ${input.auditReport.structure.packageImports} | Third-party module dependencies |`);
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  // 5. Feasibility Scorecard & Dimensional Breakdown
  if (input.feasibilityReport) {
    const f = input.feasibilityReport;
    lines.push("## 4. Multi-Dimensional Feasibility Scorecard");
    lines.push("");
    lines.push(`**Overall Portability Rating:** \`${f.score}/100\` (${f.tier.toUpperCase()})`);
    lines.push(`> *${f.summary}*`);
    lines.push("");
    lines.push("### Dimensional Weight Breakdown");
    lines.push("");
    lines.push("| Dimension | Score | Weight | Detail |");
    lines.push("| :--- | :--- | :--- | :--- |");
    lines.push(`| **${f.dimensions.routes.label}** | \`${f.dimensions.routes.score}%\` | ${(f.dimensions.routes.weight * 100).toFixed(0)}% | ${f.dimensions.routes.detail} |`);
    lines.push(`| **${f.dimensions.components.label}** | \`${f.dimensions.components.score}%\` | ${(f.dimensions.components.weight * 100).toFixed(0)}% | ${f.dimensions.components.detail} |`);
    lines.push(`| **${f.dimensions.dependencies.label}** | \`${f.dimensions.dependencies.score}%\` | ${(f.dimensions.dependencies.weight * 100).toFixed(0)}% | ${f.dimensions.dependencies.detail} |`);
    lines.push(`| **${f.dimensions.structure.label}** | \`${f.dimensions.structure.score}%\` | ${(f.dimensions.structure.weight * 100).toFixed(0)}% | ${f.dimensions.structure.detail} |`);
    lines.push("");

    if (f.breakdown.automatic.length > 0) {
      lines.push("### Automated Transformation Actions");
      for (const item of f.breakdown.automatic) {
        lines.push(`* ✓ ${item}`);
      }
      lines.push("");
    }

    if (f.breakdown.manual.length > 0) {
      lines.push("### Items Requiring Manual Review");
      for (const item of f.breakdown.manual) {
        lines.push(`* ⚠ ${item}`);
      }
      lines.push("");
    }

    if (f.breakdown.risks.length > 0) {
      lines.push("### Identified Architecture Risks");
      for (const item of f.breakdown.risks) {
        lines.push(`* ✕ ${item}`);
      }
      lines.push("");
    }

    if (f.dependencyAnalysis && f.dependencyAnalysis.dependencies.length > 0) {
      const da = f.dependencyAnalysis;
      lines.push("### Package Compatibility & Shim Recipes");
      lines.push("");
      lines.push(`- **Compatibility Score:** ${da.compatibilityScore}%`);
      lines.push(`- **Summary:** ${da.summary.dropIn} Drop-in, ${da.summary.shimAvailable} Shim Available, ${da.summary.refactorRequired} Refactor Required, ${da.summary.incompatible} Incompatible`);
      if (da.installShims.length > 0) {
        lines.push(`- **Recommended Polyfill Packages:** \`npm install ${da.installShims.join(" ")}\``);
      }
      lines.push("");
      lines.push("| Package | Status | Target Replacement | Architectural Guidance |");
      lines.push("| :--- | :--- | :--- | :--- |");
      for (const dep of da.dependencies) {
        const badge = dep.status === "drop-in" ? "Drop-in Ready" : dep.status === "shim-available" ? "Shim Available" : dep.status === "refactor-required" ? "Refactor Required" : "Incompatible";
        lines.push(`| \`${dep.name}\` | **${badge}** | \`${dep.replacement}\` | ${dep.reason} |`);
      }
      lines.push("");

      if (da.browserApis.length > 0) {
        lines.push("#### Detected Browser & Runtime Globals");
        lines.push("");
        lines.push("| Global API | Occurrences | Detected Locations | Remediation Strategy |");
        lines.push("| :--- | :--- | :--- | :--- |");
        for (const api of da.browserApis) {
          lines.push(`| \`${api.api}\` | ${api.occurrences} | \`${api.files.slice(0, 2).join(", ")}${api.files.length > 2 ? "..." : ""}\` | ${api.recommendation} |`);
        }
        lines.push("");
      }
    }

    lines.push("---");
    lines.push("");
  }

  // 6. Route Transformation Inventory
  if (input.migrationPlan) {
    lines.push("## 5. Route Transformation & Canonical Mapping Inventory");
    lines.push("");
    const required = input.migrationPlan.routes.required || [];
    const manual = input.migrationPlan.routes.manual || [];

    if (required.length > 0) {
      lines.push("### Automated Routes Mapped to Target");
      lines.push("");
      lines.push("| Route Path | Source Evidence | Target Destination |");
      lines.push("| :--- | :--- | :--- |");
      for (const r of required) {
        const targetFile = targetLabel.includes("Expo")
          ? r.path === "/" ? "app/index.tsx" : `app${r.path}.tsx`
          : r.path === "/" ? "app/page.tsx" : `app${r.path}/page.tsx`;
        lines.push(`| \`${r.path}\` | \`${r.evidence.join(", ") || "Component"}\` | \`${targetFile}\` |`);
      }
      lines.push("");
    }

    if (manual.length > 0) {
      lines.push("### Dynamic / Wildcard Routes Flagged for Manual Verification");
      lines.push("");
      lines.push("| Pattern | Evidence | Reason / Guidance |");
      lines.push("| :--- | :--- | :--- |");
      for (const m of manual) {
        lines.push(`| \`${m.pattern}\` | \`${m.evidence.join(", ")}\` | ${m.reason} |`);
      }
      lines.push("");
    }

    lines.push("---");
    lines.push("");
  }

  // Scaffold Architecture
  if (input.scaffoldConfig) {
    const s = input.scaffoldConfig;
    const isExpoTarget = targetLabel.includes("Expo");
    lines.push("## 6. Target Scaffold & Infrastructure Architecture");
    lines.push("");
    lines.push("| Specification Area | Configured Policy |");
    lines.push("| :--- | :--- |");
    lines.push(`| **Styling Framework** | \`${s.styling ?? (isExpoTarget ? "standard-css" : "tailwind")}\` |`);
    lines.push(`| **TypeScript Compiler** | \`${s.strictTypeScript !== false ? "Strict Mode (strict: true)" : "Permissive Mode"}\` |`);
    lines.push(`| **CI/CD Workflow** | \`${s.includeCiWorkflow !== false ? "Included (.github/workflows/ci.yml)" : "Omitted"}\` |`);
    lines.push(`| **Container / Packaging** | \`${s.includeDockerfile !== false ? (isExpoTarget ? "EAS Build Profile (eas.json)" : "Multi-Stage Dockerfile") : "Omitted"}\` |`);
    lines.push(`| **Package Manager** | \`${s.packageManager ?? "npm"}\` |`);
    if (!isExpoTarget) {
      lines.push(`| **Rendering Paradigm** | \`${s.renderingMode ?? "server-components"}\` |`);
    }
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  // Security Trust Model & Disclosure
  lines.push("## 7. Trust Model & Safe Execution Guarantees");
  lines.push("");
  lines.push("CodeMorph AI executes all inspections and transformations under strict safety invariants:");
  lines.push("1. **Zero Host Execution:** No arbitrary repository code or untrusted lifecycle scripts are ever executed on the host machine.");
  lines.push("2. **Network Isolation:** Sandbox container workers run with `--network=none`, `--read-only`, non-root user, and dropped Linux capabilities.");
  lines.push("3. **Bounded Source Ingestion:** Source reading is strictly bounded to max 16 files and 96 KB to prevent memory exhaustion and DoS.");
  lines.push("4. **Immutability Contract:** Analysis and generation leave input repositories and archives completely unmodified.");
  lines.push("5. **Deterministic Audit:** AST syntax parsing and OSV CVE matching use pinned hashes and verified lockfiles without hallucinations.");
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("*Document synthesized by CodeMorph AI Executive Dossier Engine.*");

  return lines.join("\n");
}

/**
 * Downloads the generated dossier as a clean Markdown (.md) file in the browser.
 */
export function downloadDossierMarkdown(filename: string, content: string): void {
  if (typeof window === "undefined") return;
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".md") ? filename : `${filename}.md`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
