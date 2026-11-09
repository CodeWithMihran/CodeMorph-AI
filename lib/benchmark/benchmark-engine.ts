import type { FeasibilityReport } from "@/lib/analysis/feasibility";
import type { AuditReport } from "@/lib/audit/types";
import { evaluateFeasibility } from "@/lib/analysis/feasibility";
import { auditSourceFiles } from "@/lib/audit/engine";
import { createSourceManifest, isAuditableSourcePath, isDependencyMetadataPath } from "@/lib/source/manifest";
import { classifySource } from "@/lib/github/classify-source";

export interface BenchmarkProject {
  id: string;
  name: string;
  framework: string;
  sourceType: string;
  fileCount: number;
  totalBytes: number;
  feasibilityScore: number;
  feasibilityTier: "high" | "moderate" | "low" | "incompatible";
  dimensions: {
    routes: number;
    components: number;
    dependencies: number;
    structure: number;
  };
  findingsSummary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
  syntaxErrors: number;
  undeclaredPackages: number;
  estimatedManualHours: number;
  estimatedAutonomousMinutes: number;
  costSavingsDollars: number;
  routeCount: number;
  keyRisks: string[];
  dropInPackages: number;
  refactorPackages: number;
}

export interface MigrationSequenceItem {
  priority: "P1" | "P2" | "P3" | "P4";
  projectId: string;
  projectName: string;
  feasibilityScore: number;
  rationale: string;
}

export interface BenchmarkComparisonResult {
  timestamp: string;
  projectCount: number;
  projects: BenchmarkProject[];
  rankings: {
    highestPortability: string;
    lowestRisk: string;
    fastestMigration: string;
    recommendedSequence: MigrationSequenceItem[];
  };
  portfolioTotals: {
    totalFiles: number;
    totalManualHoursSaved: number;
    totalEstimatedSavingsDollars: number;
    averageFeasibility: number;
    totalSecurityFindings: number;
  };
}

export interface RawProjectInput {
  id: string;
  name: string;
  files: Array<{ path: string; content: string }>;
  target?: "nextjs" | "expo";
}

/**
 * Calculates deterministic manual engineering refactoring hours and ROI.
 */
export function calculateEngineeringEffort(params: {
  fileCount: number;
  feasibilityScore: number;
  findingsCount: { critical: number; high: number; medium: number };
  syntaxErrors: number;
  routeCount: number;
  refactorPackages: number;
}): { manualHours: number; autonomousMinutes: number; savingsDollars: number } {
  const baseHours = Math.max(4, params.fileCount * 0.75);

  let difficultyMultiplier = 1.0;
  if (params.feasibilityScore < 50) difficultyMultiplier = 2.8;
  else if (params.feasibilityScore < 70) difficultyMultiplier = 1.8;
  else if (params.feasibilityScore < 85) difficultyMultiplier = 1.3;

  const securityHours =
    params.findingsCount.critical * 3.5 +
    params.findingsCount.high * 2.0 +
    params.findingsCount.medium * 0.75;

  const syntaxHours = params.syntaxErrors * 1.5;
  const packageHours = params.refactorPackages * 3.0;
  const routeHours = params.routeCount * 1.2;

  const totalManualHours = Math.round(
    baseHours * difficultyMultiplier + securityHours + syntaxHours + packageHours + routeHours
  );

  const autonomousMinutes = Math.max(3, Math.round(params.fileCount * 0.4 + params.routeCount * 0.8));
  const hourlyRateDollars = 85;
  const savingsDollars = totalManualHours * hourlyRateDollars;

  return {
    manualHours: totalManualHours,
    autonomousMinutes,
    savingsDollars,
  };
}

/**
 * Analyzes and transforms a raw project into a normalized benchmark project record.
 */
export function analyzeBenchmarkProject(input: RawProjectInput): BenchmarkProject {
  const filePaths = input.files.map((f) => f.path);
  const totalBytes = input.files.reduce(
    (acc, f) => acc + Buffer.byteLength(f.content, "utf8"),
    0
  );

  const manifestFile = input.files.find((f) => f.path === "package.json");
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

  const auditableFiles = input.files.filter((f) => isAuditableSourcePath(f.path));
  const metadataFiles = input.files.filter((f) => isDependencyMetadataPath(f.path));

  const sourceManifest = createSourceManifest({
    origin: {
      kind: "zip",
      label: input.name,
      revision: "benchmark-snapshot",
    },
    files: auditableFiles,
    metadataFiles,
    metadataFilePaths: metadataFiles.map((m) => m.path),
    repositoryFileCount: input.files.length,
    eligibleTextFileCount: auditableFiles.length,
    omittedEligibleFiles: 0,
  });

  // Run deterministic static audit
  const auditReport: AuditReport = auditSourceFiles({ manifest: sourceManifest });

  // Run feasibility evaluation
  const keyFiles = ["package.json", "index.html", "src/main.tsx", "src/App.tsx"].filter((p) =>
    filePaths.includes(p)
  );
  const routeCandidates = filePaths.filter((p) =>
    /(?:pages|routes|screens)\/|\bApp\.tsx|\bmain\.tsx/i.test(p)
  );

  const feasibility: FeasibilityReport = evaluateFeasibility({
    sourceType: profile.sourceType,
    framework: profile.framework,
    supportReason: profile.supportReason,
    filePaths,
    keyFiles,
    routeCandidates,
    manifest: packageJson,
    files: input.files,
    target: input.target ?? "nextjs",
  });

  const dropInPackages =
    feasibility.dependencyAnalysis?.summary?.dropIn ?? 0;
  const refactorPackages =
    feasibility.dependencyAnalysis?.summary?.refactorRequired ?? 0;

  const effort = calculateEngineeringEffort({
    fileCount: input.files.length,
    feasibilityScore: feasibility.score,
    findingsCount: {
      critical: auditReport.summary.critical,
      high: auditReport.summary.high,
      medium: auditReport.summary.medium,
    },
    syntaxErrors: auditReport.structure.syntaxErrors,
    routeCount: routeCandidates.length,
    refactorPackages,
  });

  return {
    id: input.id,
    name: input.name,
    framework: profile.framework,
    sourceType: profile.sourceType,
    fileCount: input.files.length,
    totalBytes,
    feasibilityScore: feasibility.score,
    feasibilityTier: feasibility.tier,
    dimensions: {
      routes: feasibility.dimensions.routes.score,
      components: feasibility.dimensions.components.score,
      dependencies: feasibility.dimensions.dependencies.score,
      structure: feasibility.dimensions.structure.score,
    },
    findingsSummary: { ...auditReport.summary },
    syntaxErrors: auditReport.structure.syntaxErrors,
    undeclaredPackages: auditReport.structure.undeclaredPackageImports,
    estimatedManualHours: effort.manualHours,
    estimatedAutonomousMinutes: effort.autonomousMinutes,
    costSavingsDollars: effort.savingsDollars,
    routeCount: routeCandidates.length,
    keyRisks: feasibility.breakdown.risks.slice(0, 4),
    dropInPackages,
    refactorPackages,
  };
}

/**
 * Compares 2 to 4 projects side-by-side, calculating comparative rankings and roadmap sequence.
 */
export function compareBenchmarkProjects(
  rawProjects: RawProjectInput[]
): BenchmarkComparisonResult {
  if (rawProjects.length < 2) {
    throw new Error("Comparative benchmark requires at least 2 projects.");
  }
  if (rawProjects.length > 4) {
    throw new Error("Comparative benchmark is capped at 4 projects for bounded memory.");
  }

  const projects = rawProjects.map((p) => analyzeBenchmarkProject(p));

  // 1. Determine rankings
  const highestPortability = [...projects].sort(
    (a, b) => b.feasibilityScore - a.feasibilityScore
  )[0].id;

  const lowestRisk = [...projects].sort((a, b) => {
    const riskA = a.findingsSummary.critical * 3 + a.findingsSummary.high * 2 + a.syntaxErrors;
    const riskB = b.findingsSummary.critical * 3 + b.findingsSummary.high * 2 + b.syntaxErrors;
    return riskA - riskB;
  })[0].id;

  const fastestMigration = [...projects].sort(
    (a, b) => a.estimatedManualHours - b.estimatedManualHours
  )[0].id;

  // 2. Recommend Sequence (P1 -> P2 -> P3 -> P4)
  // High feasibility + low risk = P1 (Quick Win)
  const sortedForSequence = [...projects].sort((a, b) => {
    const scoreA =
      a.feasibilityScore * 1.5 -
      (a.findingsSummary.critical * 20 + a.findingsSummary.high * 10 + a.syntaxErrors * 5);
    const scoreB =
      b.feasibilityScore * 1.5 -
      (b.findingsSummary.critical * 20 + b.findingsSummary.high * 10 + b.syntaxErrors * 5);
    return scoreB - scoreA;
  });

  const priorities: Array<"P1" | "P2" | "P3" | "P4"> = ["P1", "P2", "P3", "P4"];
  const recommendedSequence: MigrationSequenceItem[] = sortedForSequence.map((proj, idx) => {
    const p = priorities[idx] || "P4";
    let rationale = "";
    if (idx === 0) {
      rationale = "Quick-Win Foundation: Highest portability score with lowest architectural friction. Migrate first to validate patterns.";
    } else if (idx === 1) {
      rationale = "Core Modernization: Balanced complexity and solid component abstraction. Ideal candidate for secondary phase.";
    } else if (idx === 2) {
      rationale = "Elevated Refactoring: Requires attention to package shimming and component restructuring before deployment.";
    } else {
      rationale = "High-Friction Dependency: Significant manual refactoring required. Recommend migrating after core design tokens stabilize.";
    }
    return {
      priority: p,
      projectId: proj.id,
      projectName: proj.name,
      feasibilityScore: proj.feasibilityScore,
      rationale,
    };
  });

  // 3. Aggregate totals
  const totalFiles = projects.reduce((acc, p) => acc + p.fileCount, 0);
  const totalManualHoursSaved = projects.reduce((acc, p) => acc + p.estimatedManualHours, 0);
  const totalEstimatedSavingsDollars = projects.reduce((acc, p) => acc + p.costSavingsDollars, 0);
  const averageFeasibility = Math.round(
    projects.reduce((acc, p) => acc + p.feasibilityScore, 0) / projects.length
  );
  const totalSecurityFindings = projects.reduce(
    (acc, p) => acc + p.findingsSummary.critical + p.findingsSummary.high + p.findingsSummary.medium,
    0
  );

  return {
    timestamp: new Date().toISOString(),
    projectCount: projects.length,
    projects,
    rankings: {
      highestPortability,
      lowestRisk,
      fastestMigration,
      recommendedSequence,
    },
    portfolioTotals: {
      totalFiles,
      totalManualHoursSaved,
      totalEstimatedSavingsDollars,
      averageFeasibility,
      totalSecurityFindings,
    },
  };
}

/**
 * Generates an executive publication-ready Markdown dossier comparing all benchmarked projects.
 */
export function generateComparativeDossier(benchmark: BenchmarkComparisonResult): string {
  const lines: string[] = [];
  lines.push("# CODEMORPH AI — COMPARATIVE PORTFOLIO BENCHMARK DOSSIER");
  lines.push("### Multi-Codebase Modernization Feasibility, Security & Migration Sequence Report");
  lines.push("");
  lines.push(`*Generated on: \`${benchmark.timestamp}\` by CodeMorph AI Executive Intelligence Engine*`);
  lines.push("");
  lines.push("---");
  lines.push("");

  // 1. Executive Summary Table
  lines.push("## 1. Executive Portfolio Overview");
  lines.push("");
  lines.push(`- **Projects Benchmarked**: ${benchmark.projectCount} codebases`);
  lines.push(`- **Total Scanned Files**: ${benchmark.portfolioTotals.totalFiles} files`);
  lines.push(`- **Portfolio Average Feasibility**: **${benchmark.portfolioTotals.averageFeasibility}%**`);
  lines.push(`- **Estimated Manual Engineering Effort**: **${benchmark.portfolioTotals.totalManualHoursSaved} hours**`);
  lines.push(`- **Projected Autonomous Migration Savings**: **\$${benchmark.portfolioTotals.totalEstimatedSavingsDollars.toLocaleString()} USD**`);
  lines.push(`- **Identified Security & AST Warnings**: ${benchmark.portfolioTotals.totalSecurityFindings} findings across portfolio`);
  lines.push("");

  // 2. Side-by-Side Comparison Table
  lines.push("## 2. Side-by-Side Comparative Matrix");
  lines.push("");
  const headers = ["Metric", ...benchmark.projects.map((p) => p.name)];
  lines.push(`| ${headers.join(" | ")} |`);
  lines.push(`| ${headers.map(() => ":---").join(" | ")} |`);

  lines.push(`| **Source Framework** | ${benchmark.projects.map((p) => p.framework).join(" | ")} |`);
  lines.push(`| **Portability Score** | ${benchmark.projects.map((p) => `**${p.feasibilityScore}%** (${p.feasibilityTier.toUpperCase()})`).join(" | ")} |`);
  lines.push(`| **Route Portability** | ${benchmark.projects.map((p) => `${p.dimensions.routes}%`).join(" | ")} |`);
  lines.push(`| **Component Portability** | ${benchmark.projects.map((p) => `${p.dimensions.components}%`).join(" | ")} |`);
  lines.push(`| **Dependency Health** | ${benchmark.projects.map((p) => `${p.dimensions.dependencies}%`).join(" | ")} |`);
  lines.push(`| **Structure Integrity** | ${benchmark.projects.map((p) => `${p.dimensions.structure}%`).join(" | ")} |`);
  lines.push(`| **Total Files** | ${benchmark.projects.map((p) => `${p.fileCount}`).join(" | ")} |`);
  lines.push(`| **Critical/High CVEs** | ${benchmark.projects.map((p) => `${p.findingsSummary.critical} critical, ${p.findingsSummary.high} high`).join(" | ")} |`);
  lines.push(`| **Syntax Errors** | ${benchmark.projects.map((p) => `${p.syntaxErrors}`).join(" | ")} |`);
  lines.push(`| **Undeclared Imports** | ${benchmark.projects.map((p) => `${p.undeclaredPackages}`).join(" | ")} |`);
  lines.push(`| **Manual Effort (Est.)** | ${benchmark.projects.map((p) => `~${p.estimatedManualHours} hours`).join(" | ")} |`);
  lines.push(`| **Autonomous Time (Est.)** | ${benchmark.projects.map((p) => `~${p.estimatedAutonomousMinutes} minutes`).join(" | ")} |`);
  lines.push(`| **Cost Savings (ROI)** | ${benchmark.projects.map((p) => `\$${p.costSavingsDollars.toLocaleString()}`).join(" | ")} |`);
  lines.push("");

  // 3. Recommended Migration Sequence
  lines.push("## 3. Recommended Migration Sequence & Execution Roadmap");
  lines.push("");
  lines.push("To maximize engineering velocity and minimize cross-project friction, the autonomous intelligence engine recommends following this prioritized sequence:");
  lines.push("");

  for (const item of benchmark.rankings.recommendedSequence) {
    lines.push(`### [${item.priority}] ${item.projectName} (Portability: ${item.feasibilityScore}%)`);
    lines.push(`- **Sequence Rationale**: ${item.rationale}`);
    const proj = benchmark.projects.find((p) => p.id === item.projectId);
    if (proj && proj.keyRisks.length > 0) {
      lines.push(`- **Pre-flight Watchlist**:`);
      for (const risk of proj.keyRisks) {
        lines.push(`  - ⚠ ${risk}`);
      }
    }
    lines.push("");
  }

  // 4. Governance & Methodology Note
  lines.push("## 4. Governance & Verification Methodology");
  lines.push("");
  lines.push("- **AST Determinism**: Feasibility and structural scores are derived through deterministic AST parsing without runtime code execution.");
  lines.push("- **Safe Isolation**: Repository boundaries are strictly segregated during comparative analysis.");
  lines.push("- **Production Next.js Standards**: Evaluated targets conform to Next.js 15 App Router and Expo Router conventions with TypeScript strictness.");
  lines.push("");

  return lines.join("\n");
}
