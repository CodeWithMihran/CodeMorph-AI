"use client";

import { useState } from "react";
import { MemoryView } from "@/components/MemoryView";
import { ProceduralRuleStudioView } from "@/components/ProceduralRuleStudioView";
import Link from "next/link";

export default function MemoryPage() {
  const [activeTab, setActiveTab] = useState<"overview" | "studio">("overview");

  return (
    <div className="page-shell">
      <div className="page-intro">
        <p className="card-kicker">LOCAL PROCEDURAL RULE STORE · VERIFIED REPLAY GATE</p>
        <h1>Self-Learning AI Procedural Rules Hub</h1>
        <p className="intro-text">
          CodeMorph AI is designed to learn from its repair attempts without fine-tuning weights or sending unverified code to prompts. When an isolated Docker build fails and is successfully repaired by the AI, the pattern is saved as a rule candidate. Candidates must pass positive and negative replay tests before human promotion into future generation prompts.
        </p>

        {/* Tab Switcher */}
        <div className="memory-nav-tabs">
          <button
            type="button"
            className={`memory-tab-btn ${activeTab === "overview" ? "is-active" : ""}`}
            onClick={() => setActiveTab("overview")}
          >
            Learned Rules &amp; Replay Gate
          </button>
          <button
            type="button"
            className={`memory-tab-btn ${activeTab === "studio" ? "is-active" : ""}`}
            onClick={() => setActiveTab("studio")}
          >
            Rule Studio &amp; Testing Playground
          </button>
        </div>
      </div>

      <div className="card-workspace">
        {activeTab === "overview" ? (
          <>
            <div className="learning-loop-card">
              <h4>How the Self-Learning Loop Works</h4>
              <div className="loop-steps-grid">
                <div className="loop-step-item">
                  <span className="step-badge">1</span>
                  <h6>Isolated Build Failure</h6>
                  <p>Docker executes <code>next build</code> in a network-disabled sandbox. Diagnostics are bounded and redacted.</p>
                </div>
                <div className="loop-step-item">
                  <span className="step-badge">2</span>
                  <h6>Single AI Repair Call</h6>
                  <p>The model receives previous files and exact failure diagnostics to attempt a focused surgical repair.</p>
                </div>
                <div className="loop-step-item">
                  <span className="step-badge">3</span>
                  <h6>Deterministic Verification</h6>
                  <p>The repaired project is rebuilt and every required route is checked for HTTP 200 before creating candidates.</p>
                </div>
                <div className="loop-step-item">
                  <span className="step-badge">4</span>
                  <h6>Automated Replay Test</h6>
                  <p>Candidate rules must pass positive transform tests and 3 negative scoping checks to prevent prompt pollution.</p>
                </div>
                <div className="loop-step-item">
                  <span className="step-badge">5</span>
                  <h6>Human Promotion</h6>
                  <p>You review the error and proposed guidance, then promote it to active prompt memory with one click.</p>
                </div>
              </div>
            </div>

            <MemoryView />
          </>
        ) : (
          <ProceduralRuleStudioView />
        )}

        <div className="memory-back-link">
          <Link href="/migrate" className="footer-link">← Return to Migration Studio</Link>
        </div>
      </div>
    </div>
  );
}
