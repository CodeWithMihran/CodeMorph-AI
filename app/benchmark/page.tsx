import { Metadata } from "next";
import { BenchmarkStudioView } from "@/components/BenchmarkStudioView";

export const metadata: Metadata = {
  title: "Multi-Repository Comparative Benchmark Studio | CodeMorph AI",
  description:
    "Evaluate 2 to 4 codebases side-by-side. Benchmark feasibility scores, security posture, dependency friction, and automated migration sequence roadmap.",
};

export default function BenchmarkPage() {
  return (
    <main className="benchmark-main-wrapper">
      <BenchmarkStudioView />
    </main>
  );
}
