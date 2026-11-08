"use client";

import React, { useState } from "react";
import type { DependencyAnalysisResult, PortabilityTier } from "@/lib/analysis/dependency-shims";

interface DependencyMatrixViewProps {
  analysis: DependencyAnalysisResult;
  target?: "Next.js App Router" | "Expo Router (React Native Mobile)" | string;
}

export function DependencyMatrixView({ analysis, target = "Next.js App Router" }: DependencyMatrixViewProps) {
  const [filter, setFilter] = useState<"all" | "action" | "drop-in" | "browser-apis">("all");
  const [expandedPackage, setExpandedPackage] = useState<string | null>(null);
  const [copiedShim, setCopiedShim] = useState(false);

  const isExpo = target.includes("Expo");
  const { summary, dependencies, browserApis, compatibilityScore, installShims } = analysis;

  const actionRequiredCount = summary.shimAvailable + summary.refactorRequired + summary.incompatible;

  const filteredDependencies = dependencies.filter((dep) => {
    if (filter === "action") {
      return dep.status !== "drop-in";
    }
    if (filter === "drop-in") {
      return dep.status === "drop-in";
    }
    return true;
  });

  const getStatusBadge = (status: PortabilityTier) => {
    switch (status) {
      case "drop-in":
        return <span className="dep-badge drop-in">🟢 Drop-in Ready</span>;
      case "shim-available":
        return <span className="dep-badge shim">🟡 Shim Available</span>;
      case "refactor-required":
        return <span className="dep-badge refactor">🟠 Refactor Required</span>;
      case "incompatible":
        return <span className="dep-badge incompatible">🔴 Incompatible</span>;
      default:
        return <span className="dep-badge">{status}</span>;
    }
  };

  const handleCopyShims = () => {
    if (installShims.length === 0) return;
    const cmd = `npm install ${installShims.join(" ")}`;
    navigator.clipboard.writeText(cmd);
    setCopiedShim(true);
    setTimeout(() => setCopiedShim(false), 2000);
  };

  return (
    <div className="dep-matrix-wrap">
      <div className="dep-matrix-header">
        <div className="dep-header-left">
          <div className="dep-kicker">COMPATIBILITY &amp; SHIM MATRIX</div>
          <h3 className="dep-title">Package &amp; Runtime Portability Analysis</h3>
          <p className="dep-subtitle">
            Evaluating third-party dependencies, API deprecations, and browser runtime globals against destination <strong>{target}</strong>.
          </p>
        </div>
        <div className="dep-score-badge">
          <span className="dep-score-val">{compatibilityScore}%</span>
          <span className="dep-score-lbl">PORTABILITY</span>
        </div>
      </div>

      {/* Summary Stat Pills */}
      <div className="dep-stats-bar">
        <div className="dep-stat-item">
          <span className="stat-num">{summary.total}</span>
          <span className="stat-lbl">Total Packages</span>
        </div>
        <div className="dep-stat-item drop-in">
          <span className="stat-num">{summary.dropIn}</span>
          <span className="stat-lbl">Drop-in Compatible</span>
        </div>
        <div className="dep-stat-item shim">
          <span className="stat-num">{summary.shimAvailable}</span>
          <span className="stat-lbl">Shim Available</span>
        </div>
        <div className="dep-stat-item refactor">
          <span className="stat-num">{summary.refactorRequired}</span>
          <span className="stat-lbl">Refactor Required</span>
        </div>
        <div className="dep-stat-item incompatible">
          <span className="stat-num">{summary.incompatible}</span>
          <span className="stat-lbl">Incompatible</span>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="dep-filter-row">
        <div className="dep-tabs-group">
          <button
            type="button"
            className={`dep-tab-btn ${filter === "all" ? "is-active" : ""}`}
            onClick={() => setFilter("all")}
          >
            All Packages ({summary.total})
          </button>
          <button
            type="button"
            className={`dep-tab-btn ${filter === "action" ? "is-active" : ""}`}
            onClick={() => setFilter("action")}
          >
            Action Needed ({actionRequiredCount})
          </button>
          <button
            type="button"
            className={`dep-tab-btn ${filter === "drop-in" ? "is-active" : ""}`}
            onClick={() => setFilter("drop-in")}
          >
            Drop-in ({summary.dropIn})
          </button>
          <button
            type="button"
            className={`dep-tab-btn ${filter === "browser-apis" ? "is-active" : ""}`}
            onClick={() => setFilter("browser-apis")}
          >
            Browser APIs ({browserApis.length})
          </button>
        </div>

        {installShims.length > 0 && (
          <button
            type="button"
            className="dep-copy-shims-btn"
            onClick={handleCopyShims}
            title="Copy install command for recommended compatibility shims"
          >
            {copiedShim ? "✓ Shims Copied!" : `Copy npm install (${installShims.length} shims)`}
          </button>
        )}
      </div>

      {/* Package List or Browser APIs View */}
      {filter !== "browser-apis" ? (
        <div className="dep-table-container">
          {filteredDependencies.length === 0 ? (
            <div className="dep-empty-state">
              No dependencies match the selected filter.
            </div>
          ) : (
            <div className="dep-cards-list">
              {filteredDependencies.map((dep) => {
                const isExpanded = expandedPackage === dep.name;
                return (
                  <div key={dep.name} className={`dep-card-item ${dep.status}`}>
                    <div className="dep-card-main">
                      <div className="dep-info-col">
                        <div className="dep-name-row">
                          <code className="dep-pkg-name">{dep.name}</code>
                          {dep.version && <span className="dep-ver-pill">{dep.version}</span>}
                          {getStatusBadge(dep.status)}
                        </div>
                        <p className="dep-reason-text">{dep.reason}</p>
                      </div>

                      <div className="dep-action-col">
                        <div className="dep-target-replacement">
                          <span className="repl-lbl">Recommended Target Replacement:</span>
                          <span className="repl-val">
                            <code>{dep.replacement}</code>
                          </span>
                        </div>
                        {dep.codemodGuide && (
                          <button
                            type="button"
                            className="dep-guide-toggle-btn"
                            onClick={() =>
                              setExpandedPackage(isExpanded ? null : dep.name)
                            }
                          >
                            {isExpanded ? "Hide Codemod Recipe ▲" : "View Codemod Recipe ▼"}
                          </button>
                        )}
                      </div>
                    </div>

                    {isExpanded && dep.codemodGuide && (
                      <div className="dep-codemod-guide">
                        <div className="guide-header">
                          <strong>Codemod Transformation: {dep.codemodGuide.title}</strong>
                        </div>
                        <div className="guide-diff-grid">
                          <div className="guide-pane before">
                            <span className="pane-lbl">SOURCE ({dep.name})</span>
                            <pre className="code-block">
                              <code>{dep.codemodGuide.before}</code>
                            </pre>
                          </div>
                          <div className="guide-pane after">
                            <span className="pane-lbl">TARGET ({isExpo ? "Expo Mobile" : "Next.js"})</span>
                            <pre className="code-block">
                              <code>{dep.codemodGuide.after}</code>
                            </pre>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* Browser APIs Detected View */
        <div className="dep-apis-container">
          {browserApis.length === 0 ? (
            <div className="dep-empty-state">
              ✓ Zero unhandled browser globals detected. Codebase uses clean React component abstractions.
            </div>
          ) : (
            <div className="dep-apis-list">
              {browserApis.map((api) => (
                <div key={api.api} className="dep-api-card">
                  <div className="api-card-top">
                    <div className="api-name-badge">
                      <code>{api.api}</code>
                      <span className="api-count-badge">
                        {api.occurrences} occurrence{api.occurrences === 1 ? "" : "s"} across {api.files.length} file{api.files.length === 1 ? "" : "s"}
                      </span>
                    </div>
                    {api.shimPackage && (
                      <span className="api-shim-badge">
                        Recommended Shim: <code>{api.shimPackage}</code>
                      </span>
                    )}
                  </div>
                  <p className="api-rec-text">{api.recommendation}</p>
                  <div className="api-files-list">
                    <span className="files-lbl">Detected in:</span>
                    {api.files.map((file) => (
                      <code key={file} className="api-file-pill">
                        {file}
                      </code>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
