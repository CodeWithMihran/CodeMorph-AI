import type { Metadata } from "next";
import "./globals.css";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { ThemeProvider } from "@/components/ThemeProvider";
import { GlowingTilesBackground } from "@/components/GlowingTilesBackground";

export const metadata: Metadata = {
  title: "CodeMorph AI — Autonomous Codebase Audit & Cross-Stack Transformation",
  description:
    "Analyze and audit entire codebases, detect security and runtime flaws, and plan verifiable cross-framework migrations.",
};

const themeInitScript = `
  (function() {
    try {
      var saved = localStorage.getItem('codemorph-theme');
      var theme = (saved === 'light' || saved === 'dark') ? saved : 'dark';
      document.documentElement.setAttribute('data-theme', theme);
      document.documentElement.classList.add(theme);
    } catch (e) {}
  })();
`;

const sharpEdgesStyle = `
  *, *::before, *::after {
    border-radius: 0px !important;
    -webkit-border-radius: 0px !important;
    -moz-border-radius: 0px !important;
  }
  html, body, div, span, applet, object, iframe,
  h1, h2, h3, h4, h5, h6, p, blockquote, pre,
  a, abbr, acronym, address, big, cite, code,
  del, dfn, em, img, ins, kbd, q, s, samp,
  small, strike, strong, sub, sup, tt, var,
  b, u, i, center,
  dl, dt, dd, ol, ul, li,
  fieldset, form, label, legend,
  table, caption, tbody, tfoot, thead, tr, th, td,
  article, aside, canvas, details, embed,
  figure, figcaption, footer, header, hgroup,
  menu, nav, output, ruby, section, summary,
  time, mark, audio, video, button, input, select, textarea,
  .nav-pill, .theme-toggle-btn, .history-nav-btn, .status-indicator,
  .header-status, .dispatch-card, .card-workspace, .arch-card, .migration-card,
  .tech-tag, .kicker-pill, .step-badge, .badge, .modal-content,
  .drawer-panel, .drawer-tab, .history-card, .action-btn, .theme-toggle-indicator,
  .status-dot, .brand-logo, .status-badge-compact, .shortcuts-nav-btn,
  .shortcuts-modal-panel, .shortcut-kbd, .telemetry-dot, .footer-kbd-btn,
  .workbench-scope-info, .preset-btn {
    border-radius: 0px !important;
    -webkit-border-radius: 0px !important;
    -moz-border-radius: 0px !important;
  }
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <style dangerouslySetInnerHTML={{ __html: sharpEdgesStyle }} />
      </head>
      <body>
        <ThemeProvider>
          <GlowingTilesBackground />
          <Navbar />
          {children}
          <Footer />
        </ThemeProvider>
      </body>
    </html>
  );
}
