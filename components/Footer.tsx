"use client";

import Link from "next/link";
import { useState } from "react";
import { KeyboardShortcutsModal } from "@/components/KeyboardShortcutsModal";

export function Footer() {
  const [shortcutsModalOpen, setShortcutsModalOpen] = useState(false);

  return (
    <footer className="site-footer">
      {/* Top Telemetry Live Status Strip */}
      <div className="footer-telemetry-strip">
        <div className="footer-telemetry-inner">
          <div className="telemetry-pill live">
            <span className="telemetry-dot" aria-hidden="true" />
            <span className="telemetry-text">ENGINE: <strong>ONLINE</strong></span>
          </div>
          <div className="telemetry-divider" aria-hidden="true">/</div>
          <div className="telemetry-pill">
            <span className="telemetry-label">ISOLATION:</span>
            <span className="telemetry-text">DOCKER NETWORK=NONE</span>
          </div>
          <div className="telemetry-divider" aria-hidden="true">/</div>
          <div className="telemetry-pill">
            <span className="telemetry-label">AUTOMATED VERIFICATION:</span>
            <span className="telemetry-text">67/67 PASSING</span>
          </div>
          <div className="telemetry-divider" aria-hidden="true">/</div>
          <div className="telemetry-pill">
            <span className="telemetry-label">MIGRATION CONTRACTS:</span>
            <span className="telemetry-text">39/39 VALIDATED</span>
          </div>
          <div className="telemetry-divider" aria-hidden="true">/</div>
          <div className="telemetry-pill">
            <span className="telemetry-label">ENVIRONMENT:</span>
            <span className="telemetry-text">READ-ONLY AST PARSING</span>
          </div>
        </div>
      </div>

      {/* Main 4-Column Engineering Content */}
      <div className="footer-main-grid">
        {/* Column 1: Brand & Mission */}
        <div className="footer-col brand-col">
          <div className="footer-brand-title">
            <span className="footer-brand-logo" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 32 32" fill="none">
                <rect width="32" height="32" fill="currentColor" fillOpacity="0.12" stroke="currentColor" strokeWidth="1.5" />
                <path d="M8 16L14 10L20 16L14 22L8 16Z" fill="currentColor" fillOpacity="0.8" />
                <path d="M14 16L20 10L26 16L20 22L14 16Z" fill="currentColor" />
              </svg>
            </span>
            <span className="footer-brand-name">CodeMorph<span className="brand-accent">AI</span></span>
          </div>
          <p className="footer-brand-desc">
            Autonomous codebase audit and verifiable cross-framework migration platform engineered for zero host execution, deterministic AST codemods, and mission-critical software safety.
          </p>
          <div className="footer-badges-cluster">
            <span className="footer-micro-badge">ZERO HOST EXECUTION</span>
            <span className="footer-micro-badge">DOCKER NETWORK=NONE</span>
            <span className="footer-micro-badge">AST CODE MODS</span>
          </div>
        </div>

        {/* Column 2: Core Studios */}
        <div className="footer-col">
          <h4 className="footer-col-title">CORE STUDIOS</h4>
          <ul className="footer-links-list">
            <li>
              <Link href="/" className="footer-nav-link">
                <span>System Overview</span>
                <span className="footer-hotkey-badge">1</span>
              </Link>
            </li>
            <li>
              <Link href="/audit" className="footer-nav-link">
                <span>Codebase Audit &amp; Security</span>
                <span className="footer-hotkey-badge">2</span>
              </Link>
            </li>
            <li>
              <Link href="/feasibility" className="footer-nav-link">
                <span>Feasibility &amp; Portability</span>
                <span className="footer-hotkey-badge">3</span>
              </Link>
            </li>
            <li>
              <Link href="/benchmark" className="footer-nav-link">
                <span>Portfolio Benchmark Matrix</span>
                <span className="footer-hotkey-badge">4</span>
              </Link>
            </li>
            <li>
              <Link href="/migrate" className="footer-nav-link">
                <span>Stack Migration Studio</span>
                <span className="footer-hotkey-badge">5</span>
              </Link>
            </li>
            <li>
              <Link href="/memory" className="footer-nav-link">
                <span>Self-Learning Procedural Rules</span>
                <span className="footer-hotkey-badge">6</span>
              </Link>
            </li>
          </ul>
        </div>

        {/* Column 3: Security & Isolation Guarantees */}
        <div className="footer-col">
          <h4 className="footer-col-title">SECURITY &amp; COMPLIANCE</h4>
          <ul className="footer-links-list">
            <li className="footer-text-item">
              <span className="footer-bullet-dot" />
              <span>100% Zero Host Code Execution</span>
            </li>
            <li className="footer-text-item">
              <span className="footer-bullet-dot" />
              <span>Ephemeral Docker Sandboxes (<code>--network=none</code>)</span>
            </li>
            <li className="footer-text-item">
              <span className="footer-bullet-dot" />
              <span>Google OSV Vulnerability Database Feeds</span>
            </li>
            <li className="footer-text-item">
              <span className="footer-bullet-dot" />
              <span>18+ Sensitive Credential Pattern Redactor</span>
            </li>
            <li className="footer-text-item">
              <span className="footer-bullet-dot" />
              <span>AST Route Contract Preservation</span>
            </li>
            <li className="footer-text-item">
              <span className="footer-bullet-dot" />
              <span>Deterministic Gate Evaluation Engine</span>
            </li>
          </ul>
        </div>

        {/* Column 4: Platform Intelligence & Tools */}
        <div className="footer-col">
          <h4 className="footer-col-title">WORKBENCHES &amp; TOOLS</h4>
          <ul className="footer-links-list">
            <li>
              <Link href="/audit" className="footer-nav-link">
                <span>Executive Dossier Generator</span>
              </Link>
            </li>
            <li>
              <Link href="/migrate" className="footer-nav-link">
                <span>Git Patch &amp; PR Export Integrator</span>
              </Link>
            </li>
            <li>
              <Link href="/benchmark" className="footer-nav-link">
                <span>Multi-Repo Comparative Roadmap</span>
              </Link>
            </li>
            <li>
              <button
                type="button"
                className="footer-nav-link button-link"
                onClick={() => setShortcutsModalOpen(true)}
              >
                <span>Keyboard Navigation HUD</span>
                <span className="footer-hotkey-badge">?</span>
              </button>
            </li>
            <li>
              <a
                href="https://github.com/CodeWithMihran/CodeMorph-AI"
                target="_blank"
                rel="noopener noreferrer"
                className="footer-nav-link external"
              >
                <span>GitHub Repository</span>
                <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 12L12 4M12 4H6M12 4V10" />
                </svg>
              </a>
            </li>
          </ul>
        </div>
      </div>

      {/* Bottom Legal, Version, and Keyboard Shortcuts Bar */}
      <div className="footer-bottom-bar">
        <div className="footer-bottom-inner">
          <div className="footer-copyright">
            <span>© 2026 CodeMorph AI. All rights reserved.</span>
            <span className="footer-sep">·</span>
            <span className="footer-meta">Engine v0.1.0-STABLE</span>
            <span className="footer-sep">·</span>
            <span className="footer-meta">Next.js 16.4 App Router Architecture</span>
          </div>

          <div className="footer-actions">
            <button
              type="button"
              className="footer-kbd-btn"
              onClick={() => setShortcutsModalOpen(true)}
              title="Open Keyboard Navigation HUD [Press ?]"
            >
              <kbd className="footer-kbd">?</kbd>
              <span>Keyboard Navigation HUD</span>
            </button>
          </div>
        </div>
      </div>

      <KeyboardShortcutsModal
        isOpen={shortcutsModalOpen}
        onClose={() => setShortcutsModalOpen(false)}
      />
    </footer>
  );
}
