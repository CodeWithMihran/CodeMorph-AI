import type { FeasibilityReport } from "@/lib/analysis/feasibility";

export type RepositoryAnalysis = {
  repository: {
    fullName: string;
    url: string;
    description: string | null;
    defaultBranch: string;
    stars: number;
    language: string | null;
  };
  revision: { commitSha: string };
  profile: {
    framework: string;
    sourceType: "static" | "react-vite" | "unsupported";
    packageManager: string | null;
    supported: boolean;
    supportReason: string;
    fileCount: number;
    keyFiles: string[];
    routeCandidates: string[];
    inspectedAt: string;
    feasibility?: FeasibilityReport;
  };
};
