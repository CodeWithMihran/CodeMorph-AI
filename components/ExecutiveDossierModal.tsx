"use client";

import { useState, useEffect, useMemo } from "react";
import {
  generateExecutiveDossier,
  downloadDossierMarkdown,
  type DossierInput,
} from "@/lib/report/dossier-generator";

interface ExecutiveDossierModalProps {
  isOpen: boolean;
  onClose: () => void;
  input: DossierInput;
}

export function ExecutiveDossierModal({ isOpen, onClose, input }: ExecutiveDossierModalProps) {
  const [copied, setCopied] = useState(false);

  const markdown = useMemo(() => {
    if (!isOpen) return "";
    return generateExecutiveDossier(input);
  }, [isOpen, input]);

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

  const repoClean = (input.repository || "repository").replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase();
  const filename = `codemorph-dossier-${repoClean}.md`;

  const handleDownload = () => {
    downloadDossierMarkdown(filename, markdown);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="dossier-modal-overlay">
      <div className="dossier-modal-backdrop" onClick={onClose} aria-hidden="true" />

      <div
        className="dossier-modal-card animate-fadein"
        role="dialog"
        aria-modal="true"
        aria-label="Executive Engineering Dossier"
      >
        {/* Header */}
        <div className="dossier-modal-header">
          <div className="dossier-title-col">
            <div className="dossier-badge">EXECUTIVE DELIVERABLE</div>
            <h2 className="dossier-modal-title">Executive Engineering Dossier</h2>
            <p className="dossier-modal-sub">
              Publication-grade audit, security posture, feasibility scorecard, and route mapping dossier.
            </p>
          </div>

          <div className="dossier-actions-row">
            <button
              type="button"
              className="action-btn primary dossier-btn"
              onClick={handleDownload}
              title="Download as clean Markdown file"
            >
              Download .MD Report ➔
            </button>
            <button
              type="button"
              className="action-btn secondary dossier-btn"
              onClick={handlePrint}
              title="Print or Save as PDF"
            >
              🖨 Print / Save as PDF
            </button>
            <button
              type="button"
              className="action-btn secondary dossier-btn"
              onClick={handleCopy}
              title="Copy markdown content to clipboard"
            >
              {copied ? "✓ Copied" : "Copy Markdown"}
            </button>
            <button
              type="button"
              className="dossier-close-btn"
              onClick={onClose}
              aria-label="Close modal"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Viewport: Formatted Document Preview */}
        <div className="dossier-viewport" id="printable-dossier-area">
          <pre className="dossier-markdown-view">
            <code>{markdown}</code>
          </pre>
        </div>
      </div>
    </div>
  );
}
