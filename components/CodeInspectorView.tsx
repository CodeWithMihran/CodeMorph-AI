"use client";

import React, { useState, useMemo, useRef, useEffect } from "react";
import type { ZipEntry } from "@/lib/migration/zip";
import { createZip } from "@/lib/migration/zip";
import { computeLineDiff, type DiffSummary } from "@/lib/diff/line-diff";
import { validateFileSyntax, type ValidationStatus } from "@/lib/editor/client-validator";
import { detectApplicableCodemods, type CodemodAction } from "@/lib/codemods/engine";
import {
  initCheckpointHistory,
  createCheckpoint,
  rollbackToCheckpoint,
  type CheckpointHistory,
} from "@/lib/history/checkpoint-manager";
import { SimulatedDevicePreview } from "./SimulatedDevicePreview";
import { CheckpointTimelineModal } from "./CheckpointTimelineModal";
import { SimulatedDevTerminal, type TerminalTab } from "./SimulatedDevTerminal";
import { ArchitectureGraphModal } from "./ArchitectureGraphModal";
import { DeploymentLaunchModal } from "./DeploymentLaunchModal";
import { ProceduralRulesEnforcementModal } from "./ProceduralRulesEnforcementModal";
import { CodeSearchDrawer } from "./CodeSearchDrawer";
import { GitExportModal } from "./GitExportModal";
import { MigrationDoctorModal } from "./MigrationDoctorModal";
import { runMigrationDoctor } from "@/lib/doctor/health-doctor";
import { UniversalTargetModal } from "./UniversalTargetModal";
import { PerformanceProfilerModal } from "./PerformanceProfilerModal";
import { generatePerformanceProfile } from "@/lib/perf/bundle-profiler";
import { ComponentCatalogModal } from "./ComponentCatalogModal";
import { discoverComponentsAndProps } from "@/lib/components/catalog-generator";
import { ApiStudioModal } from "./ApiStudioModal";
import { synthesizeApiArchitecture } from "@/lib/api/api-synthesizer";

interface SourceManifest {
  framework: string;
  sourceType: string;
  files: Array<{ path: string; content: string }>;
  mappings: Array<{ route: string; sourcePath: string; targetPath: string }>;
}

interface CodeInspectorViewProps {
  entries: ZipEntry[];
  targetName: string;
  onDownloadZip?: () => void;
  onUpdateEntries?: (updatedEntries: ZipEntry[]) => void;
}

type ViewMode = "code" | "edit" | "split" | "unified" | "preview";
type CompareBaseline = "source" | "original";

export function CodeInspectorView({
  entries,
  targetName,
  onDownloadZip,
  onUpdateEntries,
}: CodeInspectorViewProps) {
  // Store initial generated entries as immutable baseline
  const originalMap = useMemo(() => {
    return new Map<string, string>(entries.map((e) => [e.path, e.content]));
  }, [entries]);

  // Working mutable entries state for hot-patching
  const [projectEntries, setProjectEntries] = useState<ZipEntry[]>(() => entries);

  // In-memory uncommitted drafts per file (path -> uncommitted text)
  const [draftContents, setDraftContents] = useState<Record<string, string>>({});

  // Extract source manifest and filter internal .codemorph files
  const { visibleEntries, sourceManifest } = useMemo(() => {
    let manifest: SourceManifest | null = null;
    const filtered: ZipEntry[] = [];
    for (const entry of projectEntries) {
      if (entry.path === ".codemorph/source-manifest.json") {
        try {
          manifest = JSON.parse(entry.content) as SourceManifest;
        } catch {
          // Ignore parse errors gracefully
        }
      } else if (!entry.path.startsWith(".codemorph/")) {
        filtered.push(entry);
      }
    }
    return { visibleEntries: filtered, sourceManifest: manifest };
  }, [projectEntries]);

  const [selectedPath, setSelectedPath] = useState<string>(() => {
    const preferred = entries.find((e) => e.path === "app/page.tsx" || e.path === "app/index.tsx");
    return preferred ? preferred.path : entries[0]?.path ?? "";
  });

  const [searchQuery, setSearchQuery] = useState("");
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("split");
  const [compareBaseline, setCompareBaseline] = useState<CompareBaseline>("source");
  const [overrideSourcePath, setOverrideSourcePath] = useState<string>("");

  const [saveToast, setSaveToast] = useState(false);
  const [newFileModalOpen, setNewFileModalOpen] = useState(false);
  const [newFilePath, setNewFilePath] = useState("");
  const [newFileError, setNewFileError] = useState("");
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [terminalInitialTab, setTerminalInitialTab] = useState<TerminalTab>("build");
  const [architectureModalOpen, setArchitectureModalOpen] = useState(false);
  const [deployModalOpen, setDeployModalOpen] = useState(false);
  const [rulesModalOpen, setRulesModalOpen] = useState(false);
  const [searchDrawerOpen, setSearchDrawerOpen] = useState(false);
  const [gitModalOpen, setGitModalOpen] = useState(false);
  const [doctorModalOpen, setDoctorModalOpen] = useState(false);
  const [catalogModalOpen, setCatalogModalOpen] = useState(false);
  const [universalModalOpen, setUniversalModalOpen] = useState(false);
  const [perfModalOpen, setPerfModalOpen] = useState(false);
  const [apiStudioModalOpen, setApiStudioModalOpen] = useState(false);


  // Checkpoint History Time-Machine state
  const [checkpointHistory, setCheckpointHistory] = useState<CheckpointHistory>(() =>
    initCheckpointHistory(entries, "Initial AI Generation Baseline", 20)
  );

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineGutterRef = useRef<HTMLDivElement>(null);

  const selectedEntry = useMemo(() => {
    return visibleEntries.find((e) => e.path === selectedPath) ?? visibleEntries[0] ?? null;
  }, [visibleEntries, selectedPath]);

  // Current active content for the selected file (prefers uncommitted draft if present)
  const activeContent = useMemo(() => {
    if (!selectedEntry) return "";
    return draftContents[selectedEntry.path] ?? selectedEntry.content;
  }, [selectedEntry, draftContents]);

  const hasUnsavedChanges = useMemo(() => {
    if (!selectedEntry) return false;
    const draft = draftContents[selectedEntry.path];
    return draft !== undefined && draft !== selectedEntry.content;
  }, [selectedEntry, draftContents]);

  // Syntax validation for active editor content
  const syntaxStatus: ValidationStatus = useMemo(() => {
    if (!selectedEntry) return { isValid: true, message: "No file selected", severity: "valid" };
    return validateFileSyntax(selectedEntry.path, activeContent);
  }, [selectedEntry, activeContent]);

  // Track all modified files (either saved or drafted)
  const modifiedFiles = useMemo(() => {
    const modified = new Set<string>();
    for (const entry of projectEntries) {
      const orig = originalMap.get(entry.path);
      const draft = draftContents[entry.path];
      const effectiveContent = draft !== undefined ? draft : entry.content;
      if (orig === undefined || orig !== effectiveContent) {
        modified.add(entry.path);
      }
    }
    return modified;
  }, [projectEntries, originalMap, draftContents]);

  const filteredEntries = useMemo(() => {
    if (!searchQuery.trim()) return visibleEntries;
    const q = searchQuery.toLowerCase();
    return visibleEntries.filter((e) => e.path.toLowerCase().includes(q));
  }, [visibleEntries, searchQuery]);

  // Determine paired source path from legacy source repository
  const matchedSourcePath = useMemo(() => {
    if (overrideSourcePath) return overrideSourcePath;
    if (!sourceManifest || !selectedEntry) return "";

    // 1. Exact mapping from canonical plan
    const match = sourceManifest.mappings.find((m) => m.targetPath === selectedEntry.path);
    if (match && match.sourcePath) return match.sourcePath;

    // 2. Same file name match (e.g. package.json, README.md)
    const sameName = sourceManifest.files.find((f) => f.path === selectedEntry.path);
    if (sameName) return sameName.path;

    // 3. Root route fallback (App.tsx / main.tsx / index.html)
    if (selectedEntry.path === "app/page.tsx" || selectedEntry.path === "app/index.tsx") {
      const appFile = sourceManifest.files.find((f) => /App\.(tsx|jsx|js|ts)$/i.test(f.path));
      if (appFile) return appFile.path;
      const indexHtml = sourceManifest.files.find((f) => f.path === "index.html");
      if (indexHtml) return indexHtml.path;
    }

    return "";
  }, [overrideSourcePath, sourceManifest, selectedEntry]);

  const sourceFileEntry = useMemo(() => {
    if (!sourceManifest || !matchedSourcePath) return null;
    return sourceManifest.files.find((f) => f.path === matchedSourcePath) ?? null;
  }, [sourceManifest, matchedSourcePath]);

  // Diff Computation
  const targetType = targetName.toLowerCase().includes("expo") ? "expo" : "nextjs";

  // Detect applicable deterministic text codemods for active file
  const applicableCodemods = useMemo(() => {
    if (!selectedEntry) return [];
    return detectApplicableCodemods(selectedEntry.path, activeContent, targetType);
  }, [selectedEntry, activeContent, targetType]);

  const handleApplyCodemod = (action: CodemodAction) => {
    if (!selectedEntry) return;
    const res = action.apply(activeContent);
    if (res.changed) {
      const updated = projectEntries.map((e) =>
        e.path === selectedEntry.path ? { ...e, content: res.code } : e
      );
      setProjectEntries(updated);
      setDraftContents((prev) => {
        const next = { ...prev };
        delete next[selectedEntry.path];
        return next;
      });
      setCheckpointHistory((prev) =>
        createCheckpoint(
          prev,
          `Codemod: ${action.label} (${selectedEntry.path})`,
          "codemod",
          updated
        )
      );
      setSaveToast(true);
      setTimeout(() => setSaveToast(false), 2500);
      if (onUpdateEntries) {
        onUpdateEntries(updated);
      }
    }
  };

  const handleApplyProceduralRules = (updatedEntries: ZipEntry[], summaryLabel: string) => {
    setProjectEntries(updatedEntries);
    setDraftContents({});
    setCheckpointHistory((prev) =>
      createCheckpoint(prev, summaryLabel, "procedural_rules", updatedEntries)
    );
    if (onUpdateEntries) {
      onUpdateEntries(updatedEntries);
    }
    setSaveToast(true);
    setTimeout(() => setSaveToast(false), 2500);
  };

  // Keyboard shortcut: Ctrl+Shift+F / Cmd+Shift+F to toggle Global Search Drawer
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setSearchDrawerOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, []);

  const handleSelectSearchMatch = (filePath: string) => {
    setSelectedPath(filePath);
  };

  const handleApplyGlobalReplace = (updatedEntries: ZipEntry[], summaryLabel: string) => {
    setProjectEntries(updatedEntries);
    setDraftContents({});
    setCheckpointHistory((prev) =>
      createCheckpoint(prev, summaryLabel, "manual_edit", updatedEntries)
    );
    if (onUpdateEntries) {
      onUpdateEntries(updatedEntries);
    }
    setSaveToast(true);
    setTimeout(() => setSaveToast(false), 2500);
  };

  const doctorReport = useMemo(() => {
    return runMigrationDoctor(projectEntries, targetName);
  }, [projectEntries, targetName]);

  const handleApplyDoctorAutofix = (updatedEntries: ZipEntry[], fixCount: number) => {
    setProjectEntries(updatedEntries);
    setDraftContents({});
    setCheckpointHistory((prev) =>
      createCheckpoint(
        prev,
        `Doctor Autofix (${fixCount} issue${fixCount > 1 ? "s" : ""} healed)`,
        "doctor_autofix",
        updatedEntries
      )
    );
    if (onUpdateEntries) {
      onUpdateEntries(updatedEntries);
    }
    setSaveToast(true);
    setTimeout(() => setSaveToast(false), 2500);
  };

  const componentCatalog = useMemo(() => {
    return discoverComponentsAndProps(projectEntries);
  }, [projectEntries]);

  const handleInjectStorybook = (updatedEntries: ZipEntry[], injectedCount: number) => {
    setProjectEntries(updatedEntries);
    setCheckpointHistory((prev) =>
      createCheckpoint(
        prev,
        `Injected Storybook Stories (${injectedCount} .stories.tsx files)`,
        "scaffold",
        updatedEntries
      )
    );
    if (onUpdateEntries) {
      onUpdateEntries(updatedEntries);
    }
    setSaveToast(true);
    setTimeout(() => setSaveToast(false), 2500);
  };

  const handleSwitchTarget = (newEntries: ZipEntry[], newTargetName: string) => {
    setProjectEntries(newEntries);
    setDraftContents({});
    setSelectedPath(newEntries[0]?.path ?? "");
    setCheckpointHistory((prev) =>
      createCheckpoint(
        prev,
        `Universal Target Switched: ${newTargetName}`,
        "scaffold",
        newEntries
      )
    );
    if (onUpdateEntries) {
      onUpdateEntries(newEntries);
    }
    setSaveToast(true);
    setTimeout(() => setSaveToast(false), 2500);
  };

  const perfReport = useMemo(() => {
    return generatePerformanceProfile(projectEntries, targetName);
  }, [projectEntries, targetName]);

  const handleApplyPerfOptimization = (updatedEntries: ZipEntry[], optCount: number) => {
    setProjectEntries(updatedEntries);
    setCheckpointHistory((prev) =>
      createCheckpoint(
        prev,
        `Applied Performance Optimization (${optCount} dynamic imports)`,
        "scaffold",
        updatedEntries
      )
    );
    if (onUpdateEntries) {
      onUpdateEntries(updatedEntries);
    }
    setSaveToast(true);
    setTimeout(() => setSaveToast(false), 2500);
  };

  const apiSynthesis = useMemo(() => {
    return synthesizeApiArchitecture(projectEntries);
  }, [projectEntries]);

  const handleInjectApiFiles = (updatedEntries: ZipEntry[], injectedCount: number) => {
    setProjectEntries(updatedEntries);
    setCheckpointHistory((prev) =>
      createCheckpoint(
        prev,
        `Injected API Architecture (${injectedCount} Route Handlers & Actions)`,
        "scaffold",
        updatedEntries
      )
    );
    if (onUpdateEntries) {
      onUpdateEntries(updatedEntries);
    }
    setSaveToast(true);
    setTimeout(() => setSaveToast(false), 2500);
  };

  const diffSummary: DiffSummary | null = useMemo(() => {
    if (!selectedEntry) return null;
    let baselineText = "";
    if (compareBaseline === "source") {
      baselineText = sourceFileEntry ? sourceFileEntry.content : "";
    } else {
      baselineText = originalMap.get(selectedEntry.path) ?? "";
    }
    return computeLineDiff(baselineText, activeContent);
  }, [selectedEntry, compareBaseline, sourceFileEntry, originalMap, activeContent]);

  const lines = useMemo(() => {
    if (!selectedEntry) return [];
    return activeContent.split("\n");
  }, [selectedEntry, activeContent]);

  // Handle Tab key in editor
  const handleEditorKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const target = e.currentTarget;
      const start = target.selectionStart;
      const end = target.selectionEnd;

      const newContent = activeContent.substring(0, start) + "  " + activeContent.substring(end);
      if (selectedEntry) {
        setDraftContents((prev) => ({ ...prev, [selectedEntry.path]: newContent }));
      }

      setTimeout(() => {
        target.selectionStart = target.selectionEnd = start + 2;
      }, 0);
    } else if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      handleSaveCurrentFile();
    }
  };

  // Synchronize scroll between line gutter and textarea
  const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    if (lineGutterRef.current) {
      lineGutterRef.current.scrollTop = e.currentTarget.scrollTop;
    }
  };

  // Save current file edits
  const handleSaveCurrentFile = () => {
    if (!selectedEntry) return;
    const contentToSave = activeContent;
    const updated = projectEntries.map((e) =>
      e.path === selectedEntry.path ? { ...e, content: contentToSave } : e
    );
    setProjectEntries(updated);
    setDraftContents((prev) => {
      const next = { ...prev };
      delete next[selectedEntry.path];
      return next;
    });
    setCheckpointHistory((prev) =>
      createCheckpoint(prev, `Manual Edit: ${selectedEntry.path}`, "manual_edit", updated)
    );
    setSaveToast(true);
    setTimeout(() => setSaveToast(false), 2000);
    if (onUpdateEntries) {
      onUpdateEntries(updated);
    }
  };

  // Revert current file to original generated baseline
  const handleRevertCurrentFile = () => {
    if (!selectedEntry) return;
    const originalContent = originalMap.get(selectedEntry.path);
    if (originalContent !== undefined) {
      setDraftContents((prev) => {
        const next = { ...prev };
        delete next[selectedEntry.path];
        return next;
      });
      const updated = projectEntries.map((e) =>
        e.path === selectedEntry.path ? { ...e, content: originalContent } : e
      );
      setProjectEntries(updated);
      setCheckpointHistory((prev) =>
        createCheckpoint(prev, `Reverted: ${selectedEntry.path}`, "rollback", updated)
      );
      if (onUpdateEntries) {
        onUpdateEntries(updated);
      }
    }
  };

  // Revert all modified files to original generated baseline
  const handleRevertAllFiles = () => {
    if (!window.confirm("Revert all files to the original generated version? All custom edits will be lost.")) {
      return;
    }
    const reverted = projectEntries.map((e) => {
      const orig = originalMap.get(e.path);
      return orig !== undefined ? { ...e, content: orig } : e;
    });
    setProjectEntries(reverted);
    setDraftContents({});
    setCheckpointHistory((prev) =>
      createCheckpoint(prev, "Reverted All Files to Baseline", "rollback", reverted)
    );
    if (onUpdateEntries) {
      onUpdateEntries(reverted);
    }
  };

  // Add a new file
  const handleCreateNewFile = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPath = newFilePath.trim().replace(/^\/+/, "");
    if (!cleanPath) {
      setNewFileError("Please specify a valid file path.");
      return;
    }
    if (projectEntries.some((entry) => entry.path === cleanPath)) {
      setNewFileError("A file with this path already exists.");
      return;
    }

    const defaultContent = cleanPath.endsWith(".json")
      ? "{\n  \n}\n"
      : cleanPath.endsWith(".test.tsx") || cleanPath.endsWith(".test.ts")
      ? `import { describe, it, expect } from "vitest";\n\ndescribe("${cleanPath}", () => {\n  it("executes automated smoke test successfully", () => {\n    expect(true).toBe(true);\n  });\n});\n`
      : cleanPath.endsWith(".tsx") || cleanPath.endsWith(".jsx")
      ? `import React from "react";\n\nexport default function Component() {\n  return <div>New Component</div>;\n}\n`
      : cleanPath.endsWith(".env") || cleanPath.includes(".env.")
      ? "# Local Environment Variables\n"
      : `// ${cleanPath}\n`;

    const updated: ZipEntry[] = [...projectEntries, { path: cleanPath, content: defaultContent }];
    setProjectEntries(updated);
    setSelectedPath(cleanPath);
    setCheckpointHistory((prev) =>
      createCheckpoint(prev, `Created File: ${cleanPath}`, "manual_edit", updated)
    );
    setViewMode("edit");
    setNewFileModalOpen(false);
    setNewFilePath("");
    setNewFileError("");
    if (onUpdateEntries) {
      onUpdateEntries(updated);
    }
  };

  // Delete current file
  const handleDeleteCurrentFile = () => {
    if (!selectedEntry) return;
    if (
      selectedEntry.path === "app/layout.tsx" ||
      selectedEntry.path === "app/_layout.tsx" ||
      selectedEntry.path === "package.json"
    ) {
      if (!window.confirm(`Warning: "${selectedEntry.path}" is an essential scaffold file. Deleting it may cause build failures. Proceed?`)) {
        return;
      }
    } else {
      if (!window.confirm(`Are you sure you want to delete "${selectedEntry.path}"?`)) {
        return;
      }
    }

    const updated = projectEntries.filter((e) => e.path !== selectedEntry.path);
    setProjectEntries(updated);
    setDraftContents((prev) => {
      const next = { ...prev };
      delete next[selectedEntry.path];
      return next;
    });
    setCheckpointHistory((prev) =>
      createCheckpoint(prev, `Deleted File: ${selectedEntry.path}`, "manual_edit", updated)
    );
    const nextSelected = updated[0]?.path ?? "";
    setSelectedPath(nextSelected);
    if (onUpdateEntries) {
      onUpdateEntries(updated);
    }
  };

  // Rollback to a specific historical checkpoint
  const handleRestoreCheckpoint = (checkpointId: string) => {
    const { updatedHistory, restoredEntries } = rollbackToCheckpoint(
      checkpointHistory,
      checkpointId
    );
    setCheckpointHistory(updatedHistory);
    setProjectEntries(restoredEntries);
    setDraftContents({});
    setSaveToast(true);
    setTimeout(() => setSaveToast(false), 2500);
    if (onUpdateEntries) {
      onUpdateEntries(restoredEntries);
    }
  };

  // Inject cloud deployment configuration file into project
  const handleInjectDeploymentFile = (filename: string, content: string) => {
    const exists = projectEntries.some((e) => e.path === filename);
    const updated = exists
      ? projectEntries.map((e) => (e.path === filename ? { ...e, content } : e))
      : [...projectEntries, { path: filename, content }];

    setProjectEntries(updated);
    setSelectedPath(filename);
    setCheckpointHistory((prev) =>
      createCheckpoint(prev, `Injected Cloud Config: ${filename}`, "scaffold", updated)
    );
    setSaveToast(true);
    setTimeout(() => setSaveToast(false), 2000);
    if (onUpdateEntries) {
      onUpdateEntries(updated);
    }
  };

  // Hot-Patch & Download ZIP (packages in-memory entries with all drafts)
  const handleDownloadHotPatchedZip = () => {
    if (modifiedFiles.size === 0 && onDownloadZip) {
      onDownloadZip();
      return;
    }

    const finalEntries = projectEntries.map((e) => {
      const draft = draftContents[e.path];
      return draft !== undefined ? { ...e, content: draft } : e;
    });

    const zipBuffer = createZip(finalEntries);
    const blob = new Blob([new Uint8Array(zipBuffer)], { type: "application/zip" });
    const url = URL.createObjectURL(blob);
    const downloadName = targetName.includes("Expo")
      ? "codemorph-migrated-expo-app.zip"
      : "codemorph-migrated-project.zip";

    const a = document.createElement("a");
    a.href = url;
    a.download = downloadName;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleCopy = async () => {
    if (!selectedEntry) return;
    try {
      await navigator.clipboard.writeText(activeContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  function getFileCategory(path: string): { label: string; badgeClass: string } {
    if (
      path.startsWith("app/") &&
      (path.endsWith("/page.tsx") || path === "app/page.tsx" || path === "app/index.tsx")
    ) {
      return { label: "Route Screen", badgeClass: "badge-route" };
    }
    if (
      path.endsWith(".json") ||
      path.endsWith(".config.ts") ||
      path.endsWith(".config.js") ||
      path === "app/_layout.tsx" ||
      path === "app/layout.tsx"
    ) {
      return { label: "Config & Scaffold", badgeClass: "badge-scaffold" };
    }
    if (path.endsWith(".md")) {
      return { label: "Report & Docs", badgeClass: "badge-doc" };
    }
    return { label: "Component", badgeClass: "badge-component" };
  }

  return (
    <div className="inspector-container">
      {/* Header with Title and Actions */}
      <div className="inspector-header">
        <div className="inspector-title-row">
          <span className="step-badge success">WORKBENCH</span>
          <div>
            <h3 className="inspector-title">Code Inspector &amp; Live Hot-Patching Sandbox</h3>
            <p className="inspector-subtitle">
              Inspect, edit, and hot-patch synthesized {targetName} files before packaging.
              {modifiedFiles.size > 0 && (
                <span className="modified-counter-badge">
                  {modifiedFiles.size} file{modifiedFiles.size === 1 ? "" : "s"} modified
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="inspector-header-actions">
          <button
            type="button"
            className={`action-btn secondary search-drawer-btn ${searchDrawerOpen ? "is-active" : ""}`}
            onClick={() => setSearchDrawerOpen((prev) => !prev)}
            title="Global Multi-File Code Search & Refactor (Ctrl+Shift+F)"
          >
            🔍 Search
          </button>

          <button
            type="button"
            className="action-btn secondary procedural-rules-btn"
            onClick={() => setRulesModalOpen(true)}
            title="Scan project and batch-apply learned procedural memory rules"
          >
            ⚡ Apply Rules
          </button>

          <button
            type="button"
            className="action-btn secondary test-runner-btn"
            onClick={() => {
              setTerminalInitialTab("tests");
              setTerminalOpen(true);
            }}
            title="Run In-Browser Automated Test Suite & Route Assertion Engine"
          >
            🧪 Run Tests
          </button>

          <button
            type="button"
            className="action-btn secondary universal-btn"
            onClick={() => setUniversalModalOpen(true)}
            title="Open Universal Cross-Platform Target Synchronizer (Next.js ↔ Expo)"
          >
            🔄 Universal Twin
          </button>

          <button
            type="button"
            className="action-btn secondary catalog-btn"
            onClick={() => setCatalogModalOpen(true)}
            title="Open Interactive Component Showcase & Storybook Catalog"
          >
            🧩 Components ({componentCatalog.totalComponents})
          </button>

          <button
            type="button"
            className="action-btn secondary perf-btn"
            onClick={() => setPerfModalOpen(true)}
            title="Open Route Latency & Bundle Footprint Performance Profiler"
          >
            ⚡ Perf ({perfReport.overallPerformanceScore}%)
          </button>

          <button
            type="button"
            className="action-btn secondary api-studio-btn"
            onClick={() => setApiStudioModalOpen(true)}
            title="Open API Route Handler & Server Action Studio"
          >
            🔌 API ({apiSynthesis.totalEndpointsDiscovered})
          </button>

          <button
            type="button"
            className={`action-btn secondary doctor-btn ${doctorReport.overallScore < 90 ? "doctor-alert" : ""}`}
            onClick={() => setDoctorModalOpen(true)}
            title="Open Migration Health Doctor & Diagnostic Autofix"
          >
            🩺 Doctor ({doctorReport.grade} • {doctorReport.overallScore}%)
          </button>

          <button
            type="button"
            className="action-btn secondary git-export-btn"
            onClick={() => setGitModalOpen(true)}
            title="Generate Git Patch, PR Branch Commands & Description"
          >
            📦 Git / PR
          </button>

          <button
            type="button"
            className="action-btn secondary deploy-modal-btn"
            onClick={() => setDeployModalOpen(true)}
            title="Open Cloud Deployment & Launch Integrator"
          >
            🚀 Deploy
          </button>

          <button
            type="button"
            className="action-btn secondary architecture-btn"
            onClick={() => setArchitectureModalOpen(true)}
            title="Open Interactive Architecture & Dependency Graph"
          >
            🧬 Architecture
          </button>

          <button
            type="button"
            className={`action-btn secondary terminal-toggle-btn ${terminalOpen ? "is-active" : ""}`}
            onClick={() => setTerminalOpen((prev) => !prev)}
            title="Toggle Simulated Dev Server & Bundle Execution Terminal"
          >
            &gt;_ Terminal
          </button>

          <button
            type="button"
            className="action-btn secondary history-modal-btn"
            onClick={() => setHistoryModalOpen(true)}
            title="Open Checkpoint History & Time-Machine"
          >
            🕒 History ({checkpointHistory.checkpoints.length})
          </button>

          {modifiedFiles.size > 0 && (
            <button
              type="button"
              className="action-btn secondary revert-all-btn"
              onClick={handleRevertAllFiles}
              title="Revert all files to generated baseline"
            >
              Reset All Edits
            </button>
          )}

          <button
            type="button"
            className="action-btn primary inspector-dl-btn"
            onClick={handleDownloadHotPatchedZip}
          >
            {modifiedFiles.size > 0 ? "Download Patched ZIP ➔" : "Download Project ZIP ➔"}
          </button>
        </div>
      </div>

      <div className="inspector-workspace-grid">
        {/* SIDEBAR: File Tree & Actions */}
        <aside className="inspector-sidebar">
          <div className="sidebar-tools-row">
            <input
              type="text"
              placeholder="Filter files..."
              className="file-search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <button
              type="button"
              className="add-file-btn"
              onClick={() => setNewFileModalOpen(true)}
              title="Add a new file to project"
            >
              + New File
            </button>
          </div>

          <div className="inspector-file-list" role="list">
            {filteredEntries.map((entry) => {
              const isSelected = entry.path === selectedEntry?.path;
              const isModified = modifiedFiles.has(entry.path);
              const cat = getFileCategory(entry.path);
              const lineCount = entry.content.split("\n").length;
              const byteSize = new TextEncoder().encode(entry.content).length;

              return (
                <button
                  type="button"
                  key={entry.path}
                  className={`file-item-btn ${isSelected ? "is-active" : ""} ${isModified ? "is-modified" : ""}`}
                  onClick={() => {
                    setSelectedPath(entry.path);
                    setOverrideSourcePath("");
                  }}
                  role="listitem"
                >
                  <div className="file-item-top">
                    <span className="file-name">
                      <code>{entry.path}</code>
                    </span>
                    {isModified && <span className="mod-dot" title="Modified by developer">•</span>}
                  </div>
                  <div className="file-item-bottom">
                    <span className={`file-badge ${cat.badgeClass}`}>{cat.label}</span>
                    <span className="file-meta">
                      {lineCount} lines · {(byteSize / 1024).toFixed(1)} KB
                    </span>
                  </div>
                </button>
              );
            })}
            {filteredEntries.length === 0 && (
              <div className="empty-files-msg">No files matched &quot;{searchQuery}&quot;</div>
            )}
          </div>
        </aside>

        {/* MAIN: Code, Editor & Diff Viewer */}
        <main className="inspector-code-pane">
          {selectedEntry ? (
            <>
              {/* Toolbar */}
              <div className="code-pane-toolbar">
                <div className="code-file-info">
                  <span className="code-file-icon">📄</span>
                  <span className="code-file-path">{selectedEntry.path}</span>
                  <span className="code-file-badge">{getFileCategory(selectedEntry.path).label}</span>
                  {modifiedFiles.has(selectedEntry.path) && (
                    <span className="file-modified-pill">Customized</span>
                  )}
                </div>

                {/* Mode Selector: View Code, Edit Sandbox, Side-by-Side Diff, Unified Diff */}
                <div className="diff-mode-toggle-group" role="group" aria-label="View Mode">
                  <button
                    type="button"
                    className={`diff-toggle-btn ${viewMode === "code" ? "is-active" : ""}`}
                    onClick={() => setViewMode("code")}
                  >
                    View Code
                  </button>
                  <button
                    type="button"
                    className={`diff-toggle-btn edit-btn ${viewMode === "edit" ? "is-active" : ""}`}
                    onClick={() => setViewMode("edit")}
                  >
                    ✏️ Edit &amp; Patch
                  </button>
                  <button
                    type="button"
                    className={`diff-toggle-btn ${viewMode === "split" ? "is-active" : ""}`}
                    onClick={() => setViewMode("split")}
                  >
                    Side-by-Side Diff
                  </button>
                  <button
                    type="button"
                    className={`diff-toggle-btn ${viewMode === "unified" ? "is-active" : ""}`}
                    onClick={() => setViewMode("unified")}
                  >
                    Unified Diff
                  </button>
                  <button
                    type="button"
                    className={`diff-toggle-btn preview-btn ${viewMode === "preview" ? "is-active" : ""}`}
                    onClick={() => setViewMode("preview")}
                  >
                    👁️ Preview
                  </button>
                </div>

                <div className="code-pane-actions">
                  {viewMode === "edit" ? (
                    <>
                      <button
                        type="button"
                        className="code-tool-btn save-btn"
                        onClick={handleSaveCurrentFile}
                        disabled={!hasUnsavedChanges}
                      >
                        {saveToast ? "✓ Saved!" : hasUnsavedChanges ? "Save Changes" : "Saved"}
                      </button>
                      {modifiedFiles.has(selectedEntry.path) && (
                        <button
                          type="button"
                          className="code-tool-btn revert-btn"
                          onClick={handleRevertCurrentFile}
                          title="Revert this file to original generated version"
                        >
                          Revert
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      <button type="button" className="code-tool-btn" onClick={handleCopy}>
                        {copied ? "✓ Copied" : "Copy Code"}
                      </button>
                      <button
                        type="button"
                        className="code-tool-btn delete-btn"
                        onClick={handleDeleteCurrentFile}
                        title="Delete this file"
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* One-Click Deterministic Codemod Quick-Fix Banner */}
              {applicableCodemods.length > 0 && (
                <div className="codemod-quickfix-banner">
                  <div className="codemod-title-col">
                    <span className="codemod-banner-title">⚡ CODE QUICK-FIXES:</span>
                    <span className="codemod-banner-desc">Deterministic automated transforms ready to apply</span>
                  </div>
                  <div className="codemod-pills-row">
                    {applicableCodemods.map((action) => (
                      <button
                        key={action.id}
                        type="button"
                        className="codemod-action-pill"
                        onClick={() => handleApplyCodemod(action)}
                        title={action.description}
                      >
                        <span className="codemod-pill-icon">{action.icon}</span>
                        <span>{action.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Edit Mode Banner & Syntax Status Bar */}
              {viewMode === "edit" && (
                <div className="editor-status-banner">
                  <div className="syntax-status-row">
                    <span className={`syntax-badge ${syntaxStatus.severity}`}>
                      {syntaxStatus.severity === "valid"
                        ? "✓ Syntax Valid"
                        : syntaxStatus.severity === "warning"
                        ? "⚠️ Warning"
                        : "✕ Syntax Error"}
                    </span>
                    <span className="syntax-msg">{syntaxStatus.message}</span>
                  </div>
                  <div className="editor-meta-info">
                    <span>Press <code>Ctrl+S</code> / <code>Cmd+S</code> to save patch</span>
                    <span>{lines.length} lines</span>
                    <span>{new TextEncoder().encode(activeContent).length} bytes</span>
                  </div>
                </div>
              )}

              {/* Transformation Ancestor & Diff Banner (when Diff mode is active) */}
              {(viewMode === "split" || viewMode === "unified") && (
                <div className="diff-ancestor-banner">
                  <div className="ancestor-info-col">
                    <span className="ancestor-label">COMPARE WITH:</span>
                    <div className="compare-mode-pills">
                      <button
                        type="button"
                        className={`compare-pill ${compareBaseline === "source" ? "is-active" : ""}`}
                        onClick={() => setCompareBaseline("source")}
                      >
                        Legacy Source Repository
                      </button>
                      <button
                        type="button"
                        className={`compare-pill ${compareBaseline === "original" ? "is-active" : ""}`}
                        onClick={() => setCompareBaseline("original")}
                      >
                        Original AI-Generated Scaffold
                      </button>
                    </div>
                  </div>

                  {/* Diff Stats Pill */}
                  {diffSummary && (
                    <div className="diff-stats-pill">
                      <span className="stat-add">+{diffSummary.additions}</span>
                      <span className="stat-del">-{diffSummary.deletions}</span>
                      <span className="stat-status">
                        {diffSummary.isExactMatch
                          ? "IDENTICAL"
                          : compareBaseline === "original"
                          ? `${diffSummary.changes} CUSTOM EDITS`
                          : sourceFileEntry
                          ? `${diffSummary.changes} CHANGES`
                          : "NEW FILE"}
                      </span>
                    </div>
                  )}

                  {/* Custom Source Compare Selector (for legacy source comparison) */}
                  {compareBaseline === "source" && sourceManifest && sourceManifest.files.length > 0 && (
                    <div className="source-compare-picker">
                      <label htmlFor="source-compare-select" className="picker-lbl">
                        File:
                      </label>
                      <select
                        id="source-compare-select"
                        className="picker-select"
                        value={matchedSourcePath}
                        onChange={(e) => setOverrideSourcePath(e.target.value)}
                      >
                        <option value="">(None - Treat as New File)</option>
                        {sourceManifest.files.map((sf) => (
                          <option key={sf.path} value={sf.path}>
                            {sf.path}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}

              {/* VIEWPORT: Code, Live Editor, or Diff */}
              <div className="code-viewer-viewport">
                {/* 1. Read-only Code View */}
                {viewMode === "code" && (
                  <table className="code-table">
                    <tbody>
                      {lines.map((line, idx) => (
                        <tr key={idx} className="code-line-row">
                          <td className="line-num">{idx + 1}</td>
                          <td className="line-code">
                            <code>{line || " "}</code>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {/* 2. Interactive Live Editor */}
                {viewMode === "edit" && (
                  <div className="live-editor-wrapper">
                    <div className="editor-gutter" ref={lineGutterRef}>
                      {lines.map((_, idx) => (
                        <div key={idx} className="gutter-line-num">
                          {idx + 1}
                        </div>
                      ))}
                    </div>
                    <textarea
                      ref={textareaRef}
                      className="editor-textarea"
                      value={activeContent}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (selectedEntry) {
                          setDraftContents((prev) => ({ ...prev, [selectedEntry.path]: val }));
                        }
                      }}
                      onKeyDown={handleEditorKeyDown}
                      onScroll={handleScroll}
                      spellCheck={false}
                      autoCapitalize="off"
                      autoComplete="off"
                      autoCorrect="off"
                    />
                  </div>
                )}

                {/* 3. Side-by-Side Diff */}
                {viewMode === "split" && diffSummary && (
                  <div className="split-diff-wrapper">
                    <div className="split-diff-header">
                      <div className="split-header-col left">
                        <span>
                          {compareBaseline === "source"
                            ? `Source: ${sourceFileEntry ? sourceFileEntry.path : "(No Legacy File)"}`
                            : `Baseline Generated: ${selectedEntry.path}`}
                        </span>
                      </div>
                      <div className="split-header-col right">
                        <span>Current Target: {selectedEntry.path}</span>
                      </div>
                    </div>
                    <table className="split-diff-table">
                      <tbody>
                        {diffSummary.split.map((row, idx) => {
                          const leftCell = row.left;
                          const rightCell = row.right;
                          const leftClass = leftCell ? `cell-${leftCell.type}` : "cell-empty";
                          const rightClass = rightCell ? `cell-${rightCell.type}` : "cell-empty";

                          return (
                            <tr key={idx} className="split-row">
                              {/* Left / Baseline */}
                              <td className={`line-num ${leftClass}`}>{leftCell ? leftCell.number : ""}</td>
                              <td className={`line-code ${leftClass}`}>
                                <code>{leftCell ? leftCell.text || " " : " "}</code>
                              </td>

                              {/* Right / Target */}
                              <td className={`line-num ${rightClass}`}>{rightCell ? rightCell.number : ""}</td>
                              <td className={`line-code ${rightClass}`}>
                                <code>{rightCell ? rightCell.text || " " : " "}</code>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* 4. Unified Diff */}
                {viewMode === "unified" && diffSummary && (
                  <table className="unified-diff-table">
                    <tbody>
                      {diffSummary.unified.map((line, idx) => {
                        const lineClass = `line-${line.type}`;
                        const prefix = line.type === "added" ? "+" : line.type === "removed" ? "-" : " ";

                        return (
                          <tr key={idx} className={`unified-row ${lineClass}`}>
                            <td className="line-num old-num">{line.oldLineNumber ?? ""}</td>
                            <td className="line-num new-num">{line.newLineNumber ?? ""}</td>
                            <td className="diff-sign">
                              <code>{prefix}</code>
                            </td>
                            <td className="line-code">
                              <code>{line.text || " "}</code>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}

                {/* 5. In-Browser Simulated Device Preview */}
                {viewMode === "preview" && (
                  <SimulatedDevicePreview
                    activeEntry={{ ...selectedEntry, content: activeContent }}
                    allEntries={projectEntries.map((e) => ({
                      ...e,
                      content: draftContents[e.path] ?? e.content,
                    }))}
                    target={targetType}
                    onSelectRoute={(path) => setSelectedPath(path)}
                  />
                )}
              </div>
            </>
          ) : (
            <div className="empty-selection-msg">Select a file from the explorer to view or edit.</div>
          )}
        </main>
      </div>

      {/* Simulated Dev Terminal */}
      <SimulatedDevTerminal
        key={terminalInitialTab}
        entries={projectEntries}
        targetName={targetName}
        isOpen={terminalOpen}
        onToggle={() => setTerminalOpen((prev) => !prev)}
        initialTab={terminalInitialTab}
      />

      {/* New File Modal */}
      {newFileModalOpen && (
        <div className="modal-backdrop" onClick={() => setNewFileModalOpen(false)}>
          <div className="new-file-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h4>Add New File to Synthesized Project</h4>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setNewFileModalOpen(false)}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleCreateNewFile} className="new-file-form">
              <label htmlFor="new-file-input" className="form-label">
                FILE PATH RELATIVE TO PROJECT ROOT
              </label>
              <input
                id="new-file-input"
                type="text"
                className="text-input"
                placeholder="e.g. app/api/ping/route.ts, .env.local, components/Banner.tsx"
                value={newFilePath}
                onChange={(e) => {
                  setNewFilePath(e.target.value);
                  setNewFileError("");
                }}
                autoFocus
                required
              />

              {newFileError && <p className="inline-error">{newFileError}</p>}

              <div className="quick-template-pills">
                <span className="templates-label">Quick Templates:</span>
                <button
                  type="button"
                  className="template-pill"
                  onClick={() => setNewFilePath(".env.local")}
                >
                  .env.local
                </button>
                <button
                  type="button"
                  className="template-pill"
                  onClick={() => setNewFilePath("app/api/health/route.ts")}
                >
                  app/api/health/route.ts
                </button>
                <button
                  type="button"
                  className="template-pill"
                  onClick={() => setNewFilePath("components/CustomBanner.tsx")}
                >
                  components/CustomBanner.tsx
                </button>
                <button
                  type="button"
                  className="template-pill"
                  onClick={() => setNewFilePath("__tests__/custom.test.tsx")}
                >
                  __tests__/custom.test.tsx
                </button>
              </div>

              <div className="modal-actions-row">
                <button
                  type="button"
                  className="action-btn secondary"
                  onClick={() => setNewFileModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="action-btn primary">
                  Create File &amp; Open Editor
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Checkpoint Time-Machine Modal */}
      <CheckpointTimelineModal
        isOpen={historyModalOpen}
        onClose={() => setHistoryModalOpen(false)}
        history={checkpointHistory}
        onRestoreCheckpoint={handleRestoreCheckpoint}
      />

      {/* Interactive Architecture & Dependency Graph Modal */}
      <ArchitectureGraphModal
        isOpen={architectureModalOpen}
        onClose={() => setArchitectureModalOpen(false)}
        entries={projectEntries}
        title={`Architecture & Dependency Graph (${targetName})`}
      />

      {/* Cloud Deployment & Launch Integrator Modal */}
      <DeploymentLaunchModal
        isOpen={deployModalOpen}
        onClose={() => setDeployModalOpen(false)}
        targetName={targetName}
        projectName={targetName.toLowerCase().includes("expo") ? "codemorph-expo-app" : "codemorph-nextjs-app"}
        entries={projectEntries}
        onInjectFile={handleInjectDeploymentFile}
      />

      {/* Procedural Rules Enforcement Modal */}
      <ProceduralRulesEnforcementModal
        isOpen={rulesModalOpen}
        onClose={() => setRulesModalOpen(false)}
        entries={projectEntries}
        onApplyFixes={handleApplyProceduralRules}
      />

      {/* Global Multi-File Code Search & Refactoring Drawer */}
      <CodeSearchDrawer
        isOpen={searchDrawerOpen}
        onClose={() => setSearchDrawerOpen(false)}
        entries={projectEntries}
        onSelectMatch={handleSelectSearchMatch}
        onApplyReplace={handleApplyGlobalReplace}
      />

      {/* Migration Git Patch & Pull Request Export Integrator Modal */}
      <GitExportModal
        isOpen={gitModalOpen}
        onClose={() => setGitModalOpen(false)}
        targetName={targetName}
        sourceFiles={sourceManifest ? sourceManifest.files : []}
        targetEntries={projectEntries}
      />

      {/* Migration Health Doctor & Diagnostic Autofix Modal */}
      <MigrationDoctorModal
        isOpen={doctorModalOpen}
        onClose={() => setDoctorModalOpen(false)}
        entries={projectEntries}
        targetName={targetName}
        onApplyAutofix={handleApplyDoctorAutofix}
        onSelectFile={(filePath) => setSelectedPath(filePath)}
      />

      {/* Interactive Component Showcase & Storybook Catalog Modal */}
      <ComponentCatalogModal
        isOpen={catalogModalOpen}
        onClose={() => setCatalogModalOpen(false)}
        entries={projectEntries}
        targetName={targetName}
        onInjectStorybook={handleInjectStorybook}
        onSelectFile={(filePath) => setSelectedPath(filePath)}
      />

      {/* Universal Cross-Platform Target Synchronizer Modal */}
      <UniversalTargetModal
        isOpen={universalModalOpen}
        onClose={() => setUniversalModalOpen(false)}
        entries={projectEntries}
        targetName={targetName}
        onSwitchTarget={handleSwitchTarget}
      />

      {/* Route Latency & Bundle Footprint Performance Profiler Modal */}
      <PerformanceProfilerModal
        isOpen={perfModalOpen}
        onClose={() => setPerfModalOpen(false)}
        entries={projectEntries}
        targetName={targetName}
        onApplyOptimization={handleApplyPerfOptimization}
        onSelectFile={(filePath) => setSelectedPath(filePath)}
      />

      {/* API Contract & Server Action Studio Modal */}
      <ApiStudioModal
        isOpen={apiStudioModalOpen}
        onClose={() => setApiStudioModalOpen(false)}
        entries={projectEntries}
        targetName={targetName}
        onInjectFiles={handleInjectApiFiles}
        onSelectFile={(filePath) => setSelectedPath(filePath)}
      />
    </div>
  );
}
