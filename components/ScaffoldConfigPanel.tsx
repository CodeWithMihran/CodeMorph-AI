"use client";

import React from "react";
import type { ScaffoldConfig } from "@/lib/migration/scaffold";
import { DEFAULT_SCAFFOLD_CONFIG } from "@/lib/migration/scaffold";

interface ScaffoldConfigPanelProps {
  target: "nextjs" | "expo";
  config: ScaffoldConfig;
  onChange: (updated: ScaffoldConfig) => void;
  disabled?: boolean;
}

export function ScaffoldConfigPanel({
  target,
  config,
  onChange,
  disabled = false,
}: ScaffoldConfigPanelProps) {
  const isExpo = target === "expo";

  const handleUpdate = <K extends keyof ScaffoldConfig>(key: K, value: ScaffoldConfig[K]) => {
    onChange({
      ...config,
      [key]: value,
    });
  };

  const handleReset = () => {
    onChange({
      ...DEFAULT_SCAFFOLD_CONFIG,
      styling: isExpo ? "standard-css" : "tailwind",
    });
  };

  const currentStyling = config.styling ?? (isExpo ? "standard-css" : "tailwind");
  const isStrict = config.strictTypeScript !== false;
  const includeCi = config.includeCiWorkflow !== false;
  const includeContainer = config.includeDockerfile !== false;
  const includeTestSuite = config.includeTestSuite !== false;
  const renderingMode = config.renderingMode ?? "server-components";
  const pm = config.packageManager ?? "npm";

  // Compute live list of scaffolded files
  const scaffoldedFiles = [
    "package.json",
    isExpo ? "app.json" : "next.config.ts",
    "tsconfig.json",
    ".gitignore",
    isExpo ? "app/_layout.tsx" : "app/layout.tsx",
    "README.md",
  ];

  if (includeTestSuite) {
    if (isExpo) {
      scaffoldedFiles.push("jest.config.js", "jest.setup.js", "__tests__/navigation.test.tsx");
    } else {
      scaffoldedFiles.push("vitest.config.ts", "vitest.setup.ts", "__tests__/routes.test.tsx", "__tests__/layout.test.tsx");
    }
  }

  if (isExpo && currentStyling === "nativewind") {
    scaffoldedFiles.push("global.css");
  }

  if (includeCi) {
    scaffoldedFiles.push(".github/workflows/ci.yml");
  }

  if (includeContainer) {
    if (isExpo) {
      scaffoldedFiles.push("eas.json");
    } else {
      scaffoldedFiles.push("Dockerfile", ".dockerignore");
    }
  }

  return (
    <div className="scaffold-config-panel">
      <div className="scaffold-panel-header">
        <div className="scaffold-title-group">
          <div className="scaffold-badge">SCAFFOLD ARCHITECTURE</div>
          <h3 className="scaffold-heading">
            Target Project Configuration Customizer
          </h3>
          <p className="scaffold-subtext">
            Tailor the destination codebase architecture, compiler strictness, CI/CD automation, and deployment packaging before autonomous synthesis.
          </p>
        </div>
        <button
          type="button"
          className="scaffold-reset-btn"
          onClick={handleReset}
          disabled={disabled}
          title="Reset to recommended scaffold defaults"
        >
          Reset Defaults
        </button>
      </div>

      <div className="scaffold-grid">
        {/* Styling Strategy */}
        <div className="scaffold-card">
          <div className="scaffold-card-header">
            <span className="scaffold-icon">🎨</span>
            <span className="scaffold-label">STYLING ENGINE</span>
          </div>
          <p className="scaffold-card-desc">
            {isExpo
              ? "Select the styling paradigm for mobile UI components."
              : "Choose CSS framework integration and component styling strategy."}
          </p>
          <div className="scaffold-options-list">
            {!isExpo ? (
              <>
                <label className={`scaffold-radio-opt ${currentStyling === "tailwind" ? "is-selected" : ""}`}>
                  <input
                    type="radio"
                    name="styling"
                    value="tailwind"
                    checked={currentStyling === "tailwind"}
                    onChange={() => handleUpdate("styling", "tailwind")}
                    disabled={disabled}
                  />
                  <div className="opt-meta">
                    <span className="opt-title">Tailwind CSS v4 (Recommended)</span>
                    <span className="opt-detail">Zero-config utility classes with modern CSS variables.</span>
                  </div>
                </label>
                <label className={`scaffold-radio-opt ${currentStyling === "css-modules" ? "is-selected" : ""}`}>
                  <input
                    type="radio"
                    name="styling"
                    value="css-modules"
                    checked={currentStyling === "css-modules"}
                    onChange={() => handleUpdate("styling", "css-modules")}
                    disabled={disabled}
                  />
                  <div className="opt-meta">
                    <span className="opt-title">CSS Modules</span>
                    <span className="opt-detail">Locally scoped `.module.css` stylesheets per component.</span>
                  </div>
                </label>
                <label className={`scaffold-radio-opt ${currentStyling === "standard-css" ? "is-selected" : ""}`}>
                  <input
                    type="radio"
                    name="styling"
                    value="standard-css"
                    checked={currentStyling === "standard-css"}
                    onChange={() => handleUpdate("styling", "standard-css")}
                    disabled={disabled}
                  />
                  <div className="opt-meta">
                    <span className="opt-title">Standard Global CSS</span>
                    <span className="opt-detail">Traditional global styles via `app/globals.css`.</span>
                  </div>
                </label>
              </>
            ) : (
              <>
                <label className={`scaffold-radio-opt ${currentStyling === "standard-css" ? "is-selected" : ""}`}>
                  <input
                    type="radio"
                    name="styling-expo"
                    value="standard-css"
                    checked={currentStyling === "standard-css"}
                    onChange={() => handleUpdate("styling", "standard-css")}
                    disabled={disabled}
                  />
                  <div className="opt-meta">
                    <span className="opt-title">React Native StyleSheet (Recommended)</span>
                    <span className="opt-detail">Native `StyleSheet.create()` primitives for optimal mobile performance.</span>
                  </div>
                </label>
                <label className={`scaffold-radio-opt ${currentStyling === "nativewind" ? "is-selected" : ""}`}>
                  <input
                    type="radio"
                    name="styling-expo"
                    value="nativewind"
                    checked={currentStyling === "nativewind"}
                    onChange={() => handleUpdate("styling", "nativewind")}
                    disabled={disabled}
                  />
                  <div className="opt-meta">
                    <span className="opt-title">NativeWind v4 (Tailwind Mobile)</span>
                    <span className="opt-detail">Tailwind CSS utility className support on React Native components.</span>
                  </div>
                </label>
              </>
            )}
          </div>
        </div>

        {/* TypeScript Safety & Strictness */}
        <div className="scaffold-card">
          <div className="scaffold-card-header">
            <span className="scaffold-icon">🛡️</span>
            <span className="scaffold-label">TYPESCRIPT COMPILER MODE</span>
          </div>
          <p className="scaffold-card-desc">
            Define compiler strictness rules in `tsconfig.json`.
          </p>
          <div className="scaffold-options-list">
            <label className={`scaffold-radio-opt ${isStrict ? "is-selected" : ""}`}>
              <input
                type="radio"
                name="ts-strict"
                value="strict"
                checked={isStrict}
                onChange={() => handleUpdate("strictTypeScript", true)}
                disabled={disabled}
              />
              <div className="opt-meta">
                <span className="opt-title">Strict Mode (Recommended)</span>
                <span className="opt-detail">`strict: true`, strictNullChecks, and noImplicitAny enforced.</span>
              </div>
            </label>
            <label className={`scaffold-radio-opt ${!isStrict ? "is-selected" : ""}`}>
              <input
                type="radio"
                name="ts-strict"
                value="permissive"
                checked={!isStrict}
                onChange={() => handleUpdate("strictTypeScript", false)}
                disabled={disabled}
              />
              <div className="opt-meta">
                <span className="opt-title">Permissive / Lenient Mode</span>
                <span className="opt-detail">Eases progressive migration from untyped JavaScript codebases.</span>
              </div>
            </label>
          </div>
        </div>

        {/* Rendering Architecture (Next.js only) */}
        {!isExpo && (
          <div className="scaffold-card">
            <div className="scaffold-card-header">
              <span className="scaffold-icon">⚡</span>
              <span className="scaffold-label">RENDERING ARCHITECTURE</span>
            </div>
            <p className="scaffold-card-desc">
              Select default component execution model for App Router pages.
            </p>
            <div className="scaffold-options-list">
              <label className={`scaffold-radio-opt ${renderingMode === "server-components" ? "is-selected" : ""}`}>
                <input
                  type="radio"
                  name="renderingMode"
                  value="server-components"
                  checked={renderingMode === "server-components"}
                  onChange={() => handleUpdate("renderingMode", "server-components")}
                  disabled={disabled}
                />
                <div className="opt-meta">
                  <span className="opt-title">React Server Components (RSC - Default)</span>
                  <span className="opt-detail">Zero bundle overhead with streaming SSR server-rendered layouts.</span>
                </div>
              </label>
              <label className={`scaffold-radio-opt ${renderingMode === "client-components" ? "is-selected" : ""}`}>
                <input
                  type="radio"
                  name="renderingMode"
                  value="client-components"
                  checked={renderingMode === "client-components"}
                  onChange={() => handleUpdate("renderingMode", "client-components")}
                  disabled={disabled}
                />
                <div className="opt-meta">
                  <span className="opt-title">Client Components Preference</span>
                  <span className="opt-detail">Applies &apos;use client&apos; boundaries for rich browser SPA state migrations.</span>
                </div>
              </label>
            </div>
          </div>
        )}

        {/* Package Manager Selection */}
        <div className="scaffold-card">
          <div className="scaffold-card-header">
            <span className="scaffold-icon">📦</span>
            <span className="scaffold-label">PACKAGE MANAGER</span>
          </div>
          <p className="scaffold-card-desc">
            Preferred client package manager for CI workflows and local setup instructions.
          </p>
          <div className="pm-button-group">
            {(["npm", "pnpm", "yarn", "bun"] as const).map((m) => (
              <button
                key={m}
                type="button"
                className={`pm-btn ${pm === m ? "is-active" : ""}`}
                onClick={() => handleUpdate("packageManager", m)}
                disabled={disabled}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Toggles for CI/CD, Containerization, and Testing */}
      <div className="scaffold-toggles-row">
        <label className="scaffold-toggle-box">
          <input
            type="checkbox"
            checked={includeTestSuite}
            onChange={(e) => handleUpdate("includeTestSuite", e.target.checked)}
            disabled={disabled}
          />
          <div className="toggle-text">
            <strong>
              {isExpo
                ? "Automated Test Suite (Jest + React Native Smoke Tests)"
                : "Automated Test Suite (Vitest + React Testing Library)"}
            </strong>
            <span>
              {isExpo
                ? "Generates Jest runner, expo-router navigation mocks, and screen smoke test suites."
                : "Generates Vitest configuration, jsdom environment, route smoke tests (__tests__/routes.test.tsx), and layout hierarchy tests."}
            </span>
          </div>
        </label>

        <label className="scaffold-toggle-box">
          <input
            type="checkbox"
            checked={includeCi}
            onChange={(e) => handleUpdate("includeCiWorkflow", e.target.checked)}
            disabled={disabled}
          />
          <div className="toggle-text">
            <strong>Automated CI/CD Workflow (`.github/workflows/ci.yml`)</strong>
            <span>Generates GitHub Actions pipeline for linting, test execution, dependency caching, and build verification on push &amp; PR.</span>
          </div>
        </label>

        <label className="scaffold-toggle-box">
          <input
            type="checkbox"
            checked={includeContainer}
            onChange={(e) => handleUpdate("includeDockerfile", e.target.checked)}
            disabled={disabled}
          />
          <div className="toggle-text">
            <strong>
              {isExpo
                ? "EAS Mobile Build Profile (`eas.json`)"
                : "Production Container Setup (`Dockerfile` & `.dockerignore`)"}
            </strong>
            <span>
              {isExpo
                ? "Includes EAS Build profiles for internal development, staging, and production app store release."
                : "Multi-stage alpine container setup with non-root user and Next.js standalone optimization."}
            </span>
          </div>
        </label>
      </div>

      {/* Live Scaffold Manifest Summary */}
      <div className="scaffold-summary-bar">
        <div className="summary-lbl">
          <span>PLANNED SCAFFOLD FILES ({scaffoldedFiles.length})</span>
        </div>
        <div className="scaffold-tags-cloud">
          {scaffoldedFiles.map((file) => (
            <span key={file} className="scaffold-file-pill">
              <code>{file}</code>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
