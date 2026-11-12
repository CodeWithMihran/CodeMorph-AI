"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import { HistoryDrawer } from "@/components/HistoryDrawer";
import { KeyboardShortcutsModal } from "@/components/KeyboardShortcutsModal";
import { getHistory } from "@/lib/storage/history-store";
import { useTheme } from "@/components/ThemeProvider";

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [historyDrawerOpen, setHistoryDrawerOpen] = useState(false);
  const [shortcutsModalOpen, setShortcutsModalOpen] = useState(false);
  const [historyCount, setHistoryCount] = useState(() => getHistory().length);
  const [hasScrolled, setHasScrolled] = useState(false);

  useEffect(() => {
    const updateCount = () => {
      setHistoryCount(getHistory().length);
    };
    window.addEventListener("codemorph-history-updated", updateCount);
    return () => window.removeEventListener("codemorph-history-updated", updateCount);
  }, []);

  // Track window scroll for reactive navbar styling
  useEffect(() => {
    const handleScroll = () => {
      setHasScrolled(window.scrollY > 10);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const navItems = [
    {
      label: "Overview",
      fullLabel: "System Overview & Workbench",
      href: "/",
      hotkey: "1",
      icon: (
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="2" y="2" width="5" height="5" />
          <rect x="9" y="2" width="5" height="5" />
          <rect x="2" y="9" width="5" height="5" />
          <rect x="9" y="9" width="5" height="5" />
        </svg>
      ),
    },
    {
      label: "Audit",
      fullLabel: "Codebase Audit & AST Security",
      href: "/audit",
      hotkey: "2",
      icon: (
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M8 1.5L2.5 4v4.5c0 3.5 2.5 6 5.5 6.5 3-.5 5.5-3 5.5-6.5V4L8 1.5z" />
          <path d="M6 8l1.5 1.5L10.5 6" />
        </svg>
      ),
    },
    {
      label: "Feasibility",
      fullLabel: "Feasibility & Portability Index",
      href: "/feasibility",
      hotkey: "3",
      icon: (
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="8" cy="8" r="6" />
          <path d="M8 5v3.5l2.5 1.5" />
        </svg>
      ),
    },
    {
      label: "Benchmark",
      fullLabel: "Multi-Repo Benchmark Matrix",
      href: "/benchmark",
      hotkey: "4",
      icon: (
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M2.5 13.5h11" />
          <path d="M4.5 13.5V9" />
          <path d="M8 13.5V4.5" />
          <path d="M11.5 13.5V7" />
        </svg>
      ),
    },
    {
      label: "Migration",
      fullLabel: "Cross-Stack Migration Studio",
      href: "/migrate",
      hotkey: "5",
      icon: (
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M2.5 5h9M8.5 2l3 3-3 3" />
          <path d="M13.5 11h-9M7.5 8l-3 3 3 3" />
        </svg>
      ),
    },
    {
      label: "Rules",
      fullLabel: "Self-Learning Procedural Rules",
      href: "/memory",
      hotkey: "6",
      icon: (
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="3.5" y="3.5" width="9" height="9" />
          <path d="M6 1.5V3.5M10 1.5V3.5M6 12.5V14.5M10 12.5V14.5M1.5 6H3.5M1.5 10H3.5M12.5 6H14.5M12.5 10H14.5" />
        </svg>
      ),
    },
  ];

  // Global keyboard shortcuts handler
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Ignore when typing inside input, textarea, or select
    const target = e.target as HTMLElement | null;
    if (
      target &&
      (target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable)
    ) {
      return;
    }

    // Modal close handled by individual components
    if (e.key === "?" || (e.shiftKey && e.key === "/")) {
      e.preventDefault();
      setShortcutsModalOpen((prev) => !prev);
      return;
    }

    if (e.key === "t" || e.key === "T") {
      e.preventDefault();
      toggleTheme();
      return;
    }

    if (e.key === "h" || e.key === "H") {
      e.preventDefault();
      setHistoryDrawerOpen((prev) => !prev);
      return;
    }

    // Quick studio navigation: 1-6
    if (e.key === "1" || (e.altKey && (e.key === "d" || e.key === "D"))) {
      router.push("/");
    } else if (e.key === "2" || (e.altKey && (e.key === "a" || e.key === "A"))) {
      router.push("/audit");
    } else if (e.key === "3" || (e.altKey && (e.key === "f" || e.key === "F"))) {
      router.push("/feasibility");
    } else if (e.key === "4" || (e.altKey && (e.key === "b" || e.key === "B"))) {
      router.push("/benchmark");
    } else if (e.key === "5" || (e.altKey && (e.key === "m" || e.key === "M"))) {
      router.push("/migrate");
    } else if (e.key === "6" || (e.altKey && (e.key === "r" || e.key === "R"))) {
      router.push("/memory");
    }
  }, [router, toggleTheme]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const isDark = theme === "dark";

  return (
    <header className={`site-header ${hasScrolled ? "has-scrolled" : ""}`}>
      <div className="header-inner">
        {/* Brand Monogram & Title */}
        <Link href="/" className="brand-link" aria-label="CodeMorph AI Home">
          <span className="brand-logo" aria-hidden="true">
            {isDark ? (
              <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
                <rect width="32" height="32" fill="#180a0f" stroke="rgba(255, 45, 75, 0.4)" strokeWidth="1" />
                <path d="M8 16L14 10L20 16L14 22L8 16Z" fill="#ff2d55" fillOpacity="0.85" />
                <path d="M14 16L20 10L26 16L20 22L14 16Z" fill="#ff758f" />
              </svg>
            ) : (
              <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
                <rect width="32" height="32" fill="#081e2e" stroke="rgba(2, 132, 199, 0.4)" strokeWidth="1" />
                <path d="M8 16L14 10L20 16L14 22L8 16Z" fill="#0284c7" fillOpacity="0.85" />
                <path d="M14 16L20 10L26 16L20 22L14 16Z" fill="#38bdf8" />
              </svg>
            )}
          </span>
          <div className="brand-text">
            <span className="brand-title">CodeMorph<span className="brand-accent">AI</span></span>
            <span className="brand-subtitle">Autonomous Code Transformation</span>
          </div>
        </Link>

        {/* Primary Desktop Navigation Bar (Decongested & Reactive) */}
        <nav className="desktop-nav" aria-label="Main navigation">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-pill${isActive ? " is-active" : ""}`}
                aria-current={isActive ? "page" : undefined}
                title={`${item.fullLabel} [Press ${item.hotkey}]`}
              >
                <span className="nav-icon" aria-hidden="true">{item.icon}</span>
                <span className="nav-label">{item.label}</span>
                <span className="nav-hotkey-hint" aria-hidden="true">{item.hotkey}</span>
              </Link>
            );
          })}
        </nav>

        {/* Right-Side Utilities Cluster */}
        <div className="header-utilities">
          {/* Reactive Isolated Sandbox Pill */}
          <div
            className="status-badge-compact"
            title="100% Zero Host Code Execution | Ephemeral Docker --network=none Sandbox"
          >
            <span className="status-ping" aria-hidden="true" />
            <span className="status-badge-text">SANDBOX</span>
          </div>

          {/* Keyboard Shortcuts HUD Trigger */}
          <button
            type="button"
            className="shortcuts-nav-btn"
            onClick={() => setShortcutsModalOpen(true)}
            title="Open Keyboard Navigation HUD [Press ?]"
            aria-label="Keyboard shortcuts HUD"
          >
            <span className="shortcuts-icon" aria-hidden="true">⌘</span>
            <span className="shortcuts-key">?</span>
          </button>

          {/* Theme Switcher Toggle */}
          <button
            type="button"
            className="theme-toggle-btn"
            onClick={toggleTheme}
            title={isDark ? "Switch to Light Mode [Press T]" : "Switch to Dark Mode [Press T]"}
            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
          >
            <span className="theme-toggle-icon" aria-hidden="true">
              {isDark ? (
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M13.5 9.5C12.8 9.8 12 10 11.2 10C7.8 10 5 7.2 5 3.8C5 3 5.2 2.2 5.5 1.5C2.8 2.3 0.8 4.8 0.8 7.8C0.8 11.4 3.8 14.4 7.4 14.4C10.4 14.4 12.8 12.4 13.5 9.5Z" />
                </svg>
              ) : (
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <circle cx="8" cy="8" r="3.2" />
                  <path d="M8 1.5V3M8 13V14.5M1.5 8H3M13 8H14.5M3.4 3.4L4.5 4.5M11.5 11.5L12.6 12.6M3.4 12.6L4.5 11.5M11.5 4.5L12.6 3.4" />
                </svg>
              )}
            </span>
            <span className="theme-toggle-text">
              {isDark ? "Dark" : "Light"}
            </span>
            <span className={`theme-toggle-indicator ${isDark ? "indicator-dark" : "indicator-light"}`} />
          </button>

          {/* Activity History Trigger */}
          <button
            type="button"
            className="history-nav-btn"
            onClick={() => setHistoryDrawerOpen(true)}
            title="View recent activity and inspection history [Press H]"
            aria-label="Open Activity History"
          >
            <span className="history-btn-icon" aria-hidden="true">
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="8" cy="8" r="6" />
                <path d="M8 4.5V8L10.5 10" />
              </svg>
            </span>
            <span className="history-btn-text">History</span>
            {historyCount > 0 && <span className="history-btn-badge">{historyCount}</span>}
          </button>

          {/* Mobile Menu Toggle Button */}
          <button
            className="mobile-menu-toggle"
            type="button"
            aria-expanded={mobileMenuOpen}
            aria-label="Toggle navigation menu"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            <span className="hamburger-bar" />
            <span className="hamburger-bar" />
            <span className="hamburger-bar" />
          </button>
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="mobile-nav-menu">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`mobile-nav-item${isActive ? " is-active" : ""}`}
                onClick={() => setMobileMenuOpen(false)}
                aria-current={isActive ? "page" : undefined}
              >
                <span className="nav-icon">{item.icon}</span>
                <span>{item.fullLabel}</span>
              </Link>
            );
          })}
          <div className="mobile-menu-divider" />
          <button
            type="button"
            className="mobile-nav-item mobile-theme-item"
            onClick={() => {
              toggleTheme();
              setMobileMenuOpen(false);
            }}
          >
            <span className="nav-icon">
              {isDark ? (
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M13.5 9.5C12.8 9.8 12 10 11.2 10C7.8 10 5 7.2 5 3.8C5 3 5.2 2.2 5.5 1.5C2.8 2.3 0.8 4.8 0.8 7.8C0.8 11.4 3.8 14.4 7.4 14.4C10.4 14.4 12.8 12.4 13.5 9.5Z" />
                </svg>
              ) : (
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <circle cx="8" cy="8" r="3.2" />
                  <path d="M8 1.5V3M8 13V14.5M1.5 8H3M13 8H14.5M3.4 3.4L4.5 4.5M11.5 11.5L12.6 12.6M3.4 12.6L4.5 11.5M11.5 4.5L12.6 3.4" />
                </svg>
              )}
            </span>
            <span>Switch to {isDark ? "Light Mode (Azure)" : "Dark Mode (Ruby)"}</span>
          </button>
          <button
            type="button"
            className="mobile-nav-item"
            onClick={() => {
              setShortcutsModalOpen(true);
              setMobileMenuOpen(false);
            }}
          >
            <span className="nav-icon">⌘</span>
            <span>Keyboard Shortcuts HUD</span>
          </button>
        </div>
      )}

      {/* Slide-out Activity History Drawer */}
      <HistoryDrawer
        isOpen={historyDrawerOpen}
        onClose={() => setHistoryDrawerOpen(false)}
      />

      {/* Developer Keyboard Shortcuts Modal */}
      <KeyboardShortcutsModal
        isOpen={shortcutsModalOpen}
        onClose={() => setShortcutsModalOpen(false)}
      />
    </header>
  );
}
