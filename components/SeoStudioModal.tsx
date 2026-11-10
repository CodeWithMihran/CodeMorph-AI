"use client";

import React, { useState, useMemo } from "react";
import type { ZipEntry } from "@/lib/migration/zip";
import {
  synthesizeSeoArchitecture,
  injectSeoArchitecture,
  generateJsonLdSnippet,
  type SeoArchitectureSynthesis,
  type RouteSeoProfile,
  type GeneratedSeoFile,
} from "@/lib/seo/metadata-synthesizer";

interface SeoStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  entries: ZipEntry[];
  targetName: string;
  onInjectFiles?: (updatedEntries: ZipEntry[], injectedCount: number) => void;
  onSelectFile?: (filePath: string) => void;
}

type SeoTab = "google_preview" | "social_preview" | "routes_table" | "file_metadata";

export function SeoStudioModal({
  isOpen,
  onClose,
  entries,
  targetName,
  onInjectFiles,
  onSelectFile,
}: SeoStudioModalProps) {
  const [activeTab, setActiveTab] = useState<SeoTab>("google_preview");
  const [siteName, setSiteName] = useState<string>("CodeMorph App");
  const [baseUrl, setBaseUrl] = useState<string>("https://example.com");
  const [selectedRouteIndex, setSelectedRouteIndex] = useState<number>(0);
  const [excludedPaths, setExcludedPaths] = useState<Set<string>>(() => new Set());
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "mobile">("desktop");
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [injectSuccess, setInjectSuccess] = useState<string | null>(null);

  // Synthesize SEO Architecture
  const synthesis: SeoArchitectureSynthesis = useMemo(() => {
    return synthesizeSeoArchitecture(entries, { siteName, baseUrl });
  }, [entries, siteName, baseUrl]);

  // Derived selected paths to inject
  const selectedPathsToInject = useMemo(() => {
    return new Set(
      synthesis.generatedFiles
        .map((f) => f.path)
        .filter((p) => !excludedPaths.has(p))
    );
  }, [synthesis.generatedFiles, excludedPaths]);

  if (!isOpen) return null;

  const currentProfile: RouteSeoProfile =
    synthesis.profiles[selectedRouteIndex] || synthesis.profiles[0] || {
      route: "/",
      filePath: "app/page.tsx",
      inferredTitle: "Home",
      inferredDescription: "Welcome to CodeMorph App.",
      keywords: ["nextjs", "react"],
      ogType: "website",
      hasExistingMetadata: false,
      isClientComponent: false,
    };

  const currentFullTitle =
    currentProfile.route === "/"
      ? `${siteName} — ${currentProfile.inferredTitle}`
      : `${currentProfile.inferredTitle} | ${siteName}`;

  const currentCanonicalUrl = `${baseUrl.replace(/\/$/, "")}${
    currentProfile.route === "/" ? "" : currentProfile.route
  }`;

  const toggleSelectPath = (path: string) => {
    const next = new Set(excludedPaths);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    setExcludedPaths(next);
  };

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const handleInject = () => {
    if (!onInjectFiles) return;
    const filesToInject = synthesis.generatedFiles.filter((f) => selectedPathsToInject.has(f.path));
    if (filesToInject.length === 0) return;

    const { updatedEntries, injectedCount } = injectSeoArchitecture(entries, filesToInject);
    onInjectFiles(updatedEntries, injectedCount);
    setInjectSuccess(`Successfully injected ${injectedCount} SEO & Metadata files into your project!`);
    setTimeout(() => setInjectSuccess(null), 3500);
  };

  const fileMetadataList: GeneratedSeoFile[] = synthesis.generatedFiles.filter(
    (f) => f.type === "sitemap" || f.type === "robots" || f.type === "manifest"
  );

  return (
    <div className="seo-modal-backdrop" onClick={onClose}>
      <div className="seo-modal-window" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="seo-modal-header">
          <div className="seo-title-col">
            <div className="seo-title-row">
              <span className="seo-icon">🔍</span>
              <h3>SEO &amp; OpenGraph Social Metadata Studio</h3>
              <span className="seo-score-badge">
                SEO Score: {synthesis.overallSeoScore}/100
              </span>
              <span className="seo-routes-badge">
                {synthesis.routesCount} {synthesis.routesCount === 1 ? "Route" : "Routes"} Optimized
              </span>
            </div>
            <p className="seo-subtitle">
              Generates typed App Router metadata (`export const metadata: Metadata`), XML sitemaps, robots.txt, and PWA manifests
              with real-time Google search and OpenGraph card previews for {targetName}.
            </p>
          </div>

          <div className="seo-header-actions">
            <button
              type="button"
              className="seo-inject-btn"
              onClick={handleInject}
              disabled={selectedPathsToInject.size === 0}
              title="Inject selected SEO files and metadata into project"
            >
              ⚡ Inject SEO into Project ({selectedPathsToInject.size})
            </button>
            <button type="button" className="close-btn" onClick={onClose} title="Close SEO Studio">
              ✕
            </button>
          </div>
        </div>

        {injectSuccess && (
          <div className="seo-banner-success">
            <span>✅ {injectSuccess}</span>
          </div>
        )}

        {/* Global SEO Settings Bar */}
        <div className="seo-settings-bar">
          <div className="setting-field">
            <label htmlFor="seo-site-name">Site Name:</label>
            <input
              id="seo-site-name"
              type="text"
              value={siteName}
              onChange={(e) => setSiteName(e.target.value)}
              placeholder="e.g. Acme Corp"
            />
          </div>
          <div className="setting-field">
            <label htmlFor="seo-base-url">Production Domain:</label>
            <input
              id="seo-base-url"
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://example.com"
            />
          </div>
          <div className="route-picker-field">
            <label htmlFor="seo-route-select">Preview Route:</label>
            <select
              id="seo-route-select"
              value={selectedRouteIndex}
              onChange={(e) => setSelectedRouteIndex(Number(e.target.value))}
            >
              {synthesis.profiles.map((p, idx) => (
                <option key={p.route} value={idx}>
                  {p.route} ({p.inferredTitle})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="seo-tabs-bar">
          <button
            type="button"
            className={`seo-tab-btn ${activeTab === "google_preview" ? "active" : ""}`}
            onClick={() => setActiveTab("google_preview")}
          >
            🌐 Google Search Preview
          </button>
          <button
            type="button"
            className={`seo-tab-btn ${activeTab === "social_preview" ? "active" : ""}`}
            onClick={() => setActiveTab("social_preview")}
          >
            📱 Social Card (Twitter / LinkedIn)
          </button>
          <button
            type="button"
            className={`seo-tab-btn ${activeTab === "routes_table" ? "active" : ""}`}
            onClick={() => setActiveTab("routes_table")}
          >
            📋 Route Metadata Directory ({synthesis.profiles.length})
          </button>
          <button
            type="button"
            className={`seo-tab-btn ${activeTab === "file_metadata" ? "active" : ""}`}
            onClick={() => setActiveTab("file_metadata")}
          >
            📄 Sitemaps, Robots &amp; Manifest (3)
          </button>
        </div>

        {/* Tab Content 1: Google Search Result Preview */}
        {activeTab === "google_preview" && (
          <div className="seo-tab-content">
            <div className="preview-toolbar">
              <span className="preview-label">Google SERP Snippet Preview:</span>
              <div className="device-toggle">
                <button
                  type="button"
                  className={`device-btn ${previewDevice === "desktop" ? "active" : ""}`}
                  onClick={() => setPreviewDevice("desktop")}
                >
                  🖥️ Desktop View
                </button>
                <button
                  type="button"
                  className={`device-btn ${previewDevice === "mobile" ? "active" : ""}`}
                  onClick={() => setPreviewDevice("mobile")}
                >
                  📱 Mobile View
                </button>
              </div>
            </div>

            <div className={`google-snippet-card ${previewDevice}`}>
              <div className="google-url-row">
                <div className="google-favicon">🌐</div>
                <div className="google-url-text">
                  <span className="site-name-display">{siteName}</span>
                  <span className="url-breadcrumb">{currentCanonicalUrl}</span>
                </div>
              </div>
              <h3 className="google-title-link">{currentFullTitle}</h3>
              <p className="google-snippet-desc">{currentProfile.inferredDescription}</p>
            </div>

            {/* Schema.org JSON-LD preview */}
            <div className="json-ld-section">
              <div className="json-ld-header">
                <span>Schema.org JSON-LD Structured Data:</span>
                <button
                  type="button"
                  className="copy-btn"
                  onClick={() => handleCopy(generateJsonLdSnippet(currentProfile, siteName, baseUrl), "jsonld")}
                >
                  {copiedText === "jsonld" ? "✓ Copied" : "📋 Copy JSON-LD"}
                </button>
              </div>
              <pre className="json-ld-pre">
                <code>{generateJsonLdSnippet(currentProfile, siteName, baseUrl)}</code>
              </pre>
            </div>
          </div>
        )}

        {/* Tab Content 2: Social Card Previews */}
        {activeTab === "social_preview" && (
          <div className="seo-tab-content">
            <div className="social-cards-grid">
              {/* Twitter / X Card */}
              <div className="social-preview-card twitter-card">
                <div className="card-platform-badge">Twitter / X Summary Card</div>
                <div className="card-image-placeholder">
                  <div className="og-image-art">
                    <span className="art-site">{siteName}</span>
                    <span className="art-title">{currentProfile.inferredTitle}</span>
                  </div>
                </div>
                <div className="card-body">
                  <span className="card-domain">{new URL(baseUrl).hostname}</span>
                  <h4 className="card-title">{currentFullTitle}</h4>
                  <p className="card-desc">{currentProfile.inferredDescription}</p>
                </div>
              </div>

              {/* LinkedIn / Facebook Card */}
              <div className="social-preview-card linkedin-card">
                <div className="card-platform-badge">LinkedIn / OpenGraph Card</div>
                <div className="card-image-placeholder">
                  <div className="og-image-art alt-theme">
                    <span className="art-site">{siteName}</span>
                    <span className="art-title">{currentProfile.inferredTitle}</span>
                  </div>
                </div>
                <div className="card-body">
                  <span className="card-domain">{new URL(baseUrl).hostname.toUpperCase()}</span>
                  <h4 className="card-title">{currentFullTitle}</h4>
                  <p className="card-desc">{currentProfile.inferredDescription}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab Content 3: Routes Table */}
        {activeTab === "routes_table" && (
          <div className="seo-tab-content">
            <div className="seo-table-container">
              <table className="seo-routes-table">
                <thead>
                  <tr>
                    <th>Route</th>
                    <th>Inferred Title</th>
                    <th>Meta Description</th>
                    <th>Keywords</th>
                    <th>Scope</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {synthesis.profiles.map((p, idx) => (
                    <tr
                      key={p.route}
                      className={idx === selectedRouteIndex ? "selected-row" : ""}
                      onClick={() => setSelectedRouteIndex(idx)}
                    >
                      <td className="route-cell">
                        <code>{p.route}</code>
                        <span className="file-subtext" onClick={() => onSelectFile?.(p.filePath)}>
                          📄 {p.filePath}
                        </span>
                      </td>
                      <td className="title-cell">
                        <strong>{p.inferredTitle}</strong>
                      </td>
                      <td className="desc-cell">{p.inferredDescription}</td>
                      <td className="keywords-cell">
                        {p.keywords.slice(0, 3).map((kw, kwIdx) => (
                          <span key={kwIdx} className="kw-badge">
                            {kw}
                          </span>
                        ))}
                      </td>
                      <td className="scope-cell">
                        <span className={`scope-badge ${p.isClientComponent ? "client" : "server"}`}>
                          {p.isClientComponent ? "Client" : "Server"}
                        </span>
                      </td>
                      <td className="status-cell">
                        {p.hasExistingMetadata ? (
                          <span className="status-badge existing">✓ Configured</span>
                        ) : (
                          <span className="status-badge synthesized">⚡ Synthesized</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab Content 4: File Metadata (Sitemaps, Robots, Manifest) */}
        {activeTab === "file_metadata" && (
          <div className="seo-tab-content file-metadata-layout">
            <div className="file-meta-sidebar">
              {fileMetadataList.map((file) => {
                const isSelected = selectedPathsToInject.has(file.path);
                return (
                  <div key={file.path} className="file-meta-card">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelectPath(file.path)}
                    />
                    <div className="file-meta-info">
                      <span className="file-path">{file.path}</span>
                      <span className="file-desc">{file.description}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="file-meta-previews">
              {fileMetadataList.map((file) => (
                <div key={file.path} className="code-file-block">
                  <div className="file-block-header">
                    <span>📄 {file.path}</span>
                    <button
                      type="button"
                      className="copy-btn"
                      onClick={() => handleCopy(file.content, file.path)}
                    >
                      {copiedText === file.path ? "✓ Copied" : "📋 Copy"}
                    </button>
                  </div>
                  <pre className="file-block-pre">
                    <code>{file.content}</code>
                  </pre>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Modal Footer */}
        <div className="seo-modal-footer">
          <div className="footer-left-info">
            <span>
              Metadata complies with Next.js 15 App Router specifications &amp; Schema.org standards.
            </span>
          </div>
          <div className="footer-right-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Done
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={handleInject}
              disabled={selectedPathsToInject.size === 0}
            >
              ⚡ Inject SEO into Project ({selectedPathsToInject.size} files)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
