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
            <span className="drawer-icon" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="8" cy="8" r="6" />
                <path d="M8 4.5V8L10.5 10" />
              </svg>
            </span>
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
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M4 4l8 8M12 4l-8 8" />
              </svg>
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
                    <div className="type-badge audit">
                      <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M8 1.5L2.5 4v4.5c0 3.5 2.5 6 5.5 6.5 3-.5 5.5-3 5.5-6.5V4L8 1.5z" />
                        <path d="M6 8l1.5 1.5L10.5 6" />
                      </svg>
                      <span>AUDIT</span>
                    </div>
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
                      <span>Restore &amp; View Audit</span>
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 8h10M9 4l4 4-4 4" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      className="history-del-btn"
                      onClick={(e) => handleDelete(e, item.id)}
                      title="Remove record"
                      aria-label="Remove record"
                    >
                      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <path d="M3 4.5h10M6 4.5V3a1 1 0 011-1h2a1 1 0 011 1v1.5M5 4.5v8.5a1 1 0 001 1h4a1 1 0 001-1V4.5M7 7.5v4M9 7.5v4" />
                      </svg>
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
                    <div className="type-badge feasibility">
                      <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="8" cy="8" r="6" />
                        <path d="M8 5v3.5l2.5 1.5" />
                      </svg>
                      <span>FEASIBILITY</span>
                    </div>
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
                      <span>View Feasibility Score</span>
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 8h10M9 4l4 4-4 4" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      className="history-del-btn"
                      onClick={(e) => handleDelete(e, item.id)}
                      title="Remove record"
                      aria-label="Remove record"
                    >
                      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <path d="M3 4.5h10M6 4.5V3a1 1 0 011-1h2a1 1 0 011 1v1.5M5 4.5v8.5a1 1 0 001 1h4a1 1 0 001-1V4.5M7 7.5v4M9 7.5v4" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            }

            if (item.type === "migration") {
              return (
                <div key={item.id} className="history-card migration-type" role="listitem">
                  <div className="history-card-header">
                    <div className="type-badge migration">
                      <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M2.5 5h9M8.5 2l3 3-3 3" />
                        <path d="M13.5 11h-9M7.5 8l-3 3 3 3" />
                      </svg>
                      <span>MIGRATION</span>
                    </div>
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
                      <span>Open Migration Studio</span>
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 8h10M9 4l4 4-4 4" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      className="history-del-btn"
                      onClick={(e) => handleDelete(e, item.id)}
                      title="Remove record"
                      aria-label="Remove record"
                    >
                      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <path d="M3 4.5h10M6 4.5V3a1 1 0 011-1h2a1 1 0 011 1v1.5M5 4.5v8.5a1 1 0 001 1h4a1 1 0 001-1V4.5M7 7.5v4M9 7.5v4" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            }

            return null;
          })}

          {filteredHistory.length === 0 && (
            <div className="drawer-empty-state">
              <span className="empty-icon" aria-hidden="true">
                <svg width="32" height="32" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M2 3.5h4l1.5 2H14v7H2v-9z" />
                </svg>
              </span>
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
