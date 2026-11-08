"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { FeasibilityView } from "@/components/FeasibilityView";
import type { RepositoryAnalysis } from "@/lib/github/analysis";
import type { FeasibilityReport } from "@/lib/analysis/feasibility";
import { saveHistoryRecord, getPendingRestore } from "@/lib/storage/history-store";
import { ExecutiveDossierModal } from "@/components/ExecutiveDossierModal";

export default function FeasibilityPage() {
  const [pendingRecord] = useState(() => getPendingRestore());

  const [sourceMode, setSourceMode] = useState<"github" | "zip">("github");
  const [repositoryUrl, setRepositoryUrl] = useState(() => {
    if (pendingRecord && pendingRecord.type === "feasibility" && pendingRecord.repository && !pendingRecord.repository.endsWith(".zip")) {
      return `https://github.com/${pendingRecord.repository}`;
    }
    return "";
  });
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [targetStack, setTargetStack] = useState<"nextjs" | "expo">(() => {
    if (pendingRecord && pendingRecord.type === "feasibility") {
      return pendingRecord.target;
    }
    return "nextjs";
  });
  const [analysis, setAnalysis] = useState<RepositoryAnalysis | null>(() => {
    if (pendingRecord && pendingRecord.type === "feasibility" && pendingRecord.analysis) {
      return pendingRecord.analysis;
    }
    return null;
  });
  const [targetFeasibility, setTargetFeasibility] = useState<FeasibilityReport | null>(() => {
    if (pendingRecord && pendingRecord.type === "feasibility") {
      return pendingRecord.report;
    }
    return null;
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [dossierModalOpen, setDossierModalOpen] = useState(false);

  async function handleEvaluate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setError("");
    setAnalysis(null);
    setTargetFeasibility(null);

    try {
      let analysisResult: RepositoryAnalysis;

      if (sourceMode === "github") {
        const res = await fetch("/api/repositories/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ repositoryUrl }),
        });
        const data = await res.json();
        if (!res.ok || !data.analysis) {
          setError(data.error ?? "Failed to inspect repository.");
          setIsLoading(false);
          return;
        }
        analysisResult = data.analysis;
        setAnalysis(analysisResult);

        // Fetch target-specific feasibility via plan route
        const planRes = await fetch("/api/migrations/plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ analysis: analysisResult, goal: "Evaluate migration feasibility score", target: targetStack }),
        });
        const planData = await planRes.json();
        let finalFeasibility: FeasibilityReport | null = null;
        if (planRes.ok && planData.feasibility) {
          finalFeasibility = planData.feasibility;
          setTargetFeasibility(planData.feasibility);
        } else if (analysisResult.profile.feasibility) {
          finalFeasibility = analysisResult.profile.feasibility;
          setTargetFeasibility(analysisResult.profile.feasibility);
        }

        if (finalFeasibility) {
          saveHistoryRecord({
            type: "feasibility",
            repository: analysisResult.repository?.fullName || repositoryUrl,
            target: targetStack,
            score: finalFeasibility.score,
            tier: finalFeasibility.tier,
            summary: finalFeasibility.summary,
            report: finalFeasibility,
            analysis: analysisResult,
          });
        }
      } else {
        if (!zipFile) {
          setError("Choose a ZIP archive.");
          setIsLoading(false);
          return;
        }
        const form = new FormData();
        form.set("file", zipFile);
        const res = await fetch("/api/repositories/analyze-upload", { method: "POST", body: form });
        const data = await res.json();
        if (!res.ok || !data.analysis) {
          setError(data.error ?? "Failed to analyze archive.");
          setIsLoading(false);
          return;
        }
        analysisResult = data.analysis;
        setAnalysis(analysisResult);

        // Fetch target-specific feasibility via plan-upload
        const planForm = new FormData();
        planForm.set("file", zipFile);
        planForm.set("goal", "Evaluate migration feasibility score");
        planForm.set("target", targetStack);
        const planRes = await fetch("/api/migrations/plan-upload", { method: "POST", body: planForm });
        const planData = await planRes.json();
        let finalFeasibility: FeasibilityReport | null = null;
        if (planRes.ok && planData.feasibility) {
          finalFeasibility = planData.feasibility;
          setTargetFeasibility(planData.feasibility);
        } else if (analysisResult.profile.feasibility) {
          finalFeasibility = analysisResult.profile.feasibility;
          setTargetFeasibility(analysisResult.profile.feasibility);
        }

        if (finalFeasibility) {
          saveHistoryRecord({
            type: "feasibility",
            repository: analysisResult.repository?.fullName || repositoryUrl,
            target: targetStack,
            score: finalFeasibility.score,
            tier: finalFeasibility.tier,
            summary: finalFeasibility.summary,
            report: finalFeasibility,
            analysis: analysisResult,
          });
        }
      }
    } catch {
      setError("Network error while evaluating feasibility. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="page-shell">
      <div className="page-intro">
        <p className="card-kicker">DETERMINISTIC 0–100% HEALTH &amp; PORTABILITY SCORING</p>
        <h1>Automated Migration Feasibility Evaluator</h1>
        <p className="intro-text">
          Evaluate whether an existing codebase can be migrated automatically to Next.js or React Native (Expo). Our deterministic engine inspects route hierarchies, browser globals, direct DOM manipulations, and third-party dependencies to compute a reliable portability rating.
        </p>
      </div>

      <div className="card-workspace">
        <div className="source-mode-tabs" role="tablist">
          <button
            role="tab"
            type="button"
            className={`source-mode-tab${sourceMode === "github" ? " is-active" : ""}`}
            onClick={() => { setSourceMode("github"); setAnalysis(null); setTargetFeasibility(null); setError(""); }}
            disabled={isLoading}
          >
            Public GitHub URL
          </button>
          <button
            role="tab"
            type="button"
            className={`source-mode-tab${sourceMode === "zip" ? " is-active" : ""}`}
            onClick={() => { setSourceMode("zip"); setAnalysis(null); setTargetFeasibility(null); setError(""); }}
            disabled={isLoading}
          >
            Upload Project .ZIP
          </button>
        </div>

        <form className="repo-form" onSubmit={handleEvaluate}>
          {sourceMode === "github" ? (
            <>
              <label htmlFor="repo-url">GITHUB REPOSITORY URL</label>
              <div className="input-wrap">
                <input
                  id="repo-url"
                  type="url"
                  placeholder="https://github.com/owner/repository"
                  value={repositoryUrl}
                  onChange={(e) => setRepositoryUrl(e.target.value)}
                  disabled={isLoading}
                  required
                />
              </div>
            </>
          ) : (
            <>
              <label htmlFor="zip-file">PROJECT ARCHIVE (.ZIP)</label>
              <div className="input-wrap zip-input-wrap">
                <input
                  id="zip-file"
                  type="file"
                  accept=".zip,application/zip"
                  onChange={(e) => setZipFile(e.target.files?.[0] ?? null)}
                  disabled={isLoading}
                  required
                />
              </div>
            </>
          )}

          <label htmlFor="target-stack" className="goal-label">EVALUATE FOR TARGET STACK</label>
          <div className="target-select-wrap">
            <select
              id="target-stack"
              className="target-select"
              value={targetStack}
              onChange={(e) => {
                setTargetStack(e.target.value as "nextjs" | "expo");
                setTargetFeasibility(null);
              }}
              disabled={isLoading}
            >
              <option value="nextjs">Next.js App Router (Web · TypeScript)</option>
              <option value="expo">Expo Router (React Native Mobile · TypeScript)</option>
            </select>
          </div>
          <p className="field-help">Switching between Web and Mobile allows you to see how browser-only APIs and DOM elements affect mobile readiness.</p>

          {error && <p className="plan-error" role="alert">{error}</p>}

          <button
            className="submit-button"
            type="submit"
            disabled={isLoading || (sourceMode === "github" ? !repositoryUrl.trim() : !zipFile)}
          >
            {isLoading ? (
              <><span className="spinner" aria-hidden="true" /> Computing dimensional feasibility…</>
            ) : (
              <>Evaluate Migration Feasibility <span aria-hidden="true">→</span></>
            )}
          </button>
        </form>

        {targetFeasibility && (
          <div className="feasibility-results-card">
            {analysis && (
              <div className="source-meta-row">
                <span className="source-title">Source: <b>{analysis.repository.fullName}</b></span>
                <span className="source-tag">{analysis.profile.framework}</span>
                <span className="source-files">{analysis.profile.fileCount} files</span>
              </div>
            )}

            <FeasibilityView feasibility={targetFeasibility} />

            <div className="feasibility-export-row" style={{ marginTop: 16, marginBottom: 16, display: "flex", justifyContent: "flex-end" }}>
              <button
                type="button"
                className="action-btn primary"
                onClick={() => setDossierModalOpen(true)}
              >
                <span>📄</span> Export Executive Dossier ➔
              </button>
            </div>

            <ExecutiveDossierModal
              isOpen={dossierModalOpen}
              onClose={() => setDossierModalOpen(false)}
              input={{
                repository: analysis ? analysis.repository.fullName : (zipFile ? zipFile.name : repositoryUrl),
                branch: analysis ? analysis.repository.defaultBranch : "main",
                revision: analysis ? analysis.revision.commitSha : "HEAD",
                framework: analysis ? analysis.profile.framework : "React",
                target: targetStack === "expo" ? "Expo Router (React Native Mobile)" : "Next.js App Router (TypeScript)",
                feasibilityReport: targetFeasibility,
              }}
            />

            <div className="feasibility-actions-card">
              <div>
                <h5>Ready to execute the migration?</h5>
                <p>Transfer pages, convert components to {targetStack === "expo" ? "React Native primitives" : "Next.js App Router"}, and generate a verified project ZIP.</p>
              </div>
              <Link href="/migrate" className="submit-button start-migrate-link">
                Proceed to Migration Studio →
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
