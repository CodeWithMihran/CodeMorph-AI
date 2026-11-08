"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { AuditView } from "@/components/AuditView";
import type { RepositoryAnalysis } from "@/lib/github/analysis";
import type { AuditReport } from "@/lib/audit/types";
import { saveHistoryRecord, getPendingRestore } from "@/lib/storage/history-store";
import { ExecutiveDossierModal } from "@/components/ExecutiveDossierModal";

type AnalysisState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; analysis: RepositoryAnalysis };

type AuditState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; report: AuditReport; markdown: string };

export default function AuditPage() {
  const [pendingRecord] = useState(() => getPendingRestore());

  const [sourceMode, setSourceMode] = useState<"github" | "zip">("github");
  const [repositoryUrl, setRepositoryUrl] = useState(() => {
    if (pendingRecord && pendingRecord.type === "audit" && pendingRecord.repository && !pendingRecord.repository.endsWith(".zip")) {
      return `https://github.com/${pendingRecord.repository}`;
    }
    return "";
  });
  const [zipFile, setZipFile] = useState<File | null>(null);

  const [analysisState, setAnalysisState] = useState<AnalysisState>(() => {
    if (pendingRecord && pendingRecord.type === "audit" && pendingRecord.analysis) {
      return { status: "success", analysis: pendingRecord.analysis };
    }
    return { status: "idle" };
  });

  const [auditState, setAuditState] = useState<AuditState>(() => {
    if (pendingRecord && pendingRecord.type === "audit") {
      return { status: "success", report: pendingRecord.report, markdown: pendingRecord.markdown || "" };
    }
    return { status: "idle" };
  });

  const [dossierModalOpen, setDossierModalOpen] = useState(false);

  const isBusy = analysisState.status === "loading" || auditState.status === "loading";

  async function handleInspectAndAudit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAnalysisState({ status: "loading" });
    setAuditState({ status: "idle" });

    try {
      let analysisData: RepositoryAnalysis;

      if (sourceMode === "github") {
        const analyzeRes = await fetch("/api/repositories/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ repositoryUrl }),
        });
        const json = await analyzeRes.json();
        if (!analyzeRes.ok || !json.analysis) {
          setAnalysisState({ status: "error", message: json.error ?? "Failed to inspect repository." });
          return;
        }
        analysisData = json.analysis;
        setAnalysisState({ status: "success", analysis: analysisData });

        // Directly run audit
        setAuditState({ status: "loading" });
        const auditRes = await fetch("/api/repositories/audit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ analysis: analysisData }),
        });
        const auditJson = await auditRes.json();
        if (!auditRes.ok || !auditJson.report) {
          setAuditState({ status: "error", message: auditJson.error ?? "Audit failed." });
          return;
        }
        setAuditState({ status: "success", report: auditJson.report, markdown: auditJson.markdown });
        saveHistoryRecord({
          type: "audit",
          repository: analysisData.repository?.fullName || repositoryUrl,
          branch: analysisData.repository?.defaultBranch || "main",
          revision: analysisData.revision?.commitSha || "main",
          findingsCount: auditJson.report.findings?.length || 0,
          criticalCount: auditJson.report.summary?.critical || 0,
          highCount: auditJson.report.summary?.high || 0,
          syntaxErrors: auditJson.report.structure?.syntaxErrors || 0,
          unresolvedImports: auditJson.report.structure?.unresolvedInternalImports || 0,
          analysis: analysisData,
          report: auditJson.report,
          markdown: auditJson.markdown,
        });
      } else {
        if (!zipFile) {
          setAnalysisState({ status: "error", message: "Choose a ZIP file." });
          return;
        }
        const form = new FormData();
        form.set("file", zipFile);
        const analyzeRes = await fetch("/api/repositories/analyze-upload", { method: "POST", body: form });
        const json = await analyzeRes.json();
        if (!analyzeRes.ok || !json.analysis) {
          setAnalysisState({ status: "error", message: json.error ?? "Failed to inspect ZIP." });
          return;
        }
        analysisData = json.analysis;
        setAnalysisState({ status: "success", analysis: analysisData });

        // Run upload audit
        setAuditState({ status: "loading" });
        const auditForm = new FormData();
        auditForm.set("file", zipFile);
        const auditRes = await fetch("/api/repositories/audit-upload", { method: "POST", body: auditForm });
        const auditJson = await auditRes.json();
        if (!auditRes.ok || !auditJson.report) {
          setAuditState({ status: "error", message: auditJson.error ?? "ZIP audit failed." });
          return;
        }
        setAuditState({ status: "success", report: auditJson.report, markdown: auditJson.markdown });
        saveHistoryRecord({
          type: "audit",
          repository: analysisData.repository?.fullName || repositoryUrl,
          branch: analysisData.repository?.defaultBranch || "main",
          revision: analysisData.revision?.commitSha || "main",
          findingsCount: auditJson.report.findings?.length || 0,
          criticalCount: auditJson.report.summary?.critical || 0,
          highCount: auditJson.report.summary?.high || 0,
          syntaxErrors: auditJson.report.structure?.syntaxErrors || 0,
          unresolvedImports: auditJson.report.structure?.unresolvedInternalImports || 0,
          analysis: analysisData,
          report: auditJson.report,
          markdown: auditJson.markdown,
        });
      }
    } catch {
      setAnalysisState({ status: "error", message: "Request failed. Check your network connection." });
      setAuditState({ status: "idle" });
    }
  }

  function handleDownloadReport() {
    if (auditState.status !== "success") return;
    const blob = new Blob([auditState.markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "CODE-AUDIT-REPORT.md";
    document.body.append(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="page-shell">
      <div className="page-intro">
        <p className="card-kicker">STATIC REPOSITORY AUDIT · AST SYNTAX · LIVE OSV ADVISORIES</p>
        <h1>Codebase Health &amp; Vulnerability Inspector</h1>
        <p className="intro-text">
          Perform a deterministic security and syntax audit on any public GitHub repository or uploaded ZIP archive. We detect credentials, dangerous code patterns, unresolved imports, and query the Google OSV database for known package CVEs without executing repository code.
        </p>
      </div>

      <div className="card-workspace">
        <div className="source-mode-tabs" role="tablist">
          <button
            role="tab"
            type="button"
            className={`source-mode-tab${sourceMode === "github" ? " is-active" : ""}`}
            onClick={() => { setSourceMode("github"); setAnalysisState({ status: "idle" }); setAuditState({ status: "idle" }); }}
            disabled={isBusy}
          >
            Public GitHub URL
          </button>
          <button
            role="tab"
            type="button"
            className={`source-mode-tab${sourceMode === "zip" ? " is-active" : ""}`}
            onClick={() => { setSourceMode("zip"); setAnalysisState({ status: "idle" }); setAuditState({ status: "idle" }); }}
            disabled={isBusy}
          >
            Upload Project .ZIP
          </button>
        </div>

        <form className="repo-form" onSubmit={handleInspectAndAudit}>
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
                  disabled={isBusy}
                  required
                />
              </div>
              <p className="field-help">Public repositories only. Secrets and personal tokens are never requested.</p>
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
                  disabled={isBusy}
                  required
                />
              </div>
              <p className="field-help">ZIP only (max 10 MiB). Unpacked strictly in memory with zip bomb and traversal protection.</p>
            </>
          )}

          {analysisState.status === "error" && (
            <p className="plan-error" role="alert">{analysisState.message}</p>
          )}

          <button
            className="submit-button"
            type="submit"
            disabled={isBusy || (sourceMode === "github" ? !repositoryUrl.trim() : !zipFile)}
          >
            {isBusy ? (
              <><span className="spinner" aria-hidden="true" /> Scanning codebase &amp; querying OSV…</>
            ) : (
              <>Run Comprehensive Audit <span aria-hidden="true">→</span></>
            )}
          </button>
        </form>

        {analysisState.status === "success" && (
          <div className="audit-source-card">
            <div className="source-meta-row">
              <span className="source-title">Target: <b>{analysisState.analysis.repository.fullName}</b></span>
              <span className="source-tag">{analysisState.analysis.profile.framework}</span>
              <span className="source-files">{analysisState.analysis.profile.fileCount} files scanned</span>
            </div>
          </div>
        )}

        {auditState.status === "error" && (
          <p className="plan-error" role="alert">{auditState.message}</p>
        )}

        {auditState.status === "success" && (
          <div className="audit-results-container">
            <AuditView
              report={auditState.report}
              onDownload={handleDownloadReport}
              onExportDossier={() => setDossierModalOpen(true)}
            />

            <ExecutiveDossierModal
              isOpen={dossierModalOpen}
              onClose={() => setDossierModalOpen(false)}
              input={{
                repository: analysisState.status === "success" ? analysisState.analysis.repository.fullName : (zipFile ? zipFile.name : repositoryUrl),
                branch: analysisState.status === "success" ? analysisState.analysis.repository.defaultBranch : "main",
                revision: analysisState.status === "success" ? analysisState.analysis.revision.commitSha : "HEAD",
                framework: analysisState.status === "success" ? analysisState.analysis.profile.framework : "React",
                sourceType: analysisState.status === "success" ? analysisState.analysis.profile.sourceType : "static",
                auditReport: auditState.report,
              }}
            />

            <div className="audit-next-actions">
              <div className="next-action-card">
                <h5>Want to evaluate migration feasibility?</h5>
                <p>Calculate a 0–100% migration score across route, component, and dependency dimensions.</p>
                <Link href="/feasibility" className="next-action-link">Check Feasibility Score →</Link>
              </div>
              <div className="next-action-card">
                <h5>Ready to convert this codebase?</h5>
                <p>Generate a Next.js App Router or Expo mobile project with isolated Docker build validation.</p>
                <Link href="/migrate" className="next-action-link">Open Migration Studio →</Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
