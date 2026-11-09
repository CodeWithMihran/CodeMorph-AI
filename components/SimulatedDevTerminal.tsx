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

interface SimulatedDevTerminalProps {
  entries: ZipEntry[];
  targetName: string;
  isOpen: boolean;
  onToggle: () => void;
}

type TerminalTab = "build" | "server" | "diagnostics";

export function SimulatedDevTerminal({
  entries,
  targetName,
  isOpen,
  onToggle,
}: SimulatedDevTerminalProps) {
  const [activeTab, setActiveTab] = useState<TerminalTab>("build");
  const [isRunning, setIsRunning] = useState(false);
  const [copyToast, setCopyToast] = useState(false);
  const [serverLogOverrides, setServerLogOverrides] = useState<string[] | null>(null);

  const isExpo = targetName.toLowerCase().includes("expo");

  // Run build simulation on entries
  const buildResult: SimulatedBuildResult = useMemo(() => {
    return simulateNextBuild(entries);
  }, [entries]);

  const expoResult: SimulatedExpoResult = useMemo(() => {
    return simulateExpoMetroStart(entries);
  }, [entries]);

  const defaultServerLogs = useMemo(() => {
    return simulateLiveRequestLogs(buildResult.routes, isExpo ? "expo" : "nextjs");
  }, [buildResult.routes, isExpo]);

  const activeServerLogs = serverLogOverrides ?? defaultServerLogs;

  const handleRunBuildCheck = () => {
    setIsRunning(true);
    setTimeout(() => {
      setIsRunning(false);
    }, 600);
  };

  const handleRestartServer = () => {
    setIsRunning(true);
    setTimeout(() => {
      const freshLogs = simulateLiveRequestLogs(buildResult.routes, isExpo ? "expo" : "nextjs");
      setServerLogOverrides(freshLogs);
      setIsRunning(false);
    }, 400);
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
  }, [activeTab, isExpo, expoResult, buildResult, activeServerLogs]);

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

  if (!isOpen) {
    return (
      <div className="terminal-collapsed-bar" onClick={onToggle}>
        <div className="terminal-collapsed-left">
          <span className="terminal-prompt-glyph">&gt;_</span>
          <span className="terminal-collapsed-title">Simulated Dev Terminal</span>
          <span className="terminal-target-chip">{isExpo ? "Expo Metro" : "Next.js Turbopack"}</span>
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
            &gt;_ {isExpo ? "npx expo start (Metro Bundler)" : "next build (Turbopack Simulation)"}
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
              className={`terminal-tab-btn ${activeTab === "diagnostics" ? "is-active" : ""}`}
              onClick={() => setActiveTab("diagnostics")}
            >
              Diagnostics {totalWarnings > 0 && `(${totalWarnings})`}
            </button>
          </div>
        </div>

        <div className="terminal-header-right">
          {activeTab === "build" ? (
            <button
              type="button"
              className="term-action-btn run-btn"
              onClick={handleRunBuildCheck}
              disabled={isRunning}
              title="Re-run static build simulation"
            >
              {isRunning ? "Compiling..." : "▶ Re-run Build"}
            </button>
          ) : (
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
            <span>Simulating compilation and bundle tree generation...</span>
          </div>
        ) : (
          <pre className="terminal-output">
            {currentLogs.map((line, idx) => {
              let lineClass = "term-line";
              if (line.startsWith("✓")) lineClass += " term-success";
              else if (line.startsWith("⚠️") || line.includes("warning")) lineClass += " term-warning";
              else if (line.startsWith("▲") || line.startsWith("›") || line.startsWith(">_")) lineClass += " term-accent";
              else if (line.includes("GET") || line.includes("BUNDLE")) lineClass += " term-info";
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
          <span>Estimated JS: <strong>{(buildResult.totalBundleSizeBytes / 1024).toFixed(1)} kB</strong> (gzipped: <strong>{(buildResult.estimatedGzipBytes / 1024).toFixed(1)} kB</strong>)</span>
          <span>•</span>
          <span>Routes: <strong>{buildResult.routes.length} mapped</strong></span>
        </div>
        <div className="terminal-footer-status">
          <span className="status-indicator-dot online" />
          <span>Zero-Host Sandbox Simulation Active</span>
        </div>
      </div>
    </div>
  );
}
