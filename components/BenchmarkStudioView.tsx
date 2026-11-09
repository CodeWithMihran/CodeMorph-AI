"use client";

import React, { useState } from "react";
import Link from "next/link";
import type {
  BenchmarkComparisonResult,
  RawProjectInput,
} from "@/lib/benchmark/benchmark-engine";
import { unpackStoredZip } from "@/lib/migration/zip";

const DEFAULT_PORTFOLIO_CANDIDATES: RawProjectInput[] = [
  {
    id: "proj_ecommerce_vite",
    name: "Enterprise E-Commerce (React 19 + Vite)",
    target: "nextjs",
    files: [
      {
        path: "package.json",
        content: JSON.stringify(
          {
            name: "ecommerce-spa",
            version: "1.0.0",
            dependencies: {
              react: "^19.0.0",
              "react-dom": "^19.0.0",
              "react-router-dom": "^7.0.0",
            },
            devDependencies: {
              vite: "^6.0.0",
              typescript: "^5.3.0",
            },
          },
          null,
          2
        ),
      },
      {
        path: "index.html",
        content: '<!DOCTYPE html><html><head><title>Shop</title></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>',
      },
      {
        path: "src/main.tsx",
        content: 'import React from "react";\nimport ReactDOM from "react-dom/client";\nimport App from "./App";\n\nReactDOM.createRoot(document.getElementById("root")!).render(<App />);',
      },
      {
        path: "src/App.tsx",
        content: 'import React from "react";\nimport { Header } from "./components/Header";\n\nexport default function App() {\n  return <div><Header /><h1>E-Commerce Storefront</h1></div>;\n}',
      },
      {
        path: "src/components/Header.tsx",
        content: 'import React from "react";\nexport function Header() { return <header><nav>Home | Products | Cart</nav></header>; }',
      },
      {
        path: "src/pages/Products.tsx",
        content: 'import React from "react";\nexport default function Products() { return <div><h2>Product Catalog</h2></div>; }',
      },
      {
        path: "src/pages/Cart.tsx",
        content: 'import React from "react";\nexport default function Cart() { return <div><h2>Shopping Cart</h2></div>; }',
      },
    ],
  },
  {
    id: "proj_marketing_portal",
    name: "Marketing Portal (Static Multi-Page HTML5)",
    target: "nextjs",
    files: [
      {
        path: "index.html",
        content: '<!DOCTYPE html><html><head><title>Marketing</title><link rel="stylesheet" href="style.css"></head><body><h1>Welcome to Marketing</h1><p>Our solutions.</p></body></html>',
      },
      {
        path: "about.html",
        content: '<!DOCTYPE html><html><head><title>About</title></head><body><h1>About Company</h1><p>Mission & Vision</p></body></html>',
      },
      {
        path: "pricing.html",
        content: '<!DOCTYPE html><html><head><title>Pricing</title></head><body><h1>Enterprise Pricing Plans</h1></body></html>',
      },
      {
        path: "style.css",
        content: "body { font-family: sans-serif; margin: 0; background: #0f172a; color: #fff; }",
      },
      {
        path: "app.js",
        content: 'console.log("Marketing site active");',
      },
    ],
  },
  {
    id: "proj_mobile_shell",
    name: "Field Operations Shell (React Native / Untyped)",
    target: "expo",
    files: [
      {
        path: "package.json",
        content: JSON.stringify(
          {
            name: "field-ops-mobile",
            version: "0.1.0",
            dependencies: {
              react: "18.2.0",
              "react-native": "0.72.6",
            },
          },
          null,
          2
        ),
      },
      {
        path: "App.js",
        content: 'import React from "react";\nimport { View, Text } from "react-native";\n\nexport default function App() {\n  return <View><Text>Field Operations</Text></View>;\n}',
      },
      {
        path: "screens/Dashboard.js",
        content: 'import React from "react";\nimport { View, Text } from "react-native";\nexport default function Dashboard() { return <View><Text>Dashboard</Text></View>; }',
      },
      {
        path: "screens/Inspection.js",
        content: 'import React from "react";\nimport { View, Text } from "react-native";\nexport default function Inspection() { return <View><Text>Inspection Details</Text></View>; }',
      },
    ],
  },
];

export function BenchmarkStudioView() {
  const [candidates, setCandidates] = useState<RawProjectInput[]>(DEFAULT_PORTFOLIO_CANDIDATES);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(DEFAULT_PORTFOLIO_CANDIDATES.map((c) => c.id))
  );
  const [targetOverrides, setTargetOverrides] = useState<Record<string, "nextjs" | "expo">>({});
  const [benchmarkResult, setBenchmarkResult] = useState<BenchmarkComparisonResult | null>(null);
  const [dossierMarkdown, setDossierMarkdown] = useState<string>("");
  const [isComputing, setIsComputing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Toggle candidate inclusion
  const toggleCandidate = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        if (next.size <= 2) {
          setError("At least 2 repositories must be selected for comparative benchmarking.");
          return prev;
        }
        next.delete(id);
      } else {
        if (next.size >= 4) {
          setError("A maximum of 4 repositories can be benchmarked simultaneously.");
          return prev;
        }
        next.add(id);
      }
      setError(null);
      return next;
    });
  };

  // Target toggle for a specific candidate
  const handleTargetChange = (id: string, target: "nextjs" | "expo") => {
    setTargetOverrides((prev) => ({ ...prev, [id]: target }));
  };

  // Upload custom ZIP as a new candidate slot
  const handleZipUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".zip")) {
      setError("Only valid .zip archives can be uploaded for benchmarking.");
      return;
    }

    try {
      const buffer = await file.arrayBuffer();
      const extracted = unpackStoredZip(buffer);
      if (extracted.length === 0) {
        setError("The uploaded ZIP archive contains no readable source files.");
        return;
      }

      const newId = `proj_upload_${Date.now()}`;
      const newCandidate: RawProjectInput = {
        id: newId,
        name: file.name.replace(/\.zip$/i, "") + " (Custom ZIP)",
        target: "nextjs",
        files: extracted,
      };

      setCandidates((prev) => [...prev, newCandidate]);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.size >= 4) {
          const first = Array.from(next)[0];
          next.delete(first);
        }
        next.add(newId);
        return next;
      });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to process uploaded ZIP archive.");
    }
  };

  // Run benchmark computation
  const handleRunBenchmark = async () => {
    setIsComputing(true);
    setError(null);

    try {
      const activeProjects = candidates
        .filter((c) => selectedIds.has(c.id))
        .map((c) => ({
          ...c,
          target: targetOverrides[c.id] ?? c.target ?? "nextjs",
        }));

      if (activeProjects.length < 2) {
        setError("Select at least 2 repositories to compare.");
        setIsComputing(false);
        return;
      }

      const res = await fetch("/api/benchmark/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projects: activeProjects }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "Benchmark analysis failed.");
      }

      const data = (await res.json()) as { result: BenchmarkComparisonResult; markdown: string };
      setBenchmarkResult(data.result);
      setDossierMarkdown(data.markdown);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Benchmark analysis failed.");
    } finally {
      setIsComputing(false);
    }
  };

  // Download Dossier Markdown
  const handleDownloadDossier = () => {
    if (!dossierMarkdown) return;
    const blob = new Blob([dossierMarkdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `codemorph-portfolio-benchmark-${new Date().toISOString().slice(0, 10)}.md`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // Export JSON
  const handleExportJson = () => {
    if (!benchmarkResult) return;
    const jsonStr = JSON.stringify(benchmarkResult, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `codemorph-benchmark-data-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="benchmark-studio-container">
      {/* Studio Header Banner */}
      <div className="benchmark-hero-banner">
        <div className="badge-pill">ENTERPRISE INTELLIGENCE STUDIO</div>
        <h1 className="hero-heading">Multi-Repository Comparative Benchmark Studio</h1>
        <p className="hero-subtext">
          Evaluate 2 to 4 repositories or ZIP archives side-by-side. Analyze feasibility scores, security posture, dependency friction, and automated migration ROI to establish an optimal migration sequence.
        </p>
      </div>

      {error && <div className="benchmark-alert-box error">{error}</div>}

      {/* Candidate Selection Section */}
      <div className="benchmark-section">
        <div className="section-header-row">
          <div>
            <h2 className="section-title">1. Configure Benchmark Portfolio Candidates</h2>
            <p className="section-subtext">
              Select 2 to 4 codebases to benchmark against Next.js 15 App Router or Expo Router targets.
            </p>
          </div>
          <div className="upload-wrapper">
            <label className="action-btn secondary upload-btn">
              <span>+ Upload ZIP Repository</span>
              <input
                type="file"
                accept=".zip"
                onChange={handleZipUpload}
                style={{ display: "none" }}
              />
            </label>
          </div>
        </div>

        <div className="benchmark-candidate-grid">
          {candidates.map((candidate) => {
            const isSelected = selectedIds.has(candidate.id);
            const currentTarget = targetOverrides[candidate.id] ?? candidate.target ?? "nextjs";

            return (
              <div
                key={candidate.id}
                className={`candidate-card ${isSelected ? "is-active" : ""}`}
                onClick={() => toggleCandidate(candidate.id)}
              >
                <div className="card-top-row">
                  <span className="checkbox-indicator">{isSelected ? "✔" : ""}</span>
                  <span className="file-count-badge">{candidate.files.length} files</span>
                </div>
                <h3 className="candidate-name">{candidate.name}</h3>
                <div className="target-select-row" onClick={(e) => e.stopPropagation()}>
                  <span className="target-lbl">Target:</span>
                  <button
                    type="button"
                    className={`target-pill ${currentTarget === "nextjs" ? "active" : ""}`}
                    onClick={() => handleTargetChange(candidate.id, "nextjs")}
                  >
                    Next.js
                  </button>
                  <button
                    type="button"
                    className={`target-pill ${currentTarget === "expo" ? "active" : ""}`}
                    onClick={() => handleTargetChange(candidate.id, "expo")}
                  >
                    Expo
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="benchmark-action-bar">
          <button
            type="button"
            className="action-btn primary large-btn"
            onClick={handleRunBenchmark}
            disabled={isComputing || selectedIds.size < 2}
          >
            {isComputing
              ? "Running Multi-Codebase Analysis..."
              : `Run Comparative Benchmark (${selectedIds.size} Codebases)`}
          </button>
        </div>
      </div>

      {/* Comparative Benchmark Results */}
      {benchmarkResult && (
        <div className="benchmark-results-wrapper">
          {/* Executive Totals Cards */}
          <div className="benchmark-totals-grid">
            <div className="total-stat-card">
              <span className="stat-label">PORTFOLIO PORTABILITY</span>
              <span className="stat-value">{benchmarkResult.portfolioTotals.averageFeasibility}%</span>
              <span className="stat-desc">Weighted average across {benchmarkResult.projectCount} codebases</span>
            </div>
            <div className="total-stat-card">
              <span className="stat-label">MANUAL REFACTORING HOURS</span>
              <span className="stat-value">~{benchmarkResult.portfolioTotals.totalManualHoursSaved} hrs</span>
              <span className="stat-desc">Estimated baseline manual engineering</span>
            </div>
            <div className="total-stat-card highlight">
              <span className="stat-label">PROJECTED ROI / SAVINGS</span>
              <span className="stat-value">${benchmarkResult.portfolioTotals.totalEstimatedSavingsDollars.toLocaleString()}</span>
              <span className="stat-desc">Autonomous modernization cost efficiency</span>
            </div>
            <div className="total-stat-card">
              <span className="stat-label">TOTAL SECURITY FINDINGS</span>
              <span className="stat-value">{benchmarkResult.portfolioTotals.totalSecurityFindings}</span>
              <span className="stat-desc">Aggregated CVE &amp; syntax warnings</span>
            </div>
          </div>

          {/* Side-by-Side Matrix Table */}
          <div className="benchmark-section">
            <div className="section-header-row">
              <h2 className="section-title">2. Side-by-Side Executive Comparative Matrix</h2>
              <div className="dossier-actions">
                <button
                  type="button"
                  className="action-btn secondary small"
                  onClick={handleDownloadDossier}
                >
                  Download Dossier (.md)
                </button>
                <button
                  type="button"
                  className="action-btn secondary small"
                  onClick={handleExportJson}
                >
                  Export JSON
                </button>
              </div>
            </div>

            <div className="matrix-table-container">
              <table className="matrix-table">
                <thead>
                  <tr>
                    <th>EVALUATION METRIC</th>
                    {benchmarkResult.projects.map((p) => (
                      <th key={p.id}>
                        <div className="th-project-title">{p.name}</div>
                        <span className="th-framework-badge">{p.framework}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="row-label">Portability Score &amp; Tier</td>
                    {benchmarkResult.projects.map((p) => (
                      <td key={p.id} className="bold-cell">
                        <span className={`score-badge ${p.feasibilityTier}`}>
                          {p.feasibilityScore}% ({p.feasibilityTier.toUpperCase()})
                        </span>
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="row-label">Route Portability</td>
                    {benchmarkResult.projects.map((p) => (
                      <td key={p.id}>{p.dimensions.routes}%</td>
                    ))}
                  </tr>
                  <tr>
                    <td className="row-label">Component Portability</td>
                    {benchmarkResult.projects.map((p) => (
                      <td key={p.id}>{p.dimensions.components}%</td>
                    ))}
                  </tr>
                  <tr>
                    <td className="row-label">Dependency Compatibility</td>
                    {benchmarkResult.projects.map((p) => (
                      <td key={p.id}>{p.dimensions.dependencies}%</td>
                    ))}
                  </tr>
                  <tr>
                    <td className="row-label">Structural Integrity</td>
                    {benchmarkResult.projects.map((p) => (
                      <td key={p.id}>{p.dimensions.structure}%</td>
                    ))}
                  </tr>
                  <tr>
                    <td className="row-label">Critical &amp; High Security CVEs</td>
                    {benchmarkResult.projects.map((p) => (
                      <td key={p.id}>
                        {p.findingsSummary.critical + p.findingsSummary.high > 0 ? (
                          <span className="warning-text">
                            {p.findingsSummary.critical} critical, {p.findingsSummary.high} high
                          </span>
                        ) : (
                          <span className="clean-text">✔ 0 CVEs</span>
                        )}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="row-label">Syntax Errors &amp; Undeclared Imports</td>
                    {benchmarkResult.projects.map((p) => (
                      <td key={p.id}>
                        {p.syntaxErrors + p.undeclaredPackages > 0 ? (
                          <span>{p.syntaxErrors} errors, {p.undeclaredPackages} undeclared</span>
                        ) : (
                          <span className="clean-text">✔ 0 Errors</span>
                        )}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="row-label">Manual Engineering Effort</td>
                    {benchmarkResult.projects.map((p) => (
                      <td key={p.id} className="bold-cell">~{p.estimatedManualHours} hours</td>
                    ))}
                  </tr>
                  <tr>
                    <td className="row-label">Autonomous Migration Time</td>
                    {benchmarkResult.projects.map((p) => (
                      <td key={p.id} className="accent-cell">~{p.estimatedAutonomousMinutes} mins</td>
                    ))}
                  </tr>
                  <tr>
                    <td className="row-label">Cost Savings (ROI)</td>
                    {benchmarkResult.projects.map((p) => (
                      <td key={p.id} className="accent-cell">${p.costSavingsDollars.toLocaleString()}</td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Recommended Migration Sequence Section */}
          <div className="benchmark-section">
            <h2 className="section-title">3. Recommended Migration Priority Roadmap</h2>
            <p className="section-subtext">
              Strategically phased sequence maximizing early wins and minimizing dependency friction.
            </p>

            <div className="sequence-cards-grid">
              {benchmarkResult.rankings.recommendedSequence.map((seq) => {
                const proj = benchmarkResult.projects.find((p) => p.id === seq.projectId);

                return (
                  <div key={seq.projectId} className="sequence-card">
                    <div className="sequence-header">
                      <span className={`priority-tag ${seq.priority}`}>{seq.priority}</span>
                      <h3 className="seq-project-title">{seq.projectName}</h3>
                      <span className="seq-score">Portability: {seq.feasibilityScore}%</span>
                    </div>
                    <p className="seq-rationale">{seq.rationale}</p>

                    {proj && proj.keyRisks.length > 0 && (
                      <div className="seq-risks-box">
                        <span className="risks-label">Pre-Flight Watchlist:</span>
                        <ul>
                          {proj.keyRisks.map((risk, idx) => (
                            <li key={idx}>⚠ {risk}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="seq-footer">
                      <Link
                        href={`/migrate`}
                        className="action-btn secondary small"
                      >
                        Open in Migration Studio →
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
