import type { FeasibilityReport } from "@/lib/analysis/feasibility";
import { DependencyMatrixView } from "@/components/DependencyMatrixView";

export function FeasibilityView({ feasibility }: { feasibility: FeasibilityReport }) {
  const tierColorClass =
    feasibility.tier === "high"
      ? "tier-high"
      : feasibility.tier === "moderate"
        ? "tier-moderate"
        : feasibility.tier === "low"
          ? "tier-low"
          : "tier-incompatible";

  const dimensions = [
    feasibility.dimensions.routes,
    feasibility.dimensions.components,
    feasibility.dimensions.dependencies,
    feasibility.dimensions.structure,
  ];

  const targetLabel = feasibility.target === "expo" ? "Expo Router (React Native Mobile)" : "Next.js App Router (Web)";

  return (
    <section className="feasibility-panel" aria-labelledby="feasibility-title">
      <div className="feasibility-header">
        <div>
          <p className="card-kicker">AUTOMATED FEASIBILITY &amp; MIGRATION HEALTH</p>
          <h4 id="feasibility-title">Target: {targetLabel}</h4>
        </div>
        <div className={`feasibility-badge ${tierColorClass}`}>
          <span className="feasibility-score-number">{feasibility.score}%</span>
          <span className="feasibility-tier-label">{feasibility.tier.toUpperCase()}</span>
        </div>
      </div>

      <p className="feasibility-summary">{feasibility.summary}</p>

      <div className="feasibility-dimensions">
        {dimensions.map((dim) => (
          <div className="dimension-item" key={dim.label}>
            <div className="dimension-top">
              <span className="dimension-label">{dim.label} <small>({Math.round(dim.weight * 100)}% weight)</small></span>
              <span className="dimension-score">{dim.score}%</span>
            </div>
            <div className="dimension-bar-track">
              <div
                className={`dimension-bar-fill ${dim.score >= 80 ? "fill-high" : dim.score >= 50 ? "fill-moderate" : "fill-low"}`}
                style={{ width: `${dim.score}%` }}
              />
            </div>
            <p className="dimension-detail">{dim.detail}</p>
          </div>
        ))}
      </div>

      {feasibility.breakdown.automatic.length > 0 && (
        <div className="feasibility-breakdown-section">
          <h5>✓ Automated Migration Factors</h5>
          <ul>
            {feasibility.breakdown.automatic.map((item, idx) => (
              <li key={idx}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {feasibility.breakdown.manual.length > 0 && (
        <div className="feasibility-breakdown-section">
          <h5>⚡ Manual Review &amp; Adaptation Items</h5>
          <ul>
            {feasibility.breakdown.manual.map((item, idx) => (
              <li key={idx}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {feasibility.breakdown.risks.length > 0 && (
        <div className="feasibility-breakdown-section is-risks">
          <h5>⚠ Architectural Incompatibilities &amp; Risks</h5>
          <ul>
            {feasibility.breakdown.risks.map((item, idx) => (
              <li key={idx}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {feasibility.dependencyAnalysis && (
        <div className="feasibility-dep-matrix-embed">
          <DependencyMatrixView
            analysis={feasibility.dependencyAnalysis}
            target={targetLabel}
          />
        </div>
      )}
    </section>
  );
}
