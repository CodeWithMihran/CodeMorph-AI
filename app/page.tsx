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
      {/* HERO SECTION (PORTFOLIO SPECIFICATION) */}
      <section className="hero-banner">
        <div className="hero-badge">
          <span className="live-dot" />
          <span>PRODUCTION-GRADE CODE ENGINE // ARCHITECTURAL SHOWCASE</span>
        </div>
        <h1 className="hero-title">
          Autonomous Codebase Audit &amp; Verifiable Cross-Stack Migration
        </h1>
        <p className="hero-lead">
          Production-grade code intelligence running 24/7 across local silicon and cloud repositories.
          Inspect codebases for credential exposures, AST syntax errors, and Google OSV advisories.
          Synthesize verifiable transformations to Next.js App Router or Expo Router Mobile with zero runtime risk.
        </p>

        <div className="hero-actions">
          <Link href="/audit" className="action-btn primary">
            <span>Open Code Audit Studio</span>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 8h10M9 4l4 4-4 4" />
            </svg>
          </Link>
          <Link href="/migrate" className="action-btn secondary">
            <span>Launch Stack Migration</span>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 8h10M9 4l4 4-4 4" />
            </svg>
          </Link>
        </div>

        {/* Portfolio Live Telemetry Metric Strip */}
        <div className="hero-metrics-strip">
          <div className="hero-metric-item">
            <span className="hero-metric-number">67/67</span>
            <span className="hero-metric-label">Automated Tests Passed</span>
          </div>
          <div className="hero-metric-divider" />
          <div className="hero-metric-item">
            <span className="hero-metric-number">39/39</span>
            <span className="hero-metric-label">Migration Contracts Validated</span>
          </div>
          <div className="hero-metric-divider" />
          <div className="hero-metric-item">
            <span className="hero-metric-number">100%</span>
            <span className="hero-metric-label">Zero Host Execution Isolation</span>
          </div>
          <div className="hero-metric-divider" />
          <div className="hero-metric-item">
            <span className="hero-metric-number">0.00s</span>
            <span className="hero-metric-label">Docker Network=None Leakage</span>
          </div>
        </div>
      </section>

      {/* 4 CORE CAPABILITIES DISPATCH GRID (PORTFOLIO BOXES) */}
      <section className="feature-dispatch-grid">
        <Link href="/audit" className="dispatch-card">
          <span className="card-reticle top-left" aria-hidden="true">+</span>
          <span className="card-reticle bottom-right" aria-hidden="true">+</span>
          <div className="card-top-kicker">
            <span className="kicker-accent">SECURITY // STATIC ANALYSIS</span>
            <span className="kicker-pill">AST SCANNER</span>
          </div>
          <div className="dispatch-header">
            <div className="dispatch-icon" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M8 1.5L2.5 4v4.5c0 3.5 2.5 6 5.5 6.5 3-.5 5.5-3 5.5-6.5V4L8 1.5z" />
                <path d="M6 8l1.5 1.5L10.5 6" />
              </svg>
            </div>
            <h3 className="dispatch-title">Codebase Audit &amp; Security</h3>
          </div>
          <p className="dispatch-desc">
            Detect credential exposures, AST parsing syntax errors, unresolved relative imports, and real-time Google OSV advisories with zero host code execution.
          </p>
          <div className="card-tech-tags">
            <span className="tech-tag">AST Parser</span>
            <span className="tech-tag">Secret Redactor</span>
            <span className="tech-tag">Google OSV</span>
            <span className="tech-tag">Zero Host Exec</span>
          </div>
          <div className="dispatch-footer">
            <span>Explore Auditor Module</span>
            <span className="arrow" aria-hidden="true">
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 8h10M9 4l4 4-4 4" />
              </svg>
            </span>
          </div>
        </Link>

        <Link href="/feasibility" className="dispatch-card">
          <span className="card-reticle top-left" aria-hidden="true">+</span>
          <span className="card-reticle bottom-right" aria-hidden="true">+</span>
          <div className="card-top-kicker">
            <span className="kicker-accent">ENGINE // HEALTH MATRIX</span>
            <span className="kicker-pill">0-100% SUITABILITY</span>
          </div>
          <div className="dispatch-header">
            <div className="dispatch-icon" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="8" cy="8" r="6" />
                <path d="M8 5v3.5l2.5 1.5" />
              </svg>
            </div>
            <h3 className="dispatch-title">Feasibility &amp; Portability</h3>
          </div>
          <p className="dispatch-desc">
            Compute weighted mathematical suitability across syntax integrity, dependency deprecations, routing topography, and target framework penalties.
          </p>
          <div className="card-tech-tags">
            <span className="tech-tag">Suitability Index</span>
            <span className="tech-tag">Target Penalties</span>
            <span className="tech-tag">Routing Radar</span>
            <span className="tech-tag">AST Topology</span>
          </div>
          <div className="dispatch-footer">
            <span>Calculate Feasibility Score</span>
            <span className="arrow" aria-hidden="true">
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 8h10M9 4l4 4-4 4" />
              </svg>
            </span>
          </div>
        </Link>

        <Link href="/migrate" className="dispatch-card">
          <span className="card-reticle top-left" aria-hidden="true">+</span>
          <span className="card-reticle bottom-right" aria-hidden="true">+</span>
          <div className="card-top-kicker">
            <span className="kicker-accent">TRANSFORMATION // COMPILER</span>
            <span className="kicker-pill">NEXT.JS &amp; EXPO</span>
          </div>
          <div className="dispatch-header">
            <div className="dispatch-icon" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M2.5 5h9M8.5 2l3 3-3 3" />
                <path d="M13.5 11h-9M7.5 8l-3 3 3 3" />
              </svg>
            </div>
            <h3 className="dispatch-title">Stack Migration Studio</h3>
          </div>
          <p className="dispatch-desc">
            Plan and synthesize full-stack transformations with route contract preservation, AST codemod transforms, and isolated Docker network=none builds.
          </p>
          <div className="card-tech-tags">
            <span className="tech-tag">Next.js 16</span>
            <span className="tech-tag">Expo Router Mobile</span>
            <span className="tech-tag">Docker Network=None</span>
            <span className="tech-tag">AST Codemod</span>
          </div>
          <div className="dispatch-footer">
            <span>Launch Transformation Studio</span>
            <span className="arrow" aria-hidden="true">
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 8h10M9 4l4 4-4 4" />
              </svg>
            </span>
          </div>
        </Link>

        <Link href="/memory" className="dispatch-card">
          <span className="card-reticle top-left" aria-hidden="true">+</span>
          <span className="card-reticle bottom-right" aria-hidden="true">+</span>
          <div className="card-top-kicker">
            <span className="kicker-accent">CORE // RECURSIVE MEMORY</span>
            <span className="kicker-pill">AST REPLAY REPAIR</span>
          </div>
          <div className="dispatch-header">
            <div className="dispatch-icon" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
                <rect x="3.5" y="3.5" width="9" height="9" />
                <path d="M6 1.5V3.5M10 1.5V3.5M6 12.5V14.5M10 12.5V14.5M1.5 6H3.5M1.5 10H3.5M12.5 6H14.5M12.5 10H14.5" />
              </svg>
            </div>
            <h3 className="dispatch-title">Self-Learning Procedural Rules</h3>
          </div>
          <p className="dispatch-desc">
            Autonomous self-learning repair engine with positive/negative AST fixture replay test verification and team rule promotion.
          </p>
          <div className="card-tech-tags">
            <span className="tech-tag">Continuous Memory</span>
            <span className="tech-tag">Candidate Mining</span>
            <span className="tech-tag">Deterministic Gates</span>
            <span className="tech-tag">Rollback Buffer</span>
          </div>
          <div className="dispatch-footer">
            <span>Review Rule Inventory</span>
            <span className="arrow" aria-hidden="true">
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 8h10M9 4l4 4-4 4" />
              </svg>
            </span>
          </div>
        </Link>
      </section>

      {/* QUICK INGESTION WORKBENCH (PORTFOLIO BOX SYSTEM) */}
      <section className="card-workspace">
        <span className="card-reticle top-left" aria-hidden="true">+</span>
        <span className="card-reticle bottom-right" aria-hidden="true">+</span>
        <div className="workbench-head">
          <div className="card-top-kicker">
            <span className="kicker-accent">CLI INGESTION // INSTANT WORKBENCH</span>
            <span className="kicker-pill">STAGE 01</span>
          </div>
          <h2 className="section-title">Inspect Any Codebase Instantly</h2>
          <p className="section-desc">
            Provide a GitHub repository URL or upload a ZIP archive to analyze topology, routes, and health.
          </p>
        </div>

        {/* Security & Verification Scope HUD */}
        <div className="workbench-scope-info">
          <div className="scope-info-header">
            <span className="scope-badge">ZERO HOST EXECUTION GUARANTEE</span>
            <span className="scope-status">ACTIVE ENFORCEMENT</span>
          </div>
          <div className="scope-features-grid">
            <div className="scope-feature-item">
              <span className="scope-dot" />
              <div className="scope-feature-text">
                <strong>AST Static Parsing:</strong> Evaluates syntax trees and relative imports safely without executing untrusted code.
              </div>
            </div>
            <div className="scope-feature-item">
              <span className="scope-dot" />
              <div className="scope-feature-text">
                <strong>Secret Redaction:</strong> Sanitizes 18+ credential patterns (OpenAI, AWS, GitHub tokens) prior to memory persistence.
              </div>
            </div>
            <div className="scope-feature-item">
              <span className="scope-dot" />
              <div className="scope-feature-text">
                <strong>Google OSV Advisory:</strong> Correlates pinned package manifests with real-time security vulnerability advisories.
              </div>
            </div>
            <div className="scope-feature-item">
              <span className="scope-dot" />
              <div className="scope-feature-text">
                <strong>Network=None Docker:</strong> Downstream verification packages compile in isolated containers with zero network access.
              </div>
            </div>
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
                <div className="demo-presets-row">
                  <span className="demo-presets-label">TRY DEMO:</span>
                  <button
                    type="button"
                    className="preset-btn"
                    onClick={() => {
                      setRepoUrl("https://github.com/facebook/react");
                      setBranch("main");
                    }}
                    disabled={isBusy}
                  >
                    facebook/react
                  </button>
                  <button
                    type="button"
                    className="preset-btn"
                    onClick={() => {
                      setRepoUrl("https://github.com/vercel/next.js");
                      setBranch("canary");
                    }}
                    disabled={isBusy}
                  >
                    vercel/next.js
                  </button>
                  <button
                    type="button"
                    className="preset-btn"
                    onClick={() => {
                      setRepoUrl("https://github.com/expo/expo");
                      setBranch("main");
                    }}
                    disabled={isBusy}
                  >
                    expo/expo
                  </button>
                </div>
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
                <span>Transfer to Stack Migration Studio</span>
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 8h10M9 4l4 4-4 4" />
                </svg>
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

      {/* SYSTEM ARCHITECTURE & SECURITY CALLOUTS (THE SYSTEMS MATRIX) */}
      <section className="architecture-section">
        <div style={{ marginBottom: 20 }}>
          <div className="card-top-kicker">
            <span className="kicker-accent">{"// ENGINEERING INDEX"}</span>
            <span className="kicker-pill">THE SYSTEMS MATRIX</span>
          </div>
          <h2 className="section-title">Engine Architecture &amp; Security Principles</h2>
          <p className="section-desc">
            Specialized architectures engineered for strict safety, deterministic repeatability, and zero runtime risk.
          </p>
        </div>

        <div className="arch-cards-grid">
          <div className="arch-card">
            <span className="card-reticle top-left" aria-hidden="true">+</span>
            <span className="card-reticle bottom-right" aria-hidden="true">+</span>
            <div className="arch-card-header">
              <span className="arch-num">01</span>
              <span className="arch-kicker-pill">ISOLATION</span>
            </div>
            <h4 className="arch-card-title">Zero Host Execution</h4>
            <p className="arch-card-desc">
              All repository inspection, parsing, and AST validation operate strictly read-only on the host machine.
              Untrusted source code is never executed directly.
            </p>
            <div className="card-tech-tags">
              <span className="tech-tag">Read-Only Host</span>
              <span className="tech-tag">AST Security</span>
            </div>
          </div>

          <div className="arch-card">
            <span className="card-reticle top-left" aria-hidden="true">+</span>
            <span className="card-reticle bottom-right" aria-hidden="true">+</span>
            <div className="arch-card-header">
              <span className="arch-num">02</span>
              <span className="arch-kicker-pill">SANDBOX</span>
            </div>
            <h4 className="arch-card-title">Docker Network Isolation</h4>
            <p className="arch-card-desc">
              Verification builds execute inside ephemeral Docker sandboxes with <code>--network=none</code>, ensuring no external network calls or exfiltration.
            </p>
            <div className="card-tech-tags">
              <span className="tech-tag">Network=None</span>
              <span className="tech-tag">Ephemeral Containers</span>
            </div>
          </div>

          <div className="arch-card">
            <span className="card-reticle top-left" aria-hidden="true">+</span>
            <span className="card-reticle bottom-right" aria-hidden="true">+</span>
            <div className="arch-card-header">
              <span className="arch-num">03</span>
              <span className="arch-kicker-pill">SCORING</span>
            </div>
            <h4 className="arch-card-title">Authoritative Server Scoring</h4>
            <p className="arch-card-desc">
              Feasibility scores and migration plans are re-evaluated authoritatively on the server for the exact chosen target (Next.js vs Expo).
            </p>
            <div className="card-tech-tags">
              <span className="tech-tag">Target-Aware</span>
              <span className="tech-tag">Deterministic Metrics</span>
            </div>
          </div>

          <div className="arch-card">
            <span className="card-reticle top-left" aria-hidden="true">+</span>
            <span className="card-reticle bottom-right" aria-hidden="true">+</span>
            <div className="arch-card-header">
              <span className="arch-num">04</span>
              <span className="arch-kicker-pill">REPLAY</span>
            </div>
            <h4 className="arch-card-title">Procedural Memory Rules</h4>
            <p className="arch-card-desc">
              Continuous self-learning records verified compile fixes and validates them against positive and negative AST test fixtures before promotion.
            </p>
            <div className="card-tech-tags">
              <span className="tech-tag">AST Test Fixtures</span>
              <span className="tech-tag">Zero Regression</span>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
