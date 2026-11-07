export type AuditSeverity = "critical" | "high" | "medium" | "low" | "info";
export type AuditCategory = "security" | "correctness" | "accessibility" | "maintainability";

export type AuditFinding = {
  id: string;
  ruleId: string;
  title: string;
  category: AuditCategory;
  severity: AuditSeverity;
  confidence: "high" | "medium";
  file: string;
  line?: number;
  evidence: string;
  explanation: string;
  recommendation: string;
  provenance: "deterministic-rule" | "typescript-parser" | "osv-advisory";
  column?: number;
  advisoryId?: string;
  advisoryUrl?: string;
  packageName?: string;
  packageVersion?: string;
  dependencyType?: "production" | "development" | "transitive";
};

export type AuditReport = {
  version: "deterministic-audit-v2";
  source: { kind: "github" | "zip"; label: string; revision: string };
  generatedAt: string;
  coverage: {
    repositoryFiles: number;
    eligibleTextFiles: number;
    scannedPaths: string[];
    scannedFiles: number;
    scannedBytes: number;
    omittedEligibleFiles: number;
    findingsTruncated: boolean;
    exclusions: string[];
    metadataPaths: string[];
    complete: boolean;
    note: string;
  };
  summary: Record<AuditSeverity, number>;
  findings: AuditFinding[];
  structure: {
    parsedFiles: number;
    syntaxErrors: number;
    internalImports: number;
    resolvedInternalImports: number;
    unresolvedInternalImports: number;
    packageImports: number;
    undeclaredPackageImports: number;
  };
  dependencyAudit: {
    status: "checked" | "partial" | "not-run" | "unavailable";
    database: "OSV" | null;
    checkedAt: string | null;
    queriedPackages: number;
    vulnerablePackages: number;
    omittedPackages: number;
    message: string;
  };
  checksNotRun: string[];
};
