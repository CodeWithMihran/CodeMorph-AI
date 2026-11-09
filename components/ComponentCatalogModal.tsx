"use client";

import React, { useState, useMemo } from "react";
import type { ZipEntry } from "@/lib/migration/zip";
import {
  discoverComponentsAndProps,
  injectStorybookStoriesIntoProject,
  type CatalogSummary,
  type DiscoveredComponent,
} from "@/lib/components/catalog-generator";

interface ComponentCatalogModalProps {
  isOpen: boolean;
  onClose: () => void;
  entries: ZipEntry[];
  targetName: string;
  onInjectStorybook: (updatedEntries: ZipEntry[], injectedCount: number) => void;
  onSelectFile?: (filePath: string) => void;
}

type CatalogTab = "playground" | "props" | "storybook" | "snippet";
type ComponentFilter = "all" | "client" | "server";

export function ComponentCatalogModal({
  isOpen,
  onClose,
  entries,
  targetName,
  onInjectStorybook,
  onSelectFile,
}: ComponentCatalogModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<CatalogTab>("playground");
  const [filterType, setFilterType] = useState<ComponentFilter>("all");
  const [selectedCompId, setSelectedCompId] = useState<string | null>(null);
  const [propValues, setPropValues] = useState<Record<string, unknown>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [actionAlert, setActionAlert] = useState<string | null>(null);
  const [storybookSuccess, setStorybookSuccess] = useState<string | null>(null);

  // Discover components from project entries
  const catalog: CatalogSummary = useMemo(() => {
    return discoverComponentsAndProps(entries);
  }, [entries]);

  // Filter components
  const filteredComponents = useMemo(() => {
    return catalog.components.filter((c) => {
      if (filterType === "client" && !c.isClientComponent) return false;
      if (filterType === "server" && c.isClientComponent) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return c.name.toLowerCase().includes(q) || c.filePath.toLowerCase().includes(q);
      }
      return true;
    });
  }, [catalog.components, filterType, searchQuery]);

  // Selected component (defaults to first filtered component)
  const selectedComponent: DiscoveredComponent | null = useMemo(() => {
    if (selectedCompId) {
      const match = catalog.components.find((c) => c.id === selectedCompId);
      if (match) return match;
    }
    return filteredComponents[0] ?? catalog.components[0] ?? null;
  }, [catalog.components, filteredComponents, selectedCompId]);

  // Active prop values merged with defaults
  const activeProps = useMemo(() => {
    if (!selectedComponent) return {};
    return {
      ...selectedComponent.defaultMockProps,
      ...propValues,
    };
  }, [selectedComponent, propValues]);

  const handleSelectComponent = (comp: DiscoveredComponent) => {
    setSelectedCompId(comp.id);
    setPropValues({});
  };

  const handlePropChange = (propName: string, val: unknown) => {
    setPropValues((prev) => ({
      ...prev,
      [propName]: val,
    }));
  };

  const handleCopy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      // Fallback
    }
  };

  const handleTriggerAction = (propName: string) => {
    setActionAlert(`Simulated action: ${propName}() triggered successfully!`);
    setTimeout(() => setActionAlert(null), 2500);
  };

  const handleInjectStorybook = () => {
    const result = injectStorybookStoriesIntoProject(entries, catalog.components);
    onInjectStorybook(result.updatedEntries, result.generatedStoriesCount);
    setStorybookSuccess(`Injected ${result.generatedStoriesCount} Storybook stories and .storybook/ configs into project!`);
    setTimeout(() => setStorybookSuccess(null), 4000);
  };

  if (!isOpen) return null;

  return (
    <div className="catalog-modal-backdrop" onClick={onClose}>
      <div className="catalog-modal-window" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="catalog-modal-header">
          <div className="catalog-title-col">
            <div className="catalog-title-row">
              <span className="catalog-icon">🧩</span>
              <h3>Component Showcase &amp; Storybook Catalog</h3>
              <span className="catalog-count-badge">
                {catalog.totalComponents} {catalog.totalComponents === 1 ? "Component" : "Components"}
              </span>
              <span className="catalog-scope-badge">
                {catalog.clientComponentsCount} Client • {catalog.serverComponentsCount} Server
              </span>
            </div>
            <p className="catalog-subtitle">
              Inspect migrated UI primitives in isolation, tweak props dynamically, and generate production
              Storybook CSF 3 stories for {targetName}.
            </p>
          </div>

          <div className="catalog-header-actions">
            <button
              type="button"
              className="action-pill-btn primary-pill"
              onClick={handleInjectStorybook}
              title="Generate .stories.tsx for all components and add Storybook configs to project"
            >
              📚 Inject Storybook Stories
            </button>
            <button type="button" className="close-btn" onClick={onClose} title="Close Showcase">
              ✕
            </button>
          </div>
        </div>

        {/* Success Alert Banner */}
        {storybookSuccess && (
          <div className="catalog-success-banner">
            <span>✓ {storybookSuccess}</span>
          </div>
        )}

        {/* Action Alert Banner */}
        {actionAlert && (
          <div className="catalog-action-banner">
            <span>⚡ {actionAlert}</span>
          </div>
        )}

        {/* Main Split Grid */}
        <div className="catalog-modal-body">
          {/* Left Sidebar */}
          <aside className="catalog-sidebar">
            <div className="sidebar-search-row">
              <input
                type="text"
                placeholder="Search components..."
                className="catalog-search-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="sidebar-filter-tabs">
              <button
                type="button"
                className={`filter-tab-btn ${filterType === "all" ? "is-active" : ""}`}
                onClick={() => setFilterType("all")}
              >
                All ({catalog.totalComponents})
              </button>
              <button
                type="button"
                className={`filter-tab-btn ${filterType === "client" ? "is-active" : ""}`}
                onClick={() => setFilterType("client")}
              >
                Client ({catalog.clientComponentsCount})
              </button>
              <button
                type="button"
                className={`filter-tab-btn ${filterType === "server" ? "is-active" : ""}`}
                onClick={() => setFilterType("server")}
              >
                Server ({catalog.serverComponentsCount})
              </button>
            </div>

            <div className="catalog-components-list">
              {filteredComponents.length === 0 ? (
                <div className="catalog-no-results">No components match query.</div>
              ) : (
                filteredComponents.map((comp) => {
                  const isSelected = selectedComponent?.id === comp.id;
                  return (
                    <button
                      key={comp.id}
                      type="button"
                      className={`catalog-item-btn ${isSelected ? "is-selected" : ""}`}
                      onClick={() => handleSelectComponent(comp)}
                    >
                      <div className="item-name-row">
                        <span className="item-name">{comp.name}</span>
                        <span
                          className={`scope-pill ${comp.isClientComponent ? "pill-client" : "pill-server"}`}
                        >
                          {comp.isClientComponent ? "use client" : "server"}
                        </span>
                      </div>
                      <span className="item-path">{comp.filePath}</span>
                    </button>
                  );
                })
              )}
            </div>
          </aside>

          {/* Right Main Content */}
          <main className="catalog-main-panel">
            {selectedComponent ? (
              <div className="component-detail-wrap">
                {/* Component Detail Header */}
                <div className="comp-detail-header">
                  <div className="comp-meta-col">
                    <div className="comp-title-row">
                      <span className="comp-title">{selectedComponent.name}</span>
                      <span
                        className={`comp-scope-badge ${
                          selectedComponent.isClientComponent ? "scope-client" : "scope-server"
                        }`}
                      >
                        {selectedComponent.isClientComponent ? "Client Component" : "Server Component"}
                      </span>
                      <span className="comp-export-badge">{selectedComponent.exportType} export</span>
                    </div>

                    <button
                      type="button"
                      className="comp-file-link"
                      onClick={() => {
                        if (onSelectFile) onSelectFile(selectedComponent.filePath);
                        onClose();
                      }}
                      title="Jump to file in workbench editor"
                    >
                      📄 {selectedComponent.filePath} ➔
                    </button>
                  </div>

                  {/* Sub-tab Navigation */}
                  <div className="comp-subtabs">
                    <button
                      type="button"
                      className={`subtab-btn ${activeTab === "playground" ? "is-active" : ""}`}
                      onClick={() => setActiveTab("playground")}
                    >
                      🎨 Playground
                    </button>
                    <button
                      type="button"
                      className={`subtab-btn ${activeTab === "props" ? "is-active" : ""}`}
                      onClick={() => setActiveTab("props")}
                    >
                      📋 Props ({selectedComponent.props.length})
                    </button>
                    <button
                      type="button"
                      className={`subtab-btn ${activeTab === "storybook" ? "is-active" : ""}`}
                      onClick={() => setActiveTab("storybook")}
                    >
                      📖 Storybook CSF
                    </button>
                    <button
                      type="button"
                      className={`subtab-btn ${activeTab === "snippet" ? "is-active" : ""}`}
                      onClick={() => setActiveTab("snippet")}
                    >
                      ⚡ Usage Snippet
                    </button>
                  </div>
                </div>

                {/* Sub-tab Contents */}
                <div className="comp-subtab-body">
                  {/* TAB 1: PLAYGROUND */}
                  {activeTab === "playground" && (
                    <div className="playground-tab-view">
                      <div className="sandbox-viewport">
                        <div className="sandbox-bar">
                          <span className="sandbox-label">Component Sandbox Preview</span>
                          <span className="sandbox-dims">Isolated Frame</span>
                        </div>
                        <div className="sandbox-canvas">
                          <div className="mock-rendered-card">
                            <div className="mock-card-header">
                              <span className="mock-badge">{selectedComponent.name}</span>
                              <span className="mock-type">{selectedComponent.exportType}</span>
                            </div>
                            <div className="mock-card-body">
                              {Object.entries(activeProps).map(([key, val]) => (
                                <div key={key} className="mock-prop-row">
                                  <span className="mock-prop-key">{key}:</span>
                                  <span className="mock-prop-val">
                                    {typeof val === "object" ? JSON.stringify(val) : String(val)}
                                  </span>
                                </div>
                              ))}
                              {Object.keys(activeProps).length === 0 && (
                                <p className="no-props-hint">Component takes no input props.</p>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Props Inspector Controls */}
                      <div className="props-inspector-pane">
                        <div className="inspector-pane-header">
                          <h5>Dynamic Property Inspector</h5>
                          <span className="inspector-hint">Tweak props to test reactivity</span>
                        </div>

                        {selectedComponent.props.length === 0 ? (
                          <div className="no-props-msg">No configurable props defined.</div>
                        ) : (
                          <div className="props-controls-table">
                            {selectedComponent.props.map((prop) => (
                              <div key={prop.name} className="prop-control-row">
                                <div className="prop-info-col">
                                  <span className="prop-name">
                                    {prop.name}
                                    {prop.required && <span className="req-star">*</span>}
                                  </span>
                                  <span className="prop-raw-type font-mono">{prop.rawType}</span>
                                </div>

                                <div className="prop-input-col">
                                  {prop.type === "boolean" && (
                                    <label className="prop-toggle-wrap">
                                      <input
                                        type="checkbox"
                                        checked={Boolean(activeProps[prop.name])}
                                        onChange={(e) => handlePropChange(prop.name, e.target.checked)}
                                      />
                                      <span>{activeProps[prop.name] ? "True" : "False"}</span>
                                    </label>
                                  )}

                                  {prop.type === "enum" && prop.enumValues && (
                                    <select
                                      className="prop-select-input font-mono"
                                      value={String(activeProps[prop.name] ?? "")}
                                      onChange={(e) => handlePropChange(prop.name, e.target.value)}
                                    >
                                      {prop.enumValues.map((opt) => (
                                        <option key={opt} value={opt}>
                                          {opt}
                                        </option>
                                      ))}
                                    </select>
                                  )}

                                  {prop.type === "number" && (
                                    <input
                                      type="number"
                                      className="prop-text-input font-mono"
                                      value={Number(activeProps[prop.name] ?? 0)}
                                      onChange={(e) =>
                                        handlePropChange(prop.name, parseFloat(e.target.value) || 0)
                                      }
                                    />
                                  )}

                                  {prop.type === "function" && (
                                    <button
                                      type="button"
                                      className="prop-action-trigger-btn"
                                      onClick={() => handleTriggerAction(prop.name)}
                                    >
                                      ⚡ Trigger ({prop.name})
                                    </button>
                                  )}

                                  {(prop.type === "string" ||
                                    prop.type === "node" ||
                                    prop.type === "object" ||
                                    prop.type === "unknown") && (
                                    <input
                                      type="text"
                                      className="prop-text-input"
                                      value={String(activeProps[prop.name] ?? "")}
                                      onChange={(e) => handlePropChange(prop.name, e.target.value)}
                                    />
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* TAB 2: PROPS CONTRACT TABLE */}
                  {activeTab === "props" && (
                    <div className="props-contract-view">
                      <div className="contract-header">
                        <span className="contract-title">
                          TypeScript Props Contract Specification ({selectedComponent.props.length} props)
                        </span>
                      </div>
                      <div className="contract-table-wrap">
                        <table className="contract-table">
                          <thead>
                            <tr>
                              <th>Property</th>
                              <th>Type</th>
                              <th>Required</th>
                              <th>Mock Default</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedComponent.props.map((p) => (
                              <tr key={p.name}>
                                <td className="prop-name-cell">
                                  <code>{p.name}</code>
                                </td>
                                <td className="prop-type-cell font-mono">{p.rawType}</td>
                                <td>
                                  <span className={`req-badge ${p.required ? "is-req" : "is-opt"}`}>
                                    {p.required ? "Required" : "Optional"}
                                  </span>
                                </td>
                                <td className="prop-default-cell font-mono">
                                  {JSON.stringify(p.defaultValue)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* TAB 3: STORYBOOK STORY CODE */}
                  {activeTab === "storybook" && (
                    <div className="code-tab-view">
                      <div className="code-toolbar">
                        <span className="code-info">
                          Standard Component Story Format (CSF 3) for Storybook 8
                        </span>
                        <button
                          type="button"
                          className="action-pill-btn"
                          onClick={() => void handleCopy(selectedComponent.storybookStoryCode, "sb")}
                        >
                          {copiedKey === "sb" ? "✓ Copied" : "📋 Copy .stories.tsx"}
                        </button>
                      </div>
                      <pre className="code-viewport font-mono">
                        <code>{selectedComponent.storybookStoryCode}</code>
                      </pre>
                    </div>
                  )}

                  {/* TAB 4: USAGE SNIPPET */}
                  {activeTab === "snippet" && (
                    <div className="code-tab-view">
                      <div className="code-toolbar">
                        <span className="code-info">
                          Next.js App Router Component Import &amp; JSX Render Snippet
                        </span>
                        <button
                          type="button"
                          className="action-pill-btn"
                          onClick={() => void handleCopy(selectedComponent.sampleUsageCode, "snippet")}
                        >
                          {copiedKey === "snippet" ? "✓ Copied" : "📋 Copy JSX Snippet"}
                        </button>
                      </div>
                      <pre className="code-viewport font-mono">
                        <code>{selectedComponent.sampleUsageCode}</code>
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="catalog-empty-view">
                <span className="empty-icon">🧩</span>
                <h4>No Components Found</h4>
                <p>No reusable UI components detected in project entries.</p>
              </div>
            )}
          </main>
        </div>

        {/* Modal Footer */}
        <div className="catalog-modal-footer">
          <div className="catalog-footer-left">
            <span>
              Target: <strong>{targetName}</strong> • {catalog.totalComponents} reusable UI components discovered
            </span>
          </div>

          <div className="catalog-footer-right">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Close
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={handleInjectStorybook}
            >
              Inject Storybook Stories (.stories.tsx) ➔
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
