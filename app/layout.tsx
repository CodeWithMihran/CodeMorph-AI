import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CodeMorph AI — Autonomous Codebase Audit & Cross-Stack Transformation",
  description:
    "Analyze and audit entire codebases, detect security and runtime flaws, and plan verifiable cross-framework migrations.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
