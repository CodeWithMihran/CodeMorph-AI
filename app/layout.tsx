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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
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
