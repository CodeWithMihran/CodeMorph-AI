"use client";

import React, { useState, useMemo } from "react";
import type { ZipEntry } from "@/lib/migration/zip";
import {
  generateGitPatch,
  type GitPatchSummary,
} from "@/lib/git/patch-generator";

interface GitExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetName: string;
  sourceFiles: Array<{ path: string; content: string }>;
  targetEntries: ZipEntry[];
  testPassRate?: number;
}

type GitExportTab = "patch" | "cli" | "pr";

export function GitExportModal({
  isOpen,
  onClose,
  targetName,
  sourceFiles,
  targetEntries,
  testPassRate = 100,
}: GitExportModalProps) {
  const [activeTab, setActiveTab] = useState<GitExportTab>("patch");
  const [copiedTab, setCopiedTab] = useState<string | null>(null);
  const [branchName, setBranchName] = useState("codemorph/modernize-architecture");

  const summary: GitPatchSummary = useMemo(() => {
    return generateGitPatch(sourceFiles, targetEntries, {
      branchName,
      targetFramework: targetName,
      testPassRate,
    });
  }, [sourceFiles, targetEntries, branchName, targetName, testPassRate]);

  const handleCopy = async (text: string, tabKey: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedTab(tabKey);
      setTimeout(() => setCopiedTab(null), 2000);
    } catch {
      // Fallback
    }
  };

  const handleDownloadPatch = () => {
    const blob = new Blob([summary.patchText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "codemorph-migration.patch";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  return (
    <div className="git-modal-backdrop" onClick={onClose}>
      <div className="git-modal-window" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="git-modal-header">
          <div className="git-title-col">
            <div className="git-title-row">
              <span className="git-icon">📦</span>
              <h3>Git Patch &amp; Pull Request Export Integrator</h3>
            </div>
            <p className="git-subtitle">
              Export standard unified Git patches, executable branch commands, and executive GitHub PR
              descriptions directly from your modernized workbench.
            </p>
          </div>

          <div className="git-header-actions">
            <span className="git-meta-badge">
              +{summary.totalAdditions} / -{summary.totalDeletions} lines
            </span>
            <button type="button" className="close-btn" onClick={onClose} title="Close modal">
              ✕
            </button>
          </div>
        </div>

        {/* Branch Configuration Bar */}
        <div className="git-branch-bar">
          <label htmlFor="git-branch-input" className="branch-label">Target Branch:</label>
          <input
            id="git-branch-input"
            type="text"
            className="branch-input font-mono"
            value={branchName}
            onChange={(e) => setBranchName(e.target.value)}
            placeholder="codemorph/branch-name"
          />
          <div className="file-stats-pills">
            <span className="stat-pill add">+{summary.addedFiles.length} added</span>
            <span className="stat-pill mod">~{summary.modifiedFiles.length} modified</span>
            {summary.deletedFiles.length > 0 && (
              <span className="stat-pill del">-{summary.deletedFiles.length} deleted</span>
            )}
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="git-tabs-row">
          <button
            type="button"
            className={`git-tab-btn ${activeTab === "patch" ? "is-active" : ""}`}
            onClick={() => setActiveTab("patch")}
          >
            📄 Unified Git Patch (.patch)
          </button>
          <button
            type="button"
            className={`git-tab-btn ${activeTab === "cli" ? "is-active" : ""}`}
            onClick={() => setActiveTab("cli")}
          >
            💻 Terminal CLI Commands
          </button>
          <button
            type="button"
            className={`git-tab-btn ${activeTab === "pr" ? "is-active" : ""}`}
            onClick={() => setActiveTab("pr")}
          >
            🚀 GitHub PR Description (Markdown)
          </button>
        </div>

        {/* Tab Content Body */}
        <div className="git-modal-body">
          {activeTab === "patch" && (
            <div className="patch-content-wrap">
              <div className="content-toolbar">
                <span className="toolbar-info">
                  Standard unified format compatible with <code>git apply</code>
                </span>
                <div className="toolbar-actions">
                  <button
                    type="button"
                    className="action-pill-btn"
                    onClick={() => void handleCopy(summary.patchText, "patch")}
                  >
                    {copiedTab === "patch" ? "✓ Copied" : "📋 Copy Patch"}
                  </button>
                  <button
                    type="button"
                    className="action-pill-btn primary-pill"
                    onClick={handleDownloadPatch}
                  >
                    ⬇️ Download .patch
                  </button>
                </div>
              </div>
              <pre className="git-code-viewport font-mono">
                {summary.patchText.split("\n").map((line, idx) => {
                  let lineClass = "patch-line";
                  if (line.startsWith("+") && !line.startsWith("+++")) lineClass += " patch-add";
                  else if (line.startsWith("-") && !line.startsWith("---")) lineClass += " patch-del";
                  else if (line.startsWith("diff ") || line.startsWith("index ")) lineClass += " patch-header";
                  else if (line.startsWith("@@")) lineClass += " patch-hunk";

                  return (
                    <div key={idx} className={lineClass}>
                      {line || " "}
                    </div>
                  );
                })}
              </pre>
            </div>
          )}

          {activeTab === "cli" && (
            <div className="cli-content-wrap">
              <div className="content-toolbar">
                <span className="toolbar-info">
                  Execute these commands in your local repository root to apply modernizations:
                </span>
                <button
                  type="button"
                  className="action-pill-btn"
                  onClick={() => void handleCopy(summary.cliScript, "cli")}
                >
                  {copiedTab === "cli" ? "✓ Copied" : "📋 Copy Commands"}
                </button>
              </div>
              <pre className="git-code-viewport cli-viewport font-mono">
                <code>{summary.cliScript}</code>
              </pre>
            </div>
          )}

          {activeTab === "pr" && (
            <div className="pr-content-wrap">
              <div className="content-toolbar">
                <span className="toolbar-info">
                  Ready-to-paste executive GitHub Pull Request markdown description:
                </span>
                <button
                  type="button"
                  className="action-pill-btn"
                  onClick={() => void handleCopy(summary.prMarkdown, "pr")}
                >
                  {copiedTab === "pr" ? "✓ Copied" : "📋 Copy PR Markdown"}
                </button>
              </div>
              <pre className="git-code-viewport pr-viewport font-mono">
                <code>{summary.prMarkdown}</code>
              </pre>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="git-modal-footer">
          <div className="footer-left">
            <span>
              Target: <strong>{targetName}</strong> • Branch: <code>{branchName}</code>
            </span>
          </div>
          <div className="footer-right">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Close
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={handleDownloadPatch}
            >
              Download Patch (.patch) ➔
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
