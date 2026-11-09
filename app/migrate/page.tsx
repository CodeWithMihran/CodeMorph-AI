"use client";

import { useState } from "react";
import Link from "next/link";
import type { RepositoryAnalysis } from "@/lib/github/analysis";
import type { MigrationPlan, PlanItem } from "@/lib/migration/plan";
import type { FeasibilityReport } from "@/lib/analysis/feasibility";
import { FeasibilityView } from "@/components/FeasibilityView";
import { unpackStoredZip, type ZipEntry } from "@/lib/migration/zip";
import { CodeInspectorView } from "@/components/CodeInspectorView";
import { MigrationProgressStepper } from "@/components/MigrationProgressStepper";
import { saveHistoryRecord } from "@/lib/storage/history-store";
import { ExecutiveDossierModal } from "@/components/ExecutiveDossierModal";
import { ScaffoldConfigPanel } from "@/components/ScaffoldConfigPanel";
import { DEFAULT_SCAFFOLD_CONFIG, type ScaffoldConfig } from "@/lib/migration/scaffold";

type SourceMode = "github" | "zip";
type TargetStack = "Next.js App Router" | "Expo Router (React Native Mobile)";

interface GenerationResult {
  fileCount: number;
  sourceFileCount: number;
  readiness: string;
  validation: string;
  build: string;
  rootRoute: string;
  memoryRulesUsed: number;
  memoryRulesSaved: number;
  routeChecks: Array<{ path: string; status: string }>;
}

export default function MigratePage() {
  const [sourceMode, setSourceMode] = useState<SourceMode>("github");
  const [repoUrl, setRepoUrl] = useState("https://github.com/facebook/react");
  const [branch, setBranch] = useState("main");
  const [zipFile, setZipFile] = useState<File | null>(null);

  const [targetStack, setTargetStack] = useState<TargetStack>("Next.js App Router");
  const [goal, setGoal] = useState(
    "Migrate React application to Next.js App Router with strict TypeScript, preserved routes, and verified clean builds."
  );

  const [analysisState, setAnalysisState] = useState<{
    status: "idle" | "loading" | "success" | "error";
    analysis?: RepositoryAnalysis;
    message?: string;
  }>({ status: "idle" });

  const [planState, setPlanState] = useState<{
    status: "idle" | "loading" | "success" | "error";
    plan?: MigrationPlan;
    message?: string;
  }>({ status: "idle" });

  const [targetFeasibility, setTargetFeasibility] = useState<FeasibilityReport | null>(null);
  const [planReviewed, setPlanReviewed] = useState(false);
  const [consentGiven, setConsentGiven] = useState(false);

  const [generationState, setGenerationState] = useState<{
    status: "idle" | "loading" | "success" | "error";
    result?: GenerationResult;
    message?: string;
  }>({ status: "idle" });

  const [generatedEntries, setGeneratedEntries] = useState<ZipEntry[]>([]);
  const [downloadedBlob, setDownloadedBlob] = useState<Blob | null>(null);
  const [currentPipelineStage, setCurrentPipelineStage] = useState<number>(1);
  const [dossierModalOpen, setDossierModalOpen] = useState(false);
  const [scaffoldConfig, setScaffoldConfig] = useState<ScaffoldConfig>(DEFAULT_SCAFFOLD_CONFIG);

  const isAnalyzing = analysisState.status === "loading";
  const isPlanning = planState.status === "loading";
  const isGenerating = generationState.status === "loading";
  const isBusy = isAnalyzing || isPlanning || isGenerating;

  const handleTargetChange = (target: TargetStack) => {
    setTargetStack(target);
    if (target === "Expo Router (React Native Mobile)") {
      setGoal(
        "Convert React Web application to cross-platform Expo Router mobile app with React Native components and clean navigation."
      );
      setScaffoldConfig((prev) => ({
        ...prev,
        styling: "standard-css",
      }));
    } else {
      setGoal(
        "Migrate React application to Next.js App Router with strict TypeScript, preserved routes, and verified clean builds."
      );
      setScaffoldConfig((prev) => ({
        ...prev,
        styling: "tailwind",
      }));
    }
    // Invalidate stale plan if target changed
    if (planState.status === "success") {
      setPlanState({ status: "idle" });
      setTargetFeasibility(null);
      setPlanReviewed(false);
      setConsentGiven(false);
      setGeneratedEntries([]);
      setDownloadedBlob(null);
      setCurrentPipelineStage(1);
    }
  };

  async function handleAnalyze(e: React.FormEvent) {
    e.preventDefault();
    setAnalysisState({ status: "loading" });
    setPlanState({ status: "idle" });
    setTargetFeasibility(null);
    setPlanReviewed(false);
    setConsentGiven(false);
    setGenerationState({ status: "idle" });
    setGeneratedEntries([]);
    setDownloadedBlob(null);
    setCurrentPipelineStage(1);

    try {
      if (sourceMode === "github") {
        const response = await fetch("/api/repositories/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ repoUrl, branch }),
        });
        const data = (await response.json()) as { analysis?: RepositoryAnalysis; error?: string };
        if (!response.ok || !data.analysis) {
          setAnalysisState({
            status: "error",
            message: data.error ?? "Failed to analyze repository.",
          });
          return;
        }
        setAnalysisState({ status: "success", analysis: data.analysis });
      } else {
        if (!zipFile) {
          setAnalysisState({ status: "error", message: "Please select a ZIP archive." });
          return;
        }
        const form = new FormData();
        form.set("file", zipFile);
        const response = await fetch("/api/repositories/analyze-upload", {
          method: "POST",
          body: form,
        });
        const data = (await response.json()) as { analysis?: RepositoryAnalysis; error?: string };
        if (!response.ok || !data.analysis) {
          setAnalysisState({
            status: "error",
            message: data.error ?? "Failed to inspect ZIP archive.",
          });
          return;
        }
        setAnalysisState({ status: "success", analysis: data.analysis });
      }
    } catch {
      setAnalysisState({
        status: "error",
        message: "Network error. Please verify connection and retry.",
      });
    }
  }

  async function handleCreatePlan() {
    if (analysisState.status !== "success" || !analysisState.analysis) return;
    setPlanState({ status: "loading" });
    setGenerationState({ status: "idle" });

    try {
      let response: Response;
      if (sourceMode === "github") {
        response = await fetch("/api/migrations/plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            analysis: analysisState.analysis,
            goal,
            target: targetStack.includes("Expo") ? "expo" : "nextjs",
          }),
        });
      } else {
        if (!zipFile) {
          setPlanState({ status: "error", message: "Please re-select your ZIP file." });
          return;
        }
        const form = new FormData();
        form.set("file", zipFile);
        form.set("goal", goal);
        form.set("target", targetStack.includes("Expo") ? "expo" : "nextjs");
        response = await fetch("/api/migrations/plan-upload", { method: "POST", body: form });
      }

      const data = (await response.json()) as {
        plan?: MigrationPlan;
        feasibility?: FeasibilityReport;
        error?: string;
      };

      if (!response.ok || !data.plan) {
        setPlanState({
          status: "error",
          message: data.error ?? "Failed to generate migration plan.",
        });
        return;
      }

      if (data.feasibility) {
        setTargetFeasibility(data.feasibility);
      }
      setPlanState({ status: "success", plan: data.plan });
    } catch {
      setPlanState({
        status: "error",
        message: "Failed to generate plan due to network error.",
      });
    }
  }

  async function handleGenerate() {
    if (
      analysisState.status !== "success" ||
      planState.status !== "success" ||
      !planState.plan ||
      !planReviewed ||
      !consentGiven
    ) {
      return;
    }

    setCurrentPipelineStage(1);
    setGenerationState({ status: "loading" });

    // Active pipeline stage ticker while server generates
    const t1 = setTimeout(() => setCurrentPipelineStage(2), 450);
    const t2 = setTimeout(() => setCurrentPipelineStage(3), 950);
    const t3 = setTimeout(() => setCurrentPipelineStage(4), 1600);

    try {
      let response: Response;
      if (sourceMode === "github") {
        response = await fetch("/api/migrations/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            analysis: analysisState.analysis,
            plan: planState.plan,
            goal,
            confirmed: true,
            scaffoldConfig,
          }),
        });
      } else {
        if (!zipFile) {
          clearTimeout(t1);
          clearTimeout(t2);
          clearTimeout(t3);
          setGenerationState({ status: "error", message: "Please re-select your ZIP file." });
          return;
        }
        const form = new FormData();
        form.set("file", zipFile);
        form.set("plan", JSON.stringify(planState.plan));
        form.set("goal", goal);
        form.set("confirmed", "true");
        form.set("scaffoldConfig", JSON.stringify(scaffoldConfig));
        response = await fetch("/api/migrations/generate-upload", { method: "POST", body: form });
      }

      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);

      if (!response.ok) {
        const errData = (await response.json().catch(() => ({}))) as { error?: string };
        setGenerationState({
          status: "error",
          message: errData.error ?? "Migration code generation failed.",
        });
        return;
      }

      setCurrentPipelineStage(5); // Output guard & sandbox verification stage

      const fileCount =
        Number(response.headers.get("X-CodeMorph-File-Count") || response.headers.get("X-StackShift-File-Count")) || 0;
      const sourceFileCount =
        Number(response.headers.get("X-CodeMorph-Source-Files") || response.headers.get("X-StackShift-Source-Files")) || 0;
      const validation =
        (response.headers.get("X-CodeMorph-Validation") || response.headers.get("X-StackShift-Validation")) ?? "not-run";
      const readiness =
        (response.headers.get("X-CodeMorph-Readiness") || response.headers.get("X-StackShift-Readiness")) ?? "unverified";
      const memoryRulesUsed =
        Number(response.headers.get("X-CodeMorph-Memory-Rules-Used") || response.headers.get("X-StackShift-Memory-Rules-Used")) || 0;
      const memoryRulesSaved =
        Number(response.headers.get("X-CodeMorph-Memory-Rules-Saved") || response.headers.get("X-StackShift-Memory-Rules-Saved")) || 0;
      const build =
        (response.headers.get("X-CodeMorph-Build") || response.headers.get("X-StackShift-Build")) ?? "not-run";
      const rootRoute =
        (response.headers.get("X-CodeMorph-Root-Route") || response.headers.get("X-StackShift-Root-Route")) ?? "not-run";

      let routeChecks: Array<{ path: string; status: string }> = [];
      try {
        routeChecks = JSON.parse(
          (response.headers.get("X-CodeMorph-Route-Checks") || response.headers.get("X-StackShift-Route-Checks")) ?? "[]"
        ) as Array<{ path: string; status: string }>;
      } catch {
        // Fallback to empty if parse fails
      }

      // Download ZIP automatically & unpack for in-browser inspection
      const blob = await response.blob();
      setDownloadedBlob(blob);

      try {
        const buffer = await blob.arrayBuffer();
        const entries = unpackStoredZip(buffer);
        setGeneratedEntries(entries);
      } catch {
        // Fallback gracefully if unpack fails
        setGeneratedEntries([]);
      }

      setCurrentPipelineStage(6); // Final stage: packaging & inspection ready

      const objectUrl = URL.createObjectURL(blob);
      const downloadName = planState.plan.target.includes("Expo")
        ? "codemorph-migrated-expo-app.zip"
        : "codemorph-migrated-project.zip";

      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = downloadName;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);

      setGenerationState({
        status: "success",
        result: {
          fileCount,
          sourceFileCount,
          readiness,
          validation,
          build,
          rootRoute,
          memoryRulesUsed,
          memoryRulesSaved,
          routeChecks,
        },
      });

      saveHistoryRecord({
        type: "migration",
        repository: analysisState.analysis?.repository?.fullName || (zipFile ? zipFile.name : repoUrl),
        target: targetStack,
        fileCount,
        sourceFileCount,
        readiness,
        validation,
        memoryRulesUsed,
        routeChecksCount: routeChecks.length,
      });

      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("codemorph-memory-updated"));
      }
    } catch {
      setGenerationState({
        status: "error",
        message: "Generation interrupted. Please check connection and retry.",
      });
    }
  }

  const analysis = analysisState.analysis;
  const plan = planState.plan;
  const genResult = generationState.result;

  const handleDownloadAgain = () => {
    if (!downloadedBlob) return;
    const objectUrl = URL.createObjectURL(downloadedBlob);
    const downloadName = targetStack.includes("Expo")
      ? "codemorph-migrated-expo-app.zip"
      : "codemorph-migrated-project.zip";

    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = downloadName;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  };

  return (
    <main className="page-shell">
      <div className="page-intro">
        <span className="page-kicker">AUTONOMOUS TRANSFORMATION STUDIO</span>
        <h1 className="page-title">Cross-Stack Migration &amp; Code Generation</h1>
        <p className="page-lead">
          Execute verifiable, multi-stage framework migrations from React SPA to Next.js App Router or
          Expo Router Native Mobile with automated route mapping, AST import validation, and isolated Docker build checks.
        </p>
      </div>

      {/* STEP 1: Source & Target Configuration */}
      <section className="card-workspace">
        <div className="section-head">
          <div className="step-badge">STEP 1</div>
          <div className="step-info">
            <h2 className="section-title">Source Codebase &amp; Target Stack</h2>
            <p className="section-desc">Select your input source repository or archive and target destination.</p>
          </div>
        </div>

        <form onSubmit={handleAnalyze} className="migrate-config-grid">
          <div className="form-group-full">
            <label className="form-label">SOURCE INGESTION METHOD</label>
            <div className="mode-toggle-group">
              <button
                type="button"
                className={`mode-btn ${sourceMode === "github" ? "is-active" : ""}`}
                onClick={() => setSourceMode("github")}
              >
                GitHub Remote Repository
              </button>
              <button
                type="button"
                className={`mode-btn ${sourceMode === "zip" ? "is-active" : ""}`}
                onClick={() => setSourceMode("zip")}
              >
                Upload Local ZIP Archive
              </button>
            </div>
          </div>

          {sourceMode === "github" ? (
            <>
              <div className="form-group">
                <label htmlFor="repoUrl" className="form-label">GITHUB REPOSITORY URL</label>
                <input
                  id="repoUrl"
                  type="text"
                  className="text-input"
                  placeholder="https://github.com/owner/repository"
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  disabled={isBusy}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="branch" className="form-label">TARGET BRANCH</label>
                <input
                  id="branch"
                  type="text"
                  className="text-input"
                  placeholder="main"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  disabled={isBusy}
                  required
                />
              </div>
            </>
          ) : (
            <div className="form-group-full">
              <label htmlFor="zipInput" className="form-label">ZIP ARCHIVE FILE (.ZIP)</label>
              <input
                id="zipInput"
                type="file"
                accept=".zip"
                className="file-input"
                onChange={(e) => setZipFile(e.target.files?.[0] || null)}
                disabled={isBusy}
                required
              />
              {zipFile && (
                <div className="zip-file-pill">
                  <span>Archive: <strong>{zipFile.name}</strong></span>
                  <span>({(zipFile.size / 1024).toFixed(1)} KB)</span>
                </div>
              )}
            </div>
          )}

          <div className="form-group-full">
            <label className="form-label">TARGET DESTINATION FRAMEWORK</label>
            <div className="target-selector-grid">
              <div
                className={`target-card ${targetStack === "Next.js App Router" ? "is-selected" : ""}`}
                onClick={() => handleTargetChange("Next.js App Router")}
              >
                <div className="target-card-header">
                  <span className="target-radio">{targetStack === "Next.js App Router" ? "●" : "○"}</span>
                  <span className="target-name">Next.js App Router</span>
                  <span className="target-pill">Web Production</span>
                </div>
                <p className="target-desc">
                  React 19, TypeScript strict mode, Server Components (`app/`), Client Islands, Route Handlers, and zero layout shift.
                </p>
              </div>

              <div
                className={`target-card ${targetStack === "Expo Router (React Native Mobile)" ? "is-selected" : ""}`}
                onClick={() => handleTargetChange("Expo Router (React Native Mobile)")}
              >
                <div className="target-card-header">
                  <span className="target-radio">{targetStack === "Expo Router (React Native Mobile)" ? "●" : "○"}</span>
                  <span className="target-name">Expo Router (React Native)</span>
                  <span className="target-pill mobile">Mobile Cross-Platform</span>
                </div>
                <p className="target-desc">
                  Universal file-based routing (`app/(tabs)`), React Native native primitives (`View`, `Text`), and Expo SDK 52.
                </p>
              </div>
            </div>
          </div>

          <div className="form-group-full">
            <label htmlFor="goal" className="form-label">TRANSFORMATION SPECIFICATION &amp; GOAL</label>
            <textarea
              id="goal"
              className="textarea-input"
              rows={3}
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              disabled={isBusy}
            />
          </div>

          <div className="form-actions-full">
            <button type="submit" className="action-btn primary" disabled={isBusy}>
              {isAnalyzing ? "Inspecting Source Codebase..." : "Analyze Source for Migration"}
            </button>
            {analysisState.status === "error" && (
              <span className="inline-error">{analysisState.message}</span>
            )}
          </div>
        </form>
      </section>

      {/* STEP 2: Source Extraction & Route Contract */}
      {analysis && (
        <section className="card-workspace animate-fadein">
          <div className="section-head">
            <div className="step-badge">STEP 2</div>
            <div className="step-info">
              <h2 className="section-title">Source Extraction &amp; Route Discovery</h2>
              <p className="section-desc">Identified source routes, dependencies, and component topology.</p>
            </div>
          </div>

          <div className="source-profile-summary">
            <div className="profile-pill-item">
              <span className="profile-lbl">Source Name</span>
              <span className="profile-val">{analysis.repository.fullName}</span>
            </div>
            <div className="profile-pill-item">
              <span className="profile-lbl">Framework Detected</span>
              <span className="profile-val highlight">{analysis.profile.framework}</span>
            </div>
            <div className="profile-pill-item">
              <span className="profile-lbl">Files Scanned</span>
              <span className="profile-val">{analysis.profile.keyFiles.length} key files</span>
            </div>
            <div className="profile-pill-item">
              <span className="profile-lbl">Route Candidates</span>
              <span className="profile-val">{analysis.profile.routeCandidates.length} routes</span>
            </div>
          </div>

          {analysis.profile.routeCandidates.length > 0 && (
            <div className="detected-routes-box">
              <div className="box-title">DETECTED CLIENT ROUTES (SOURCE CONTRACT)</div>
              <div className="route-tags-list">
                {analysis.profile.routeCandidates.map((rt: string) => (
                  <span key={rt} className="route-tag">
                    <code>{rt}</code>
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="plan-trigger-row">
            <button
              type="button"
              className="action-btn secondary"
              onClick={handleCreatePlan}
              disabled={isBusy}
            >
              {isPlanning ? "Generating Target-Specific Migration Plan..." : `Generate Plan for ${targetStack}`}
            </button>
            {planState.status === "error" && (
              <span className="inline-error">{planState.message}</span>
            )}
          </div>
        </section>
      )}

      {/* STEP 3: Plan Review & Target Feasibility */}
      {plan && (
        <section className="card-workspace animate-fadein">
          <div className="section-head">
            <div className="step-badge">STEP 3</div>
            <div className="step-info">
              <h2 className="section-title">Migration Plan &amp; Portability Evaluation</h2>
              <p className="section-desc">
                Review target actions, source contract mappings, and server-verified portability before executing code generation.
              </p>
            </div>
          </div>

          {targetFeasibility && (
            <div className="feasibility-embed">
              <FeasibilityView feasibility={targetFeasibility} />
            </div>
          )}

          <div className="plan-sections-grid">
            <div className="plan-card preserve">
              <div className="plan-card-title">PRESERVE ({plan.preserve.length})</div>
              <ul className="plan-list">
                {plan.preserve.map((item: PlanItem, idx: number) => (
                  <li key={idx}>
                    <strong>✓ {item.title}</strong>
                    <p>{item.detail}</p>
                  </li>
                ))}
              </ul>
            </div>

            <div className="plan-card change">
              <div className="plan-card-title">TRANSFORM &amp; REPLACE ({plan.change.length})</div>
              <ul className="plan-list">
                {plan.change.map((item: PlanItem, idx: number) => (
                  <li key={idx}>
                    <strong>⇄ {item.title}</strong>
                    <p>{item.detail}</p>
                  </li>
                ))}
              </ul>
            </div>

            <div className="plan-card create">
              <div className="plan-card-title">CREATE SCAFFOLD ({plan.create.length})</div>
              <ul className="plan-list">
                {plan.create.map((item: PlanItem, idx: number) => (
                  <li key={idx}>
                    <strong>+ {item.title}</strong>
                    <p>{item.detail}</p>
                  </li>
                ))}
              </ul>
            </div>

            <div className="plan-card manual">
              <div className="plan-card-title">MANUAL ATTENTION ({plan.manual.length})</div>
              <ul className="plan-list">
                {plan.manual.map((item: PlanItem, idx: number) => (
                  <li key={idx}>
                    <strong>! {item.title}</strong>
                    <p>{item.detail}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {plan.routes && (plan.routes.required.length > 0 || plan.routes.manual.length > 0) && (
            <div className="plan-routes-table-wrap">
              <div className="box-title">SOURCE ROUTE CONTRACT PRESERVATION MAP</div>
              <table className="contract-table">
                <thead>
                  <tr>
                    <th>Classification</th>
                    <th>Source Route</th>
                    <th>Discovered Evidence</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.routes.required.map((sr, idx) => (
                    <tr key={`req-${idx}`}>
                      <td><span className="footer-pill" style={{ background: "#edf5ef", color: "#286d51" }}>REQUIRED ROUTE</span></td>
                      <td><code>{sr.path}</code></td>
                      <td><code>{sr.evidence.join(", ") || "Auto-detected"}</code></td>
                    </tr>
                  ))}
                  {plan.routes.manual.map((sr, idx) => (
                    <tr key={`man-${idx}`}>
                      <td><span className="footer-pill" style={{ background: "#fdf3e5", color: "#926829" }}>MANUAL ATTENTION</span></td>
                      <td><code>{sr.pattern}</code></td>
                      <td><code>{sr.reason}: {sr.evidence.join(", ") || "Dynamic contract"}</code></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* STEP 2.5: Interactive Scaffold Configuration */}
          <ScaffoldConfigPanel
            target={targetStack.includes("Expo") ? "expo" : "nextjs"}
            config={scaffoldConfig}
            onChange={setScaffoldConfig}
            disabled={isBusy}
          />

          <div className="consent-review-box">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={planReviewed}
                onChange={(e) => setPlanReviewed(e.target.checked)}
                disabled={isBusy}
              />
              <span>I have reviewed the plan actions, route mappings, and risk disclosures above.</span>
            </label>

            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={consentGiven}
                onChange={(e) => setConsentGiven(e.target.checked)}
                disabled={!planReviewed || isBusy}
              />
              <span>I authorize CodeMorph AI to synthesize transformed files and package a downloadable ZIP.</span>
            </label>
          </div>

          <div className="generate-trigger-row">
            <button
              type="button"
              className="action-btn primary"
              onClick={handleGenerate}
              disabled={!planReviewed || !consentGiven || isBusy}
            >
              {isGenerating ? "Executing Autonomous Migration & Validation..." : "Execute Migration & Download ZIP"}
            </button>
            {generationState.status === "error" && !isGenerating && (
              <span className="inline-error">{generationState.message}</span>
            )}
          </div>
        </section>
      )}

      {/* Live Pipeline Stepper during Generation or Failed Pipeline */}
      {(isGenerating || (generationState.status === "error" && currentPipelineStage > 1)) && (
        <MigrationProgressStepper
          currentStage={currentPipelineStage}
          isComplete={false}
          error={generationState.status === "error" ? generationState.message : null}
          targetStack={targetStack}
        />
      )}

      {/* STEP 4 & 5: Generation Telemetry & Results */}
      {genResult && (
        <section className="card-workspace animate-fadein">
          <MigrationProgressStepper
            currentStage={6}
            isComplete={true}
            targetStack={targetStack}
          />

          <div className="section-head" style={{ marginTop: 28 }}>
            <div className="step-badge success">DONE</div>
            <div className="step-info">
              <h2 className="section-title">Migration Telemetry &amp; Artifact Verification</h2>
              <p className="section-desc">
                Your migrated project archive has been synthesized and downloaded. Telemetry details below:
              </p>
            </div>
          </div>

          <div className="telemetry-grid">
            <div className="telemetry-card">
              <span className="telemetry-lbl">Output Files Synthesized</span>
              <span className="telemetry-val">{genResult.fileCount} files</span>
            </div>
            <div className="telemetry-card">
              <span className="telemetry-lbl">Source Files Transformed</span>
              <span className="telemetry-val">{genResult.sourceFileCount} files</span>
            </div>
            <div className="telemetry-card">
              <span className="telemetry-lbl">Readiness Classification</span>
              <span className={`telemetry-val ${genResult.readiness === "ready" ? "text-accent" : "text-amber"}`}>
                {genResult.readiness.toUpperCase()}
              </span>
            </div>
            <div className="telemetry-card">
              <span className="telemetry-lbl">AST Output Validation</span>
              <span className={`telemetry-val ${genResult.validation === "passed" ? "text-accent" : "text-amber"}`}>
                {genResult.validation.toUpperCase()}
              </span>
            </div>
            <div className="telemetry-card">
              <span className="telemetry-lbl">Docker Sandbox Build</span>
              <span className="telemetry-val">{genResult.build.toUpperCase()}</span>
            </div>
            <div className="telemetry-card">
              <span className="telemetry-lbl">Root Route Rendering</span>
              <span className="telemetry-val">{genResult.rootRoute.toUpperCase()}</span>
            </div>
            <div className="telemetry-card">
              <span className="telemetry-lbl">Memory Rules Applied</span>
              <span className="telemetry-val">{genResult.memoryRulesUsed} active rules</span>
            </div>
            <div className="telemetry-card">
              <span className="telemetry-lbl">Memory Rules Learned</span>
              <span className="telemetry-val">{genResult.memoryRulesSaved} candidates recorded</span>
            </div>
          </div>

          {genResult.routeChecks.length > 0 && (
            <div className="route-checks-summary">
              <div className="box-title">ISOLATED ROUTE VERIFICATION CHECKS</div>
              <div className="checks-chips-list">
                {genResult.routeChecks.map((rc, idx) => (
                  <span key={idx} className={`check-chip ${rc.status}`}>
                    <code>{rc.path}</code>: {rc.status.toUpperCase()}
                  </span>
                ))}
              </div>
            </div>
          )}

          {generatedEntries.length > 0 && (
            <CodeInspectorView
              entries={generatedEntries}
              targetName={targetStack}
              onDownloadZip={handleDownloadAgain}
              onUpdateEntries={(updated) => setGeneratedEntries(updated)}
            />
          )}

          <div className="post-migration-actions">
            <button
              type="button"
              className="action-btn primary"
              onClick={() => setDossierModalOpen(true)}
            >
              <span>📄</span> Export Executive Engineering Dossier ➔
            </button>
            <Link href="/audit" className="action-btn secondary">
              Run Code Audit on Another Codebase
            </Link>
            <Link href="/memory" className="action-btn secondary">
              Inspect Self-Learning Procedural Rules
            </Link>
          </div>

          <ExecutiveDossierModal
            isOpen={dossierModalOpen}
            onClose={() => setDossierModalOpen(false)}
            input={{
              repository: analysis ? analysis.repository.fullName : (zipFile ? zipFile.name : repoUrl),
              branch,
              revision: analysis ? analysis.revision.commitSha : "HEAD",
              framework: analysis ? analysis.profile.framework : "React",
              target: targetStack,
              feasibilityReport: targetFeasibility || (analysis ? analysis.profile.feasibility : null),
              migrationPlan: plan,
              scaffoldConfig,
              migrationResult: genResult,
            }}
          />
        </section>
      )}
    </main>
  );
}
