"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import type { RepositoryAnalysis } from "@/lib/github/analysis";
import type { MigrationPlan, PlanItem } from "@/lib/migration/plan";

type AnalysisState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; analysis: RepositoryAnalysis };

type PlanState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; plan: MigrationPlan };

type GenerationState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; fileCount: number; sourceFileCount: number; validation: string; build: string; rootRoute: string };

function formatCount(count: number) {
  return new Intl.NumberFormat("en", { notation: "compact" }).format(count);
}

export default function Home() {
  const [repositoryUrl, setRepositoryUrl] = useState("");
  const [goal, setGoal] = useState("");
  const [analysisState, setAnalysisState] = useState<AnalysisState>({ status: "idle" });
  const [planState, setPlanState] = useState<PlanState>({ status: "idle" });
  const [planReviewed, setPlanReviewed] = useState(false);
  const [generationState, setGenerationState] = useState<GenerationState>({ status: "idle" });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAnalysisState({ status: "loading" });
    setPlanState({ status: "idle" });
    setPlanReviewed(false);
    setGenerationState({ status: "idle" });

    try {
      const response = await fetch("/api/repositories/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repositoryUrl }),
      });
      let data: { analysis?: RepositoryAnalysis; error?: string };
      try {
        data = (await response.json()) as {
          analysis?: RepositoryAnalysis;
          error?: string;
        };
      } catch {
        setAnalysisState({
          status: "error",
          message: "StackShift returned an unexpected response. Please try again.",
        });
        return;
      }

      if (!response.ok || !data.analysis) {
        setAnalysisState({
          status: "error",
          message: data.error ?? "We could not check that repository. Please try again.",
        });
        return;
      }

      setAnalysisState({ status: "success", analysis: data.analysis });
    } catch {
      setAnalysisState({
        status: "error",
        message: "The request did not reach StackShift. Check your connection and try again.",
      });
    }
  }

  async function handleCreatePlan() {
    if (analysisState.status !== "success") return;
    setPlanState({ status: "loading" });
    setPlanReviewed(false);
    setGenerationState({ status: "idle" });
    try {
      const response = await fetch("/api/migrations/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysis: analysisState.analysis, goal }),
      });
      const data = await response.json() as { plan?: MigrationPlan; error?: string };
      if (!response.ok || !data.plan) {
        setPlanState({ status: "error", message: data.error ?? "We could not create the plan. Please try again." });
        return;
      }
      setPlanState({ status: "success", plan: data.plan });
    } catch {
      setPlanState({ status: "error", message: "The request did not reach StackShift. Check your connection and try again." });
    }
  }

  async function handleGenerate(consented: boolean) {
    if (analysisState.status !== "success" || planState.status !== "success" || !planReviewed || !consented) return;
    setGenerationState({ status: "loading" });
    try {
      const response = await fetch("/api/migrations/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysis: analysisState.analysis, plan: planState.plan, goal, confirmed: true }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { error?: string };
        setGenerationState({ status: "error", message: data.error ?? "Project generation failed. Please try again." });
        return;
      }
      const fileCount = Number(response.headers.get("X-StackShift-File-Count")) || 0;
      const sourceFileCount = Number(response.headers.get("X-StackShift-Source-Files")) || 0;
      const validation = response.headers.get("X-StackShift-Validation") ?? "not-run";
      const build = response.headers.get("X-StackShift-Build") ?? "not-run";
      const rootRoute = response.headers.get("X-StackShift-Root-Route") ?? "not-run";
      const objectUrl = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = "stackshift-migrated-project.zip";
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
      setGenerationState({ status: "success", fileCount, sourceFileCount, validation, build, rootRoute });
    } catch {
      setGenerationState({ status: "error", message: "The request did not reach StackShift. Check your connection and try again." });
    }
  }

  const isLoading = analysisState.status === "loading";
  const isPlanning = planState.status === "loading";
  const isGenerating = generationState.status === "loading";
  const isBusy = isLoading || isPlanning || isGenerating;
  const activeStep = analysisState.status === "success" ? 3 : 2;

  return (
    <main className="app-shell">
      <header className="topbar">
        <Link className="brand" href="/" aria-label="StackShift home">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 32 32" fill="none">
              <path d="M7 10h17l-4-4M25 22H8l4 4" />
              <path d="M24 10l-4 4M8 22l4-4" />
            </svg>
          </span>
          <span>stackshift<span className="brand-period">.</span></span>
        </Link>
        <div className="topbar-right">
          <span className="topbar-label">REPOSITORY MIGRATION</span>
          <span className="topbar-divider" aria-hidden="true" />
          <a className="github-link" href="https://github.com" target="_blank" rel="noreferrer">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 .9a11.1 11.1 0 0 0-3.51 21.63c.56.1.76-.24.76-.54v-2.08c-3.1.67-3.76-1.32-3.76-1.32-.5-1.28-1.23-1.62-1.23-1.62-1.01-.69.08-.68.08-.68 1.12.08 1.71 1.15 1.71 1.15 1 1.7 2.61 1.2 3.25.92.1-.72.39-1.21.71-1.49-2.47-.28-5.07-1.23-5.07-5.48 0-1.21.43-2.2 1.15-2.97-.12-.28-.5-1.41.11-2.94 0 0 .94-.3 3.05 1.14a10.6 10.6 0 0 1 5.55 0c2.11-1.43 3.05-1.14 3.05-1.14.61 1.53.23 2.66.11 2.94.72.77 1.15 1.76 1.15 2.97 0 4.26-2.6 5.2-5.08 5.48.4.35.76 1.02.76 2.06v3.06c0 .3.2.65.77.54A11.1 11.1 0 0 0 12 .9Z" />
            </svg>
            GitHub
          </a>
        </div>
      </header>

      <section className="hero-section" aria-labelledby="hero-title">
        <div className="hero-copy">
          <div className="eyebrow"><span className="eyebrow-line" /> YOUR CODE, READY FOR WHAT&apos;S NEXT</div>
          <h1 id="hero-title">A better stack<br />starts with <span>your repo.</span></h1>
          <p className="hero-description">
            Bring a website repository. StackShift will map what&apos;s there, plan the move, and help you build what comes next.
          </p>
          <div className="hero-assurance">
            <span className="assurance-icon" aria-hidden="true">↗</span>
            <span>Read-only repository access <i /> Your source stays untouched</span>
          </div>
        </div>

        <div className="migration-card">
          <div className="card-heading">
            <div>
              <p className="card-kicker">START A MIGRATION</p>
              <h2>Connect a repository</h2>
            </div>
            <span className="step-count">0{activeStep} <span>/ 04</span></span>
          </div>

          <div className="step-track" aria-label="Migration steps">
            <div className="step completed"><span>✓</span><b>Connect</b></div>
            <div className={`step${analysisState.status === "success" ? " completed" : " active"}`}><span>{analysisState.status === "success" ? "✓" : "02"}</span><b>Inspect</b></div>
            <div className={`step${analysisState.status === "success" ? planReviewed ? " completed" : " active" : ""}`}><span>{planReviewed ? "✓" : "03"}</span><b>Plan</b></div>
            <div className="step"><span>04</span><b>Transform</b></div>
          </div>

          <form className="repo-form" onSubmit={handleSubmit}>
            <label htmlFor="repository-url">PUBLIC GITHUB REPOSITORY</label>
            <div className={`input-wrap${analysisState.status === "error" ? " input-error" : ""}`}>
              <input
                id="repository-url"
                name="repositoryUrl"
                type="url"
                inputMode="url"
                autoComplete="url"
                placeholder="https://github.com/owner/repository"
                value={repositoryUrl}
                disabled={isBusy}
                onChange={(event) => {
                  setRepositoryUrl(event.target.value);
                  setAnalysisState({ status: "idle" });
                  setPlanState({ status: "idle" });
                  setPlanReviewed(false);
                  setGenerationState({ status: "idle" });
                }}
                maxLength={2_048}
                required
                aria-describedby="repo-help repo-error"
                aria-invalid={analysisState.status === "error"}
              />
              <svg className="input-github" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 .9a11.1 11.1 0 0 0-3.51 21.63c.56.1.76-.24.76-.54v-2.08c-3.1.67-3.76-1.32-3.76-1.32-.5-1.28-1.23-1.62-1.23-1.62-1.01-.69.08-.68.08-.68 1.12.08 1.71 1.15 1.71 1.15 1 1.7 2.61 1.2 3.25.92.1-.72.39-1.21.71-1.49-2.47-.28-5.07-1.23-5.07-5.48 0-1.21.43-2.2 1.15-2.97-.12-.28-.5-1.41.11-2.94 0 0 .94-.3 3.05 1.14a10.6 10.6 0 0 1 5.55 0c2.11-1.43 3.05-1.14 3.05-1.14.61 1.53.23 2.66.11 2.94.72.77 1.15 1.76 1.15 2.97 0 4.26-2.6 5.2-5.08 5.48.4.35.76 1.02.76 2.06v3.06c0 .3.2.65.77.54A11.1 11.1 0 0 0 12 .9Z" />
              </svg>
            </div>
            <p className="field-help" id="repo-help">Paste the repository URL. Public repositories only for now.</p>
            <label className="goal-label" htmlFor="migration-goal">WHAT SHOULD THE NEW APPLICATION DO?</label>
            <textarea
              id="migration-goal"
              name="migrationGoal"
              rows={3}
              minLength={8}
              maxLength={500}
              placeholder="Example: Turn this portfolio into a responsive Next.js site with a project gallery and contact section."
              value={goal}
              disabled={isBusy}
              onChange={(event) => {
                setGoal(event.target.value);
                setPlanState({ status: "idle" });
                setPlanReviewed(false);
                setGenerationState({ status: "idle" });
              }}
              required
              aria-describedby="goal-help"
            />
            <p className="field-help" id="goal-help">8–500 characters. This guides the plan; it does not generate code yet.</p>
            <p className="error-message" id="repo-error" role="alert">
              {analysisState.status === "error" ? analysisState.message : ""}
            </p>
            <button className="submit-button" type="submit" disabled={isBusy || !repositoryUrl.trim()}>
              {isLoading ? (
                <><span className="spinner" aria-hidden="true" /> Inspecting repository…</>
              ) : (
                <>Inspect repository <span aria-hidden="true">→</span></>
              )}
            </button>
          </form>

          <div className="card-footnote">
            <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M10 2.5 3.75 5v4.38c0 3.87 2.67 7.49 6.25 8.37 3.58-.88 6.25-4.5 6.25-8.37V5L10 2.5Z" /><path d="m7.5 10 1.67 1.67L12.92 8" /></svg>
            <span>Read-only inspection. StackShift never runs repository scripts.</span>
          </div>

          {analysisState.status === "success" && (() => {
            const { analysis } = analysisState;
            return <section className="repo-result" aria-live="polite" aria-labelledby="result-title">
              <div className="result-topline">
                <span className={`result-status${analysis.profile.supported ? " is-supported" : " is-unsupported"}`}><span /> {analysis.profile.supported ? "SUPPORTED SOURCE DETECTED" : "SOURCE NEEDS A DIFFERENT PATH"}</span>
                <a href={analysis.repository.url} target="_blank" rel="noreferrer" className="result-open">View on GitHub ↗</a>
              </div>
              <h3 id="result-title">{analysis.repository.fullName}</h3>
              <p className="result-description">
                {analysis.repository.description || "No repository description has been added."}
              </p>
              <div className="repo-stats">
                <span><i className="language-dot" />{analysis.profile.framework}</span>
                <span><b>▦</b> {formatCount(analysis.profile.fileCount)} files</span>
                <span className="branch-stat">Manager <code>{analysis.profile.packageManager ?? "none"}</code></span>
              </div>
              <div className={`result-note${analysis.profile.supported ? "" : " is-unsupported"}`}>
                <span className="result-note-icon" aria-hidden="true">{analysis.profile.supported ? "✓" : "!"}</span>
                <span>{analysis.profile.supportReason}</span>
              </div>
              <div className="inspection-block">
                <div className="inspection-heading"><span>INSPECTION PROFILE</span><span>Branch <code>{analysis.repository.defaultBranch}</code></span></div>
                <p className="revision-line">Pinned commit <code title={analysis.revision.commitSha}>{analysis.revision.commitSha.slice(0, 12)}</code></p>
                <div className="inspection-columns">
                  <div><h4>Key files</h4>{analysis.profile.keyFiles.length ? <ul>{analysis.profile.keyFiles.map((file) => <li key={file}><code>{file}</code></li>)}</ul> : <p>No common entry files were found.</p>}</div>
                  <div><h4>Route candidates</h4>{analysis.profile.routeCandidates.length ? <ul>{analysis.profile.routeCandidates.slice(0, 8).map((path) => <li key={path}><code>{path}</code></li>)}</ul> : <p>No route files detected from filenames.</p>}</div>
                </div>
                <p className="inspection-disclaimer">This is a source profile based on the file tree and package manifest. It has not generated or validated an application.</p>
                {analysis.profile.supported && (
                  <>
                    <div className="plan-actions">
                      <button className="submit-button plan-button" type="button" onClick={handleCreatePlan} disabled={isPlanning || isLoading || goal.trim().length < 8}>
                        {isPlanning ? <><span className="spinner" aria-hidden="true" /> Preparing evidence-based plan…</> : <>Create migration plan <span aria-hidden="true">→</span></>}
                      </button>
                      <p className="planner-caption">Rules-based draft using this profile and your goal. No AI-generated code is produced in this phase.</p>
                    </div>
                    {planState.status === "error" && <p className="plan-error" role="alert">{planState.message}</p>}
                    {planState.status === "success" && <MigrationPlanReview plan={planState.plan} reviewed={planReviewed} onReviewedChange={setPlanReviewed} generation={generationState} onGenerate={handleGenerate} />}
                  </>
                )}
              </div>
            </section>;
          })()}
        </div>
      </section>

      <footer className="page-footer">
        <span>STACKSHIFT <i>·</i> REPOSITORY MIGRATION, MADE CLEAR.</span>
        <span>PUBLIC REPOSITORIES <i>·</i> READ ONLY</span>
      </footer>
    </main>
  );
}

function MigrationPlanReview({
  plan,
  reviewed,
  onReviewedChange,
  generation,
  onGenerate,
}: {
  plan: MigrationPlan;
  reviewed: boolean;
  onReviewedChange: (reviewed: boolean) => void;
  generation: GenerationState;
  onGenerate: (consented: boolean) => void;
}) {
  const [consented, setConsented] = useState(false);
  const sections: { key: string; title: string; items: PlanItem[] }[] = [
    { key: "preserve", title: "Preserve", items: plan.preserve },
    { key: "change", title: "Change", items: plan.change },
    { key: "create", title: "Create", items: plan.create },
    { key: "manual", title: "Needs review or setup", items: plan.manual },
  ];

  return (
    <section className="migration-plan" aria-live="polite" aria-labelledby="plan-title">
      <div className="plan-title-row">
        <div><p className="card-kicker">DRAFT · {plan.planner}</p><h3 id="plan-title">Migration plan</h3></div>
        <span className="target-badge">NEXT.JS + TYPESCRIPT</span>
      </div>
      <p className="plan-outcome">{plan.requestedOutcome}</p>
      <p className="plan-source">Based on <strong>{plan.source.repository}</strong> at <code title={plan.source.commitSha}>{plan.source.commitSha.slice(0, 12)}</code> · detected {plan.source.framework}</p>

      <div className="plan-sections">
        {sections.map((section) => (
          <div className="plan-section" key={section.key}>
            <h4>{section.title}</h4>
            <ul>
              {section.items.map((item) => (
                <li key={item.title}>
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                  {item.evidence.length > 0 && <div className="evidence-list"><span>Evidence</span>{item.evidence.map((path) => <code key={path}>{path}</code>)}</div>}
                  {item.evidence.length === 0 && <span className="no-evidence">No file-level evidence yet</span>}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="plan-unknowns">
        <strong>Known unknowns</strong>
        <ul>{plan.unknowns.map((unknown) => <li key={unknown}>{unknown}</li>)}</ul>
      </div>

      <label className="plan-review-check">
        <input type="checkbox" checked={reviewed} onChange={(event) => onReviewedChange(event.target.checked)} />
        <span>I reviewed this plan and understand the listed limitations.</span>
      </label>
      <p className={`plan-next-step${reviewed ? " is-reviewed" : ""}`} role="status">
        {reviewed ? "Plan reviewed. Generation needs an OpenAI API key; Docker-based checks can be enabled separately." : "Review the proposed work and limitations before generation."}
      </p>
      <div className="generation-consent">
        <strong>Before code generation</strong>
        <p>StackShift will send up to 16 small source files to OpenAI for generation. Credential-like strings are redacted and secret/config files are excluded. Your OpenAI API usage may incur charges.</p>
        <label className="plan-review-check">
          <input type="checkbox" checked={consented} onChange={(event) => setConsented(event.target.checked)} />
          <span>I agree to send the selected source files to OpenAI for this generation.</span>
        </label>
        <button className="submit-button generate-button" type="button" onClick={() => onGenerate(consented)} disabled={!reviewed || !consented || generation.status === "loading"}>
          {generation.status === "loading" ? <><span className="spinner" aria-hidden="true" /> Generating project…</> : <>Generate and download project <span aria-hidden="true">↓</span></>}
        </button>
        <p className="planner-caption">Generation needs OPENAI_API_KEY in your local .env.local. Build and root-route checks run in the isolated Docker worker when it is available; otherwise the ZIP is returned with validation marked not run.</p>
        {generation.status === "error" && <p className="plan-error" role="alert">{generation.message}</p>}
        {generation.status === "success" && <p className="generation-success" role="status">Download started: {generation.fileCount} project and report files. {generation.sourceFileCount} source files were sent after redaction. Validation: {generation.validation}; build: {generation.build}; root route: {generation.rootRoute}. See MIGRATION-REPORT.md for details.</p>}
      </div>
    </section>
  );
}
