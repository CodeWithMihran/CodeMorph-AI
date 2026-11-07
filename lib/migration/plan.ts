export type PlanItem = {
  title: string;
  detail: string;
  evidence: string[];
};

export type MigrationPlan = {
  planner: "rules-based-v1";
  source: { repository: string; framework: string; commitSha: string };
  target: "Next.js App Router + TypeScript";
  requestedOutcome: string;
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
};

export function createMigrationPlan(input: PlanInput): MigrationPlan {
  const isReactVite = input.sourceType === "react-vite";
  const sourceFiles = [...new Set([...input.keyFiles, ...input.routeCandidates])].slice(0, 20);
  const pageEvidence = input.routeCandidates.length ? input.routeCandidates.slice(0, 8) : sourceFiles.slice(0, 8);

  return {
    planner: "rules-based-v1",
    source: { repository: input.repository, framework: input.framework, commitSha: input.commitSha },
    target: "Next.js App Router + TypeScript",
    requestedOutcome: input.goal,
    preserve: [
      {
        title: "Existing site content and recognizable structure",
        detail: "Use the listed entry and route files as the starting evidence. This plan does not semantically inspect the source code or confirm runtime behavior.",
        evidence: sourceFiles.slice(0, 10),
      },
      {
        title: "Existing brand assets and styling where practical",
        detail: "Inspect and carry over referenced images, fonts, and styles after the source files are read during generation.",
        evidence: sourceFiles.filter((path) => /\.(css|scss|sass|svg|png|jpe?g|webp|woff2?)$/i.test(path)).slice(0, 8),
      },
    ],
    change: [
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
    create: [
      { title: "Next.js app shell", detail: "Create the App Router layout, TypeScript configuration, and shared global styles.", evidence: ["app/layout.tsx", "app/globals.css", "tsconfig.json"] },
      { title: "Requested experience", detail: `Implement a first pass toward: ${input.goal}`, evidence: pageEvidence },
    ],
    manual: [
      { title: "Confirm behavior and integrations", detail: "Review forms, navigation, API calls, authentication, and other interactions after source contents are inspected. Connect external services and credentials yourself.", evidence: [] },
      { title: "Review the migrated result", detail: "Visual parity, accessibility, and functional behavior cannot be confirmed from this file-tree profile. They need a running preview and explicit checks.", evidence: [] },
    ],
    unknowns: [
      "This plan uses repository metadata and file paths; source code has not been semantically analyzed for behavior.",
      "Dependencies, environment variables, backend services, and runtime behavior have not been reviewed.",
    ],
  };
}
