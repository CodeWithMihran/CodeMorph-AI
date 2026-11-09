"use client";

import React, { useState, useMemo } from "react";
import type { ZipEntry } from "@/lib/migration/zip";
import {
  simulateNextBuild,
  simulateExpoMetroStart,
  simulateLiveRequestLogs,
  type SimulatedBuildResult,
  type SimulatedExpoResult,
} from "@/lib/terminal/bundle-simulator";
import {
  runSimulatedTestSuite,
  type TestSuiteReport,
} from "@/lib/testing/test-runner";

export type TerminalTab = "build" | "server" | "diagnostics" | "tests";

interface SimulatedDevTerminalProps {
  entries: ZipEntry[];
  targetName: string;
  isOpen: boolean;
  onToggle: () => void;
  initialTab?: TerminalTab;
}

export function SimulatedDevTerminal({
  entries,
  targetName,
  isOpen,
  onToggle,
  initialTab = "build",
}: SimulatedDevTerminalProps) {
  const [activeTab, setActiveTab] = useState<TerminalTab>(initialTab);
  const [isRunning, setIsRunning] = useState(false);
  const [copyToast, setCopyToast] = useState(false);
  const [serverLogOverrides, setServerLogOverrides] = useState<string[] | null>(null);
  const [testViewMode, setTestViewMode] = useState<"terminal" | "visual">("terminal");
  const [testCategoryFilter, setTestCategoryFilter] = useState<string>("all");

  const isExpo = targetName.toLowerCase().includes("expo");

  // Run build simulation on entries
  const buildResult: SimulatedBuildResult = useMemo(() => {
    return simulateNextBuild(entries);
  }, [entries]);

  const expoResult: SimulatedExpoResult = useMemo(() => {
    return simulateExpoMetroStart(entries);
  }, [entries]);

  // Run automated test suite simulation on entries
  const testReport: TestSuiteReport = useMemo(() => {
    return runSimulatedTestSuite(entries, targetName);
  }, [entries, targetName]);

  const defaultServerLogs = useMemo(() => {
    return simulateLiveRequestLogs(buildResult.routes, isExpo ? "expo" : "nextjs");
  }, [buildResult.routes, isExpo]);

  const activeServerLogs = serverLogOverrides ?? defaultServerLogs;

  const handleRunBuildCheck = () => {
    setIsRunning(true);
    setTimeout(() => {
      setIsRunning(false);
    }, 500);
  };

  const handleRestartServer = () => {
    setIsRunning(true);
    setTimeout(() => {
      const freshLogs = simulateLiveRequestLogs(buildResult.routes, isExpo ? "expo" : "nextjs");
      setServerLogOverrides(freshLogs);
      setIsRunning(false);
    }, 400);
  };

  const handleRunTests = () => {
    setIsRunning(true);
    setTimeout(() => {
      setIsRunning(false);
    }, 450);
  };

  const currentLogs: string[] = useMemo(() => {
    if (activeTab === "build") {
      return isExpo ? expoResult.terminalLogs : buildResult.terminalLogs;
    }
    if (activeTab === "server") {
      const prefix = isExpo
        ? ["› Metro Bundler running on port 8081", "› Fast Refresh listening for client file changes..."]
        : ["▲ Next.js 15.1.0 dev server active on http://localhost:3000", "○ Compiled / in 480ms"];
      return [...prefix, ...activeServerLogs];
    }
    if (activeTab === "tests") {
      return testReport.terminalLogs;
    }
    // Diagnostics tab
    const diags = isExpo ? expoResult.diagnostics : buildResult.diagnostics;
    if (diags.length === 0) {
      return [
        "✓ 0 Bundle Diagnostics or Directive Issues Found",
        "  All component hooks, event handlers, and relative imports resolved cleanly.",
        "  Project meets Next.js / Expo static analysis requirements.",
      ];
    }
    return [
      `Found ${diags.length} diagnostic warnings during static bundle inspection:`,
      "",
      ...diags.map(
        (d, i) =>
          `[${i + 1}] ${d.filePath}\n    ${d.message}${d.codeSnippet ? `\n    Snippet: ${d.codeSnippet}` : ""}`
      ),
    ];
  }, [activeTab, isExpo, expoResult, buildResult, activeServerLogs, testReport]);

  const handleCopyLogs = async () => {
    try {
      await navigator.clipboard.writeText(currentLogs.join("\n"));
      setCopyToast(true);
      setTimeout(() => setCopyToast(false), 2000);
    } catch {
      // Fallback
    }
  };

  const totalWarnings = isExpo ? expoResult.diagnostics.length : buildResult.diagnostics.length;
  const filteredTests = useMemo(() => {
    if (testCategoryFilter === "all") return testReport.testCases;
    return testReport.testCases.filter((t) => t.category === testCategoryFilter);
  }, [testReport.testCases, testCategoryFilter]);

  if (!isOpen) {
    return (
      <div className="terminal-collapsed-bar" onClick={onToggle}>
        <div className="terminal-collapsed-left">
          <span className="terminal-prompt-glyph">&gt;_</span>
          <span className="terminal-collapsed-title">Simulated Dev &amp; Test Terminal</span>
          <span className="terminal-target-chip">{isExpo ? "Expo Metro" : "Next.js Turbopack"}</span>
          <span className={`terminal-diag-chip ${testReport.failedCount === 0 ? "pass" : "warn"}`}>
            🧪 Tests: {testReport.passedCount}/{testReport.totalTests} Pass
          </span>
          {totalWarnings > 0 ? (
            <span className="terminal-diag-chip warn">⚠️ {totalWarnings} warnings</span>
          ) : (
            <span className="terminal-diag-chip pass">✓ Ready</span>
          )}
        </div>
        <div className="terminal-collapsed-right">
          <span className="terminal-expand-hint">Click to expand console ▲</span>
        </div>
      </div>
    );
  }

  return (
    <div className="simulated-terminal-container">
      {/* Terminal Header Toolbar */}
      <div className="terminal-header">
        <div className="terminal-header-left">
          <div className="terminal-window-dots">
            <span className="dot dot-red" />
            <span className="dot dot-yellow" />
            <span className="dot dot-green" />
          </div>
          <span className="terminal-title">
            &gt;_{" "}
            {activeTab === "tests"
              ? `${testReport.framework} run --reporter=verbose`
              : activeTab === "server"
              ? isExpo ? "npx expo start" : "next dev -p 3000"
              : isExpo ? "npx expo start (Metro Bundler)" : "next build (Turbopack Simulation)"}
          </span>
          <div className="terminal-tabs-row">
            <button
              type="button"
              className={`terminal-tab-btn ${activeTab === "build" ? "is-active" : ""}`}
              onClick={() => setActiveTab("build")}
            >
              Build Output
            </button>
            <button
              type="button"
              className={`terminal-tab-btn ${activeTab === "server" ? "is-active" : ""}`}
              onClick={() => setActiveTab("server")}
            >
              Dev Server Logs
            </button>
            <button
              type="button"
              className={`terminal-tab-btn ${activeTab === "tests" ? "is-active" : ""}`}
              onClick={() => setActiveTab("tests")}
            >
              🧪 Tests ({testReport.passedCount}/{testReport.totalTests})
            </button>
            <button
              type="button"
              className={`terminal-tab-btn ${activeTab === "diagnostics" ? "is-active" : ""}`}
              onClick={() => setActiveTab("diagnostics")}
            >
              Diagnostics {totalWarnings > 0 && `(${totalWarnings})`}
            </button>
          </div>
        </div>

        <div className="terminal-header-right">
          {activeTab === "build" && (
            <button
              type="button"
              className="term-action-btn run-btn"
              onClick={handleRunBuildCheck}
              disabled={isRunning}
              title="Re-run static build simulation"
            >
              {isRunning ? "Compiling..." : "▶ Re-run Build"}
            </button>
          )}

          {activeTab === "server" && (
            <button
              type="button"
              className="term-action-btn restart-btn"
              onClick={handleRestartServer}
              disabled={isRunning}
              title="Restart simulated dev server"
            >
              {isRunning ? "Restarting..." : "🔄 Restart Server"}
            </button>
          )}

          {activeTab === "tests" && (
            <div className="term-test-actions">
              <button
                type="button"
                className="term-action-btn run-btn"
                onClick={handleRunTests}
                disabled={isRunning}
                title="Execute all simulated test suites"
              >
                {isRunning ? "Running..." : "▶ Run All Tests"}
              </button>
              <button
                type="button"
                className="term-action-btn toggle-view-btn"
                onClick={() => setTestViewMode((m) => (m === "terminal" ? "visual" : "terminal"))}
                title="Toggle between CLI log and visual test inspector"
              >
                {testViewMode === "terminal" ? "Visual Tree" : "CLI Output"}
              </button>
            </div>
          )}

          <button
            type="button"
            className="term-action-btn copy-btn"
            onClick={handleCopyLogs}
            title="Copy terminal logs to clipboard"
          >
            {copyToast ? "✓ Copied" : "📋 Copy"}
          </button>

          <button
            type="button"
            className="term-action-btn minimize-btn"
            onClick={onToggle}
            title="Minimize terminal"
          >
            ▼ Minimize
          </button>
        </div>
      </div>

      {/* Terminal Body */}
      <div className="terminal-body">
        {isRunning ? (
          <div className="terminal-compiling-state">
            <span className="terminal-spinner" />
            <span>
              {activeTab === "tests"
                ? "Executing route smoke tests, navigation crawler, and accessibility assertions..."
                : "Simulating compilation and bundle tree generation..."}
            </span>
          </div>
        ) : activeTab === "tests" && testViewMode === "visual" ? (
          /* Visual Test Suite Explorer */
          <div className="terminal-visual-tests-wrapper">
            <div className="visual-tests-filter-bar">
              <span className="filter-title">Filter by Category:</span>
              <button
                type="button"
                className={`filter-pill ${testCategoryFilter === "all" ? "is-active" : ""}`}
                onClick={() => setTestCategoryFilter("all")}
              >
                All ({testReport.testCases.length})
              </button>
              <button
                type="button"
                className={`filter-pill ${testCategoryFilter === "route_smoke" ? "is-active" : ""}`}
                onClick={() => setTestCategoryFilter("route_smoke")}
              >
                Route Smoke ({testReport.testCases.filter((t) => t.category === "route_smoke").length})
              </button>
              <button
                type="button"
                className={`filter-pill ${testCategoryFilter === "navigation_integrity" ? "is-active" : ""}`}
                onClick={() => setTestCategoryFilter("navigation_integrity")}
              >
                Navigation (404 Crawler)
              </button>
              <button
                type="button"
                className={`filter-pill ${testCategoryFilter === "accessibility_meta" ? "is-active" : ""}`}
                onClick={() => setTestCategoryFilter("accessibility_meta")}
              >
                Accessibility &amp; Meta
              </button>
              <button
                type="button"
                className={`filter-pill ${testCategoryFilter === "directives_imports" ? "is-active" : ""}`}
                onClick={() => setTestCategoryFilter("directives_imports")}
              >
                Directives
              </button>
            </div>

            <div className="visual-tests-grid">
              {filteredTests.map((tc) => (
                <div
                  key={tc.id}
                  className={`visual-test-card ${tc.status === "passed" ? "is-pass" : "is-fail"}`}
                >
                  <div className="test-card-header">
                    <span className="test-status-badge">
                      {tc.status === "passed" ? "✓ PASS" : "✕ FAIL"}
                    </span>
                    <span className="test-file-path">{tc.filePath}</span>
                    <span className="test-duration">{tc.durationMs}ms</span>
                  </div>
                  <div className="test-card-title">{tc.title}</div>
                  {tc.errorMessage && (
                    <div className="test-card-error">
                      <strong>Assertion Failure:</strong> {tc.errorMessage}
                    </div>
                  )}
                  <div className="test-card-meta">
                    <span>{tc.assertionsCount} assertion(s) verified</span>
                    <span>•</span>
                    <span className="test-category-label">{tc.category}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* CLI Terminal Log Output */
          <pre className="terminal-output">
            {currentLogs.map((line, idx) => {
              let lineClass = "term-line";
              if (line.startsWith("✓") || line.includes("TEST SUITE PASSED")) lineClass += " term-success";
              else if (line.startsWith("⚠️") || line.includes("warning")) lineClass += " term-warning";
              else if (line.startsWith("✕") || line.includes("TEST SUITE FAILED") || line.includes("Error")) lineClass += " term-error";
              else if (line.startsWith("▲") || line.startsWith("›") || line.startsWith(">_") || line.startsWith("RUN")) lineClass += " term-accent";
              else if (line.includes("GET") || line.includes("BUNDLE") || line.includes("Test Files")) lineClass += " term-info";
              else if (line.startsWith("Route (app)") || line.startsWith("+ First Load")) lineClass += " term-header";

              return (
                <div key={idx} className={lineClass}>
                  {line || " "}
                </div>
              );
            })}
            <div className="terminal-cursor-line">
              <span className="term-prompt-marker">$</span>
              <span className="terminal-cursor" />
            </div>
          </pre>
        )}
      </div>

      {/* Terminal Footer Info Bar */}
      <div className="terminal-footer">
        <div className="terminal-footer-meta">
          <span>Target: <strong>{targetName}</strong></span>
          <span>•</span>
          <span>Runner: <strong>{testReport.framework.toUpperCase()}</strong></span>
          <span>•</span>
          <span>Pass Rate: <strong>{testReport.passRate}%</strong> ({testReport.passedCount}/{testReport.totalTests})</span>
          <span>•</span>
          <span>Estimated JS: <strong>{(buildResult.totalBundleSizeBytes / 1024).toFixed(1)} kB</strong></span>
        </div>
        <div className="terminal-footer-status">
          <span className="status-indicator-dot online" />
          <span>Zero-Host In-Browser Test Suite Active</span>
        </div>
      </div>
    </div>
  );
}
