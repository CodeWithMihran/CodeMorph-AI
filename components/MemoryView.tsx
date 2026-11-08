"use client";

import { useEffect, useState } from "react";

type RuleMemorySnapshot = {
  rules: Array<{
    id: string;
    sourceFramework: string;
    target: string;
    trigger: string;
    resolution: string;
    verifiedRepairs: number;
    usageCount: number;
    passedUses: number;
    failedUses: number;
    notRunUses: number;
    lastVerifiedAt: string;
  }>;
  candidates: Array<{
    id: string;
    sourceFramework: string;
    target: string;
    trigger: string;
    errorSignature: string;
    resolution: string;
    verifiedRepairs: number;
    replay: { positiveCases: number; negativeCases: number };
  }>;
};

export function MemoryView() {
  const [snapshot, setSnapshot] = useState<RuleMemorySnapshot | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let isSubscribed = true;

    async function fetchRules() {
      try {
        const response = await fetch("/api/memory/rules", { cache: "no-store" });
        const data = (await response.json()) as RuleMemorySnapshot;
        if (isSubscribed && response.ok) {
          setSnapshot(data);
        }
      } catch {
        if (isSubscribed) {
          setError("Could not load local procedural memory.");
        }
      }
    }

    void fetchRules();

    const handleUpdate = () => {
      void fetchRules();
    };

    window.addEventListener("codemorph-memory-updated", handleUpdate);
    return () => {
      isSubscribed = false;
      window.removeEventListener("codemorph-memory-updated", handleUpdate);
    };
  }, []);

  async function review(id: string, action: "promote" | "reject") {
    setBusyId(id);
    setError("");
    try {
      const response = await fetch("/api/memory/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const data = (await response.json()) as RuleMemorySnapshot & { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Could not update that rule candidate.");
        return;
      }
      setSnapshot(data);
    } catch {
      setError("The rule review action could not be saved.");
    } finally {
      setBusyId(null);
    }
  }

  if (!snapshot) {
    return (
      <div className="memory-loading">
        <span className="spinner" aria-hidden="true" /> Loading procedural rule cache…
      </div>
    );
  }

  return (
    <div className="memory-view-container">
      <div className="memory-metrics-bar">
        <div className="mem-stat">
          <span className="mem-num">{snapshot.rules.length}</span>
          <span className="mem-label">Active Promoted Rules</span>
        </div>
        <div className="mem-stat">
          <span className="mem-num">{snapshot.candidates.length}</span>
          <span className="mem-label">Pending Review Candidates</span>
        </div>
        <div className="mem-stat">
          <span className="mem-num">
            {snapshot.rules.reduce((acc, r) => acc + r.usageCount, 0)}
          </span>
          <span className="mem-label">Total Rule Injections</span>
        </div>
      </div>

      {error && <p className="plan-error" role="alert">{error}</p>}

      <section className="memory-section">
        <div className="section-title-wrap">
          <h4>Candidate Rules (Awaiting Human Promotion)</h4>
          <span className="section-badge">{snapshot.candidates.length} pending</span>
        </div>
        <p className="section-desc">
          When an isolated Docker build fails and is successfully repaired by the AI, a rule candidate is generated. Every candidate must pass positive and negative replay tests before you can promote it.
        </p>

        {snapshot.candidates.length === 0 ? (
          <div className="memory-empty-state">
            <p>✓ No candidates currently pending review. Repaired build errors will appear here automatically.</p>
          </div>
        ) : (
          <div className="memory-card-list">
            {snapshot.candidates.map((candidate) => (
              <article className="memory-rule-card candidate-card" key={candidate.id}>
                <div className="rule-card-top">
                  <span className="rule-framework-tag">{candidate.sourceFramework}</span>
                  <span className="rule-target-tag">{candidate.target}</span>
                  <code className="rule-trigger-code">{candidate.trigger}</code>
                  <span className="rule-repairs-count">Verified Repair ×{candidate.verifiedRepairs}</span>
                </div>
                <div className="rule-error-block">
                  <strong>Triggered by Error:</strong>
                  <code>{candidate.errorSignature}</code>
                </div>
                <div className="rule-guidance-block">
                  <strong>Learned Guidance:</strong>
                  <p>{candidate.resolution}</p>
                </div>
                <div className="rule-replay-badge">
                  ✓ Replay Verified: {candidate.replay.positiveCases} positive, {candidate.replay.negativeCases} negative scoping checks passed.
                </div>
                <div className="rule-actions">
                  <button
                    type="button"
                    className="promote-btn"
                    disabled={busyId !== null}
                    onClick={() => void review(candidate.id, "promote")}
                  >
                    {busyId === candidate.id ? "Promoting…" : "Promote Rule to Active Prompt"}
                  </button>
                  <button
                    type="button"
                    className="reject-btn"
                    disabled={busyId !== null}
                    onClick={() => void review(candidate.id, "reject")}
                  >
                    Reject Candidate
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="memory-section">
        <div className="section-title-wrap">
          <h4>Active Rule Registry (Promoted &amp; Injected)</h4>
          <span className="section-badge active-badge">{snapshot.rules.length} active</span>
        </div>
        <p className="section-desc">
          Promoted rules are injected into model instructions whenever matching source triggers are discovered, preventing the generator from repeating previously corrected mistakes.
        </p>

        {snapshot.rules.length === 0 ? (
          <div className="memory-empty-state">
            <p>No active procedural rules promoted yet. Review and promote candidate rules above to activate them.</p>
          </div>
        ) : (
          <div className="memory-card-list">
            {snapshot.rules.map((rule) => (
              <article className="memory-rule-card active-card" key={rule.id}>
                <div className="rule-card-top">
                  <span className="rule-framework-tag">{rule.sourceFramework}</span>
                  <span className="rule-target-tag">{rule.target}</span>
                  <code className="rule-trigger-code">{rule.trigger}</code>
                  <span className="rule-repairs-count">{rule.verifiedRepairs} verified repair(s)</span>
                </div>
                <p className="active-rule-text">{rule.resolution}</p>
                <div className="rule-usage-metrics">
                  <span>Used <b>{rule.usageCount}</b> time(s)</span>
                  <span className="usage-sep">·</span>
                  <span className="pass-text"><b>{rule.passedUses}</b> passed</span>
                  <span className="usage-sep">·</span>
                  <span className="fail-text"><b>{rule.failedUses}</b> failed</span>
                  <span className="usage-sep">·</span>
                  <span><b>{rule.notRunUses}</b> unverified</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
