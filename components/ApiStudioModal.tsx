"use client";

import React, { useState, useMemo } from "react";
import type { ZipEntry } from "@/lib/migration/zip";
import {
  synthesizeApiArchitecture,
  injectGeneratedApiFiles,
  type ApiArchitectureSynthesis,
  type GeneratedApiFile,
  type DiscoveredEndpointSummary,
} from "@/lib/api/api-synthesizer";

interface ApiStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  entries: ZipEntry[];
  targetName: string;
  onInjectFiles?: (updatedEntries: ZipEntry[], injectedCount: number) => void;
  onSelectFile?: (filePath: string) => void;
}

type ApiTab = "endpoints" | "route_handlers" | "server_actions" | "mock_db";

export function ApiStudioModal({
  isOpen,
  onClose,
  entries,
  targetName,
  onInjectFiles,
  onSelectFile,
}: ApiStudioModalProps) {
  const [activeTab, setActiveTab] = useState<ApiTab>("endpoints");
  const [selectedFileIndex, setSelectedFileIndex] = useState<number>(0);
  const [excludedPaths, setExcludedPaths] = useState<Set<string>>(() => new Set());
  const [copiedFile, setCopiedFile] = useState<boolean>(false);
  const [injectSuccess, setInjectSuccess] = useState<string | null>(null);

  // Synthesize API architecture
  const synthesis: ApiArchitectureSynthesis = useMemo(() => {
    return synthesizeApiArchitecture(entries);
  }, [entries]);

  // Derive selected paths (all generated files except excluded)
  const selectedPathsToInject = useMemo(() => {
    return new Set(
      synthesis.generatedFiles
        .map((f) => f.path)
        .filter((p) => !excludedPaths.has(p))
    );
  }, [synthesis.generatedFiles, excludedPaths]);

  if (!isOpen) return null;

  const toggleSelectPath = (path: string) => {
    const next = new Set(excludedPaths);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    setExcludedPaths(next);
  };

  const toggleSelectAll = () => {
    if (selectedPathsToInject.size === synthesis.generatedFiles.length) {
      setExcludedPaths(new Set(synthesis.generatedFiles.map((f) => f.path)));
    } else {
      setExcludedPaths(new Set());
    }
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedFile(true);
    setTimeout(() => setCopiedFile(false), 2000);
  };

  const handleInject = () => {
    if (!onInjectFiles) return;
    const filesToInject = synthesis.generatedFiles.filter((f) => selectedPathsToInject.has(f.path));
    if (filesToInject.length === 0) return;

    const { updatedEntries, injectedCount } = injectGeneratedApiFiles(entries, filesToInject);
    onInjectFiles(updatedEntries, injectedCount);
    setInjectSuccess(`Successfully injected ${injectedCount} API architecture files into your project!`);
    setTimeout(() => setInjectSuccess(null), 3500);
  };

  const activeFilesList: GeneratedApiFile[] =
    activeTab === "route_handlers"
      ? synthesis.generatedFiles.filter((f) => f.type === "route_handler")
      : activeTab === "server_actions"
      ? synthesis.generatedFiles.filter((f) => f.type === "server_action")
      : activeTab === "mock_db"
      ? synthesis.generatedFiles.filter((f) => f.type === "types" || f.type === "mock_db")
      : [];

  const previewFile = activeFilesList[selectedFileIndex] || activeFilesList[0] || synthesis.generatedFiles[0];

  return (
    <div className="api-modal-backdrop" onClick={onClose}>
      <div className="api-modal-window" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="api-modal-header">
          <div className="api-title-col">
            <div className="api-title-row">
              <span className="api-icon">🔌</span>
              <h3>API Contract &amp; Server Action Studio</h3>
              <span className="api-badge-endpoints">
                {synthesis.totalEndpointsDiscovered} {synthesis.totalEndpointsDiscovered === 1 ? "Endpoint" : "Endpoints"}
              </span>
              <span className="api-badge-files">
                {synthesis.generatedFiles.length} Architecture Files
              </span>
            </div>
            <p className="api-subtitle">
              Analyzes legacy client API calls (`fetch`, `axios`) for {targetName}, then synthesizes typed Next.js App Router Route Handlers (`app/api/.../route.ts`),
              React 19 Server Actions (`app/actions/*.ts`), and in-memory mock seed fixtures.
            </p>
          </div>

          <div className="api-header-actions">
            <button
              type="button"
              className="api-inject-btn"
              onClick={handleInject}
              disabled={selectedPathsToInject.size === 0}
              title="Inject selected API files into workbench project"
            >
              ⚡ Inject Selected into Project ({selectedPathsToInject.size})
            </button>
            <button type="button" className="close-btn" onClick={onClose} title="Close API Studio">
              ✕
            </button>
          </div>
        </div>

        {injectSuccess && (
          <div className="api-banner-success">
            <span>✅ {injectSuccess}</span>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="api-tabs-bar">
          <button
            type="button"
            className={`api-tab-btn ${activeTab === "endpoints" ? "active" : ""}`}
            onClick={() => setActiveTab("endpoints")}
          >
            📋 Discovered Endpoints ({synthesis.endpoints.length})
          </button>
          <button
            type="button"
            className={`api-tab-btn ${activeTab === "route_handlers" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("route_handlers");
              setSelectedFileIndex(0);
            }}
          >
            ⚡ Route Handlers (`app/api/**`) ({synthesis.generatedFiles.filter((f) => f.type === "route_handler").length})
          </button>
          <button
            type="button"
            className={`api-tab-btn ${activeTab === "server_actions" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("server_actions");
              setSelectedFileIndex(0);
            }}
          >
            ⚙️ Server Actions (`app/actions/*`) ({synthesis.generatedFiles.filter((f) => f.type === "server_action").length})
          </button>
          <button
            type="button"
            className={`api-tab-btn ${activeTab === "mock_db" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("mock_db");
              setSelectedFileIndex(0);
            }}
          >
            📦 Mock DB &amp; Schemas (2)
          </button>
        </div>

        {/* Tab 1: Discovered Endpoints */}
        {activeTab === "endpoints" && (
          <div className="api-tab-content">
            <div className="api-endpoints-table-container">
              <table className="api-endpoints-table">
                <thead>
                  <tr>
                    <th>Endpoint Route</th>
                    <th>Inferred Resource</th>
                    <th>HTTP Methods</th>
                    <th>Calling Files</th>
                    <th>Generated Next.js Target</th>
                  </tr>
                </thead>
                <tbody>
                  {synthesis.endpoints.map((ep: DiscoveredEndpointSummary, idx: number) => (
                    <tr key={idx}>
                      <td className="api-route-cell">
                        <code>{ep.normalizedRoute}</code>
                        {ep.hasDynamicParam && <span className="param-tag">dynamic: {ep.paramName}</span>}
                      </td>
                      <td className="api-resource-cell">
                        <span className="resource-pill">{ep.resourceName}</span>
                      </td>
                      <td className="api-methods-cell">
                        {ep.methods.map((m, mIdx) => (
                          <span key={mIdx} className={`method-badge method-${m.toLowerCase()}`}>
                            {m}
                          </span>
                        ))}
                      </td>
                      <td className="api-callers-cell">
                        {ep.callingFiles.map((file, fIdx) => (
                          <div key={fIdx} className="caller-file" onClick={() => onSelectFile?.(file)}>
                            📄 {file}
                          </div>
                        ))}
                      </td>
                      <td className="api-target-cell">
                        <div className="target-code-link">
                          <span>Route Handler:</span>
                          <code>{ep.suggestedRouteHandlerPath}</code>
                        </div>
                        <div className="target-code-link">
                          <span>Server Action:</span>
                          <code>{ep.suggestedServerActionPath}</code>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 2, 3, 4: Code Previews & Injection Checklist */}
        {activeTab !== "endpoints" && (
          <div className="api-preview-layout">
            {/* Sidebar list of generated files */}
            <div className="api-file-sidebar">
              <div className="sidebar-header">
                <span>Architecture Files</span>
                <button type="button" className="toggle-all-btn" onClick={toggleSelectAll}>
                  {selectedPathsToInject.size === synthesis.generatedFiles.length ? "Deselect All" : "Select All"}
                </button>
              </div>
              <div className="api-files-list">
                {activeFilesList.map((file, fIdx) => {
                  const isChecked = selectedPathsToInject.has(file.path);
                  const isSelected = fIdx === selectedFileIndex;

                  return (
                    <div
                      key={file.path}
                      className={`api-file-card ${isSelected ? "selected" : ""}`}
                      onClick={() => setSelectedFileIndex(fIdx)}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          e.stopPropagation();
                          toggleSelectPath(file.path);
                        }}
                      />
                      <div className="file-info-col">
                        <span className="file-path">{file.path}</span>
                        <span className="file-desc">{file.description}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Main code viewer */}
            <div className="api-code-viewer">
              {previewFile ? (
                <>
                  <div className="viewer-toolbar">
                    <div className="viewer-file-meta">
                      <span className="viewer-path">📄 {previewFile.path}</span>
                      <span className="viewer-type-tag">{previewFile.type.replace("_", " ").toUpperCase()}</span>
                    </div>
                    <div className="viewer-actions">
                      <button
                        type="button"
                        className="api-copy-btn"
                        onClick={() => handleCopyCode(previewFile.content)}
                      >
                        {copiedFile ? "✓ Copied" : "📋 Copy Code"}
                      </button>
                    </div>
                  </div>
                  <pre className="viewer-pre">
                    <code>{previewFile.content}</code>
                  </pre>
                </>
              ) : (
                <div className="empty-preview">No file selected.</div>
              )}
            </div>
          </div>
        )}

        {/* Modal Footer */}
        <div className="api-modal-footer">
          <div className="footer-left-info">
            <span>
              Generated using Next.js 15 App Router &amp; React 19 conventions with zero host execution.
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
              ⚡ Inject ({selectedPathsToInject.size} files)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
