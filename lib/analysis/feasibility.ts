import type { MigrationTarget } from "@/lib/migration/plan";
import {
  analyzeDependencyCompatibility,
  type DependencyAnalysisResult,
} from "@/lib/analysis/dependency-shims";

export type FeasibilityDimension = {
  score: number;
  weight: number;
  label: string;
  detail: string;
};

export type FeasibilityReport = {
  score: number;
  tier: "high" | "moderate" | "low" | "incompatible";
  summary: string;
  target?: MigrationTarget;
  dimensions: {
    routes: FeasibilityDimension;
    components: FeasibilityDimension;
    dependencies: FeasibilityDimension;
    structure: FeasibilityDimension;
  };
  breakdown: {
    automatic: string[];
    manual: string[];
    risks: string[];
  };
  dependencyAnalysis?: DependencyAnalysisResult;
};

export type FeasibilityInput = {
  sourceType: "static" | "react-vite" | "unsupported";
  framework: string;
  supportReason: string;
  filePaths: string[];
  keyFiles: string[];
  routeCandidates: string[];
  manifest?: Record<string, unknown> | null;
  files?: Array<{ path: string; content: string }>;
  target?: MigrationTarget;
};

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

export function evaluateFeasibility(input: FeasibilityInput): FeasibilityReport {
  const isExpo = input.target === "expo";
  const automatic: string[] = [];
  const manual: string[] = [];
  const risks: string[] = [];

  // Incompatible source early exit
  if (input.sourceType === "unsupported") {
    return {
      score: 0,
      tier: "incompatible",
      summary: `Automated migration not recommended: ${input.supportReason}`,
      target: input.target ?? "nextjs",
      dimensions: {
        routes: { score: 0, weight: 0.25, label: "Route Portability", detail: "Unsupported source architecture." },
        components: { score: 0, weight: 0.30, label: "Component Portability", detail: "Components do not match supported web patterns." },
        dependencies: { score: 0, weight: 0.25, label: "Dependency Compatibility", detail: "Contains unsupported or backend runtime packages." },
        structure: { score: 0, weight: 0.20, label: "Structural Integrity", detail: "Missing supported entry configuration." },
      },
      breakdown: {
        automatic: [],
        manual: ["Restructure application into a client-rendered React or static web architecture first."],
        risks: [input.supportReason],
      },
    };
  }

  // 1. Route Portability (Weight: 25%)
  let routeScore = 95;
  let routeDetail = "Clean static routes detected.";
  if (input.routeCandidates.length === 0) {
    if (input.keyFiles.includes("index.html")) {
      routeScore = 90;
      routeDetail = "Single-page application root entry mapped.";
      automatic.push("Single-page root route (/ / app/index.tsx) mapped automatically.");
    } else {
      routeScore = 70;
      routeDetail = "No standard entry or page routes detected; relying on heuristic entry points.";
      manual.push("Review route definitions and entry page mapping.");
    }
  } else {
    const hasDynamic = input.routeCandidates.some((r) => /\[.*\]|:\w+|\*/.test(r));
    if (hasDynamic) {
      routeScore = 80;
      routeDetail = `${input.routeCandidates.length} routes detected, including dynamic or parameter segments.`;
      automatic.push(`${input.routeCandidates.length} static route candidates detected for automatic migration.`);
      manual.push("Verify dynamic route parameter types and navigation handlers.");
    } else {
      routeScore = 100;
      routeDetail = `${input.routeCandidates.length} distinct static routes detected for automatic route mapping.`;
      automatic.push(`All ${input.routeCandidates.length} static route candidate(s) map cleanly to file-based routing.`);
    }
  }

  // 2. Component Portability (Weight: 30%)
  let componentScore = input.sourceType === "static" ? 95 : 90;
  let componentDetail = "Standard functional components and layout elements.";
  automatic.push(
    isExpo
      ? "Web DOM elements (div, p, button, a) will be mapped to React Native primitives (View, Text, Pressable)."
      : "Standard React JSX components map cleanly to Next.js App Router."
  );

  if (input.files && input.files.length > 0) {
    let browserGlobals = 0;
    let rawDomInteractions = 0;
    let canvasOrWebGl = 0;

    for (const file of input.files) {
      if (/\b(?:window\.|document\.|localStorage\.|sessionStorage\.|navigator\.)/i.test(file.content)) {
        browserGlobals += 1;
      }
      if (/\b(?:getElementById|querySelector|addEventListener|innerHTML)\b/i.test(file.content)) {
        rawDomInteractions += 1;
      }
      if (/<canvas\b|<iframe\b|<video\b/i.test(file.content)) {
        canvasOrWebGl += 1;
      }
    }

    if (browserGlobals > 0) {
      if (isExpo) {
        componentScore -= 20;
        risks.push(`Detected browser globals (window/document/localStorage) in ${browserGlobals} file(s) that require mobile shims or AsyncStorage.`);
      } else {
        componentScore -= 8;
        manual.push(`Browser globals in ${browserGlobals} file(s) will need "use client" directives or SSR guards.`);
      }
    }

    if (rawDomInteractions > 0) {
      componentScore -= 12;
      manual.push(`Direct DOM manipulation detected in ${rawDomInteractions} file(s); refactor into React state/refs.`);
    }

    if (canvasOrWebGl > 0) {
      componentScore -= 15;
      risks.push(`Web-only canvas/iframe elements found in ${canvasOrWebGl} file(s) that cannot be directly translated to mobile.`);
    }

    componentDetail = `${input.files.length} source file(s) scanned; component abstraction health is ${componentScore >= 80 ? "clean" : "moderate"}.`;
  }

  // 3. Dependency Compatibility (Weight: 25%)
  const rawDeps = (input.manifest?.dependencies as Record<string, string> | undefined) ?? {};
  const depAnalysis = analyzeDependencyCompatibility(rawDeps, input.files, input.target ?? "nextjs");
  let depScore = depAnalysis.compatibilityScore;
  let depDetail = "Standard frontend dependency footprint.";

  if (Object.keys(rawDeps).length === 0) {
    depScore = 100;
    depDetail = "Zero runtime dependencies; clean static migration.";
    automatic.push("Pure markup and styles with zero third-party dependency conflicts.");
  } else {
    for (const d of depAnalysis.dependencies) {
      if (d.status === "incompatible") {
        risks.push(`Incompatible package ${d.name}: ${d.reason}`);
      } else if (d.status === "refactor-required") {
        manual.push(`Package ${d.name} requires refactoring: ${d.replacement} (${d.reason})`);
      } else if (d.status === "shim-available") {
        automatic.push(`Package ${d.name} can be adapted with ${d.replacement}.`);
      }
    }
    depDetail = `${depAnalysis.dependencies.length} declared dependencies evaluated for ${isExpo ? "Expo" : "Next.js"} compatibility.`;
  }

  // 4. Structural Integrity (Weight: 20%)
  let structScore = 90;
  let structDetail = "Well-formed entry points and directory layout.";
  const hasKeyEntry = input.keyFiles.some((f) => /index\.html$|main\.(?:t|j)sx?$|App\.(?:t|j)sx?$/i.test(f));
  if (hasKeyEntry) {
    structScore += 10;
    automatic.push("Authoritative application entry points located.");
  } else {
    structScore -= 20;
    manual.push("Non-standard entry structure; review root layout assembly.");
  }

  if (input.filePaths.length > 500) {
    structScore -= 15;
    manual.push(`Large repository (${input.filePaths.length} files); generation prioritizes essential routes and key components.`);
    structDetail = `Large codebase (${input.filePaths.length} files); essential routes prioritized.`;
  } else {
    structDetail = `Compact, well-bounded codebase (${input.filePaths.length} files).`;
  }

  // Final Calculations
  const routesFinal = clamp(routeScore);
  const compFinal = clamp(componentScore);
  const depFinal = clamp(depScore);
  const structFinal = clamp(structScore);

  const weighted = clamp(
    routesFinal * 0.25 +
    compFinal * 0.30 +
    depFinal * 0.25 +
    structFinal * 0.20
  );

  let tier: FeasibilityReport["tier"] = "high";
  let summary = `High feasibility (${weighted}%): Application structure and dependencies conform cleanly to ${isExpo ? "Expo mobile" : "Next.js"} migration patterns.`;
  if (weighted < 45) {
    tier = "low";
    summary = `Low feasibility (${weighted}%): Substantial manual refactoring or component shimming required before migration.`;
  } else if (weighted < 75) {
    tier = "moderate";
    summary = `Moderate feasibility (${weighted}%): Automated migration can generate primary pages, with manual follow-up required for browser-specific features.`;
  }

  return {
    score: weighted,
    tier,
    summary,
    target: input.target ?? "nextjs",
    dimensions: {
      routes: { score: routesFinal, weight: 0.25, label: "Route Portability", detail: routeDetail },
      components: { score: compFinal, weight: 0.30, label: "Component Portability", detail: componentDetail },
      dependencies: { score: depFinal, weight: 0.25, label: "Dependency Compatibility", detail: depDetail },
      structure: { score: structFinal, weight: 0.20, label: "Structural Integrity", detail: structDetail },
    },
    breakdown: {
      automatic: automatic.slice(0, 5),
      manual: manual.slice(0, 5),
      risks: risks.slice(0, 5),
    },
    dependencyAnalysis: depAnalysis,
  };
}
