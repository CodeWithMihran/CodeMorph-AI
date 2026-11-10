"use client";

import React, { useState, useMemo } from "react";
import type { ZipEntry } from "@/lib/migration/zip";
import { createZip } from "@/lib/migration/zip";
import {
  synchronizeCrossPlatformTwin,
  type UniversalSyncResult,
  type SynchronizedFilePair,
  type PlatformTarget,
} from "@/lib/synchronizer/universal-transpiler";

interface UniversalTargetModalProps {
  isOpen: boolean;
  onClose: () => void;
  entries: ZipEntry[];
  targetName: string;
  onSwitchTarget: (newEntries: ZipEntry[], newTargetName: string) => void;
}

export function UniversalTargetModal({
  isOpen,
  onClose,
  entries,
  targetName,
  onSwitchTarget,
}: UniversalTargetModalProps) {
  const currentPlatform: PlatformTarget = targetName.toLowerCase().includes("expo") ? "expo" : "nextjs";

  // Run synchronization engine
  const syncResult: UniversalSyncResult = useMemo(() => {
    return synchronizeCrossPlatformTwin(entries, currentPlatform);
  }, [entries, currentPlatform]);

  const [selectedFileIdx, setSelectedFileIdx] = useState(0);
  const [downloadSuccess, setDownloadSuccess] = useState(false);

  const selectedPair: SynchronizedFilePair | null = useMemo(() => {
    return syncResult.filePairs[selectedFileIdx] ?? syncResult.filePairs[0] ?? null;
  }, [syncResult.filePairs, selectedFileIdx]);

  const handleDownloadMonorepo = () => {
    const zipBuffer = createZip(syncResult.universalMonorepoEntries);
    const blob = new Blob([new Uint8Array(zipBuffer)], { type: "application/zip" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "codemorph-universal-monorepo.zip";
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setDownloadSuccess(true);
    setTimeout(() => setDownloadSuccess(false), 3000);
  };

  const handleApplySwitch = () => {
    const newTargetName = currentPlatform === "nextjs"
      ? "Expo Router (React Native Mobile)"
      : "Next.js App Router (TypeScript)";
    onSwitchTarget(syncResult.targetEntries, newTargetName);
    onClose();
  };

  if (!isOpen) return null;

  const targetPlatformLabel = syncResult.targetPlatform === "expo" ? "Expo SDK 58 (Mobile)" : "Next.js App Router (Web)";
  const sourcePlatformLabel = syncResult.sourcePlatform === "nextjs" ? "Next.js App Router (Web)" : "Expo SDK 58 (Mobile)";

  return (
    <div className="universal-modal-backdrop" onClick={onClose}>
      <div className="universal-modal-window" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="universal-modal-header">
          <div className="universal-title-col">
            <div className="universal-title-row">
              <span className="universal-icon">🔄</span>
              <h3>Universal Cross-Platform Target Synchronizer</h3>
              <div className="platform-transition-badge">
                <span className="trans-source">{sourcePlatformLabel}</span>
                <span className="trans-arrow">➔</span>
                <span className="trans-target">{targetPlatformLabel}</span>
              </div>
            </div>
            <p className="universal-subtitle">
              Synthesize and inspect cross-platform twins on the fly, map JSX primitives and navigation paradigms,
              or export a Universal Monorepo containing both Web and Mobile apps.
            </p>
          </div>

          <div className="universal-header-actions">
            <button
              type="button"
              className="action-pill-btn primary-pill"
              onClick={handleDownloadMonorepo}
              title="Download unified monorepo containing apps/web and apps/mobile"
            >
              📦 Export Monorepo (.zip)
            </button>
            <button type="button" className="close-btn" onClick={onClose} title="Close Synchronizer">
              ✕
            </button>
          </div>
        </div>

        {/* Success Banner */}
        {downloadSuccess && (
          <div className="universal-success-banner">
            <span>✓ Downloaded codemorph-universal-monorepo.zip successfully!</span>
          </div>
        )}

        {/* File Pairs Tab Bar */}
        <div className="universal-files-bar">
          <span className="files-bar-label">Synchronized File Pairs:</span>
          <div className="files-pill-list">
            {syncResult.filePairs.map((pair, idx) => {
              const isSelected = idx === selectedFileIdx;
              return (
                <button
                  key={pair.sourcePath}
                  type="button"
                  className={`file-pair-pill ${isSelected ? "is-selected" : ""}`}
                  onClick={() => setSelectedFileIdx(idx)}
                >
                  <span className="pill-source-name">{pair.sourcePath.split("/").pop()}</span>
                  <span className="pill-arrow">➔</span>
                  <span className="pill-target-name">{pair.targetPath.split("/").pop()}</span>
                  {pair.mappedPrimitivesCount > 0 && (
                    <span className="pill-count">+{pair.mappedPrimitivesCount}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected Pair Transform Summary */}
        {selectedPair && (
          <div className="universal-pair-meta">
            <div className="pair-meta-paths">
              <span className="path-source"><code>{selectedPair.sourcePath}</code></span>
              <span className="path-arrow">➔</span>
              <span className="path-target"><code>{selectedPair.targetPath}</code></span>
            </div>
            <div className="pair-transforms-list">
              {selectedPair.appliedTransforms.map((t, i) => (
                <span key={i} className="transform-chip">⚡ {t}</span>
              ))}
            </div>
          </div>
        )}

        {/* Split Code Viewport */}
        <div className="universal-modal-body">
          {selectedPair ? (
            <div className="universal-split-grid">
              {/* Left Column: Source Platform */}
              <div className="split-column source-column">
                <div className="column-header">
                  <div className="column-title-row">
                    <span className="col-platform-badge source-badge">
                      {syncResult.sourcePlatform === "nextjs" ? "🌐 Next.js Web (Source)" : "📱 Expo Mobile (Source)"}
                    </span>
                    <span className="col-path font-mono">{selectedPair.sourcePath}</span>
                  </div>
                </div>
                <pre className="split-code-viewport font-mono">
                  <code>{selectedPair.sourceContent}</code>
                </pre>
              </div>

              {/* Right Column: Target Platform Twin */}
              <div className="split-column target-column">
                <div className="column-header">
                  <div className="column-title-row">
                    <span className="col-platform-badge target-badge">
                      {syncResult.targetPlatform === "expo" ? "📱 Expo Mobile (Synthesized Twin)" : "🌐 Next.js Web (Synthesized Twin)"}
                    </span>
                    <span className="col-path font-mono">{selectedPair.targetPath}</span>
                  </div>
                </div>
                <pre className="split-code-viewport font-mono">
                  <code>{selectedPair.targetContent}</code>
                </pre>
              </div>
            </div>
          ) : (
            <div className="universal-empty-view">
              <p>No transpilable React JSX files found in active project.</p>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="universal-modal-footer">
          <div className="universal-footer-left">
            <span>
              Total Mapped Primitives: <strong>{syncResult.totalMappedPrimitives}</strong> • Monorepo Targets: <strong>apps/web</strong> &amp; <strong>apps/mobile</strong>
            </span>
          </div>

          <div className="universal-footer-right">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Close
            </button>
            <button
              type="button"
              className="action-pill-btn primary-pill"
              onClick={handleDownloadMonorepo}
            >
              Download Monorepo (.zip)
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={handleApplySwitch}
              title={`Hot-swap active workbench target to ${targetPlatformLabel}`}
            >
              Switch Workbench to {syncResult.targetPlatform === "expo" ? "Expo Mobile" : "Next.js Web"} ➔
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
