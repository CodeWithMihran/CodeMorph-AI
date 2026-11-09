"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import type { ZipEntry } from "@/lib/migration/zip";
import {
  executeGlobalSearch,
  executeGlobalReplace,
  type GlobalSearchQuery,
  type GlobalSearchResult,
  type GlobalReplaceResult,
} from "@/lib/search/code-search";

interface CodeSearchDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  entries: ZipEntry[];
  onSelectMatch: (filePath: string, lineNumber: number) => void;
  onApplyReplace: (updatedEntries: ZipEntry[], summaryLabel: string) => void;
}

export function CodeSearchDrawer({
  isOpen,
  onClose,
  entries,
  onSelectMatch,
  onApplyReplace,
}: CodeSearchDrawerProps) {
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [showReplace, setShowReplace] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [isRegex, setIsRegex] = useState(false);
  const [fileFilter, setFileFilter] = useState("");
  const [collapsedFiles, setCollapsedFiles] = useState<Set<string>>(new Set());
  const [replacePreviewModalOpen, setReplacePreviewModalOpen] = useState(false);
  const [pendingReplaceResult, setPendingReplaceResult] = useState<GlobalReplaceResult | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Focus search input when drawer opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }, 50);
    }
  }, [isOpen]);

  const searchQuery: GlobalSearchQuery = useMemo(() => {
    return {
      query,
      caseSensitive,
      wholeWord,
      isRegex,
      fileFilter: fileFilter.trim() || undefined,
    };
  }, [query, caseSensitive, wholeWord, isRegex, fileFilter]);

  // Execute search
  const searchResult: GlobalSearchResult = useMemo(() => {
    return executeGlobalSearch(entries, searchQuery);
  }, [entries, searchQuery]);

  // Toggle file collapse
  const toggleFileCollapse = (filePath: string) => {
    setCollapsedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(filePath)) next.delete(filePath);
      else next.add(filePath);
      return next;
    });
  };

  const collapseAll = () => {
    setCollapsedFiles(new Set(searchResult.fileResults.map((r) => r.filePath)));
  };

  const expandAll = () => {
    setCollapsedFiles(new Set());
  };

  // Prepare replace preview
  const handleInitiateReplace = () => {
    if (!query) return;
    const result = executeGlobalReplace(entries, searchQuery, replacement);
    setPendingReplaceResult(result);
    setReplacePreviewModalOpen(true);
  };

  // Confirm replace
  const handleConfirmReplace = () => {
    if (!pendingReplaceResult) return;
    const summaryLabel = `Global Replace: "${query}" -> "${replacement}" (${pendingReplaceResult.totalReplacedCount} matches across ${pendingReplaceResult.affectedFilesCount} files)`;
    onApplyReplace(pendingReplaceResult.updatedEntries, summaryLabel);
    setReplacePreviewModalOpen(false);
    setPendingReplaceResult(null);
  };

  if (!isOpen) return null;

  return (
    <div className="search-drawer-backdrop" onClick={onClose}>
      <aside className="search-drawer-window" onClick={(e) => e.stopPropagation()}>
        {/* Drawer Header */}
        <div className="search-drawer-header">
          <div className="drawer-title-row">
            <span className="search-glyph">🔍</span>
            <span className="drawer-title">Search &amp; Refactor in Project</span>
            <span className="drawer-shortcut-hint">Ctrl+Shift+F</span>
          </div>
          <button type="button" className="drawer-close-btn" onClick={onClose} title="Close search drawer">
            ✕
          </button>
        </div>

        {/* Search Inputs & Filter Controls */}
        <div className="search-controls-pane">
          <div className="search-input-wrapper">
            <input
              ref={searchInputRef}
              type="text"
              className="search-main-input font-mono"
              placeholder="Search code across all files..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") onClose();
              }}
            />
            {query && (
              <button
                type="button"
                className="clear-query-btn"
                onClick={() => setQuery("")}
                title="Clear query"
              >
                ✕
              </button>
            )}

            {/* Match Toggles */}
            <div className="search-toggle-options">
              <button
                type="button"
                className={`toggle-option-btn ${caseSensitive ? "is-active" : ""}`}
                onClick={() => setCaseSensitive((v) => !v)}
                title="Match Case (Alt+C)"
              >
                Aa
              </button>
              <button
                type="button"
                className={`toggle-option-btn ${wholeWord ? "is-active" : ""}`}
                onClick={() => setWholeWord((v) => !v)}
                title="Match Whole Word (Alt+W)"
              >
                \b
              </button>
              <button
                type="button"
                className={`toggle-option-btn ${isRegex ? "is-active" : ""}`}
                onClick={() => setIsRegex((v) => !v)}
                title="Use Regular Expression (Alt+R)"
              >
                .*
              </button>
              <button
                type="button"
                className={`toggle-option-btn ${showReplace ? "is-active" : ""}`}
                onClick={() => setShowReplace((v) => !v)}
                title="Toggle Replace Bar"
              >
                ⇄
              </button>
            </div>
          </div>

          {/* Expandable Replace Bar */}
          {showReplace && (
            <div className="replace-input-wrapper">
              <input
                type="text"
                className="search-main-input replace-input font-mono"
                placeholder="Replace with..."
                value={replacement}
                onChange={(e) => setReplacement(e.target.value)}
              />
              <button
                type="button"
                className="replace-all-btn"
                onClick={handleInitiateReplace}
                disabled={searchResult.totalMatches === 0}
                title="Replace all occurrences across project"
              >
                Replace All ({searchResult.totalMatches})
              </button>
            </div>
          )}

          {/* File Filter Input */}
          <div className="file-filter-row">
            <label className="file-filter-label">Filter:</label>
            <input
              type="text"
              className="file-filter-input font-mono"
              placeholder="e.g. *.tsx, app/**, !package.json"
              value={fileFilter}
              onChange={(e) => setFileFilter(e.target.value)}
            />
          </div>
        </div>

        {/* Search Results Summary Bar */}
        <div className="search-results-summary-bar">
          <div className="summary-text">
            {searchResult.errorMessage ? (
              <span className="search-error-text">⚠️ {searchResult.errorMessage}</span>
            ) : query ? (
              <span>
                <strong>{searchResult.totalMatches}</strong> match
                {searchResult.totalMatches === 1 ? "" : "es"} in{" "}
                <strong>{searchResult.totalFiles}</strong> file
                {searchResult.totalFiles === 1 ? "" : "s"} ({searchResult.searchTimeMs}ms)
              </span>
            ) : (
              <span className="placeholder-text">Type above to search code</span>
            )}
          </div>

          {searchResult.fileResults.length > 0 && (
            <div className="collapse-toggle-buttons">
              <button type="button" className="summary-action-btn" onClick={collapseAll}>
                Collapse All
              </button>
              <span>·</span>
              <button type="button" className="summary-action-btn" onClick={expandAll}>
                Expand All
              </button>
            </div>
          )}
        </div>

        {/* Grouped Search Results List */}
        <div className="search-results-body">
          {searchResult.fileResults.length === 0 ? (
            query && (
              <div className="search-empty-state">
                <span>No results found matching &quot;{query}&quot;</span>
              </div>
            )
          ) : (
            <div className="search-file-groups-list">
              {searchResult.fileResults.map((fileRes) => {
                const isCollapsed = collapsedFiles.has(fileRes.filePath);

                return (
                  <div key={fileRes.filePath} className="search-file-group">
                    {/* File Header */}
                    <div
                      className="search-file-header"
                      onClick={() => toggleFileCollapse(fileRes.filePath)}
                    >
                      <span className="file-collapse-arrow">{isCollapsed ? "▶" : "▼"}</span>
                      <span className="file-icon">📄</span>
                      <span className="file-group-path">{fileRes.filePath}</span>
                      <span className="file-match-badge">{fileRes.matchCount}</span>
                    </div>

                    {/* Matched Lines */}
                    {!isCollapsed && (
                      <div className="file-matches-list">
                        {fileRes.matches.map((match, mIdx) => {
                          const prefix = match.lineContent.slice(0, match.matchStart);
                          const highlight = match.lineContent.slice(match.matchStart, match.matchEnd);
                          const suffix = match.lineContent.slice(match.matchEnd);

                          return (
                            <div
                              key={mIdx}
                              className="search-match-row font-mono"
                              onClick={() => {
                                onSelectMatch(match.filePath, match.lineNumber);
                              }}
                              title={`Click to open ${match.filePath} at line ${match.lineNumber}`}
                            >
                              <span className="match-line-no">{match.lineNumber}:</span>
                              <span className="match-snippet">
                                <span>{prefix}</span>
                                <mark className="match-highlight">{highlight}</mark>
                                <span>{suffix}</span>
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Replace Diff Preview Confirmation Modal */}
        {replacePreviewModalOpen && pendingReplaceResult && (
          <div
            className="replace-modal-backdrop"
            onClick={() => setReplacePreviewModalOpen(false)}
          >
            <div className="replace-modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="replace-modal-header">
                <h3>Confirm Global Code Replace</h3>
                <button
                  type="button"
                  className="close-btn"
                  onClick={() => setReplacePreviewModalOpen(false)}
                >
                  ✕
                </button>
              </div>

              <div className="replace-summary-callout">
                Replacing <strong>&quot;{query}&quot;</strong> with{" "}
                <strong>&quot;{replacement}&quot;</strong> across{" "}
                <strong>{pendingReplaceResult.affectedFilesCount}</strong> files (
                {pendingReplaceResult.totalReplacedCount} occurrences). An atomic Checkpoint will be
                recorded for 1-click rollback.
              </div>

              <div className="replace-previews-list">
                {pendingReplaceResult.previews.map((prev, pIdx) => (
                  <div key={pIdx} className="replace-file-preview-card">
                    <div className="preview-card-header">
                      <span className="preview-file-path">📄 {prev.filePath}</span>
                      <span className="preview-badge">{prev.replacedCount} replaced</span>
                    </div>
                    <div className="preview-diff-viewport font-mono">
                      {prev.diff.slice(0, 15).map((line, lIdx) => (
                        <div key={lIdx} className={`diff-line-row diff-${line.type}`}>
                          <span className="diff-line-marker">
                            {line.type === "insert" ? "+" : line.type === "delete" ? "-" : " "}
                          </span>
                          <span className="diff-line-content">{line.value || " "}</span>
                        </div>
                      ))}
                      {prev.diff.length > 15 && (
                        <div className="diff-more-hint">... {prev.diff.length - 15} more lines</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="replace-modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setReplacePreviewModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleConfirmReplace}
                >
                  Confirm &amp; Apply All ({pendingReplaceResult.totalReplacedCount}) ➔
                </button>
              </div>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
