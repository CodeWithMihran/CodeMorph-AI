"use client";

import { useState } from "react";
import Link from "next/link";
import type { RepositoryAnalysis } from "@/lib/github/analysis";
import type { AuditReport } from "@/lib/audit/types";
import type { FeasibilityReport } from "@/lib/analysis/feasibility";
import { AuditView } from "@/components/AuditView";
import { FeasibilityView } from "@/components/FeasibilityView";

type SourceMode = "github" | "zip";

export default function HomePage() {
  const [sourceMode, setSourceMode] = useState<SourceMode>("github");
  const [repoUrl, setRepoUrl] = useState("https://github.com/facebook/react");
  const [branch, setBranch] = useState("main");
  const [zipFile, setZipFile] = useState<File | null>(null);

  const [inspectState, setInspectState] = useState<{
    status: "idle" | "loading" | "success" | "error";
    analysis?: RepositoryAnalysis;
    feasibility?: FeasibilityReport;
    message?: string;
  }>({ status: "idle" });

  const [auditState, setAuditState] = useState<{
    status: "idle" | "loading" | "success" | "error";
    report?: AuditReport;
    markdown?: string;
    message?: string;
  }>({ status: "idle" });

  const isInspecting = inspectState.status === "loading";
  const isAuditing = auditState.status === "loading";
  const isBusy = isInspecting || isAuditing;

  async function handleQuickInspect(e: React.FormEvent) {
    e.preventDefault();
    setInspectState({ status: "loading" });
    setAuditState({ status: "idle" });

    try {
      if (sourceMode === "github") {
        const response = await fetch("/api/repositories/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ repoUrl, branch }),
        });
        const data = (await response.json()) as {
          analysis?: RepositoryAnalysis;
          feasibility?: FeasibilityReport;
          error?: string;
        };

        if (!response.ok || !data.analysis) {
          setInspectState({
            status: "error",
            message: data.error ?? "Failed to inspect repository.",
          });
          return;
        }

        setInspectState({
          status: "success",
          analysis: data.analysis,
          feasibility: data.feasibility,
        });
      } else {
        if (!zipFile) {
          setInspectState({ status: "error", message: "Please select a ZIP file." });
          return;
        }
        const form = new FormData();
        form.set("file", zipFile);
        const response = await fetch("/api/repositories/analyze-upload", {
          method: "POST",
          body: form,
        });
        const data = (await response.json()) as {
          analysis?: RepositoryAnalysis;
          feasibility?: FeasibilityReport;
          error?: string;
        };

        if (!response.ok || !data.analysis) {
          setInspectState({
            status: "error",
            message: data.error ?? "Failed to inspect ZIP archive.",
          });
          return;
        }

        setInspectState({
          status: "success",
          analysis: data.analysis,
          feasibility: data.feasibility,
        });
      }
    } catch {
      setInspectState({
        status: "error",
        message: "Failed to connect to inspection service.",
      });
    }
  }

  async function handleQuickAudit() {
    if (!inspectState.analysis) return;
    setAuditState({ status: "loading" });
    try {
      if (sourceMode === "github") {
        const response = await fetch("/api/repositories/audit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ analysis: inspectState.analysis }),
        });
        const data = (await response.json()) as {
          report?: AuditReport;
          markdown?: string;
          error?: string;
        };

        if (!response.ok || !data.report) {
          setAuditState({
            status: "error",
            message: data.error ?? "Codebase audit failed.",
          });
          return;
        }

        setAuditState({
          status: "success",
          report: data.report,
          markdown: data.markdown ?? "",
        });
      } else {
        if (!zipFile) {
          setAuditState({ status: "error", message: "ZIP file not found. Re-upload to run audit." });
          return;
        }
        const form = new FormData();
        form.set("file", zipFile);
        const response = await fetch("/api/repositories/audit-upload", {
          method: "POST",
          body: form,
        });
        const data = (await response.json()) as {
          report?: AuditReport;
          markdown?: string;
          error?: string;
        };

        if (!response.ok || !data.report) {
          setAuditState({
            status: "error",
            message: data.error ?? "ZIP codebase audit failed.",
          });
          return;
        }

        setAuditState({
          status: "success",
          report: data.report,
          markdown: data.markdown ?? "",
        });
      }
    } catch {
      setAuditState({
        status: "error",
        message: "Network error occurred while running codebase audit.",
      });
    }
  }

  const analysis = inspectState.analysis;
  const feasibility = inspectState.feasibility;

  return (
    <main className="page-shell">
      {/* HERO SECTION */}
      <section className="hero-banner">
        <div className="hero-badge">
          <span className="live-dot" />
          <span>PRODUCTION-GRADE CODE ENGINE</span>
        </div>
        <h1 className="hero-title">
          Autonomous Codebase Audit &amp; Verifiable Cross-Stack Migration
        </h1>
        <p className="hero-lead">
          Inspect repositories for credential exposures, syntax errors, and Google OSV advisories.
          Evaluate portability metrics and synthesize verifiable migrations to Next.js App Router or Expo Router Mobile.
        </p>

        <div className="hero-actions">
          <Link href="/audit" className="action-btn primary">
            Open Code Audit Studio ➔
          </Link>
          <Link href="/migrate" className="action-btn secondary">
            Launch Stack Migration ➔
          </Link>
        </div>
      </section>

      {/* 4 CORE CAPABILITIES DISPATCH GRID */}
      <section className="feature-dispatch-grid">
        <Link href="/audit" className="dispatch-card">
          <div className="dispatch-icon">🛡</div>
          <div className="dispatch-body">
            <h3 className="dispatch-title">Codebase Audit &amp; Security</h3>
            <p className="dispatch-desc">
              Detect secret leaks, AST parsing syntax errors, unresolved relative imports, and real-time Google OSV CVEs.
            </p>
          </div>
          <div className="dispatch-footer">
            <span>Explore Auditor</span>
            <span className="arrow">➔</span>
          </div>
        </Link>

        <Link href="/feasibility" className="dispatch-card">
          <div className="dispatch-icon">⚡</div>
          <div className="dispatch-body">
            <h3 className="dispatch-title">Feasibility &amp; Portability</h3>
            <p className="dispatch-desc">
              Compute 0-100% mathematical migration suitability across syntax, dependencies, routing, and architecture.
            </p>
          </div>
          <div className="dispatch-footer">
            <span>Calculate Feasibility</span>
            <span className="arrow">➔</span>
          </div>
        </Link>

        <Link href="/migrate" className="dispatch-card">
          <div className="dispatch-icon">⇄</div>
          <div className="dispatch-body">
            <h3 className="dispatch-title">Stack Migration Studio</h3>
            <p className="dispatch-desc">
              Plan and generate Next.js or Expo mobile transformations with route contract preservation and isolated Docker builds.
            </p>
          </div>
          <div className="dispatch-footer">
            <span>Start Transformation</span>
            <span className="arrow">➔</span>
          </div>
        </Link>

        <Link href="/memory" className="dispatch-card">
          <div className="dispatch-icon">🧠</div>
          <div className="dispatch-body">
            <h3 className="dispatch-title">Self-Learning Procedural Rules</h3>
            <p className="dispatch-desc">
              Automated repair learning loop with positive/negative replay test verification and rule promotion.
            </p>
          </div>
          <div className="dispatch-footer">
            <span>Review Rules</span>
            <span className="arrow">➔</span>
          </div>
        </Link>
      </section>

      {/* QUICK INGESTION WORKBENCH */}
      <section className="card-workspace">
        <div className="section-head">
          <div className="step-badge">QUICK WORKBENCH</div>
          <div className="step-info">
            <h2 className="section-title">Inspect Any Codebase Instantly</h2>
            <p className="section-desc">
              Provide a GitHub repository URL or upload a ZIP archive to analyze topology, routes, and health.
            </p>
          </div>
        </div>

        <form onSubmit={handleQuickInspect} className="migrate-config-grid">
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
                  placeholder="https://github.com/facebook/react"
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  disabled={isBusy}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="branch" className="form-label">BRANCH</label>
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

          <div className="form-actions-full">
            <button type="submit" className="action-btn primary" disabled={isBusy}>
              {isInspecting ? "Inspecting Codebase Structure..." : "Run Quick Inspection"}
            </button>
            {inspectState.status === "error" && (
              <span className="inline-error">{inspectState.message}</span>
            )}
          </div>
        </form>

        {analysis && (
          <div className="quick-analysis-result animate-fadein">
            <div className="source-profile-summary">
              <div className="profile-pill-item">
                <span className="profile-lbl">Repository</span>
                <span className="profile-val">{analysis.repository.fullName}</span>
              </div>
              <div className="profile-pill-item">
                <span className="profile-lbl">Detected Framework</span>
                <span className="profile-val highlight">{analysis.profile.framework}</span>
              </div>
              <div className="profile-pill-item">
                <span className="profile-lbl">Key Files</span>
                <span className="profile-val">{analysis.profile.keyFiles.length} files</span>
              </div>
              <div className="profile-pill-item">
                <span className="profile-lbl">Discovered Routes</span>
                <span className="profile-val">{analysis.profile.routeCandidates.length} routes</span>
              </div>
            </div>

            {feasibility && (
              <div className="quick-feasibility-wrap">
                <FeasibilityView feasibility={feasibility} />
              </div>
            )}

            <div className="quick-actions-bar">
              <button
                type="button"
                className="action-btn secondary"
                onClick={handleQuickAudit}
                disabled={isBusy}
              >
                {isAuditing ? "Running Code Audit..." : "Run Security & AST Audit on this Repo"}
              </button>
              <Link href="/migrate" className="action-btn primary">
                Transfer to Stack Migration Studio ➔
              </Link>
            </div>
          </div>
        )}

        {auditState.status === "success" && auditState.report && (
          <div className="quick-audit-view-wrap animate-fadein">
            <AuditView
              report={auditState.report}
              onDownload={() => {
                if (!auditState.markdown) return;
                const blob = new Blob([auditState.markdown], { type: "text/markdown;charset=utf-8" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "CODE-AUDIT-REPORT.md";
                document.body.append(a);
                a.click();
                a.remove();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
              }}
            />
          </div>
        )}
      </section>

      {/* SYSTEM ARCHITECTURE & SECURITY CALLOUTS */}
      <section className="architecture-section">
        <h2 className="section-title text-center">Engine Architecture &amp; Security Principles</h2>
        <p className="section-desc text-center">
          Engineered for strict safety, deterministic repeatability, and zero runtime risk.
        </p>

        <div className="arch-cards-grid">
          <div className="arch-card">
            <div className="arch-num">01</div>
            <h4 className="arch-card-title">Zero Host Execution</h4>
            <p className="arch-card-desc">
              All repository inspection, parsing, and AST validation operate strictly read-only on the host machine.
              Untrusted source code is never executed directly.
            </p>
          </div>

          <div className="arch-card">
            <div className="arch-num">02</div>
            <h4 className="arch-card-title">Docker Network Isolation</h4>
            <p className="arch-card-desc">
              Verification builds execute inside ephemeral Docker sandboxes with <code>--network=none</code>, ensuring no external network calls or exfiltration.
            </p>
          </div>

          <div className="arch-card">
            <div className="arch-num">03</div>
            <h4 className="arch-card-title">Authoritative Server Scoring</h4>
            <p className="arch-card-desc">
              Feasibility scores and migration plans are re-evaluated authoritatively on the server for the exact chosen target (Next.js vs Expo).
            </p>
          </div>

          <div className="arch-card">
            <div className="arch-num">04</div>
            <h4 className="arch-card-title">Procedural Memory Rules</h4>
            <p className="arch-card-desc">
              Continuous self-learning records verified compile fixes and validates them against positive and negative AST test fixtures before promotion.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
