"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  getHistory,
  deleteHistoryRecord,
  clearAllHistory,
  setPendingRestore,
  type HistoryRecord,
  type HistoryItemType,
} from "@/lib/storage/history-store";

interface HistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onRestoreDirectly?: (item: HistoryRecord) => void;
}

export function HistoryDrawer({ isOpen, onClose, onRestoreDirectly }: HistoryDrawerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [history, setHistory] = useState<HistoryRecord[]>(() => getHistory());
  const [activeTab, setActiveTab] = useState<"all" | HistoryItemType>("all");

  useEffect(() => {
    const handleUpdate = () => setHistory(getHistory());
    window.addEventListener("codemorph-history-updated", handleUpdate);
    return () => window.removeEventListener("codemorph-history-updated", handleUpdate);
  }, []);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const filteredHistory = useMemo(() => {
    if (activeTab === "all") return history;
    return history.filter((item) => item.type === activeTab);
  }, [history, activeTab]);

  const auditCount = useMemo(() => history.filter((i) => i.type === "audit").length, [history]);
  const feasibilityCount = useMemo(() => history.filter((i) => i.type === "feasibility").length, [history]);
  const migrationCount = useMemo(() => history.filter((i) => i.type === "migration").length, [history]);

  const handleRestore = (item: HistoryRecord) => {
    setPendingRestore(item);

    if (item.type === "audit") {
      if (pathname === "/audit" && onRestoreDirectly) {
        onRestoreDirectly(item);
      } else {
        router.push("/audit");
      }
    } else if (item.type === "feasibility") {
      if (pathname === "/feasibility" && onRestoreDirectly) {
        onRestoreDirectly(item);
      } else {
        router.push("/feasibility");
      }
    } else if (item.type === "migration") {
      router.push("/migrate");
    }

    onClose();
  };

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    deleteHistoryRecord(id);
  };

  const handleClearAll = () => {
    if (confirm("Are you sure you want to clear your inspection and migration history?")) {
      clearAllHistory();
    }
  };

  function formatTime(isoString: string): string {
    try {
      const date = new Date(isoString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);

      if (diffMins < 1) return "Just now";
      if (diffMins < 60) return `${diffMins}m ago`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}h ago`;
      return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    } catch {
      return "";
    }
  }

  if (!isOpen) return null;

  return (
    <div className="drawer-portal">
      {/* Backdrop */}
      <div className="drawer-backdrop" onClick={onClose} aria-hidden="true" />

      {/* Slide-over panel */}
      <aside className="drawer-panel animate-slide-left" role="dialog" aria-modal="true" aria-label="Activity History">
        {/* Header */}
        <div className="drawer-header">
          <div className="drawer-title-row">
            <span className="drawer-icon">🕒</span>
            <div>
              <h2 className="drawer-title">Activity &amp; Inspection History</h2>
              <p className="drawer-subtitle">
                {history.length} saved inspection{history.length === 1 ? "" : "s"} &amp; migrations
              </p>
            </div>
          </div>
          <div className="drawer-header-actions">
            {history.length > 0 && (
              <button
                type="button"
                className="drawer-clear-btn"
                onClick={handleClearAll}
                title="Clear all stored history"
              >
                Clear All
              </button>
            )}
            <button
              type="button"
              className="drawer-close-btn"
              onClick={onClose}
              aria-label="Close activity history"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="drawer-tabs-bar" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "all"}
            className={`drawer-tab ${activeTab === "all" ? "is-active" : ""}`}
            onClick={() => setActiveTab("all")}
          >
            All ({history.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "audit"}
            className={`drawer-tab ${activeTab === "audit" ? "is-active" : ""}`}
            onClick={() => setActiveTab("audit")}
          >
            Audits ({auditCount})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "feasibility"}
            className={`drawer-tab ${activeTab === "feasibility" ? "is-active" : ""}`}
            onClick={() => setActiveTab("feasibility")}
          >
            Feasibility ({feasibilityCount})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "migration"}
            className={`drawer-tab ${activeTab === "migration" ? "is-active" : ""}`}
            onClick={() => setActiveTab("migration")}
          >
            Migrations ({migrationCount})
          </button>
        </div>

        {/* History Item Cards List */}
        <div className="drawer-items-list" role="list">
          {filteredHistory.map((item) => {
            const timeAgo = formatTime(item.timestamp);

            if (item.type === "audit") {
              return (
                <div key={item.id} className="history-card audit-type" role="listitem">
                  <div className="history-card-header">
                    <div className="type-badge audit">🛡 AUDIT</div>
                    <span className="history-time">{timeAgo}</span>
                  </div>
                  <h4 className="history-repo-title">{item.repository}</h4>
                  <div className="history-meta-row">
                    <span className="history-chip">
                      {item.findingsCount} findings ({item.criticalCount} crit, {item.highCount} high)
                    </span>
                    <span className="history-chip">
                      {item.syntaxErrors} syntax / {item.unresolvedImports} imports
                    </span>
                  </div>
                  <div className="history-card-actions">
                    <button
                      type="button"
                      className="history-action-btn primary"
                      onClick={() => handleRestore(item)}
                    >
                      Restore &amp; View Audit ➔
                    </button>
                    <button
                      type="button"
                      className="history-del-btn"
                      onClick={(e) => handleDelete(e, item.id)}
                      title="Remove record"
                    >
                      🗑
                    </button>
                  </div>
                </div>
              );
            }

            if (item.type === "feasibility") {
              const targetLabel = item.target === "expo" ? "Expo Mobile" : "Next.js App Router";
              return (
                <div key={item.id} className="history-card feasibility-type" role="listitem">
                  <div className="history-card-header">
                    <div className="type-badge feasibility">⚡ FEASIBILITY</div>
                    <span className="history-time">{timeAgo}</span>
                  </div>
                  <h4 className="history-repo-title">{item.repository}</h4>
                  <div className="history-meta-row">
                    <span className="history-chip target-chip">{targetLabel}</span>
                    <span className="history-chip score-chip">
                      Score: {item.score}% ({item.tier.toUpperCase()})
                    </span>
                  </div>
                  <p className="history-recommendation">{item.summary}</p>
                  <div className="history-card-actions">
                    <button
                      type="button"
                      className="history-action-btn primary"
                      onClick={() => handleRestore(item)}
                    >
                      View Feasibility Score ➔
                    </button>
                    <button
                      type="button"
                      className="history-del-btn"
                      onClick={(e) => handleDelete(e, item.id)}
                      title="Remove record"
                    >
                      🗑
                    </button>
                  </div>
                </div>
              );
            }

            if (item.type === "migration") {
              return (
                <div key={item.id} className="history-card migration-type" role="listitem">
                  <div className="history-card-header">
                    <div className="type-badge migration">⇄ MIGRATION</div>
                    <span className="history-time">{timeAgo}</span>
                  </div>
                  <h4 className="history-repo-title">{item.repository}</h4>
                  <div className="history-meta-row">
                    <span className="history-chip target-chip">{item.target}</span>
                    <span className="history-chip">{item.fileCount} output files</span>
                    <span className={`history-chip ${item.validation === "passed" ? "verified" : ""}`}>
                      Validation: {item.validation.toUpperCase()}
                    </span>
                  </div>
                  <div className="history-card-actions">
                    <button
                      type="button"
                      className="history-action-btn primary"
                      onClick={() => handleRestore(item)}
                    >
                      Open Migration Studio ➔
                    </button>
                    <button
                      type="button"
                      className="history-del-btn"
                      onClick={(e) => handleDelete(e, item.id)}
                      title="Remove record"
                    >
                      🗑
                    </button>
                  </div>
                </div>
              );
            }

            return null;
          })}

          {filteredHistory.length === 0 && (
            <div className="drawer-empty-state">
              <span className="empty-icon">📂</span>
              <h4 className="empty-title">No inspection history yet</h4>
              <p className="empty-text">
                Run an audit in Code Audit Studio, evaluate a repository feasibility score, or execute a stack migration. Completed runs will appear here automatically.
              </p>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
