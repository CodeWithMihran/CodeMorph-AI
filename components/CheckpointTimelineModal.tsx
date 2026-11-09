"use client";

import React, { useState, useMemo } from "react";
import { createZip } from "@/lib/migration/zip";
import { computeLineDiff } from "@/lib/diff/line-diff";
import {
  type Checkpoint,
  type CheckpointHistory,
  type CheckpointTrigger,
  compareCheckpoints,
} from "@/lib/history/checkpoint-manager";

interface CheckpointTimelineModalProps {
  isOpen: boolean;
  onClose: () => void;
  history: CheckpointHistory;
  onRestoreCheckpoint: (checkpointId: string) => void;
}

function getTriggerBadge(trigger: CheckpointTrigger): { label: string; icon: string; className: string } {
  switch (trigger) {
    case "initial_generation":
      return { label: "Initial Baseline", icon: "🤖", className: "badge-baseline" };
    case "codemod":
      return { label: "AST Codemod", icon: "⚡", className: "badge-codemod" };
    case "manual_edit":
      return { label: "Manual Hot-Patch", icon: "✏️", className: "badge-edit" };
    case "scaffold":
      return { label: "Scaffold Config", icon: "🛠️", className: "badge-scaffold" };
    case "test_scaffold":
      return { label: "Test Suite", icon: "🧪", className: "badge-test" };
    case "procedural_rules":
      return { label: "Procedural Rules", icon: "⚡", className: "badge-codemod" };
    case "rollback":
      return { label: "Revert / Rollback", icon: "⏪", className: "badge-rollback" };
    default:
      return { label: "Snapshot", icon: "📌", className: "badge-default" };
  }
}

function formatTime(isoStr: string): string {
  try {
    const d = new Date(isoStr);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return isoStr;
  }
}

export function CheckpointTimelineModal({
  isOpen,
  onClose,
  history,
  onRestoreCheckpoint,
}: CheckpointTimelineModalProps) {
  const [comparingCheckpointId, setComparingCheckpointId] = useState<string | null>(null);
  const [selectedDiffPath, setSelectedDiffPath] = useState<string | null>(null);

  const activeCheckpoint = useMemo(() => {
    return (
      history.checkpoints.find((c) => c.id === history.currentCheckpointId) ||
      history.checkpoints[history.checkpoints.length - 1]
    );
  }, [history]);

  // Display newest checkpoints at the top of the timeline
  const reversedCheckpoints = useMemo(() => {
    return [...history.checkpoints].reverse();
  }, [history.checkpoints]);

  const comparison = useMemo(() => {
    if (!comparingCheckpointId || !activeCheckpoint) return null;
    const target = history.checkpoints.find((c) => c.id === comparingCheckpointId);
    if (!target) return null;
    return {
      target,
      diff: compareCheckpoints(target, activeCheckpoint),
    };
  }, [comparingCheckpointId, activeCheckpoint, history.checkpoints]);

  const activeFileDiff = useMemo(() => {
    if (!comparison || !selectedDiffPath) return null;
    const targetEntry = comparison.target.entries.find((e) => e.path === selectedDiffPath);
    const activeEntry = activeCheckpoint?.entries.find((e) => e.path === selectedDiffPath);

    const oldText = targetEntry ? targetEntry.content : "";
    const newText = activeEntry ? activeEntry.content : "";

    return computeLineDiff(oldText, newText);
  }, [comparison, selectedDiffPath, activeCheckpoint]);

  const handleDownloadSnapshot = (checkpoint: Checkpoint) => {
    const zipBuffer = createZip(checkpoint.entries);
    const blob = new Blob([new Uint8Array(zipBuffer)], { type: "application/zip" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `codemorph-snapshot-${checkpoint.id}.zip`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="checkpoint-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Modal Header */}
        <div className="checkpoint-header">
          <div className="checkpoint-header-left">
            <span className="checkpoint-header-icon">🕒</span>
            <div>
              <h3 className="checkpoint-modal-title">Revision History &amp; Time-Machine</h3>
              <p className="checkpoint-modal-subtitle">
                Immutable snapshot journal of all migrations, AST codemods, hot-patches, and scaffold changes.
              </p>
            </div>
          </div>
          <div className="checkpoint-header-right">
            <span className="checkpoint-count-pill">
              {history.checkpoints.length} / {history.maxCheckpoints} Snapshots
            </span>
            <button
              type="button"
              className="checkpoint-close-btn"
              onClick={onClose}
              aria-label="Close time machine"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Modal Body / Timeline */}
        <div className="checkpoint-body">
          {comparison ? (
            /* Comparison Subview */
            <div className="checkpoint-diff-view">
              <div className="checkpoint-diff-topbar">
                <button
                  type="button"
                  className="diff-back-btn"
                  onClick={() => {
                    setComparingCheckpointId(null);
                    setSelectedDiffPath(null);
                  }}
                >
                  ← Back to Timeline
                </button>
                <div className="diff-header-summary">
                  Comparing <strong>{comparison.target.label}</strong> vs <strong>Current State</strong>
                  <span className="diff-stats-tag add">+{comparison.diff.totalAdditions}</span>
                  <span className="diff-stats-tag del">-{comparison.diff.totalDeletions}</span>
                  <span className="diff-stats-tag mod">{comparison.diff.filesModifiedCount} files changed</span>
                </div>
              </div>

              <div className="checkpoint-diff-layout">
                {/* File List */}
                <div className="checkpoint-diff-files">
                  <div className="diff-files-header">Modified Files</div>
                  <div className="diff-files-list">
                    {comparison.diff.fileDiffs
                      .filter((f) => f.status !== "unchanged")
                      .map((f) => (
                        <button
                          key={f.path}
                          type="button"
                          className={`diff-file-item ${selectedDiffPath === f.path ? "is-selected" : ""}`}
                          onClick={() => setSelectedDiffPath(f.path)}
                        >
                          <span className={`file-status-dot ${f.status}`} />
                          <span className="diff-file-path" title={f.path}>
                            {f.path}
                          </span>
                          <span className="file-diff-numbers">
                            +{f.additions} -{f.deletions}
                          </span>
                        </button>
                      ))}
                    {comparison.diff.filesModifiedCount === 0 && (
                      <div className="diff-empty-notice">
                        No changes detected between this snapshot and current state.
                      </div>
                    )}
                  </div>
                </div>

                {/* Diff Viewer */}
                <div className="checkpoint-diff-content">
                  {selectedDiffPath && activeFileDiff ? (
                    <div className="diff-viewer-table-wrap">
                      <div className="diff-content-filename">{selectedDiffPath}</div>
                      <table className="unified-diff-table">
                        <tbody>
                          {activeFileDiff.unified.map((line, idx) => {
                            const lineClass = `line-${line.type}`;
                            const prefix = line.type === "added" ? "+" : line.type === "removed" ? "-" : " ";
                            return (
                              <tr key={idx} className={`unified-row ${lineClass}`}>
                                <td className="line-num old-num">{line.oldLineNumber ?? ""}</td>
                                <td className="line-num new-num">{line.newLineNumber ?? ""}</td>
                                <td className="diff-sign">
                                  <code>{prefix}</code>
                                </td>
                                <td className="line-code">
                                  <code>{line.text || " "}</code>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="diff-placeholder">
                      Select a file from the list to view the line-by-line diff.
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* Timeline List */
            <div className="checkpoint-timeline">
              {reversedCheckpoints.map((cp, idx) => {
                const isActive = cp.id === history.currentCheckpointId;
                const badge = getTriggerBadge(cp.triggerType);

                return (
                  <div
                    key={cp.id}
                    className={`timeline-item ${isActive ? "is-active" : ""}`}
                  >
                    {/* Visual Connector Spine */}
                    <div className="timeline-spine">
                      <div className={`timeline-dot ${badge.className}`}>
                        {badge.icon}
                      </div>
                      {idx !== reversedCheckpoints.length - 1 && <div className="timeline-line" />}
                    </div>

                    {/* Checkpoint Card */}
                    <div className="timeline-card">
                      <div className="timeline-card-header">
                        <div className="timeline-header-meta">
                          <span className={`checkpoint-trigger-badge ${badge.className}`}>
                            {badge.label}
                          </span>
                          <span className="checkpoint-time">{formatTime(cp.timestamp)}</span>
                          {isActive && (
                            <span className="active-tag-pill">CURRENT ACTIVE</span>
                          )}
                        </div>

                        <div className="timeline-card-actions">
                          <button
                            type="button"
                            className="checkpoint-action-btn compare"
                            onClick={() => {
                              setComparingCheckpointId(cp.id);
                              const firstMod = cp.meta.modifiedFiles[0] || null;
                              setSelectedDiffPath(firstMod);
                            }}
                            title="Compare this snapshot against current workbench state"
                          >
                            🔍 Compare
                          </button>
                          <button
                            type="button"
                            className="checkpoint-action-btn download"
                            onClick={() => handleDownloadSnapshot(cp)}
                            title="Download ZIP archive of this snapshot"
                          >
                            💾 ZIP
                          </button>
                          {!isActive && (
                            <button
                              type="button"
                              className="checkpoint-action-btn restore"
                              onClick={() => {
                                if (
                                  window.confirm(
                                    `Rollback workbench files to "${cp.label}"? Any uncommitted drafts will be overwritten.`
                                  )
                                ) {
                                  onRestoreCheckpoint(cp.id);
                                  onClose();
                                }
                              }}
                              title="Restore workbench files to this snapshot"
                            >
                              ⏪ Restore
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="timeline-card-title">{cp.label}</div>

                      <div className="timeline-card-stats">
                        <span className="cp-stat-item">
                          📁 <strong>{cp.meta.fileCount}</strong> files
                        </span>
                        {cp.meta.totalAdditions > 0 && (
                          <span className="cp-stat-item add">
                            +{cp.meta.totalAdditions} lines
                          </span>
                        )}
                        {cp.meta.totalDeletions > 0 && (
                          <span className="cp-stat-item del">
                            -{cp.meta.totalDeletions} lines
                          </span>
                        )}
                        {cp.meta.modifiedFiles.length > 0 && (
                          <span className="cp-stat-item mod">
                            ✏️ {cp.meta.modifiedFiles.length} touched
                          </span>
                        )}
                      </div>

                      {cp.meta.modifiedFiles.length > 0 && (
                        <div className="timeline-files-preview">
                          {cp.meta.modifiedFiles.slice(0, 4).map((f) => (
                            <span key={f} className="timeline-file-pill" title={f}>
                              {f}
                            </span>
                          ))}
                          {cp.meta.modifiedFiles.length > 4 && (
                            <span className="timeline-file-more">
                              +{cp.meta.modifiedFiles.length - 4} more
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
