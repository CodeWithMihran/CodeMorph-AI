"use client";

import { useEffect } from "react";

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ShortcutItem {
  key: string;
  altKey?: string;
  label: string;
  path?: string;
}

interface ShortcutGroup {
  category: string;
  items: ShortcutItem[];
}

export function KeyboardShortcutsModal({ isOpen, onClose }: KeyboardShortcutsModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const shortcutGroups: ShortcutGroup[] = [
    {
      category: "STUDIO NAVIGATION",
      items: [
        { key: "1", altKey: "D", label: "Overview & Quick Workbench", path: "/" },
        { key: "2", altKey: "A", label: "Codebase Audit & AST Security", path: "/audit" },
        { key: "3", altKey: "F", label: "Feasibility & Portability Index", path: "/feasibility" },
        { key: "4", altKey: "B", label: "Multi-Repo Benchmark Matrix", path: "/benchmark" },
        { key: "5", altKey: "M", label: "Cross-Stack Migration Studio", path: "/migrate" },
        { key: "6", altKey: "R", label: "Self-Learning Procedural Rules", path: "/memory" },
      ],
    },
    {
      category: "SYSTEM & UTILITIES",
      items: [
        { key: "T", label: "Toggle Theme (Ruby Dark / Azure Light)" },
        { key: "H", label: "Open Activity & Inspection History" },
        { key: "?", label: "Toggle this Keyboard Shortcuts HUD" },
        { key: "Esc", label: "Close active modal, drawer, or dialog" },
      ],
    },
  ];

  return (
    <div className="shortcuts-modal-overlay" onClick={onClose} aria-hidden="true">
      <div
        className="shortcuts-modal-panel animate-fadein"
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shortcuts-modal-header">
          <div className="shortcuts-title-wrap">
            <span className="card-kicker-tag">{"// DEVELOPER PRODUCTIVITY"}</span>
            <h3 id="shortcuts-modal-title" className="shortcuts-modal-title">
              Keyboard Navigation HUD
            </h3>
          </div>
          <button
            type="button"
            className="shortcuts-close-btn"
            onClick={onClose}
            aria-label="Close shortcuts HUD"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>

        <p className="shortcuts-modal-desc">
          Navigate and operate CodeMorph AI with zero mouse friction. Press any shortcut key from anywhere when not focused on an input.
        </p>

        <div className="shortcuts-groups-container">
          {shortcutGroups.map((group) => (
            <div key={group.category} className="shortcut-group-block">
              <span className="shortcut-group-kicker">{group.category}</span>
              <div className="shortcut-items-list">
                {group.items.map((item) => (
                  <div key={item.label} className="shortcut-item-row">
                    <span className="shortcut-item-label">{item.label}</span>
                    <div className="shortcut-keys-cluster">
                      <kbd className="shortcut-kbd">{item.key}</kbd>
                      {item.altKey && (
                        <>
                          <span className="shortcut-separator">/</span>
                          <kbd className="shortcut-kbd">{item.altKey}</kbd>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="shortcuts-modal-footer">
          <span className="shortcuts-footer-hint">
            Tip: Press <kbd className="shortcut-kbd inline">?</kbd> at any time to toggle this HUD
          </span>
          <button type="button" className="action-btn secondary btn-sm" onClick={onClose}>
            Close HUD [Esc]
          </button>
        </div>
      </div>
    </div>
  );
}
