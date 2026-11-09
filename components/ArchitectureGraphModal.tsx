"use client";

import React, { useState, useMemo } from "react";
import type { ZipEntry } from "@/lib/migration/zip";
import {
  buildArchitectureGraph,
  type ArchitectureGraph,
  type GraphNodeKind,
} from "@/lib/graph/architecture-graph";

interface ArchitectureGraphModalProps {
  isOpen: boolean;
  onClose: () => void;
  entries: ZipEntry[];
  title?: string;
}

const KIND_COLORS: Record<GraphNodeKind, { stroke: string; fill: string; text: string; label: string }> = {
  route: { stroke: "#10b981", fill: "rgba(16, 185, 129, 0.15)", text: "#10b981", label: "Route" },
  component: { stroke: "#0284c7", fill: "rgba(2, 132, 199, 0.15)", text: "#0284c7", label: "Component" },
  state_hook: { stroke: "#8b5cf6", fill: "rgba(139, 92, 246, 0.15)", text: "#8b5cf6", label: "Hook/State" },
  utility: { stroke: "#f59e0b", fill: "rgba(245, 158, 11, 0.15)", text: "#f59e0b", label: "Utility" },
  style: { stroke: "#ec4899", fill: "rgba(236, 72, 153, 0.15)", text: "#ec4899", label: "Style" },
  package: { stroke: "#64748b", fill: "rgba(100, 116, 139, 0.15)", text: "#94a3b8", label: "Package" },
};

export function ArchitectureGraphModal({
  isOpen,
  onClose,
  entries,
  title = "Architecture & Dependency Visualizer",
}: ArchitectureGraphModalProps) {
  const [activeFilter, setActiveFilter] = useState<"all" | GraphNodeKind | "cycles">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  const graph: ArchitectureGraph = useMemo(() => {
    return buildArchitectureGraph(entries, true);
  }, [entries]);

  // Filtered nodes
  const filteredNodes = useMemo(() => {
    let result = graph.nodes;
    if (activeFilter === "cycles") {
      result = result.filter((n) => n.isCircular);
    } else if (activeFilter !== "all") {
      result = result.filter((n) => n.kind === activeFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((n) => n.id.toLowerCase().includes(q) || n.label.toLowerCase().includes(q));
    }
    return result;
  }, [graph.nodes, activeFilter, searchQuery]);

  const filteredNodeIds = useMemo(() => {
    return new Set(filteredNodes.map((n) => n.id));
  }, [filteredNodes]);

  // Filtered edges
  const filteredEdges = useMemo(() => {
    return graph.edges.filter(
      (e) => filteredNodeIds.has(e.source) && filteredNodeIds.has(e.target)
    );
  }, [graph.edges, filteredNodeIds]);

  // Selected node details
  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null;
    return graph.nodes.find((n) => n.id === selectedNodeId) ?? null;
  }, [selectedNodeId, graph.nodes]);

  const incomingEdges = useMemo(() => {
    if (!selectedNodeId) return [];
    return graph.edges.filter((e) => e.target === selectedNodeId);
  }, [selectedNodeId, graph.edges]);

  const outgoingEdges = useMemo(() => {
    if (!selectedNodeId) return [];
    return graph.edges.filter((e) => e.source === selectedNodeId);
  }, [selectedNodeId, graph.edges]);

  const selectedEntryContent = useMemo(() => {
    if (!selectedNodeId) return null;
    return entries.find((e) => e.path === selectedNodeId)?.content ?? null;
  }, [selectedNodeId, entries]);

  // Canvas bounds calculation
  const canvasBounds = useMemo(() => {
    if (graph.nodes.length === 0) return { width: 1200, height: 600 };
    const maxX = Math.max(...graph.nodes.map((n) => n.x)) + 180;
    const maxY = Math.max(...graph.nodes.map((n) => n.y)) + 120;
    return {
      width: Math.max(1200, maxX),
      height: Math.max(650, maxY),
    };
  }, [graph.nodes]);

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="architecture-graph-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Modal Header */}
        <div className="graph-modal-header">
          <div className="graph-header-left">
            <span className="graph-header-icon">🧬</span>
            <div>
              <h3 className="graph-modal-title">{title}</h3>
              <p className="graph-modal-subtitle">
                Interactive topological dependency graph with circular cycle detection and coupling metrics.
              </p>
            </div>
          </div>

          <div className="graph-header-right">
            <div className="graph-metrics-pills">
              <span className="graph-metric-tag">
                <strong>{graph.metrics.totalModules}</strong> Modules
              </span>
              <span className="graph-metric-tag">
                <strong>{graph.metrics.totalEdges}</strong> Links
              </span>
              {graph.metrics.circularCycleCount > 0 ? (
                <span className="graph-metric-tag cycle-warn">
                  ⚠️ <strong>{graph.metrics.circularCycleCount}</strong> Cycles
                </span>
              ) : (
                <span className="graph-metric-tag cycle-clean">
                  ✓ 0 Cycles
                </span>
              )}
            </div>
            <button
              type="button"
              className="checkpoint-close-btn"
              onClick={onClose}
              aria-label="Close architecture graph"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Toolbar Controls */}
        <div className="graph-toolbar">
          <div className="graph-filter-chips">
            <button
              type="button"
              className={`filter-chip ${activeFilter === "all" ? "is-active" : ""}`}
              onClick={() => setActiveFilter("all")}
            >
              All ({graph.nodes.length})
            </button>
            <button
              type="button"
              className={`filter-chip ${activeFilter === "route" ? "is-active" : ""}`}
              onClick={() => setActiveFilter("route")}
            >
              Routes ({graph.metrics.routesCount})
            </button>
            <button
              type="button"
              className={`filter-chip ${activeFilter === "component" ? "is-active" : ""}`}
              onClick={() => setActiveFilter("component")}
            >
              Components ({graph.metrics.componentsCount})
            </button>
            <button
              type="button"
              className={`filter-chip ${activeFilter === "state_hook" ? "is-active" : ""}`}
              onClick={() => setActiveFilter("state_hook")}
            >
              Hooks/State ({graph.metrics.hooksCount})
            </button>
            {graph.metrics.circularCycleCount > 0 && (
              <button
                type="button"
                className={`filter-chip warn ${activeFilter === "cycles" ? "is-active" : ""}`}
                onClick={() => setActiveFilter("cycles")}
              >
                ⚠️ Circular ({graph.metrics.circularCycleCount})
              </button>
            )}
          </div>

          <div className="graph-tools-right">
            <input
              type="text"
              className="graph-search-input"
              placeholder="Filter by name or path..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <div className="graph-zoom-group">
              <button
                type="button"
                className="zoom-btn"
                onClick={() => setZoomLevel((z) => Math.min(2.0, z + 0.15))}
                title="Zoom In"
              >
                +
              </button>
              <button
                type="button"
                className="zoom-btn"
                onClick={() => setZoomLevel((z) => Math.max(0.5, z - 0.15))}
                title="Zoom Out"
              >
                -
              </button>
              <button
                type="button"
                className="zoom-btn"
                onClick={() => setZoomLevel(1.0)}
                title="Reset View"
              >
                ↺
              </button>
            </div>
          </div>
        </div>

        {/* Graph Workspace Layout */}
        <div className="graph-workspace-layout">
          {/* SVG Canvas Area */}
          <div className="graph-canvas-container">
            <svg
              className="architecture-svg-canvas"
              width={canvasBounds.width * zoomLevel}
              height={canvasBounds.height * zoomLevel}
              viewBox={`0 0 ${canvasBounds.width} ${canvasBounds.height}`}
            >
              <defs>
                <marker
                  id="arrow-normal"
                  viewBox="0 0 10 10"
                  refX="18"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1 L 10 5 L 0 9 z" fill="#475569" />
                </marker>
                <marker
                  id="arrow-circular"
                  viewBox="0 0 10 10"
                  refX="18"
                  refY="5"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1 L 10 5 L 0 9 z" fill="#ef4444" />
                </marker>
                <marker
                  id="arrow-active"
                  viewBox="0 0 10 10"
                  refX="18"
                  refY="5"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1 L 10 5 L 0 9 z" fill="#38bdf8" />
                </marker>
              </defs>

              {/* Background Grid Pattern */}
              <g className="svg-grid-layer" opacity="0.15">
                {Array.from({ length: Math.ceil(canvasBounds.width / 40) }).map((_, i) => (
                  <line
                    key={`v-${i}`}
                    x1={i * 40}
                    y1={0}
                    x2={i * 40}
                    y2={canvasBounds.height}
                    stroke="#475569"
                    strokeWidth="1"
                  />
                ))}
                {Array.from({ length: Math.ceil(canvasBounds.height / 40) }).map((_, i) => (
                  <line
                    key={`h-${i}`}
                    x1={0}
                    y1={i * 40}
                    x2={canvasBounds.width}
                    y2={i * 40}
                    stroke="#475569"
                    strokeWidth="1"
                  />
                ))}
              </g>

              {/* Graph Edges */}
              <g className="svg-edges-layer">
                {filteredEdges.map((edge) => {
                  const source = graph.nodes.find((n) => n.id === edge.source);
                  const target = graph.nodes.find((n) => n.id === edge.target);
                  if (!source || !target) return null;

                  const isEdgeActive =
                    hoveredNodeId === edge.source ||
                    hoveredNodeId === edge.target ||
                    selectedNodeId === edge.source ||
                    selectedNodeId === edge.target;

                  // Smooth cubic bezier curved paths
                  const dx = target.x - source.x;
                  const curvature = Math.min(60, Math.max(30, Math.abs(dx) * 0.4));
                  const pathData = `M ${source.x} ${source.y} C ${source.x + curvature} ${source.y}, ${target.x - curvature} ${target.y}, ${target.x} ${target.y}`;

                  return (
                    <path
                      key={edge.id}
                      d={pathData}
                      fill="none"
                      stroke={
                        edge.isCircular
                          ? "#ef4444"
                          : isEdgeActive
                          ? "#38bdf8"
                          : "rgba(100, 116, 139, 0.4)"
                      }
                      strokeWidth={edge.isCircular ? 2.5 : isEdgeActive ? 2 : 1.2}
                      strokeDasharray={edge.isCircular ? "5,3" : "none"}
                      markerEnd={
                        edge.isCircular
                          ? "url(#arrow-circular)"
                          : isEdgeActive
                          ? "url(#arrow-active)"
                          : "url(#arrow-normal)"
                      }
                      className="graph-edge-path"
                    />
                  );
                })}
              </g>

              {/* Graph Nodes */}
              <g className="svg-nodes-layer">
                {filteredNodes.map((node) => {
                  const colors = KIND_COLORS[node.kind];
                  const isSelected = selectedNodeId === node.id;
                  const isHovered = hoveredNodeId === node.id;

                  return (
                    <g
                      key={node.id}
                      className="svg-node-group"
                      transform={`translate(${node.x}, ${node.y})`}
                      onClick={() => setSelectedNodeId(node.id)}
                      onMouseEnter={() => setHoveredNodeId(node.id)}
                      onMouseLeave={() => setHoveredNodeId(null)}
                      style={{ cursor: "pointer" }}
                    >
                      {/* Circular pulse ring */}
                      {node.isCircular && (
                        <circle
                          r={node.size + 6}
                          fill="none"
                          stroke="#ef4444"
                          strokeWidth="2"
                          strokeDasharray="4,3"
                          opacity="0.8"
                        />
                      )}

                      {/* Active glow ring */}
                      {(isSelected || isHovered) && (
                        <circle
                          r={node.size + 4}
                          fill="none"
                          stroke="#38bdf8"
                          strokeWidth="2.5"
                          opacity="0.9"
                        />
                      )}

                      {/* Main Node Circle */}
                      <circle
                        r={node.size}
                        fill="#0b1120"
                        stroke={node.isCircular ? "#ef4444" : colors.stroke}
                        strokeWidth={isSelected ? 3 : 2}
                      />

                      {/* Inner Node Accent Core */}
                      <circle
                        r={Math.max(6, node.size - 8)}
                        fill={colors.fill}
                      />

                      {/* Node Label Text */}
                      <text
                        y={node.size + 14}
                        textAnchor="middle"
                        fill="#e2e8f0"
                        fontSize="11"
                        fontWeight="600"
                        fontFamily="ui-monospace, monospace"
                      >
                        {node.label.length > 20 ? `${node.label.slice(0, 18)}…` : node.label}
                      </text>

                      {/* Small Type Glyph */}
                      <text
                        y="4"
                        textAnchor="middle"
                        fill={colors.text}
                        fontSize="10"
                        fontWeight="bold"
                        fontFamily="system-ui, sans-serif"
                      >
                        {node.kind === "route"
                          ? "R"
                          : node.kind === "component"
                          ? "C"
                          : node.kind === "state_hook"
                          ? "H"
                          : node.kind === "package"
                          ? "P"
                          : "U"}
                      </text>
                    </g>
                  );
                })}
              </g>
            </svg>
          </div>

          {/* Node Inspector Drawer */}
          {selectedNode && (
            <div className="graph-node-drawer">
              <div className="drawer-header">
                <div className="drawer-title-col">
                  <span
                    className="drawer-kind-badge"
                    style={{
                      color: KIND_COLORS[selectedNode.kind].stroke,
                      background: KIND_COLORS[selectedNode.kind].fill,
                    }}
                  >
                    {KIND_COLORS[selectedNode.kind].label}
                  </span>
                  <h4 className="drawer-module-name">{selectedNode.label}</h4>
                  <span className="drawer-full-path">{selectedNode.id}</span>
                </div>
                <button
                  type="button"
                  className="drawer-close-btn"
                  onClick={() => setSelectedNodeId(null)}
                >
                  ✕
                </button>
              </div>

              {selectedNode.isCircular && (
                <div className="drawer-cycle-alert">
                  ⚠️ <strong>Circular Dependency Detected</strong>
                  <p>This module is part of an import recursion cycle.</p>
                </div>
              )}

              {/* Architectural Metrics */}
              <div className="drawer-stats-grid">
                <div className="drawer-stat-card">
                  <span className="stat-label">Afferent (Fan-In)</span>
                  <span className="stat-val">{selectedNode.fanIn}</span>
                  <span className="stat-hint">Inbound dependents</span>
                </div>
                <div className="drawer-stat-card">
                  <span className="stat-label">Efferent (Fan-Out)</span>
                  <span className="stat-val">{selectedNode.fanOut}</span>
                  <span className="stat-hint">Outbound imports</span>
                </div>
                <div className="drawer-stat-card full-width">
                  <div className="stat-row-flex">
                    <span className="stat-label">Martin Instability (I)</span>
                    <span className="stat-val-inline">{selectedNode.instability}</span>
                  </div>
                  <div className="instability-progress-bar">
                    <div
                      className="instability-fill"
                      style={{
                        width: `${Math.round(selectedNode.instability * 100)}%`,
                        background:
                          selectedNode.instability < 0.35
                            ? "#10b981"
                            : selectedNode.instability < 0.7
                            ? "#f59e0b"
                            : "#ef4444",
                      }}
                    />
                  </div>
                  <span className="stat-hint">
                    {selectedNode.instability < 0.35
                      ? "Stable Anchor (Hard to change, heavily depended upon)"
                      : selectedNode.instability < 0.7
                      ? "Balanced Component"
                      : "Flexible Leaf (Easy to change, depends on others)"}
                  </span>
                </div>
              </div>

              {/* Inbound Dependents */}
              <div className="drawer-links-section">
                <div className="section-title-sm">Imported By ({incomingEdges.length})</div>
                <div className="links-pill-list">
                  {incomingEdges.map((e) => (
                    <button
                      key={e.source}
                      type="button"
                      className="link-pill-btn"
                      onClick={() => setSelectedNodeId(e.source)}
                    >
                      ← {e.source}
                    </button>
                  ))}
                  {incomingEdges.length === 0 && (
                    <div className="empty-links-hint">No inbound internal dependents.</div>
                  )}
                </div>
              </div>

              {/* Outbound Imports */}
              <div className="drawer-links-section">
                <div className="section-title-sm">Imports ({outgoingEdges.length})</div>
                <div className="links-pill-list">
                  {outgoingEdges.map((e) => (
                    <button
                      key={e.target}
                      type="button"
                      className="link-pill-btn"
                      onClick={() => setSelectedNodeId(e.target)}
                    >
                      → {e.target}
                    </button>
                  ))}
                  {outgoingEdges.length === 0 && (
                    <div className="empty-links-hint">Leaf node (no outgoing imports).</div>
                  )}
                </div>
              </div>

              {/* Preview Snippet */}
              {selectedEntryContent && (
                <div className="drawer-snippet-section">
                  <div className="section-title-sm">Source Preview</div>
                  <pre className="drawer-code-preview">
                    {selectedEntryContent.split("\n").slice(0, 14).join("\n")}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
