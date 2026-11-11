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
    { label: "Dashboard", href: "/", icon: "▦" },
    { label: "Code Audit", href: "/audit", icon: "🛡" },
    { label: "Feasibility Score", href: "/feasibility", icon: "⚡" },
    { label: "Portfolio Benchmark", href: "/benchmark", icon: "📊" },
    { label: "Stack Migration", href: "/migrate", icon: "⇄" },
    { label: "Self-Learning Rules", href: "/memory", icon: "🧠" },
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
          <span className="status-indicator" aria-hidden="true" />
          <span className="status-label">Isolated Sandbox Active</span>
        </div>

        {/* Theme Switcher Toggle */}
        <button
          type="button"
          className="theme-toggle-btn"
          onClick={toggleTheme}
          title={isDark ? "Switch to Light Mode (Cyan/Blue glow)" : "Switch to Dark Mode (Crimson/Red glow)"}
          aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
        >
          <span className="theme-toggle-icon" aria-hidden="true">
            {isDark ? "🌙" : "☀️"}
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
          <span className="history-btn-icon" aria-hidden="true">🕒</span>
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
            <span className="nav-icon">{isDark ? "🌙" : "☀️"}</span>
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
