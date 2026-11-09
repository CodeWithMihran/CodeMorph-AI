"use client";

import React, { useState, useMemo } from "react";
import type { ZipEntry } from "@/lib/migration/zip";
import { generateWebPreviewHtml, generateMobilePreviewHtml } from "@/lib/preview/simulator";

export interface SimulatedDevicePreviewProps {
  activeEntry: ZipEntry;
  allEntries: ZipEntry[];
  target: "nextjs" | "expo";
  onSelectRoute?: (path: string) => void;
}

type WebViewport = "desktop" | "tablet" | "mobile";

export function SimulatedDevicePreview({
  activeEntry,
  allEntries,
  target,
  onSelectRoute,
}: SimulatedDevicePreviewProps) {
  const isExpo = target === "expo";
  const [viewport, setViewport] = useState<WebViewport>("desktop");
  const [reloadKey, setReloadKey] = useState(0);

  // Discover all page/screen routes in the project
  const routeEntries = useMemo(() => {
    if (isExpo) {
      return allEntries.filter((e) =>
        /^app\/(?!_layout)[a-zA-Z0-9_./-]+\.tsx?$/.test(e.path)
      );
    }
    return allEntries.filter(
      (e) => e.path === "app/page.tsx" || /^app\/.+\/page\.tsx?$/.test(e.path)
    );
  }, [allEntries, isExpo]);

  // Derive route URL path for address bar
  const routeUrl = useMemo(() => {
    if (activeEntry.path === "app/page.tsx" || activeEntry.path === "app/index.tsx") {
      return "/";
    }
    return "/" + activeEntry.path
      .replace(/^app\//, "")
      .replace(/\/(?:page|index)\.tsx?$/, "")
      .replace(/\.tsx?$/, "");
  }, [activeEntry.path]);

  // Compute preview HTML document
  const previewHtml = useMemo(() => {
    if (isExpo) {
      return generateMobilePreviewHtml(activeEntry, allEntries);
    }
    return generateWebPreviewHtml(activeEntry, allEntries);
  }, [activeEntry, allEntries, isExpo]);

  return (
    <div className="simulated-preview-workspace">
      {/* Top Simulation Toolbar */}
      <div className="preview-top-toolbar">
        {/* Left: Route Switcher Pills */}
        <div className="preview-routes-switcher">
          <span className="switcher-lbl">SCREEN:</span>
          {routeEntries.slice(0, 5).map((route) => {
            const isActive = route.path === activeEntry.path;
            const label = route.path
              .replace(/^app\//, "")
              .replace(/\/(?:page|index)\.tsx?$/, "")
              .replace(/\.tsx?$/, "");
            return (
              <button
                key={route.path}
                type="button"
                className={`preview-route-pill ${isActive ? "active" : ""}`}
                onClick={() => onSelectRoute?.(route.path)}
              >
                {label || "index"}
              </button>
            );
          })}
        </div>

        {/* Right: Viewport Controls (Next.js only) */}
        {!isExpo && (
          <div className="viewport-button-group">
            <button
              type="button"
              className={`vp-btn ${viewport === "desktop" ? "active" : ""}`}
              onClick={() => setViewport("desktop")}
              title="Desktop 100% View"
            >
              🖥️ Desktop
            </button>
            <button
              type="button"
              className={`vp-btn ${viewport === "tablet" ? "active" : ""}`}
              onClick={() => setViewport("tablet")}
              title="Tablet 768px View"
            >
              📱 Tablet
            </button>
            <button
              type="button"
              className={`vp-btn ${viewport === "mobile" ? "active" : ""}`}
              onClick={() => setViewport("mobile")}
              title="Mobile 375px View"
            >
              📲 Mobile
            </button>
          </div>
        )}
      </div>

      {/* Main Device Stage Container */}
      <div className={`preview-stage-container ${isExpo ? "mobile-target" : ""}`}>
        {isExpo ? (
          /* =========================================================
             EXPO SMARTPHONE HARDWARE FRAME (IOS / ANDROID SIMULATOR)
             ========================================================= */
          <div className="smartphone-chassis">
            {/* Top Speaker / Dynamic Island */}
            <div className="smartphone-notch">
              <div className="dynamic-island"></div>
            </div>

            {/* Mobile Status Bar */}
            <div className="smartphone-status-bar">
              <span className="status-time">9:41</span>
              <div className="status-icons">
                <span className="status-cell">5G</span>
                <span className="status-wifi">📶</span>
                <span className="status-battery">🔋</span>
              </div>
            </div>

            {/* Native Screen Header Bar */}
            <div className="mobile-native-header">
              <span className="native-header-back">‹ Back</span>
              <span className="native-header-title">
                {activeEntry.path.replace(/^app\//, "").replace(/\.tsx?$/, "")}
              </span>
              <span className="native-header-action">Edit</span>
            </div>

            {/* Simulated Mobile Webview Screen */}
            <div className="smartphone-screen-area">
              <iframe
                key={reloadKey}
                title="Mobile Preview Screen"
                srcDoc={previewHtml}
                className="mobile-simulated-iframe"
                sandbox="allow-scripts"
              />
            </div>

            {/* Bottom Home Indicator Bar */}
            <div className="smartphone-home-bar">
              <div className="home-indicator-line"></div>
            </div>
          </div>
        ) : (
          /* =========================================================
             NEXT.JS BROWSER WINDOW SHELL SIMULATOR
             ========================================================= */
          <div className={`browser-window-shell ${viewport}`}>
            {/* Browser Header Bar */}
            <div className="browser-header-bar">
              <div className="window-dots">
                <span className="dot red"></span>
                <span className="dot yellow"></span>
                <span className="dot green"></span>
              </div>

              <div className="browser-nav-controls">
                <button type="button" className="nav-arrow" disabled>‹</button>
                <button type="button" className="nav-arrow" disabled>›</button>
                <button
                  type="button"
                  className="nav-arrow"
                  onClick={() => setReloadKey((k) => k + 1)}
                  title="Reload Preview Frame"
                >
                  ↻
                </button>
              </div>

              <div className="browser-address-bar">
                <span className="protocol-badge">http://</span>
                <span className="domain-text">localhost:3000</span>
                <span className="route-path-text">{routeUrl}</span>
              </div>

              <div className="browser-end-meta">
                <span className="server-status-dot"></span>
                <span>Next.js 15 SSR</span>
              </div>
            </div>

            {/* Browser Iframe Canvas */}
            <div className="browser-viewport-canvas">
              <iframe
                key={reloadKey}
                title="Next.js Web Preview Canvas"
                srcDoc={previewHtml}
                className="browser-simulated-iframe"
                sandbox="allow-scripts"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
