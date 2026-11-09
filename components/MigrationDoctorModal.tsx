"use client";

import React, { useState, useMemo } from "react";
import type { ZipEntry } from "@/lib/migration/zip";
import {
  runMigrationDoctor,
  applyDoctorAutofix,
  type DoctorReport,
  type DoctorIssue,
  type DoctorCategory,
  type DoctorIssueSeverity,
} from "@/lib/doctor/health-doctor";

interface MigrationDoctorModalProps {
  isOpen: boolean;
  onClose: () => void;
  entries: ZipEntry[];
  targetName: string;
  onApplyAutofix: (updatedEntries: ZipEntry[], fixCount: number) => void;
  onSelectFile?: (filePath: string) => void;
}

export function MigrationDoctorModal({
  isOpen,
  onClose,
  entries,
  targetName,
  onApplyAutofix,
  onSelectFile,
}: MigrationDoctorModalProps) {
  const [severityFilter, setSeverityFilter] = useState<"all" | DoctorIssueSeverity | "fixable">("all");
  const [categoryFilter, setCategoryFilter] = useState<"all" | DoctorCategory>("all");
  const [autofixSuccessMsg, setAutofixSuccessMsg] = useState<string | null>(null);

  // Compute live diagnostic report
  const report: DoctorReport = useMemo(() => {
    return runMigrationDoctor(entries, targetName);
  }, [entries, targetName]);

  // Filter issues based on active filters
  const filteredIssues: DoctorIssue[] = useMemo(() => {
    return report.issues.filter((iss) => {
      if (categoryFilter !== "all" && iss.category !== categoryFilter) {
        return false;
      }
      if (severityFilter === "fixable") {
        return iss.canAutofix;
      }
      if (severityFilter !== "all" && iss.severity !== severityFilter) {
        return false;
      }
      return true;
    });
  }, [report.issues, categoryFilter, severityFilter]);

  const handleRunAutofixAll = () => {
    const result = applyDoctorAutofix(entries);
    if (result.appliedFixesCount > 0) {
      onApplyAutofix(result.updatedEntries, result.appliedFixesCount);
      setAutofixSuccessMsg(`Successfully auto-healed ${result.appliedFixesCount} issue(s)!`);
      setTimeout(() => setAutofixSuccessMsg(null), 3500);
    }
  };

  const handleRunAutofixSingle = (issue: DoctorIssue) => {
    const result = applyDoctorAutofix(entries, [issue]);
    if (result.appliedFixesCount > 0) {
      onApplyAutofix(result.updatedEntries, result.appliedFixesCount);
      setAutofixSuccessMsg(`Fixed ${issue.title} in ${issue.filePath}`);
      setTimeout(() => setAutofixSuccessMsg(null), 3500);
    }
  };

  if (!isOpen) return null;

  const gradeClass =
    report.grade === "A+" || report.grade === "A"
      ? "grade-green"
      : report.grade === "B"
      ? "grade-blue"
      : report.grade === "C"
      ? "grade-amber"
      : "grade-red";

  return (
    <div className="doctor-modal-backdrop" onClick={onClose}>
      <div className="doctor-modal-window" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="doctor-modal-header">
          <div className="doctor-title-col">
            <div className="doctor-title-row">
              <span className="doctor-icon">🩺</span>
              <h3>Migration Health Doctor &amp; Diagnostic Autofix</h3>
              <span className={`doctor-grade-badge ${gradeClass}`}>Grade {report.grade}</span>
              <span className="doctor-score-badge">{report.overallScore}/100</span>
            </div>
            <p className="doctor-subtitle">
              Real-time automated static inspection of directives, App Router conventions, dependency hygiene,
              navigation accessibility, and code quality.
            </p>
          </div>

          <div className="doctor-header-actions">
            <button type="button" className="close-btn" onClick={onClose} title="Close Doctor">
              ✕
            </button>
          </div>
        </div>

        {/* Success Alert Banner */}
        {autofixSuccessMsg && (
          <div className="doctor-success-banner">
            <span>✓ {autofixSuccessMsg}</span>
          </div>
        )}

        {/* Categories Scorecard Bar */}
        <div className="doctor-categories-bar">
          {report.categories.map((cat) => (
            <div
              key={cat.category}
              className={`category-score-card ${categoryFilter === cat.category ? "is-selected" : ""}`}
              onClick={() =>
                setCategoryFilter((prev) => (prev === cat.category ? "all" : cat.category))
              }
            >
              <div className="cat-card-header">
                <span className="cat-title">{cat.title}</span>
                <span className="cat-score">{cat.score}%</span>
              </div>
              <div className="cat-bar-wrap">
                <div
                  className="cat-bar-fill"
                  style={{
                    width: `${cat.score}%`,
                    backgroundColor:
                      cat.score >= 90 ? "#16a34a" : cat.score >= 70 ? "#0284c7" : cat.score >= 50 ? "#eab308" : "#dc2626",
                  }}
                />
              </div>
              <span className="cat-meta-text">
                {cat.totalIssues === 0 ? "✓ Pristine" : `${cat.totalIssues} issue(s)`}
              </span>
            </div>
          ))}
        </div>

        {/* Action & Filter Toolbar */}
        <div className="doctor-toolbar">
          <div className="toolbar-filter-group">
            <button
              type="button"
              className={`doc-filter-btn ${severityFilter === "all" ? "is-active" : ""}`}
              onClick={() => setSeverityFilter("all")}
            >
              All ({report.issues.length})
            </button>
            <button
              type="button"
              className={`doc-filter-btn crit-btn ${severityFilter === "critical" ? "is-active" : ""}`}
              onClick={() => setSeverityFilter("critical")}
            >
              Critical ({report.criticalCount})
            </button>
            <button
              type="button"
              className={`doc-filter-btn warn-btn ${severityFilter === "warning" ? "is-active" : ""}`}
              onClick={() => setSeverityFilter("warning")}
            >
              Warnings ({report.warningCount})
            </button>
            <button
              type="button"
              className={`doc-filter-btn fix-btn ${severityFilter === "fixable" ? "is-active" : ""}`}
              onClick={() => setSeverityFilter("fixable")}
            >
              ⚡ Fixable ({report.totalFixable})
            </button>
          </div>

          <div className="toolbar-action-group">
            {report.totalFixable > 0 && (
              <button
                type="button"
                className="doctor-autofix-all-btn"
                onClick={handleRunAutofixAll}
                title="Automatically fix all eligible directive and syntax issues"
              >
                ⚡ Run Automated Autofix ({report.totalFixable})
              </button>
            )}
          </div>
        </div>

        {/* Issues List Body */}
        <div className="doctor-modal-body">
          {filteredIssues.length === 0 ? (
            <div className="doctor-empty-state">
              <span className="empty-icon">🎉</span>
              <h4>Codebase is in Pristine Health!</h4>
              <p>
                No issues detected matching current filters. All directives, routing conventions,
                accessibility attributes, and code hygiene rules comply with {targetName} best practices.
              </p>
            </div>
          ) : (
            <div className="doctor-issues-list">
              {filteredIssues.map((issue) => (
                <div key={issue.id} className={`doctor-issue-card severity-${issue.severity}`}>
                  <div className="issue-card-header">
                    <div className="issue-badge-row">
                      <span className={`issue-severity-badge badge-${issue.severity}`}>
                        {issue.severity.toUpperCase()}
                      </span>
                      <span className="issue-category-tag">{issue.category}</span>
                      {issue.canAutofix && <span className="issue-autofix-tag">⚡ 1-Click Fixable</span>}
                    </div>

                    <div className="issue-path-wrap">
                      <button
                        type="button"
                        className="issue-file-link"
                        onClick={() => {
                          if (onSelectFile) onSelectFile(issue.filePath);
                          onClose();
                        }}
                        title="Click to open file in code editor"
                      >
                        📄 {issue.filePath}
                        {issue.line !== undefined && `:${issue.line}`}
                      </button>
                    </div>
                  </div>

                  <h5 className="issue-title">{issue.title}</h5>
                  <p className="issue-desc">{issue.description}</p>

                  {issue.autofixDescription && (
                    <div className="issue-autofix-hint">
                      <strong>Fix:</strong> {issue.autofixDescription}
                    </div>
                  )}

                  {issue.canAutofix && (
                    <div className="issue-actions-row">
                      <button
                        type="button"
                        className="issue-fix-btn"
                        onClick={() => handleRunAutofixSingle(issue)}
                      >
                        ⚡ Apply Autofix
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="doctor-modal-footer">
          <div className="doctor-footer-left">
            <span>
              Target: <strong>{targetName}</strong> • {report.passedChecksCount} architectural check suites passed
            </span>
          </div>

          <div className="doctor-footer-right">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Close
            </button>
            {report.totalFixable > 0 && (
              <button
                type="button"
                className="btn-primary"
                onClick={handleRunAutofixAll}
              >
                Autofix All Issues ({report.totalFixable}) ➔
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
