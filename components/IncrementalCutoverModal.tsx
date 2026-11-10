"use client";

import React, { useState, useMemo } from "react";
import type { ZipEntry } from "@/lib/migration/zip";
import {
  synthesizeStranglerCutover,
  applyStranglerCutover,
  type StranglerCutoverSynthesis,
  type RouteCutoverStatus,
} from "@/lib/cutover/strangler-configurator";

interface IncrementalCutoverModalProps {
  isOpen: boolean;
  onClose: () => void;
  entries: ZipEntry[];
  targetName: string;
  onApplyCutover?: (updatedEntries: ZipEntry[], appliedCount: number) => void;
  onSelectFile?: (filePath: string) => void;
}

type CutoverTab = "traffic_map" | "next_config" | "middleware" | "edge_proxies";

export function IncrementalCutoverModal({
  isOpen,
  onClose,
  entries,
  targetName,
  onApplyCutover,
  onSelectFile,
}: IncrementalCutoverModalProps) {
  const [activeTab, setActiveTab] = useState<CutoverTab>("traffic_map");
  const [legacyHost, setLegacyHost] = useState<string>("https://legacy-spa.example.com");
  const [preserveCookies, setPreserveCookies] = useState<boolean>(true);
  const [selectedEdgeProxy, setSelectedEdgeProxy] = useState<"cloudflare" | "nginx" | "cloudfront">("cloudflare");
  const [copiedFile, setCopiedFile] = useState<string | null>(null);
  const [applySuccess, setApplySuccess] = useState<string | null>(null);

  // Synthesize Strangler Fig Cutover configuration
  const synthesis: StranglerCutoverSynthesis = useMemo(() => {
    return synthesizeStranglerCutover(entries, {
      legacyHost,
      preserveCookies,
    });
  }, [entries, legacyHost, preserveCookies]);

  if (!isOpen) return null;

  const handleCopy = (content: string, label: string) => {
    navigator.clipboard.writeText(content);
    setCopiedFile(label);
    setTimeout(() => setCopiedFile(null), 2000);
  };

  const handleApply = () => {
    if (!onApplyCutover) return;
    const { updatedEntries, appliedCount } = applyStranglerCutover(entries, synthesis);
    onApplyCutover(updatedEntries, appliedCount);
    setApplySuccess(
      `Successfully applied Strangler Fig configuration (${appliedCount} files updated: next.config.ts, middleware.ts, edge proxies)!`
    );
    setTimeout(() => setApplySuccess(null), 3500);
  };

  const edgeFileContent =
    selectedEdgeProxy === "cloudflare"
      ? synthesis.cloudflareWorkerContent
      : selectedEdgeProxy === "nginx"
      ? synthesis.nginxConfigContent
      : synthesis.cloudfrontLambdaContent;

  const edgeFilePath =
    selectedEdgeProxy === "cloudflare"
      ? ".codemorph/cutover/cloudflare-worker.js"
      : selectedEdgeProxy === "nginx"
      ? ".codemorph/cutover/nginx.conf"
      : ".codemorph/cutover/cloudfront-lambda.js";

  return (
    <div className="cutover-modal-backdrop" onClick={onClose}>
      <div className="cutover-modal-window" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="cutover-modal-header">
          <div className="cutover-title-col">
            <div className="cutover-title-row">
              <span className="cutover-icon">🔀</span>
              <h3>Incremental Migration &amp; Strangler Fig Configurator</h3>
              <span className="cutover-badge-pct">
                {synthesis.cutoverPercentage}% Modernized
              </span>
              <span className="cutover-badge-next">
                {synthesis.modernizedRoutesCount} Next.js Routes
              </span>
              <span className="cutover-badge-legacy">
                {synthesis.legacyRoutesCount} Legacy Fallbacks
              </span>
            </div>
            <p className="cutover-subtitle">
              Safely transition from legacy SPAs to {targetName} using the Strangler Fig Pattern.
              Modernized routes render locally on App Router, while unmigrated paths proxy to your legacy host with shared cookies.
            </p>
          </div>

          <div className="cutover-header-actions">
            <button
              type="button"
              className="cutover-apply-btn"
              onClick={handleApply}
              title="Apply Strangler Fig rewrites and middleware to project"
            >
              ⚡ Apply Strangler Fig Rewrites
            </button>
            <button type="button" className="close-btn" onClick={onClose} title="Close Cutover Studio">
              ✕
            </button>
          </div>
        </div>

        {applySuccess && (
          <div className="cutover-banner-success">
            <span>✅ {applySuccess}</span>
          </div>
        )}

        {/* Global Settings & Traffic Split Meter */}
        <div className="cutover-summary-bar">
          <div className="legacy-host-field">
            <label htmlFor="cutover-legacy-host">Legacy SPA Host:</label>
            <input
              id="cutover-legacy-host"
              type="text"
              value={legacyHost}
              onChange={(e) => setLegacyHost(e.target.value)}
              placeholder="https://legacy.example.com"
            />
          </div>

          <div className="cutover-checkbox-field">
            <label>
              <input
                type="checkbox"
                checked={preserveCookies}
                onChange={(e) => setPreserveCookies(e.target.checked)}
              />
              Preserve Session Cookies &amp; Auth Headers
            </label>
          </div>

          {/* Traffic Split Meter */}
          <div className="traffic-meter-col">
            <div className="meter-label-row">
              <span className="meter-label-next">▲ Modernized: {synthesis.cutoverPercentage}%</span>
              <span className="meter-label-legacy">🏛️ Legacy Fallback: {100 - synthesis.cutoverPercentage}%</span>
            </div>
            <div className="traffic-progress-bar">
              <div
                className="progress-segment nextjs"
                style={{ width: `${synthesis.cutoverPercentage}%` }}
                title={`Modernized Next.js App Router: ${synthesis.cutoverPercentage}%`}
              />
              <div
                className="progress-segment legacy"
                style={{ width: `${100 - synthesis.cutoverPercentage}%` }}
                title={`Legacy SPA Fallback: ${100 - synthesis.cutoverPercentage}%`}
              />
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="cutover-tabs-bar">
          <button
            type="button"
            className={`cutover-tab-btn ${activeTab === "traffic_map" ? "active" : ""}`}
            onClick={() => setActiveTab("traffic_map")}
          >
            🗺️ Route Traffic Map ({synthesis.routeStatuses.length})
          </button>
          <button
            type="button"
            className={`cutover-tab-btn ${activeTab === "next_config" ? "active" : ""}`}
            onClick={() => setActiveTab("next_config")}
          >
            ⚙️ `next.config.ts` Rewrites
          </button>
          <button
            type="button"
            className={`cutover-tab-btn ${activeTab === "middleware" ? "active" : ""}`}
            onClick={() => setActiveTab("middleware")}
          >
            🛡️ `middleware.ts` Session Sync
          </button>
          <button
            type="button"
            className={`cutover-tab-btn ${activeTab === "edge_proxies" ? "active" : ""}`}
            onClick={() => setActiveTab("edge_proxies")}
          >
            🌐 Edge Proxy Templates (Cloudflare / Nginx / AWS)
          </button>
        </div>

        {/* Tab 1: Route Traffic Map */}
        {activeTab === "traffic_map" && (
          <div className="cutover-tab-content">
            <div className="cutover-table-container">
              <table className="cutover-routes-table">
                <thead>
                  <tr>
                    <th>Route Path</th>
                    <th>Routing Target</th>
                    <th>Execution Layer</th>
                    <th>Source / File Location</th>
                    <th>Cutover Action</th>
                  </tr>
                </thead>
                <tbody>
                  {synthesis.routeStatuses.map((rs: RouteCutoverStatus, idx: number) => (
                    <tr key={idx} className={rs.target === "nextjs" ? "row-nextjs" : "row-legacy"}>
                      <td className="route-cell">
                        <code>{rs.route}</code>
                      </td>
                      <td className="target-cell">
                        {rs.target === "nextjs" ? (
                          <span className="target-badge nextjs">▲ Next.js App Router</span>
                        ) : (
                          <span className="target-badge legacy">🏛️ Legacy SPA Fallback</span>
                        )}
                      </td>
                      <td className="layer-cell">
                        {rs.target === "nextjs" ? (
                          <span className="layer-pill local">Local Serverless / Edge</span>
                        ) : (
                          <span className="layer-pill proxy">Reverse Proxy to {new URL(legacyHost).hostname}</span>
                        )}
                      </td>
                      <td className="file-cell">
                        {rs.filePath ? (
                          <span className="file-link" onClick={() => onSelectFile?.(rs.filePath!)}>
                            📄 {rs.filePath}
                          </span>
                        ) : (
                          <span className="unmigrated-tag">Unmigrated route</span>
                        )}
                      </td>
                      <td className="action-cell">
                        <span className="reason-text">{rs.reason}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 2: next.config.ts rewrites */}
        {activeTab === "next_config" && (
          <div className="cutover-tab-content code-tab-layout">
            <div className="code-viewer-header">
              <div className="file-meta">
                <span className="file-path">📄 next.config.ts</span>
                <span className="file-desc">Next.js App Router fallback rewrites configuration</span>
              </div>
              <button
                type="button"
                className="copy-btn"
                onClick={() => handleCopy(synthesis.nextConfigContent, "nextconfig")}
              >
                {copiedFile === "nextconfig" ? "✓ Copied" : "📋 Copy Code"}
              </button>
            </div>
            <pre className="code-viewer-pre">
              <code>{synthesis.nextConfigContent}</code>
            </pre>
          </div>
        )}

        {/* Tab 3: middleware.ts session sync */}
        {activeTab === "middleware" && (
          <div className="cutover-tab-content code-tab-layout">
            <div className="code-viewer-header">
              <div className="file-meta">
                <span className="file-path">📄 middleware.ts</span>
                <span className="file-desc">Cross-origin authentication cookie &amp; header propagation</span>
              </div>
              <button
                type="button"
                className="copy-btn"
                onClick={() => handleCopy(synthesis.middlewareContent, "middleware")}
              >
                {copiedFile === "middleware" ? "✓ Copied" : "📋 Copy Code"}
              </button>
            </div>
            <pre className="code-viewer-pre">
              <code>{synthesis.middlewareContent}</code>
            </pre>
          </div>
        )}

        {/* Tab 4: Edge Proxy Templates */}
        {activeTab === "edge_proxies" && (
          <div className="cutover-tab-content edge-tab-layout">
            <div className="edge-selector-bar">
              <button
                type="button"
                className={`edge-btn ${selectedEdgeProxy === "cloudflare" ? "active" : ""}`}
                onClick={() => setSelectedEdgeProxy("cloudflare")}
              >
                Cloudflare Worker
              </button>
              <button
                type="button"
                className={`edge-btn ${selectedEdgeProxy === "nginx" ? "active" : ""}`}
                onClick={() => setSelectedEdgeProxy("nginx")}
              >
                Nginx Configuration
              </button>
              <button
                type="button"
                className={`edge-btn ${selectedEdgeProxy === "cloudfront" ? "active" : ""}`}
                onClick={() => setSelectedEdgeProxy("cloudfront")}
              >
                AWS CloudFront Lambda@Edge
              </button>
            </div>

            <div className="code-viewer-header">
              <div className="file-meta">
                <span className="file-path">📄 {edgeFilePath}</span>
                <span className="file-desc">
                  {selectedEdgeProxy === "cloudflare"
                    ? "Cloudflare Worker routing script"
                    : selectedEdgeProxy === "nginx"
                    ? "Nginx location reverse proxy block"
                    : "AWS Lambda@Edge origin-request router"}
                </span>
              </div>
              <button
                type="button"
                className="copy-btn"
                onClick={() => handleCopy(edgeFileContent, selectedEdgeProxy)}
              >
                {copiedFile === selectedEdgeProxy ? "✓ Copied" : "📋 Copy Code"}
              </button>
            </div>
            <pre className="code-viewer-pre">
              <code>{edgeFileContent}</code>
            </pre>
          </div>
        )}

        {/* Modal Footer */}
        <div className="cutover-modal-footer">
          <div className="footer-left-info">
            <span>
              Strangler Fig rewrites proxy requests transparently on the server side with zero client redirect lag.
            </span>
          </div>
          <div className="footer-right-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Done
            </button>
            <button type="button" className="btn-primary" onClick={handleApply}>
              ⚡ Apply Strangler Fig Rewrites
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
