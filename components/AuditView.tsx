"use client";

import { useState } from "react";
import type { AuditFinding, AuditReport } from "@/lib/audit/types";

export function AuditView({
  report,
  onDownload,
  onExportDossier,
}: {
  report: AuditReport;
  onDownload?: () => void;
  onExportDossier?: () => void;
}) {
  const [selectedSeverity, setSelectedSeverity] = useState<string>("all");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const totalFindings = Object.values(report.summary).reduce((total, count) => total + count, 0);

  const filteredFindings = report.findings.filter((f) => {
    if (selectedSeverity !== "all" && f.severity !== selectedSeverity) return false;
    if (selectedCategory !== "all" && f.category !== selectedCategory) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return f.title.toLowerCase().includes(q) || f.file.toLowerCase().includes(q) || f.explanation.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="audit-result-view" aria-live="polite">
      <div className="audit-summary-header">
        <div className="audit-counts-strip" aria-label="Finding counts by severity">
          {(["critical", "high", "medium", "low", "info"] as const).map((severity) => {
            const count = report.summary[severity];
            const isActive = selectedSeverity === severity;
            return (
              <button
                key={severity}
                type="button"
                className={`audit-count-badge audit-${severity}${isActive ? " is-filtered" : ""}`}
                onClick={() => setSelectedSeverity(isActive ? "all" : severity)}
                title={`Filter by ${severity} severity (${count} findings)`}
              >
                <b className="count-num">{count}</b>
                <span className="count-label">{severity}</span>
              </button>
            );
          })}
        </div>

        <div className="audit-header-btns">
          {onExportDossier && (
            <button className="action-btn primary audit-dossier-btn" type="button" onClick={onExportDossier}>
              <span aria-hidden="true">📄</span> Export Executive Dossier
            </button>
          )}
          {onDownload && (
            <button className="audit-download-btn" type="button" onClick={onDownload}>
              <span aria-hidden="true">↓</span> Download Raw Report
            </button>
          )}
        </div>
      </div>

      <div className="audit-structure-grid">
        <div className="struct-metric">
          <span className="metric-num">{report.structure.parsedFiles}</span>
          <span className="metric-label">JS/TS Parsed</span>
        </div>
        <div className={`struct-metric${report.structure.syntaxErrors > 0 ? " has-issues" : ""}`}>
          <span className="metric-num">{report.structure.syntaxErrors}</span>
          <span className="metric-label">Syntax Errors</span>
        </div>
        <div className={`struct-metric${report.structure.unresolvedInternalImports > 0 ? " has-issues" : ""}`}>
          <span className="metric-num">{report.structure.unresolvedInternalImports}</span>
          <span className="metric-label">Unresolved Imports</span>
        </div>
        <div className={`struct-metric${report.structure.undeclaredPackageImports > 0 ? " has-issues" : ""}`}>
          <span className="metric-num">{report.structure.undeclaredPackageImports}</span>
          <span className="metric-label">Undeclared Packages</span>
        </div>
      </div>

      <div className={`audit-dependency-status audit-${report.dependencyAudit.status}`}>
        <div className="dep-status-top">
          <span className="dep-dot" />
          <strong>OSV Dependency Advisory Check: {report.dependencyAudit.status.toUpperCase()}</strong>
        </div>
        <p>{report.dependencyAudit.message}</p>
        {report.dependencyAudit.checkedAt && (
          <small>Verified with Google OSV at {new Date(report.dependencyAudit.checkedAt).toLocaleTimeString()}</small>
        )}
      </div>

      <div className="audit-filter-bar">
        <div className="search-wrap">
          <input
            type="search"
            placeholder="Search findings by file, title, or text…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="audit-search-input"
          />
        </div>
        <div className="category-chips">
          {["all", "security", "maintainability", "accessibility"].map((cat) => (
            <button
              key={cat}
              type="button"
              className={`cat-chip${selectedCategory === cat ? " is-active" : ""}`}
              onClick={() => setSelectedCategory(cat)}
            >
              {cat === "all" ? "All Categories" : cat}
            </button>
          ))}
          {(selectedSeverity !== "all" || selectedCategory !== "all" || searchQuery) && (
            <button
              type="button"
              className="clear-filters-btn"
              onClick={() => {
                setSelectedSeverity("all");
                setSelectedCategory("all");
                setSearchQuery("");
              }}
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      <p className="findings-subhead">
        Showing <strong>{filteredFindings.length}</strong> of <strong>{totalFindings}</strong> total finding(s)
      </p>

      {filteredFindings.length === 0 ? (
        <div className="audit-empty-card">
          <p>✓ No findings match the selected filters.</p>
        </div>
      ) : (
        <div className="audit-findings-list">
          {filteredFindings.map((finding: AuditFinding) => (
            <article className={`audit-card-finding severity-${finding.severity}`} key={finding.id}>
              <div className="finding-header">
                <span className={`finding-severity-tag severity-${finding.severity}`}>
                  {finding.severity.toUpperCase()}
                </span>
                <span className="finding-category">{finding.category}</span>
                <span className="finding-confidence">{finding.confidence} confidence</span>
                <span className="finding-rule-id"><code>{finding.ruleId}</code></span>
              </div>
              <h5 className="finding-title">{finding.title}</h5>
              <p className="finding-location">
                <code>{finding.file}{finding.line ? `:${finding.line}${finding.column ? `:${finding.column}` : ""}` : ""}</code>
              </p>
              {finding.evidence && (
                <pre className="finding-evidence"><code>{finding.evidence}</code></pre>
              )}
              <p className="finding-explanation">{finding.explanation}</p>
              <div className="finding-recommendation">
                <strong>Remediation:</strong> {finding.recommendation}
              </div>
              {finding.advisoryUrl && (
                <div className="finding-advisory-link-wrap">
                  <a className="advisory-link" href={finding.advisoryUrl} target="_blank" rel="noreferrer">
                    Review {finding.advisoryId} on Google OSV Database ↗
                  </a>
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      <details className="audit-collapsible-section">
        <summary>Scanned Files ({report.coverage.scannedFiles} files)</summary>
        <ul>
          {report.coverage.scannedPaths.map((p) => (
            <li key={p}><code>{p}</code></li>
          ))}
        </ul>
      </details>

      <details className="audit-collapsible-section">
        <summary>Checks Not Run (Scope Disclosures)</summary>
        <ul>
          {report.checksNotRun.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}
