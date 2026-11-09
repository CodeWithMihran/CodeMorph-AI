"use client";

import React, { useState, useMemo } from "react";
import type { ZipEntry } from "@/lib/migration/zip";
import {
  getDeploymentPresets,
  type DeploymentPreset,
  type CloudProviderId,
} from "@/lib/deployment/launch-templates";

interface DeploymentLaunchModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetName: string;
  projectName?: string;
  entries: ZipEntry[];
  onInjectFile: (filename: string, content: string) => void;
}

export function DeploymentLaunchModal({
  isOpen,
  onClose,
  targetName,
  projectName = "codemorph-migrated-app",
  entries,
  onInjectFile,
}: DeploymentLaunchModalProps) {
  const { presets, discoveredEnvVars } = useMemo(() => {
    return getDeploymentPresets(targetName, projectName, entries);
  }, [targetName, projectName, entries]);

  const [activeProviderId, setActiveProviderId] = useState<CloudProviderId>(() => presets[0]?.id || "vercel");
  const [copyToast, setCopyToast] = useState(false);
  const [injectToast, setInjectToast] = useState<string | null>(null);

  const activePreset: DeploymentPreset = useMemo(() => {
    return presets.find((p) => p.id === activeProviderId) || presets[0];
  }, [presets, activeProviderId]);

  const handleCopyConfig = async () => {
    try {
      await navigator.clipboard.writeText(activePreset.content);
      setCopyToast(true);
      setTimeout(() => setCopyToast(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handleInject = () => {
    onInjectFile(activePreset.filename, activePreset.content);
    setInjectToast(activePreset.filename);
    setTimeout(() => setInjectToast(null), 2500);
  };

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="deployment-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="deployment-header">
          <div className="deployment-header-left">
            <span className="deployment-header-icon">🚀</span>
            <div>
              <h3 className="deployment-modal-title">Cloud Deployment &amp; Launch Integrator</h3>
              <p className="deployment-modal-subtitle">
                Synthesize production deployment manifests, launch to cloud hosting, and generate secret manifests.
              </p>
            </div>
          </div>
          <div className="deployment-header-right">
            <span className="deploy-target-tag">Target: {targetName}</span>
            <button
              type="button"
              className="checkpoint-close-btn"
              onClick={onClose}
              aria-label="Close deployment modal"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Provider Tabs */}
        <div className="deployment-tabs-bar">
          {presets.map((preset) => {
            const isActive = preset.id === activeProviderId;
            return (
              <button
                key={preset.id}
                type="button"
                className={`deploy-tab-btn ${isActive ? "is-active" : ""}`}
                onClick={() => setActiveProviderId(preset.id)}
              >
                <span className="deploy-tab-icon">{preset.icon}</span>
                <span className="deploy-tab-name">{preset.providerName}</span>
                {preset.recommendedFor === "nextjs" && targetName.includes("Next") && (
                  <span className="recommended-tag">PREFER</span>
                )}
                {preset.recommendedFor === "expo" && targetName.includes("Expo") && (
                  <span className="recommended-tag">PREFER</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Provider Content Area */}
        <div className="deployment-body">
          <div className="deploy-provider-summary">
            <div className="provider-meta-row">
              <div className="provider-info-left">
                <span className="provider-avatar-icon">{activePreset.icon}</span>
                <div>
                  <h4 className="provider-title">{activePreset.providerName}</h4>
                  <span className="provider-badge-pill">{activePreset.badge}</span>
                </div>
              </div>

              <div className="provider-actions-row">
                <button
                  type="button"
                  className="deploy-action-btn copy"
                  onClick={handleCopyConfig}
                  title="Copy configuration code"
                >
                  {copyToast ? "✓ Copied!" : "📋 Copy Config"}
                </button>

                <button
                  type="button"
                  className="deploy-action-btn inject"
                  onClick={handleInject}
                  title={`Add ${activePreset.filename} into project files`}
                >
                  {injectToast ? `✓ Added ${injectToast}!` : `📥 Inject ${activePreset.filename}`}
                </button>

                {activePreset.deployUrl && (
                  <a
                    href={activePreset.deployUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="deploy-action-btn launch"
                    title={`Open 1-Click Launch on ${activePreset.providerName}`}
                  >
                    🚀 One-Click Launch ➔
                  </a>
                )}
              </div>
            </div>

            {/* Checklist */}
            <div className="deploy-checklist-box">
              <div className="checklist-title">Production Verification Highlights:</div>
              <ul className="checklist-list">
                {activePreset.checklist.map((item, idx) => (
                  <li key={idx} className="checklist-item">
                    <span className="check-check">✓</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* CLI Command */}
            {activePreset.cliCommand && (
              <div className="deploy-cli-box">
                <span className="cli-label">Local Terminal Command:</span>
                <code className="cli-code">$ {activePreset.cliCommand}</code>
              </div>
            )}
          </div>

          {/* Config Preview */}
          <div className="deploy-config-preview-wrap">
            <div className="config-file-header">
              <span className="config-file-name">{activePreset.filename}</span>
              <span className="config-file-size">
                {activePreset.content.split("\n").length} lines · {new TextEncoder().encode(activePreset.content).length} bytes
              </span>
            </div>
            <pre className="config-code-pre">
              <code>{activePreset.content}</code>
            </pre>
          </div>
        </div>

        {/* Footer */}
        <div className="deployment-footer">
          <div className="deployment-footer-left">
            <span>Discovered Environment Variables: <strong>{discoveredEnvVars.length} keys</strong></span>
            {discoveredEnvVars.length > 0 && (
              <span className="env-keys-preview">
                ({discoveredEnvVars.slice(0, 3).join(", ")}{discoveredEnvVars.length > 3 ? "…" : ""})
              </span>
            )}
          </div>
          <div className="deployment-footer-right">
            <button type="button" className="action-btn secondary" onClick={onClose}>
              Done / Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
