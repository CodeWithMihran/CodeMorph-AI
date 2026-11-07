import type { SourceManifest } from "@/lib/source/manifest";
import { isAuditableSourcePath } from "@/lib/source/manifest";
import type { AuditFinding, AuditReport, AuditSeverity } from "./types";
import { redactAuditEvidence } from "./sanitize";
import { auditStructure } from "./structure";

type Rule = {
  id: string;
  title: string;
  category: AuditFinding["category"];
  severity: AuditSeverity;
  confidence: AuditFinding["confidence"];
  pattern: RegExp;
  explanation: string;
  recommendation: string;
};

const RULES: Rule[] = [
  {
    id: "SEC001", title: "Credential-like value in source", category: "security", severity: "high", confidence: "medium",
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|AKIA[A-Z0-9]{16}|(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}|AIza[A-Za-z0-9_-]{30,}|xox[baprs]-[A-Za-z0-9-]{20,})\b|(?:api[_-]?key|client[_-]?secret|access[_-]?token|auth[_-]?token|password|secret)\s*[:=]\s*["'][^"']{8,}["']/i,
    explanation: "A credential-shaped token or secret assignment appears in a scanned source file. Pattern matching can produce false positives and does not establish whether the value is active.",
    recommendation: "If this is a real credential, revoke and rotate it, remove it from repository history, and load the replacement from a secret manager or environment variable.",
  },
  {
    id: "SEC002", title: "Dynamic code evaluation", category: "security", severity: "high", confidence: "high",
    pattern: /\beval\s*\(|\bnew\s+Function\s*\(/,
    explanation: "The source constructs or evaluates code dynamically, which can turn untrusted input into executable code.",
    recommendation: "Remove dynamic evaluation where possible. If unavoidable, ensure the evaluated content is fully trusted and cannot be influenced by user input.",
  },
  {
    id: "SEC003", title: "Raw HTML injection sink", category: "security", severity: "medium", confidence: "medium",
    pattern: /dangerouslySetInnerHTML\s*=|\.innerHTML\s*=/,
    explanation: "The code writes HTML directly into the DOM. This can create cross-site scripting risk when the value contains untrusted content.",
    recommendation: "Prefer rendering text or React elements. If HTML is required, sanitize it with a maintained sanitizer and keep trusted and untrusted values separate.",
  },
  {
    id: "MAINT001", title: "Debug logging in application source", category: "maintainability", severity: "low", confidence: "high",
    pattern: /\bconsole\.(?:log|debug)\s*\(/,
    explanation: "Debug output is present in the scanned source. Logs can expose implementation details or create noisy production output.",
    recommendation: "Remove temporary logging or route intentional diagnostics through a logging policy that avoids sensitive data.",
  },
  {
    id: "ACC001", title: "Image may be missing alternative text", category: "accessibility", severity: "medium", confidence: "medium",
    pattern: /<img\b(?![^>]*\balt\s*=)[^>]*>/i,
    explanation: "An image element appears without an explicit alt attribute in this source line. Decorative images should use empty alt text; informative images need a meaningful alternative.",
    recommendation: "Add an appropriate alt attribute, using alt=\"\" for decorative images.",
  },
  {
    id: "MAINT002", title: "Unresolved work marker", category: "maintainability", severity: "info", confidence: "high",
    pattern: /\b(?:TODO|FIXME|HACK)\b/i,
    explanation: "A TODO, FIXME, or HACK marker indicates work that may be incomplete. Its context and current relevance require developer review.",
    recommendation: "Confirm whether the note is still relevant; complete it, track it as an issue, or remove the stale marker.",
  },
];

const MAX_FINDINGS = 500;

function markdownInline(value: string) {
  return value.replace(/[\r\n]/g, " ").replace(/`/g, "\\`");
}

export function auditSourceFiles(input: {
  manifest: SourceManifest;
}): AuditReport {
  const findings: AuditFinding[] = [];
  let scannedBytes = 0;
  const files = input.manifest.files.filter((file) => isAuditableSourcePath(file.path));

  for (const file of files) {
    scannedBytes += Buffer.byteLength(file.content, "utf8");
    const lines = file.content.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      for (const rule of RULES) {
        if (!rule.pattern.test(line)) continue;
        findings.push({
          id: `${rule.id}:${file.path}:${index + 1}`,
          ruleId: rule.id,
          title: rule.title,
          category: rule.category,
          severity: rule.severity,
          confidence: rule.confidence,
          file: file.path,
          line: index + 1,
          evidence: redactAuditEvidence(line),
          explanation: rule.explanation,
          recommendation: rule.recommendation,
          provenance: "deterministic-rule",
        });
        if (findings.length >= MAX_FINDINGS) break;
      }
      if (findings.length >= MAX_FINDINGS) break;
    }
    if (findings.length >= MAX_FINDINGS) break;
  }

  const structural = auditStructure(input.manifest);
  findings.push(...structural.findings);
  if (findings.length > MAX_FINDINGS) findings.length = MAX_FINDINGS;

  const summary: Record<AuditSeverity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const finding of findings) summary[finding.severity] += 1;
  const complete = input.manifest.omittedEligibleFiles === 0 && files.length === input.manifest.eligibleTextFileCount;
  const findingsTruncated = findings.length >= MAX_FINDINGS;

  return {
    version: "deterministic-audit-v2",
    source: input.manifest.origin,
    generatedAt: new Date().toISOString(),
    coverage: {
      repositoryFiles: input.manifest.repositoryFileCount,
      eligibleTextFiles: input.manifest.eligibleTextFileCount,
      scannedPaths: files.map((file) => file.path),
      scannedFiles: files.length,
      scannedBytes,
      omittedEligibleFiles: input.manifest.omittedEligibleFiles,
      findingsTruncated,
      exclusions: input.manifest.exclusions,
      metadataPaths: input.manifest.metadataFilePaths,
      complete,
      note: `${complete
        ? "All eligible text files supplied by the bounded source reader were scanned."
        : `This is a partial audit: ${input.manifest.omittedEligibleFiles} eligible text files were omitted by source-reading limits. Findings cover only the files listed as scanned.`} ${findingsTruncated ? `The result was capped at ${MAX_FINDINGS} findings.` : ""} This rule set does not prove that the source is free of defects.`,
    },
    summary,
    findings,
    structure: structural.metrics,
    dependencyAudit: {
      status: "not-run",
      database: null,
      checkedAt: null,
      queriedPackages: 0,
      vulnerablePackages: 0,
      omittedPackages: 0,
      message: "No dependency advisory lookup was requested.",
    },
    checksNotRun: [
      "Type checking and project build (syntax parsing is not type checking; repository code is not executed).",
      "Configured project linter and unit tests.",
      "Dependency vulnerability database checks.",
      "Full secret scanning and secret-history checks.",
      "Runtime behavior, performance profiling, and complete accessibility analysis.",
    ],
  };
}

export function renderAuditMarkdown(report: AuditReport) {
  const counts = Object.entries(report.summary).map(([severity, count]) => `- ${severity}: ${count}`).join("\n");
  const findings = report.findings.length
    ? report.findings.map((finding) => [
        `### ${finding.severity.toUpperCase()} · ${markdownInline(finding.title)}`,
        `- Rule: \`${finding.ruleId}\` · Category: ${finding.category} · Confidence: ${finding.confidence}`,
        `- Location: \`${markdownInline(finding.file)}${finding.line ? `:${finding.line}${finding.column ? `:${finding.column}` : ""}` : ""}\``,
        ...(finding.packageName ? [`- Package: \`${markdownInline(finding.packageName)}@${markdownInline(finding.packageVersion ?? "")}\` · Dependency: ${finding.dependencyType ?? "unknown"} · Advisory: [${finding.advisoryId}](${finding.advisoryUrl})`] : []),
        `- Evidence: \`${markdownInline(finding.evidence)}\``,
        `- Finding: ${finding.explanation}`,
        `- Recommendation: ${finding.recommendation}`,
      ].join("\n")).join("\n\n")
    : "No findings matched the enabled deterministic rules in the scanned files.";
  const scannedPaths = report.coverage.scannedPaths.map((path) => `- \`${markdownInline(path)}\``).join("\n") || "- No source files were scanned.";
  const exclusions = report.coverage.exclusions.map((item) => `- ${markdownInline(item)}`).join("\n") || "- No exclusion summary was provided.";
  const metadataPaths = report.coverage.metadataPaths.map((path) => `- \`${markdownInline(path)}\``).join("\n") || "- No dependency metadata files were included.";
  const structure = `- Parsed JS/TS files: ${report.structure.parsedFiles}\n- Syntax errors: ${report.structure.syntaxErrors}\n- Internal imports: ${report.structure.resolvedInternalImports} resolved / ${report.structure.unresolvedInternalImports} unresolved\n- Package imports: ${report.structure.packageImports}\n- Undeclared package imports: ${report.structure.undeclaredPackageImports}`;
  const dependency = `- Status: ${report.dependencyAudit.status}\n- Database: ${report.dependencyAudit.database ?? "none"}\n- Exact package versions queried: ${report.dependencyAudit.queriedPackages}\n- Vulnerable package/version pairs: ${report.dependencyAudit.vulnerablePackages}\n- Omitted packages: ${report.dependencyAudit.omittedPackages}\n- Result: ${report.dependencyAudit.message}`;
  return `# Code audit report\n\n- Source: ${report.source.label}\n- Source type: ${report.source.kind}\n- Revision: \`${report.source.revision}\`\n- Generated: ${report.generatedAt}\n- Audit engine: ${report.version}\n\n## Coverage\n\n- Repository/archive files: ${report.coverage.repositoryFiles}\n- Eligible text files: ${report.coverage.eligibleTextFiles}\n- Scanned files: ${report.coverage.scannedFiles}\n- Scanned source bytes: ${report.coverage.scannedBytes}\n- Omitted eligible files: ${report.coverage.omittedEligibleFiles}\n- Complete within source-reader limits: ${report.coverage.complete ? "yes" : "no"}\n\n${report.coverage.note}\n\n### Scanned paths\n\n${scannedPaths}\n\n### Dependency metadata paths\n\n${metadataPaths}\n\n### Exclusions\n\n${exclusions}\n\n## Structural analysis\n\n${structure}\n\n## Dependency advisory check\n\n${dependency}\n\n## Finding counts\n\n${counts}\n\n## Findings\n\n${findings}\n\n## Checks not run\n\n${report.checksNotRun.map((item) => `- ${item}`).join("\n")}\n\nThis report lists static parser results and known advisory matches. It is not a guarantee that all vulnerabilities or defects have been found.\n`;
}
