import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "StackShift — Move your website to a better stack",
  description:
    "Analyze a public website repository and plan a clear, verifiable migration to a modern application stack.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
