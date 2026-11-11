"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { HistoryDrawer } from "@/components/HistoryDrawer";
import { getHistory } from "@/lib/storage/history-store";
import { useTheme } from "@/components/ThemeProvider";

export function Navbar() {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [historyDrawerOpen, setHistoryDrawerOpen] = useState(false);
  const [historyCount, setHistoryCount] = useState(() => getHistory().length);

  useEffect(() => {
    const updateCount = () => {
      setHistoryCount(getHistory().length);
    };
    window.addEventListener("codemorph-history-updated", updateCount);
    return () => window.removeEventListener("codemorph-history-updated", updateCount);
  }, []);

  const navItems = [
    {
      label: "Dashboard",
      href: "/",
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
      label: "Code Audit",
      href: "/audit",
      icon: (
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M8 1.5L2.5 4v4.5c0 3.5 2.5 6 5.5 6.5 3-.5 5.5-3 5.5-6.5V4L8 1.5z" />
          <path d="M6 8l1.5 1.5L10.5 6" />
        </svg>
      ),
    },
    {
      label: "Feasibility Score",
      href: "/feasibility",
      icon: (
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="8" cy="8" r="6" />
          <path d="M8 5v3.5l2.5 1.5" />
        </svg>
      ),
    },
    {
      label: "Portfolio Benchmark",
      href: "/benchmark",
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
      label: "Stack Migration",
      href: "/migrate",
      icon: (
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M2.5 5h9M8.5 2l3 3-3 3" />
          <path d="M13.5 11h-9M7.5 8l-3 3 3 3" />
        </svg>
      ),
    },
    {
      label: "Self-Learning Rules",
      href: "/memory",
      icon: (
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="3.5" y="3.5" width="9" height="9" />
          <path d="M6 1.5V3.5M10 1.5V3.5M6 12.5V14.5M10 12.5V14.5M1.5 6H3.5M1.5 10H3.5M12.5 6H14.5M12.5 10H14.5" />
        </svg>
      ),
    },
  ];

  const isDark = theme === "dark";

  return (
    <header className="site-header">
      <div className="header-inner">
        <Link href="/" className="brand-link" aria-label="CodeMorph AI Home">
          <span className="brand-logo" aria-hidden="true" style={{ width: 32, height: 32, display: "inline-flex", flexShrink: 0 }}>
            {isDark ? (
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none" style={{ width: 32, height: 32, display: "block" }}>
                <rect width="32" height="32" fill="#240c12" stroke="rgba(255, 45, 75, 0.3)" strokeWidth="1" />
                <path d="M8 16L14 10L20 16L14 22L8 16Z" fill="#ff2d55" fillOpacity="0.85" />
                <path d="M14 16L20 10L26 16L20 22L14 16Z" fill="#ff758f" />
              </svg>
            ) : (
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none" style={{ width: 32, height: 32, display: "block" }}>
                <rect width="32" height="32" fill="#0c2538" stroke="rgba(2, 132, 199, 0.3)" strokeWidth="1" />
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

        <nav className="desktop-nav" aria-label="Main navigation">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-pill${isActive ? " is-active" : ""}`}
                aria-current={isActive ? "page" : undefined}
              >
                <span className="nav-icon" aria-hidden="true">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="header-status">
          <span className="status-dot" aria-hidden="true" />
          <span className="status-label">Isolated Sandbox Active</span>
        </div>

        {/* Theme Switcher Toggle */}
        <button
          type="button"
          className="theme-toggle-btn"
          onClick={toggleTheme}
          title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
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

        <button
          type="button"
          className="history-nav-btn"
          onClick={() => setHistoryDrawerOpen(true)}
          title="View recent inspections and migration history"
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
                <span>{item.label}</span>
              </Link>
            );
          })}
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
            <span>Switch to {isDark ? "Light Mode" : "Dark Mode"}</span>
          </button>
        </div>
      )}

      <HistoryDrawer
        isOpen={historyDrawerOpen}
        onClose={() => setHistoryDrawerOpen(false)}
      />
    </header>
  );
}
