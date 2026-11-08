"use client";

import { useState, useMemo } from "react";
import type { ZipEntry } from "@/lib/migration/zip";
import { computeLineDiff, type DiffSummary } from "@/lib/diff/line-diff";

interface SourceManifest {
  framework: string;
  sourceType: string;
  files: Array<{ path: string; content: string }>;
  mappings: Array<{ route: string; sourcePath: string; targetPath: string }>;
}

interface CodeInspectorViewProps {
  entries: ZipEntry[];
  targetName: string;
  onDownloadZip?: () => void;
}

type ViewMode = "code" | "split" | "unified";

export function CodeInspectorView({ entries, targetName, onDownloadZip }: CodeInspectorViewProps) {
  // Extract source manifest and filter out internal .codemorph files from tree
  const { visibleEntries, sourceManifest } = useMemo(() => {
    let manifest: SourceManifest | null = null;
    const filtered: ZipEntry[] = [];
    for (const entry of entries) {
      if (entry.path === ".codemorph/source-manifest.json") {
        try {
          manifest = JSON.parse(entry.content) as SourceManifest;
        } catch {
          // Ignore parse errors gracefully
        }
      } else if (!entry.path.startsWith(".codemorph/")) {
        filtered.push(entry);
      }
    }
    return { visibleEntries: filtered, sourceManifest: manifest };
  }, [entries]);

  const [selectedPath, setSelectedPath] = useState<string>(() => {
    const preferred = visibleEntries.find((e) => e.path === "app/page.tsx" || e.path === "app/index.tsx");
    return preferred ? preferred.path : visibleEntries[0]?.path ?? "";
  });

  const [searchQuery, setSearchQuery] = useState("");
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("split");
  const [overrideSourcePath, setOverrideSourcePath] = useState<string>("");

  const filteredEntries = useMemo(() => {
    if (!searchQuery.trim()) return visibleEntries;
    const q = searchQuery.toLowerCase();
    return visibleEntries.filter((e) => e.path.toLowerCase().includes(q));
  }, [visibleEntries, searchQuery]);

  const selectedEntry = useMemo(() => {
    return visibleEntries.find((e) => e.path === selectedPath) ?? visibleEntries[0] ?? null;
  }, [visibleEntries, selectedPath]);

  // Determine paired source path
  const matchedSourcePath = useMemo(() => {
    if (overrideSourcePath) return overrideSourcePath;
    if (!sourceManifest || !selectedEntry) return "";

    // 1. Exact mapping from canonical plan
    const match = sourceManifest.mappings.find((m) => m.targetPath === selectedEntry.path);
    if (match && match.sourcePath) return match.sourcePath;

    // 2. Same file name match (e.g. package.json, README.md)
    const sameName = sourceManifest.files.find((f) => f.path === selectedEntry.path);
    if (sameName) return sameName.path;

    // 3. Root route fallback (App.tsx / main.tsx / index.html)
    if (selectedEntry.path === "app/page.tsx" || selectedEntry.path === "app/index.tsx") {
      const appFile = sourceManifest.files.find((f) => /App\.(tsx|jsx|js|ts)$/i.test(f.path));
      if (appFile) return appFile.path;
      const indexHtml = sourceManifest.files.find((f) => f.path === "index.html");
      if (indexHtml) return indexHtml.path;
    }

    return "";
  }, [overrideSourcePath, sourceManifest, selectedEntry]);

  const sourceFileEntry = useMemo(() => {
    if (!sourceManifest || !matchedSourcePath) return null;
    return sourceManifest.files.find((f) => f.path === matchedSourcePath) ?? null;
  }, [sourceManifest, matchedSourcePath]);

  // Compute Diff
  const diffSummary: DiffSummary | null = useMemo(() => {
    if (!selectedEntry) return null;
    const oldText = sourceFileEntry ? sourceFileEntry.content : "";
    return computeLineDiff(oldText, selectedEntry.content);
  }, [selectedEntry, sourceFileEntry]);

  const lines = useMemo(() => {
    if (!selectedEntry) return [];
    return selectedEntry.content.split("\n");
  }, [selectedEntry]);

  const handleCopy = async () => {
    if (!selectedEntry) return;
    try {
      await navigator.clipboard.writeText(selectedEntry.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handleDownloadSingleFile = () => {
    if (!selectedEntry) return;
    const blob = new Blob([selectedEntry.content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = selectedEntry.path.split("/").pop() || "download";
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  function getFileCategory(path: string): { label: string; badgeClass: string } {
    if (
      path.startsWith("app/") &&
      (path.endsWith("/page.tsx") || path === "app/page.tsx" || path === "app/index.tsx")
    ) {
      return { label: "Route Screen", badgeClass: "badge-route" };
    }
    if (
      path.endsWith(".json") ||
      path.endsWith(".config.ts") ||
      path.endsWith(".config.js") ||
      path === "app/_layout.tsx" ||
      path === "app/layout.tsx"
    ) {
      return { label: "Config & Scaffold", badgeClass: "badge-scaffold" };
    }
    if (path.endsWith(".md")) {
      return { label: "Report & Docs", badgeClass: "badge-doc" };
    }
    return { label: "Component", badgeClass: "badge-component" };
  }

  return (
    <div className="inspector-container">
      <div className="inspector-header">
        <div className="inspector-title-row">
          <span className="step-badge success">INSPECTOR</span>
          <div>
            <h3 className="inspector-title">Generated Project Artifacts &amp; Code Inspector</h3>
            <p className="inspector-subtitle">
              Inspect synthesized {targetName} files, route mappings, and scaffolds before downloading.
            </p>
          </div>
        </div>
        {onDownloadZip && (
          <button type="button" className="action-btn primary inspector-dl-btn" onClick={onDownloadZip}>
            Download Full Project ZIP ➔
          </button>
        )}
      </div>

      <div className="inspector-workspace-grid">
        {/* SIDEBAR: File Tree */}
        <aside className="inspector-sidebar">
          <div className="file-search-wrap">
            <input
              type="text"
              placeholder="Search files (e.g. page.tsx)..."
              className="file-search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="inspector-file-list" role="list">
            {filteredEntries.map((entry) => {
              const isSelected = entry.path === selectedEntry?.path;
              const cat = getFileCategory(entry.path);
              const lineCount = entry.content.split("\n").length;
              const byteSize = new TextEncoder().encode(entry.content).length;

              return (
                <button
                  type="button"
                  key={entry.path}
                  className={`file-item-btn ${isSelected ? "is-active" : ""}`}
                  onClick={() => {
                    setSelectedPath(entry.path);
                    setOverrideSourcePath("");
                  }}
                  role="listitem"
                >
                  <div className="file-item-top">
                    <span className="file-name">
                      <code>{entry.path}</code>
                    </span>
                  </div>
                  <div className="file-item-bottom">
                    <span className={`file-badge ${cat.badgeClass}`}>{cat.label}</span>
                    <span className="file-meta">
                      {lineCount} lines · {(byteSize / 1024).toFixed(1)} KB
                    </span>
                  </div>
                </button>
              );
            })}
            {filteredEntries.length === 0 && (
              <div className="empty-files-msg">No files matched &quot;{searchQuery}&quot;</div>
            )}
          </div>
        </aside>

        {/* MAIN: Code & Diff Viewer */}
        <main className="inspector-code-pane">
          {selectedEntry ? (
            <>
              {/* Toolbar */}
              <div className="code-pane-toolbar">
                <div className="code-file-info">
                  <span className="code-file-icon">📄</span>
                  <span className="code-file-path">{selectedEntry.path}</span>
                  <span className="code-file-badge">{getFileCategory(selectedEntry.path).label}</span>
                </div>

                {/* View Mode Toggle: Code vs Side-by-Side vs Unified */}
                <div className="diff-mode-toggle-group" role="group" aria-label="View Mode">
                  <button
                    type="button"
                    className={`diff-toggle-btn ${viewMode === "code" ? "is-active" : ""}`}
                    onClick={() => setViewMode("code")}
                  >
                    Code
                  </button>
                  <button
                    type="button"
                    className={`diff-toggle-btn ${viewMode === "split" ? "is-active" : ""}`}
                    onClick={() => setViewMode("split")}
                  >
                    Side-by-Side Diff
                  </button>
                  <button
                    type="button"
                    className={`diff-toggle-btn ${viewMode === "unified" ? "is-active" : ""}`}
                    onClick={() => setViewMode("unified")}
                  >
                    Unified Diff
                  </button>
                </div>

                <div className="code-pane-actions">
                  <button type="button" className="code-tool-btn" onClick={handleCopy}>
                    {copied ? "✓ Copied" : "Copy Code"}
                  </button>
                  <button type="button" className="code-tool-btn" onClick={handleDownloadSingleFile}>
                    Download File
                  </button>
                </div>
              </div>

              {/* Transformation Ancestor Banner (When Diff mode is active) */}
              {viewMode !== "code" && (
                <div className="diff-ancestor-banner">
                  <div className="ancestor-info-col">
                    <span className="ancestor-label">TRANSFORMATION ANCESTOR:</span>
                    {sourceFileEntry ? (
                      <span className="ancestor-path">
                        <code>{sourceFileEntry.path}</code> ➔ <code>{selectedEntry.path}</code>
                      </span>
                    ) : (
                      <span className="ancestor-path new-file">
                        Newly synthesized target scaffold (No legacy ancestor)
                      </span>
                    )}
                  </div>

                  {/* Diff Stats Pill */}
                  {diffSummary && (
                    <div className="diff-stats-pill">
                      <span className="stat-add">+{diffSummary.additions}</span>
                      <span className="stat-del">-{diffSummary.deletions}</span>
                      <span className="stat-status">
                        {diffSummary.isExactMatch
                          ? "IDENTICAL"
                          : sourceFileEntry
                          ? `${diffSummary.changes} CHANGES`
                          : "NEW FILE"}
                      </span>
                    </div>
                  )}

                  {/* Custom Source Compare Selector */}
                  {sourceManifest && sourceManifest.files.length > 0 && (
                    <div className="source-compare-picker">
                      <label htmlFor="source-compare-select" className="picker-lbl">
                        Compare with:
                      </label>
                      <select
                        id="source-compare-select"
                        className="picker-select"
                        value={matchedSourcePath}
                        onChange={(e) => setOverrideSourcePath(e.target.value)}
                      >
                        <option value="">(None - Treat as New File)</option>
                        {sourceManifest.files.map((sf) => (
                          <option key={sf.path} value={sf.path}>
                            {sf.path}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}

              {/* VIEWPORT: Code or Diff */}
              <div className="code-viewer-viewport">
                {viewMode === "code" && (
                  <table className="code-table">
                    <tbody>
                      {lines.map((line, idx) => (
                        <tr key={idx} className="code-line-row">
                          <td className="line-num">{idx + 1}</td>
                          <td className="line-code">
                            <code>{line || " "}</code>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {viewMode === "split" && diffSummary && (
                  <div className="split-diff-wrapper">
                    <div className="split-diff-header">
                      <div className="split-header-col left">
                        <span>Source: {sourceFileEntry ? sourceFileEntry.path : "(No Source File)"}</span>
                      </div>
                      <div className="split-header-col right">
                        <span>Target: {selectedEntry.path}</span>
                      </div>
                    </div>
                    <table className="split-diff-table">
                      <tbody>
                        {diffSummary.split.map((row, idx) => {
                          const leftCell = row.left;
                          const rightCell = row.right;
                          const leftClass = leftCell ? `cell-${leftCell.type}` : "cell-empty";
                          const rightClass = rightCell ? `cell-${rightCell.type}` : "cell-empty";

                          return (
                            <tr key={idx} className="split-row">
                              {/* Left / Source */}
                              <td className={`line-num ${leftClass}`}>{leftCell ? leftCell.number : ""}</td>
                              <td className={`line-code ${leftClass}`}>
                                <code>{leftCell ? leftCell.text || " " : " "}</code>
                              </td>

                              {/* Right / Target */}
                              <td className={`line-num ${rightClass}`}>{rightCell ? rightCell.number : ""}</td>
                              <td className={`line-code ${rightClass}`}>
                                <code>{rightCell ? rightCell.text || " " : " "}</code>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {viewMode === "unified" && diffSummary && (
                  <table className="unified-diff-table">
                    <tbody>
                      {diffSummary.unified.map((line, idx) => {
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
                )}
              </div>
            </>
          ) : (
            <div className="empty-selection-msg">Select a file from the explorer to view contents.</div>
          )}
        </main>
      </div>
    </div>
  );
}
