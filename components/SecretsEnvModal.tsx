"use client";

import React, { useState, useMemo } from "react";
import type { ZipEntry } from "@/lib/migration/zip";
import {
  synthesizeEnvStudioReport,
  injectEnvArchitecture,
  applyEnvPrefixCodemod,
  type EnvStudioReport,
  type DiscoveredEnvVar,
} from "@/lib/env/secret-scanner";

interface SecretsEnvModalProps {
  isOpen: boolean;
  onClose: () => void;
  entries: ZipEntry[];
  targetName: string;
  onApplyInjection?: (updatedEntries: ZipEntry[], appliedCount: number) => void;
  onApplyCodemod?: (updatedEntries: ZipEntry[], replacedCount: number) => void;
  onSelectFile?: (filePath: string) => void;
}

type EnvTab = "variables_inventory" | "typed_contract" | "env_example" | "env_local";

export function SecretsEnvModal({
  isOpen,
  onClose,
  entries,
  targetName,
  onApplyInjection,
  onApplyCodemod,
  onSelectFile,
}: SecretsEnvModalProps) {
  const [activeTab, setActiveTab] = useState<EnvTab>("variables_inventory");
  const [copiedLabel, setCopiedLabel] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const targetPlatform = targetName.toLowerCase().includes("expo") ? "expo" : "nextjs";

  // Synthesize Environment Report
  const report: EnvStudioReport = useMemo(() => {
    return synthesizeEnvStudioReport(entries, targetPlatform);
  }, [entries, targetPlatform]);

  if (!isOpen) return null;

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedLabel(label);
    setTimeout(() => setCopiedLabel(null), 2000);
  };

  const handleInjectFiles = () => {
    if (!onApplyInjection) return;
    const { updatedEntries, appliedCount } = injectEnvArchitecture(entries, report);
    onApplyInjection(updatedEntries, appliedCount);
    setActionSuccess(`Injected ${appliedCount} environment files (.env.example, .env.local.template, lib/env.ts)!`);
    setTimeout(() => setActionSuccess(null), 3500);
  };

  const handleRunPrefixCodemod = () => {
    if (!onApplyCodemod) return;
    const { updatedEntries, replacedCount } = applyEnvPrefixCodemod(entries, targetPlatform);
    if (replacedCount === 0) {
      setActionSuccess("All environment variable references already use modern Next.js/Expo prefixes!");
    } else {
      onApplyCodemod(updatedEntries, replacedCount);
      setActionSuccess(`Successfully modernized ${replacedCount} legacy variable prefix references!`);
    }
    setTimeout(() => setActionSuccess(null), 3500);
  };

  const scoreClass =
    report.securityScore >= 90
      ? "score-good"
      : report.securityScore >= 70
      ? "score-fair"
      : "score-danger";

  return (
    <div className="env-modal-backdrop" onClick={onClose}>
      <div className="env-modal-window" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="env-modal-header">
          <div className="env-title-col">
            <div className="env-title-row">
              <span className="env-icon">🔐</span>
              <h3>Environment Variable &amp; Secret Boundary Studio</h3>
              <span className={`env-score-badge ${scoreClass}`}>
                Security Score: {report.securityScore}/100
              </span>
              <span className="env-vars-badge">
                {report.totalVars} {report.totalVars === 1 ? "Variable" : "Variables"} Discovered
              </span>
              {report.leakedSecretsCount > 0 && (
                <span className="env-leak-badge">
                  🚨 {report.leakedSecretsCount} Leaked {report.leakedSecretsCount === 1 ? "Secret" : "Secrets"} Alert
                </span>
              )}
            </div>
            <p className="env-subtitle">
              Audits environment variables for {targetName}. Enforces strict Client (`NEXT_PUBLIC_`) vs Server-only boundaries
              to prevent confidential database tokens and API secrets from leaking into client bundles.
            </p>
          </div>

          <div className="env-header-actions">
            <button
              type="button"
              className="env-codemod-btn"
              onClick={handleRunPrefixCodemod}
              title="Modernize REACT_APP_ and VITE_ prefixes across all files"
            >
              ⚡ Modernize Prefixes
            </button>
            <button
              type="button"
              className="env-inject-btn"
              onClick={handleInjectFiles}
              title="Inject lib/env.ts typed contract and .env manifests into project"
            >
              ⚡ Inject Typed Contract
            </button>
            <button type="button" className="close-btn" onClick={onClose} title="Close Secrets Studio">
              ✕
            </button>
          </div>
        </div>

        {actionSuccess && (
          <div className="env-banner-success">
            <span>✅ {actionSuccess}</span>
          </div>
        )}

        {/* Leaked Secret Alert Banner */}
        {report.leakedSecretsCount > 0 && (
          <div className="env-leak-alert-banner">
            <div className="alert-icon">⚠️</div>
            <div className="alert-text">
              <strong>CRITICAL SECURITY VULNERABILITY DETECTED</strong>
              <p>
                {report.leakedSecretsCount} confidential {report.leakedSecretsCount === 1 ? "secret is" : "secrets are"} directly
                referenced in Client Components (&quot;use client&quot;). In Next.js App Router, these secrets will either be exposed in
                client JavaScript or stripped. Move these operations to Server Actions or Route Handlers!
              </p>
            </div>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="env-tabs-bar">
          <button
            type="button"
            className={`env-tab-btn ${activeTab === "variables_inventory" ? "active" : ""}`}
            onClick={() => setActiveTab("variables_inventory")}
          >
            📋 Discovered Variables ({report.variables.length})
          </button>
          <button
            type="button"
            className={`env-tab-btn ${activeTab === "typed_contract" ? "active" : ""}`}
            onClick={() => setActiveTab("typed_contract")}
          >
            🛡️ Typed Contract (`lib/env.ts`)
          </button>
          <button
            type="button"
            className={`env-tab-btn ${activeTab === "env_example" ? "active" : ""}`}
            onClick={() => setActiveTab("env_example")}
          >
            📄 `.env.example`
          </button>
          <button
            type="button"
            className={`env-tab-btn ${activeTab === "env_local" ? "active" : ""}`}
            onClick={() => setActiveTab("env_local")}
          >
            🔒 `.env.local.template`
          </button>
        </div>

        {/* Tab 1: Variables Inventory */}
        {activeTab === "variables_inventory" && (
          <div className="env-tab-content">
            <div className="env-table-container">
              <table className="env-vars-table">
                <thead>
                  <tr>
                    <th>Variable Name</th>
                    <th>Modernized Key</th>
                    <th>Scope &amp; Boundary</th>
                    <th>Referenced In Files</th>
                    <th>Security Recommendation</th>
                  </tr>
                </thead>
                <tbody>
                  {report.variables.map((v: DiscoveredEnvVar, idx: number) => (
                    <tr
                      key={idx}
                      className={
                        v.hasClientLeak
                          ? "row-leak"
                          : v.scope === "public_client"
                          ? "row-public"
                          : "row-server"
                      }
                    >
                      <td className="var-name-cell">
                        <code>{v.name}</code>
                        {v.name !== v.modernizedName && (
                          <span className="legacy-tag">legacy prefix</span>
                        )}
                      </td>
                      <td className="modern-name-cell">
                        <code>{v.modernizedName}</code>
                      </td>
                      <td className="scope-cell">
                        {v.hasClientLeak ? (
                          <span className="scope-badge leak">🚨 Leaked Secret</span>
                        ) : v.scope === "public_client" ? (
                          <span className="scope-badge public">Public Client</span>
                        ) : (
                          <span className="scope-badge server">Server-Only</span>
                        )}
                      </td>
                      <td className="files-cell">
                        {v.usedInFiles.map((file, fIdx) => (
                          <div
                            key={fIdx}
                            className="file-item"
                            onClick={() => onSelectFile?.(file)}
                          >
                            📄 {file}
                          </div>
                        ))}
                      </td>
                      <td className="rec-cell">
                        <span className={v.hasClientLeak ? "rec-leak" : "rec-normal"}>
                          {v.recommendation}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 2: Typed Contract lib/env.ts */}
        {activeTab === "typed_contract" && (
          <div className="env-tab-content code-tab-layout">
            <div className="code-header">
              <div className="file-meta">
                <span className="file-path">📄 lib/env.ts</span>
                <span className="file-desc">Runtime type validation and client/server boundary guard</span>
              </div>
              <button
                type="button"
                className="copy-btn"
                onClick={() => handleCopy(report.envTypesContent, "types")}
              >
                {copiedLabel === "types" ? "✓ Copied" : "📋 Copy Code"}
              </button>
            </div>
            <pre className="code-pre">
              <code>{report.envTypesContent}</code>
            </pre>
          </div>
        )}

        {/* Tab 3: .env.example */}
        {activeTab === "env_example" && (
          <div className="env-tab-content code-tab-layout">
            <div className="code-header">
              <div className="file-meta">
                <span className="file-path">📄 .env.example</span>
                <span className="file-desc">Documented repository environment variable manifest</span>
              </div>
              <button
                type="button"
                className="copy-btn"
                onClick={() => handleCopy(report.envExampleContent, "example")}
              >
                {copiedLabel === "example" ? "✓ Copied" : "📋 Copy Code"}
              </button>
            </div>
            <pre className="code-pre">
              <code>{report.envExampleContent}</code>
            </pre>
          </div>
        )}

        {/* Tab 4: .env.local.template */}
        {activeTab === "env_local" && (
          <div className="env-tab-content code-tab-layout">
            <div className="code-header">
              <div className="file-meta">
                <span className="file-path">📄 .env.local.template</span>
                <span className="file-desc">Local development secrets configuration template</span>
              </div>
              <button
                type="button"
                className="copy-btn"
                onClick={() => handleCopy(report.envLocalContent, "local")}
              >
                {copiedLabel === "local" ? "✓ Copied" : "📋 Copy Code"}
              </button>
            </div>
            <pre className="code-pre">
              <code>{report.envLocalContent}</code>
            </pre>
          </div>
        )}

        {/* Modal Footer */}
        <div className="env-modal-footer">
          <div className="footer-left-info">
            <span>
              Variables without <code>NEXT_PUBLIC_</code> are strictly isolated to Server Components, Actions, and Route Handlers.
            </span>
          </div>
          <div className="footer-right-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Done
            </button>
            <button type="button" className="btn-primary" onClick={handleInjectFiles}>
              ⚡ Inject Environment Architecture
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
