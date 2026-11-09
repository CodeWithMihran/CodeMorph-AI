"use client";

import React, { useState, useMemo, useEffect } from "react";
import type { ZipEntry } from "@/lib/migration/zip";
import {
  DEFAULT_STUDIO_RULES,
  type StudioRule,
} from "@/lib/memory/rule-studio";
import {
  scanProjectForProceduralRules,
  applyBatchRules,
  type BatchEnforcementPlan,
  type RuleMatchResult,
} from "@/lib/memory/rule-enforcer";

interface ProceduralRulesEnforcementModalProps {
  isOpen: boolean;
  onClose: () => void;
  entries: ZipEntry[];
  onApplyFixes: (updatedEntries: ZipEntry[], summaryLabel: string) => void;
}

export function ProceduralRulesEnforcementModal({
  isOpen,
  onClose,
  entries,
  onApplyFixes,
}: ProceduralRulesEnforcementModalProps) {
  const [rules, setRules] = useState<StudioRule[]>(DEFAULT_STUDIO_RULES);
  const [deselectedMatchIds, setDeselectedMatchIds] = useState<Set<string>>(new Set());
  const [previewOverrideId, setPreviewOverrideId] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  // Attempt to fetch any active rules from procedural memory store API, fallback to default studio rules
  useEffect(() => {
    let isSubscribed = true;
    async function loadActiveRules() {
      try {
        const res = await fetch("/api/memory/rules");
        if (!res.ok) return;
        const data = await res.json();
        if (isSubscribed && Array.isArray(data.rules) && data.rules.length > 0) {
          // Merge dynamic rules with default templates
          const dynamicStudioRules: StudioRule[] = data.rules.map(
            (r: { id: string; trigger: string; resolution: string; sourceFramework: string; target: string }) => ({
              id: r.id,
              name: `Learned: ${r.trigger}`,
              description: r.resolution,
              sourceFramework: r.sourceFramework,
              target: r.target,
              category: "custom" as const,
              pattern: r.trigger,
              replacement: r.resolution,
              isRegex: false,
              flags: "g",
              testSnippet: "",
              trigger: r.trigger,
              resolution: r.resolution,
              createdAt: new Date().toISOString(),
              author: "AI Self-Learning Hub",
            })
          );
          setRules([...DEFAULT_STUDIO_RULES, ...dynamicStudioRules]);
        }
      } catch {
        // Fallback to DEFAULT_STUDIO_RULES
      }
    }
    void loadActiveRules();
    return () => {
      isSubscribed = false;
    };
  }, []);

  // Compute scan plan
  const plan: BatchEnforcementPlan = useMemo(() => {
    return scanProjectForProceduralRules(entries, rules);
  }, [entries, rules]);

  // Derived selected matches: all matches except explicitly deselected ones
  const selectedMatchIds = useMemo(() => {
    return new Set(
      plan.matches.map((m) => m.id).filter((id) => !deselectedMatchIds.has(id))
    );
  }, [plan.matches, deselectedMatchIds]);

  const activePreviewId = previewOverrideId ?? plan.matches[0]?.id ?? null;

  const activeMatch: RuleMatchResult | null = useMemo(() => {
    if (!activePreviewId) return plan.matches[0] ?? null;
    return plan.matches.find((m) => m.id === activePreviewId) ?? plan.matches[0] ?? null;
  }, [plan.matches, activePreviewId]);

  const toggleMatchSelection = (id: string) => {
    setDeselectedMatchIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAll = () => {
    setDeselectedMatchIds(new Set());
  };

  const deselectAll = () => {
    setDeselectedMatchIds(new Set(plan.matches.map((m) => m.id)));
  };

  const filteredMatches = useMemo(() => {
    if (categoryFilter === "all") return plan.matches;
    return plan.matches.filter((m) => m.category === categoryFilter);
  }, [plan.matches, categoryFilter]);

  const selectedCount = selectedMatchIds.size;

  const handleApply = () => {
    const matchesToApply = plan.matches.map((m) => ({
      ...m,
      selected: selectedMatchIds.has(m.id),
    }));

    const result = applyBatchRules(entries, matchesToApply, rules);
    const summaryLabel = `Applied Procedural Rules (${result.totalFixesApplied} fixes across ${result.modifiedFilesCount} files)`;
    onApplyFixes(result.updatedEntries, summaryLabel);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="rules-modal-backdrop" onClick={onClose}>
      <div className="rules-modal-window" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="rules-modal-header">
          <div className="modal-title-col">
            <div className="modal-title-row">
              <span className="modal-icon">⚡</span>
              <h3>Procedural Rules &amp; Automated Team Fixes</h3>
            </div>
            <p className="modal-subtitle">
              Scan project files against verified procedural memory rules. Preview line-level diffs and
              safely batch-apply transformations with automatic rollback checkpointing.
            </p>
          </div>

          <div className="modal-header-actions">
            <span className="scan-metric-badge">
              <strong>{plan.totalMatches}</strong> fixes in <strong>{plan.affectedFilesCount}</strong> files
            </span>
            <button type="button" className="close-btn" onClick={onClose} title="Close modal">
              ✕
            </button>
          </div>
        </div>

        {/* Modal Body */}
        {plan.matches.length === 0 ? (
          <div className="rules-empty-state">
            <div className="empty-state-icon">✓</div>
            <h4>All Files Comply With Procedural Rules</h4>
            <p>
              No pattern mismatches, legacy router invocations, or unoptimized elements were discovered
              in this project. Your codebase is clean and compliant.
            </p>
            <button type="button" className="btn-secondary" onClick={onClose}>
              Return to Workbench
            </button>
          </div>
        ) : (
          <div className="rules-workbench-grid">
            {/* Left Pane: Matched Rules & Affected Files List */}
            <div className="rules-list-pane">
              <div className="list-toolbar">
                <div className="selection-buttons-row">
                  <button type="button" className="text-btn" onClick={selectAll}>
                    Select All
                  </button>
                  <span className="sep">·</span>
                  <button type="button" className="text-btn" onClick={deselectAll}>
                    Deselect All
                  </button>
                </div>
                <div className="category-filter-select">
                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="category-select"
                  >
                    <option value="all">All Categories ({plan.matches.length})</option>
                    <option value="routing">Routing</option>
                    <option value="directives">Directives</option>
                    <option value="components">Components</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>
              </div>

              <div className="matched-rules-list">
                {filteredMatches.map((match) => {
                  const isChecked = selectedMatchIds.has(match.id);
                  const isActive = activePreviewId === match.id;

                  return (
                    <div
                      key={match.id}
                      className={`rule-match-card ${isActive ? "is-active" : ""}`}
                      onClick={() => setPreviewOverrideId(match.id)}
                    >
                      <div className="card-check-col" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleMatchSelection(match.id)}
                          title="Toggle this rule fix"
                        />
                      </div>

                      <div className="card-info-col">
                        <div className="card-top-row">
                          <span className="match-rule-name">{match.ruleName}</span>
                          <span className="match-count-pill">{match.matchesCount} match</span>
                        </div>
                        <div className="match-file-path">{match.filePath}</div>
                        <div className="match-category-tag">{match.category}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right Pane: Live Before/After Line Diff Preview */}
            <div className="rules-diff-pane">
              {activeMatch ? (
                <>
                  <div className="diff-header-bar">
                    <div className="diff-title-col">
                      <span className="diff-target-file">
                        📄 <strong>{activeMatch.filePath}</strong>
                      </span>
                      <span className="diff-rule-label">
                        Rule: <strong>{activeMatch.ruleName}</strong>
                      </span>
                    </div>
                    <span className="diff-resolution-chip">
                      {activeMatch.resolution}
                    </span>
                  </div>

                  <div className="diff-content-viewport font-mono">
                    {activeMatch.diff.map((line, idx) => (
                      <div
                        key={idx}
                        className={`diff-line-row diff-${line.type}`}
                      >
                        <span className="diff-line-marker">
                          {line.type === "insert" ? "+" : line.type === "delete" ? "-" : " "}
                        </span>
                        <span className="diff-line-no">
                          {line.type === "insert"
                            ? line.newLineNo
                            : line.type === "delete"
                            ? line.oldLineNo
                            : line.newLineNo ?? line.oldLineNo}
                        </span>
                        <span className="diff-line-content">{line.value || " "}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="empty-diff-selection">Select a rule match to preview line diff.</div>
              )}
            </div>
          </div>
        )}

        {/* Modal Footer */}
        <div className="rules-modal-footer">
          <div className="footer-left">
            <span>
              Selected: <strong>{selectedCount}</strong> of <strong>{plan.matches.length}</strong> rule match(es)
            </span>
          </div>

          <div className="footer-right">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary apply-rules-btn"
              onClick={handleApply}
              disabled={selectedCount === 0}
            >
              Apply Selected Fixes ({selectedCount}) ➔
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
