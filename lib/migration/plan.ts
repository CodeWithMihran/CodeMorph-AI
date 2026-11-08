export type MigrationTarget = "nextjs" | "expo";
export type TargetLabel = "Next.js App Router + TypeScript" | "Expo Router (React Native) + TypeScript";

export type PlanItem = {
  title: string;
  detail: string;
  evidence: string[];
};

export type MigrationPlan = {
  planner: "rules-based-v1";
  source: { repository: string; framework: string; commitSha: string };
  target: TargetLabel;
  requestedOutcome: string;
  routes: import("./source-routes").SourceRouteInventory;
  preserve: PlanItem[];
  change: PlanItem[];
  create: PlanItem[];
  manual: PlanItem[];
  unknowns: string[];
};

export type PlanInput = {
  sourceType: "static" | "react-vite";
  repository: string;
  framework: string;
  commitSha: string;
  goal: string;
  keyFiles: string[];
  routeCandidates: string[];
  routes?: import("./source-routes").SourceRouteInventory;
  target?: MigrationTarget;
};

export function createMigrationPlan(input: PlanInput): MigrationPlan {
  const isReactVite = input.sourceType === "react-vite";
  const isExpo = input.target === "expo";
  const targetLabel: TargetLabel = isExpo ? "Expo Router (React Native) + TypeScript" : "Next.js App Router + TypeScript";
  const sourceFiles = [...new Set([...input.keyFiles, ...input.routeCandidates])].slice(0, 20);
  const pageEvidence = input.routeCandidates.length ? input.routeCandidates.slice(0, 8) : sourceFiles.slice(0, 8);
  const routes = input.routes ?? { required: [{ path: "/", evidence: pageEvidence.slice(0, 1) }], manual: [] };

  return {
    planner: "rules-based-v1",
    source: { repository: input.repository, framework: input.framework, commitSha: input.commitSha },
    target: targetLabel,
    requestedOutcome: input.goal,
    routes,
    preserve: [
      {
        title: "Existing site content and recognizable structure",
        detail: "Use the listed entry and route files as the starting evidence. This plan does not semantically inspect the source code or confirm runtime behavior.",
        evidence: sourceFiles.slice(0, 10),
      },
      {
        title: isExpo ? "Brand assets and text content adapted for mobile" : "Existing brand assets and styling where practical",
        detail: isExpo
          ? "Inspect and adapt referenced images, labels, and text hierarchy for mobile screen dimensions."
          : "Inspect and carry over referenced images, fonts, and styles after the source files are read during generation.",
        evidence: sourceFiles.filter((path) => /\.(css|scss|sass|svg|png|jpe?g|webp|woff2?)$/i.test(path)).slice(0, 8),
      },
    ],
    change: isExpo
      ? [
          {
            title: isReactVite ? "Translate React web components to React Native primitives" : "Convert static HTML into React Native mobile screens",
            detail: "Replace DOM elements (div, p, button, a) with React Native primitives (View, Text, Pressable) and configure file-based screens in Expo Router.",
            evidence: pageEvidence,
          },
          {
            title: "Adapt styling for mobile runtimes",
            detail: "Convert CSS declarations into React Native StyleSheet flexbox styles and safe-area aware layouts.",
            evidence: sourceFiles.filter((path) => /\.(css|scss|sass|svg|png|jpe?g|webp|woff2?)$/i.test(path)).slice(0, 8),
          },
        ]
      : [
          {
            title: isReactVite ? "Move page rendering to the Next.js App Router" : "Move static pages into the Next.js App Router",
            detail: isReactVite
              ? "Replace the Vite entry and client-side route setup with Next.js route files while preserving page intent."
              : "Convert the detected static HTML entry and page candidates into Next.js route components.",
            evidence: pageEvidence,
          },
          {
            title: "Adapt styling and asset references",
            detail: "Map existing styles and public assets into the target project and update paths that change during migration.",
            evidence: sourceFiles.filter((path) => /\.(css|scss|sass|svg|png|jpe?g|webp|woff2?)$/i.test(path)).slice(0, 8),
          },
        ],
    create: isExpo
      ? [
          {
            title: "Expo mobile app shell",
            detail: "Create the Expo Router root stack layout, app configuration, and TypeScript setup.",
            evidence: ["app/_layout.tsx", "app.json", "tsconfig.json", "package.json"],
          },
          { title: "Requested mobile experience", detail: `Implement a first mobile-first pass toward: ${input.goal}`, evidence: pageEvidence },
        ]
      : [
          {
            title: "Next.js app shell",
            detail: "Create the App Router layout, TypeScript configuration, and shared global styles.",
            evidence: ["app/layout.tsx", "app/globals.css", "tsconfig.json"],
          },
          { title: "Requested experience", detail: `Implement a first pass toward: ${input.goal}`, evidence: pageEvidence },
        ],
    manual: [
      {
        title: "Confirm behavior and integrations",
        detail: isExpo
          ? "Review touch gestures, navigation transitions, mobile device APIs, and authentication. Connect native permissions and external services yourself."
          : "Review forms, navigation, API calls, authentication, and other interactions after source contents are inspected. Connect external services and credentials yourself.",
        evidence: [],
      },
      {
        title: "Review the migrated result",
        detail: isExpo
          ? "Mobile layout, touch targets, and responsiveness need a running Expo Go or simulator preview to verify."
          : "Visual parity, accessibility, and functional behavior cannot be confirmed from this file-tree profile. They need a running preview and explicit checks.",
        evidence: [],
      },
    ],
    unknowns: isExpo
      ? [
          "This plan uses repository metadata and file paths; source code has not been semantically analyzed for mobile compatibility.",
          "Web browser APIs (window, document, localStorage) must be replaced with mobile equivalents or polyfills.",
          "Dependencies, environment variables, native device capabilities, and runtime behavior have not been reviewed.",
        ]
      : [
          "This plan uses repository metadata and file paths; source code has not been semantically analyzed for behavior.",
          "Dependencies, environment variables, backend services, and runtime behavior have not been reviewed.",
        ],
  };
}
