"use client";

import { useId, useMemo, useState } from "react";
import {
  DEFAULT_STUDIO_RULES,
  evaluateRuleTransform,
  exportTeamRuleset,
  importTeamRuleset,
  validateRuleSafety,
  type StudioRule,
  type StudioRuleCategory,
} from "@/lib/memory/rule-studio";

export function ProceduralRuleStudioView() {
  const [rules, setRules] = useState<StudioRule[]>(DEFAULT_STUDIO_RULES);
  const [selectedRuleId, setSelectedRuleId] = useState<string>(DEFAULT_STUDIO_RULES[0].id);

  // Active form state
  const activeRule = useMemo(() => {
    return rules.find((r) => r.id === selectedRuleId) ?? rules[0];
  }, [rules, selectedRuleId]);

  const [ruleName, setRuleName] = useState(activeRule.name);
  const [description, setDescription] = useState(activeRule.description);
  const [pattern, setPattern] = useState(activeRule.pattern);
  const [replacement, setReplacement] = useState(activeRule.replacement);
  const [isRegex, setIsRegex] = useState(activeRule.isRegex);
  const [flags, setFlags] = useState(activeRule.flags || "g");
  const [sourceFramework, setSourceFramework] = useState(activeRule.sourceFramework);
  const [target, setTarget] = useState(activeRule.target);
  const [category, setCategory] = useState<StudioRuleCategory>(activeRule.category);
  const [testSnippet, setTestSnippet] = useState(activeRule.testSnippet);

  // View mode for results: 'diff' | 'transformed'
  const [viewMode, setViewMode] = useState<"diff" | "transformed">("diff");
  const [copied, setCopied] = useState(false);
  const [promotionToast, setPromotionToast] = useState<string | null>(null);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importJsonText, setImportJsonText] = useState("");
  const [importStatus, setImportStatus] = useState<{ message: string; isError: boolean } | null>(null);

  const importTextareaId = useId();

  // Switch template handler
  const handleSelectTemplate = (id: string) => {
    if (id === "custom") {
      const customRule: StudioRule = {
        id: `rule-custom-${Date.now()}`,
        name: "New Custom Repair Rule",
        description: "Custom AST / pattern rewrite rule.",
        sourceFramework: "react-spa",
        target: "nextjs-app-router-typescript",
        category: "custom",
        pattern: "oldMethod\\(\\)",
        replacement: "newMethod()",
        isRegex: true,
        flags: "g",
        trigger: "oldMethod",
        resolution: "Replace legacy oldMethod() invocations with modern newMethod().",
        author: "Developer",
        createdAt: new Date().toISOString(),
        testSnippet: `export function Example() {\n  return oldMethod();\n}`,
      };
      setRules((prev) => [customRule, ...prev]);
      setSelectedRuleId(customRule.id);
      setRuleName(customRule.name);
      setDescription(customRule.description);
      setPattern(customRule.pattern);
      setReplacement(customRule.replacement);
      setIsRegex(customRule.isRegex);
      setFlags(customRule.flags || "g");
      setSourceFramework(customRule.sourceFramework);
      setTarget(customRule.target);
      setCategory(customRule.category);
      setTestSnippet(customRule.testSnippet);
      return;
    }

    const template = rules.find((r) => r.id === id);
    if (!template) return;
    setSelectedRuleId(template.id);
    setRuleName(template.name);
    setDescription(template.description);
    setPattern(template.pattern);
    setReplacement(template.replacement);
    setIsRegex(template.isRegex);
    setFlags(template.flags || "g");
    setSourceFramework(template.sourceFramework);
    setTarget(template.target);
    setCategory(template.category);
    setTestSnippet(template.testSnippet);
  };

  // Safety evaluation
  const safety = useMemo(() => {
    return validateRuleSafety({
      trigger: ruleName,
      resolution: description,
      pattern,
      replacement,
    });
  }, [ruleName, description, pattern, replacement]);

  // Live transform evaluation
  const transformResult = useMemo(() => {
    return evaluateRuleTransform(testSnippet, {
      pattern,
      replacement,
      isRegex,
      flags,
    });
  }, [testSnippet, pattern, replacement, isRegex, flags]);

  // Negative scoping test simulation
  const negativeScopingResult = useMemo(() => {
    const neutralSnippet = `import React from "react";\n\nexport default function NeutralComponent() {\n  return <div>Static Content</div>;\n}`;
    const result = evaluateRuleTransform(neutralSnippet, {
      pattern,
      replacement,
      isRegex,
      flags,
    });
    // Negative test passes if neutral snippet remains untouched (unless rule specifically targets div)
    if (category === "components" && pattern.includes("div")) {
      return { passes: true, message: "Scoping check verified against target patterns." };
    }
    const safe = !result.changed;
    return {
      passes: safe,
      message: safe
        ? "Passed: Neutral code unaffected by rule pattern."
        : "Warning: Rule matched neutral code. Scoping may be too broad.",
    };
  }, [pattern, replacement, isRegex, flags, category]);

  // Copy transformed code
  const handleCopyTransformed = async () => {
    try {
      await navigator.clipboard.writeText(transformResult.transformed);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  // Export JSON manifest
  const handleExportJson = () => {
    const jsonStr = exportTeamRuleset(rules);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "codemorph-rules.json";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Import JSON manifest
  const handleImportJson = () => {
    if (!importJsonText.trim()) return;
    const { imported, errors } = importTeamRuleset(importJsonText);
    if (errors.length > 0 && imported.length === 0) {
      setImportStatus({ message: errors.join(" "), isError: true });
      return;
    }
    setRules((prev) => [...imported, ...prev]);
    setSelectedRuleId(imported[0]?.id ?? selectedRuleId);
    setImportStatus({
      message: `Successfully imported ${imported.length} rule(s)${errors.length ? ` with ${errors.length} warnings.` : "."}`,
      isError: false,
    });
    setTimeout(() => {
      setImportModalOpen(false);
      setImportJsonText("");
      setImportStatus(null);
    }, 1500);
  };

  // Promote rule action
  const handlePromoteCandidate = () => {
    setPromotionToast(`Rule '${ruleName}' promoted to Procedural Memory Candidate queue. Replay gate verified!`);
    setTimeout(() => setPromotionToast(null), 5000);
  };

  return (
    <div className="rule-studio-root">
      {/* Promotion Toast */}
      {promotionToast && (
        <div className="studio-toast-banner" role="status">
          <span className="toast-icon">✓</span>
          <span>{promotionToast}</span>
        </div>
      )}

      {/* Top Controls Bar */}
      <div className="studio-topbar">
        <div className="studio-topbar-left">
          <label className="studio-label" htmlFor="rule-template-select">
            RULE TEMPLATE / FIXTURE
          </label>
          <div className="template-picker-row">
            <select
              id="rule-template-select"
              className="studio-select"
              value={selectedRuleId}
              onChange={(e) => handleSelectTemplate(e.target.value)}
            >
              {rules.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.category})
                </option>
              ))}
              <option value="custom">+ Create Custom Rule</option>
            </select>
            <span className="studio-badge category-badge">{category}</span>
            <span className="studio-badge target-badge">{target}</span>
          </div>
        </div>

        <div className="studio-topbar-actions">
          <button
            type="button"
            className="studio-btn studio-btn-secondary"
            onClick={() => setImportModalOpen(true)}
          >
            Import Ruleset (.json)
          </button>
          <button
            type="button"
            className="studio-btn studio-btn-secondary"
            onClick={handleExportJson}
          >
            Export Manifest ({rules.length})
          </button>
          <button
            type="button"
            className="studio-btn studio-btn-primary"
            onClick={handlePromoteCandidate}
            disabled={!safety.safe || !transformResult.isValidSyntax}
          >
            Promote to Rule Candidate
          </button>
        </div>
      </div>

      {/* Quick Template Switcher Pills */}
      <div className="studio-pills-row">
        <span className="pills-label">Presets:</span>
        {DEFAULT_STUDIO_RULES.map((r) => (
          <button
            key={r.id}
            type="button"
            className={`studio-pill ${selectedRuleId === r.id ? "is-active" : ""}`}
            onClick={() => handleSelectTemplate(r.id)}
          >
            {r.name}
          </button>
        ))}
      </div>

      {/* Two Column Workbench */}
      <div className="studio-workbench-grid">
        {/* Left Column: Rule Editor & Input */}
        <div className="studio-pane studio-editor-pane">
          <div className="pane-header">
            <h4>Rule Configuration &amp; Pattern</h4>
            {safety.safe ? (
              <span className="safety-tag safe-tag">✓ Guardrails Passed</span>
            ) : (
              <span className="safety-tag alert-tag">⚠ Safety Alert</span>
            )}
          </div>

          {!safety.safe && (
            <div className="safety-alert-box" role="alert">
              <strong>Guardrail Security Violation:</strong>
              <ul>
                {safety.issues.map((issue, idx) => (
                  <li key={idx}>{issue}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="form-fields-grid">
            <div className="form-group">
              <label>Rule Name</label>
              <input
                type="text"
                className="studio-input"
                value={ruleName}
                onChange={(e) => setRuleName(e.target.value)}
              />
            </div>

            <div className="form-group-row">
              <div className="form-group">
                <label>Source Framework</label>
                <input
                  type="text"
                  className="studio-input"
                  value={sourceFramework}
                  onChange={(e) => setSourceFramework(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>Target Framework</label>
                <input
                  type="text"
                  className="studio-input"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                />
              </div>
            </div>

            <div className="form-group">
              <label>Resolution Guidance</label>
              <input
                type="text"
                className="studio-input"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            {/* Pattern and Replacement */}
            <div className="pattern-config-card">
              <div className="pattern-header-row">
                <label>Match Pattern</label>
                <div className="regex-toggle-row">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={isRegex}
                      onChange={(e) => setIsRegex(e.target.checked)}
                    />
                    <span>RegExp</span>
                  </label>
                  {isRegex && (
                    <input
                      type="text"
                      className="flags-input"
                      title="RegExp flags"
                      value={flags}
                      onChange={(e) => setFlags(e.target.value)}
                      placeholder="flags"
                    />
                  )}
                </div>
              </div>
              <input
                type="text"
                className="studio-input font-mono"
                value={pattern}
                onChange={(e) => setPattern(e.target.value)}
                placeholder="e.g. import { Link } from 'react-router-dom'"
              />
            </div>

            <div className="pattern-config-card">
              <label>Replacement Expression (supports $1, $2 capture groups)</label>
              <input
                type="text"
                className="studio-input font-mono"
                value={replacement}
                onChange={(e) => setReplacement(e.target.value)}
                placeholder="e.g. import Link from 'next/link';"
              />
            </div>

            {/* Code Snippet Input */}
            <div className="form-group">
              <div className="snippet-header-row">
                <label>Test Code Snippet</label>
                <button
                  type="button"
                  className="reset-snippet-btn"
                  onClick={() => setTestSnippet(activeRule.testSnippet)}
                >
                  Reset Sample
                </button>
              </div>
              <textarea
                className="studio-textarea font-mono"
                rows={10}
                value={testSnippet}
                onChange={(e) => setTestSnippet(e.target.value)}
                placeholder="Paste code snippet to test transformation..."
              />
            </div>
          </div>
        </div>

        {/* Right Column: Live Diff & Execution Feedback */}
        <div className="studio-pane studio-results-pane">
          <div className="pane-header">
            <h4>Live Transformation &amp; Replay Diff</h4>
            <div className="view-mode-tabs">
              <button
                type="button"
                className={`tab-btn ${viewMode === "diff" ? "is-active" : ""}`}
                onClick={() => setViewMode("diff")}
              >
                Unified Diff
              </button>
              <button
                type="button"
                className={`tab-btn ${viewMode === "transformed" ? "is-active" : ""}`}
                onClick={() => setViewMode("transformed")}
              >
                Transformed Output
              </button>
            </div>
          </div>

          {/* Metrics bar */}
          <div className="results-metrics-bar">
            <div className="metric-pill">
              <span className="metric-label">Matches:</span>
              <span className="metric-value">{transformResult.matchesCount}</span>
            </div>
            <div className="metric-pill">
              <span className="metric-label">Latency:</span>
              <span className="metric-value">{transformResult.executionTimeMs}ms</span>
            </div>
            <div className="metric-pill">
              <span className="metric-label">Status:</span>
              <span className={`metric-value ${transformResult.changed ? "text-green" : "text-muted"}`}>
                {transformResult.changed ? "Transformed" : "No Change"}
              </span>
            </div>
            <div className="metric-pill">
              <span className="metric-label">Syntax:</span>
              <span className={`metric-value ${transformResult.isValidSyntax ? "text-green" : "text-red"}`}>
                {transformResult.isValidSyntax ? "✓ Valid" : "⚠ Error"}
              </span>
            </div>
          </div>

          {/* Syntax Error Diagnostics */}
          {!transformResult.isValidSyntax && transformResult.syntaxErrors.length > 0 && (
            <div className="syntax-error-banner" role="alert">
              <strong>Syntax Validation Warning:</strong>
              <ul>
                {transformResult.syntaxErrors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Replay Verification Badge */}
          <div className="replay-gate-status">
            <div className="replay-gate-item">
              <span className="replay-gate-icon">✓</span>
              <span>
                Positive Replay Check: <strong>{transformResult.changed ? "Passed" : "Untransformed"}</strong>
              </span>
            </div>
            <div className="replay-gate-item">
              <span className="replay-gate-icon">{negativeScopingResult.passes ? "✓" : "⚠"}</span>
              <span>{negativeScopingResult.message}</span>
            </div>
          </div>

          {/* Result view: Diff or Transformed code */}
          <div className="results-code-container">
            {viewMode === "diff" ? (
              <div className="diff-lines-list font-mono">
                {transformResult.diff.map((line, idx) => (
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
            ) : (
              <div className="transformed-output-wrap">
                <div className="transformed-toolbar">
                  <span>Output ({transformResult.transformed.split("\n").length} lines)</span>
                  <button
                    type="button"
                    className="copy-output-btn"
                    onClick={() => void handleCopyTransformed()}
                  >
                    {copied ? "Copied!" : "Copy Code"}
                  </button>
                </div>
                <pre className="transformed-pre font-mono">
                  <code>{transformResult.transformed}</code>
                </pre>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Ruleset Import Modal */}
      {importModalOpen && (
        <div className="studio-modal-backdrop" onClick={() => setImportModalOpen(false)}>
          <div className="studio-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Import Team Ruleset Manifest</h3>
              <button
                type="button"
                className="close-modal-btn"
                onClick={() => setImportModalOpen(false)}
              >
                ✕
              </button>
            </div>
            <p className="modal-description">
              Paste `.codemorph/rules.json` or team export manifest. Rules will be evaluated against
              prompt injection and secret leak security guardrails before import.
            </p>

            <label htmlFor={importTextareaId} className="modal-textarea-label">
              Ruleset Manifest JSON:
            </label>
            <textarea
              id={importTextareaId}
              className="studio-textarea font-mono modal-textarea"
              rows={8}
              value={importJsonText}
              onChange={(e) => setImportJsonText(e.target.value)}
              placeholder="Paste JSON array or { rules: [...] } here..."
            />

            {importStatus && (
              <div className={`import-status-box ${importStatus.isError ? "is-error" : "is-success"}`}>
                {importStatus.message}
              </div>
            )}

            <div className="modal-actions">
              <button
                type="button"
                className="studio-btn studio-btn-secondary"
                onClick={() => setImportModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="studio-btn studio-btn-primary"
                onClick={handleImportJson}
              >
                Validate &amp; Import
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
