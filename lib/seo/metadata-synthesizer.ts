/**
 * Automated SEO & OpenGraph Social Metadata Synthesizer Engine
 * Discovers migrated routes, infers semantic page titles and descriptions,
 * synthesizes Next.js App Router Metadata contracts (export const metadata: Metadata),
 * generates file-based metadata (app/sitemap.ts, app/robots.ts, app/manifest.ts),
 * and structures Schema.org JSON-LD snippets.
 * Pure TypeScript, client-safe with zero host execution.
 */

import type { ZipEntry } from "@/lib/migration/zip";

export interface RouteSeoProfile {
  route: string; // e.g. "/" or "/about" or "/dashboard"
  filePath: string; // e.g. "app/page.tsx" or "app/about/page.tsx"
  inferredTitle: string;
  inferredDescription: string;
  keywords: string[];
  ogType: "website" | "article";
  hasExistingMetadata: boolean;
  isClientComponent: boolean;
}

export interface GeneratedSeoFile {
  path: string;
  content: string;
  type: "route_metadata" | "sitemap" | "robots" | "manifest" | "json_ld";
  description: string;
  route?: string;
}

export interface SeoArchitectureSynthesis {
  overallSeoScore: number; // 0-100
  routesCount: number;
  routesWithMetadataCount: number;
  profiles: RouteSeoProfile[];
  generatedFiles: GeneratedSeoFile[];
  siteName: string;
  baseUrl: string;
}

export interface SeoOptions {
  siteName?: string;
  baseUrl?: string;
  defaultDescription?: string;
}

/**
 * Derives a human-friendly page title from route path and content
 */
export function inferTitleFromRoute(route: string, content: string): string {
  // 1. Try finding an <h1> heading
  const h1Match = content.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1Match) {
    const raw = h1Match[1].replace(/<[^>]+>/g, "").replace(/\{[^}]+\}/g, "").trim();
    if (raw && raw.length > 2 && raw.length < 70) {
      return raw;
    }
  }

  // 2. Try document.title or existing title tags
  const titleMatch = content.match(/<title>([^<]+)<\/title>/i);
  if (titleMatch) {
    return titleMatch[1].trim();
  }

  // 3. Fallback to clean route segment name
  if (route === "/" || route === "") {
    return "Home";
  }

  const segment = route.split("/").filter(Boolean).pop() || "Page";
  const formatted = segment
    .replace(/^\[|\/\]$/g, "")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return formatted;
}

/**
 * Derives an SEO description from route content
 */
export function inferDescriptionFromContent(content: string, route: string, siteName: string): string {
  // 1. Try finding a <p> paragraph tag
  const pMatch = content.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
  if (pMatch) {
    const raw = pMatch[1].replace(/<[^>]+>/g, "").replace(/\{[^}]+\}/g, "").trim();
    if (raw && raw.length > 20 && raw.length < 200) {
      return raw;
    }
  }

  // 2. Fallback to route-aware descriptive summary
  if (route === "/") {
    return `Welcome to ${siteName}. Experience fast, reliable, modern web applications built with Next.js App Router.`;
  }

  const title = inferTitleFromRoute(route, content);
  return `Explore ${title} on ${siteName}. Discover updated details, features, and resources optimized for high performance.`;
}

/**
 * Extracts SEO profiles for all page routes in the project
 */
export function extractRouteSeoProfiles(entries: ZipEntry[], siteName: string = "CodeMorph App"): RouteSeoProfile[] {
  const profiles: RouteSeoProfile[] = [];

  const routeEntries = entries.filter(
    (e) =>
      e.path.startsWith("app/") &&
      (e.path.endsWith("/page.tsx") ||
        e.path.endsWith("/page.jsx") ||
        e.path === "app/page.tsx" ||
        e.path === "app/page.jsx")
  );

  for (const entry of routeEntries) {
    let route = "/";
    if (entry.path !== "app/page.tsx" && entry.path !== "app/page.jsx") {
      route = "/" + entry.path.replace(/^app\//, "").replace(/\/page\.(tsx|jsx)$/, "");
    }

    const isClient = /^\s*["']use client["']/.test(entry.content);
    const hasMetadata = /export\s+(?:const\s+metadata|async\s+function\s+generateMetadata)/.test(entry.content);

    const title = inferTitleFromRoute(route, entry.content);
    const description = inferDescriptionFromContent(entry.content, route, siteName);

    // Inferred keywords
    const keywords = [
      siteName.toLowerCase(),
      title.toLowerCase(),
      route === "/" ? "homepage" : route.replace(/^\//, "").replace(/\//g, " "),
      "nextjs",
      "react",
    ];

    profiles.push({
      route,
      filePath: entry.path,
      inferredTitle: title,
      inferredDescription: description,
      keywords,
      ogType: route === "/" ? "website" : "article",
      hasExistingMetadata: hasMetadata,
      isClientComponent: isClient,
    });
  }

  // Sort: root "/" first, then alphabetically
  return profiles.sort((a, b) => {
    if (a.route === "/") return -1;
    if (b.route === "/") return 1;
    return a.route.localeCompare(b.route);
  });
}

/**
 * Generates typed Next.js App Router metadata code block
 */
export function generateRouteMetadataSnippet(
  profile: RouteSeoProfile,
  siteName: string = "CodeMorph App",
  baseUrl: string = "https://example.com"
): string {
  const fullTitle = profile.route === "/" ? `${siteName} — ${profile.inferredTitle}` : `${profile.inferredTitle} | ${siteName}`;
  const canonicalUrl = `${baseUrl.replace(/\/$/, "")}${profile.route === "/" ? "" : profile.route}`;

  return `export const metadata: Metadata = {
  title: "${fullTitle.replace(/"/g, '\\"')}",
  description: "${profile.inferredDescription.replace(/"/g, '\\"')}",
  keywords: ${JSON.stringify(profile.keywords)},
  alternates: {
    canonical: "${canonicalUrl}",
  },
  openGraph: {
    title: "${fullTitle.replace(/"/g, '\\"')}",
    description: "${profile.inferredDescription.replace(/"/g, '\\"')}",
    url: "${canonicalUrl}",
    siteName: "${siteName.replace(/"/g, '\\"')}",
    type: "${profile.ogType}",
  },
  twitter: {
    card: "summary_large_image",
    title: "${fullTitle.replace(/"/g, '\\"')}",
    description: "${profile.inferredDescription.replace(/"/g, '\\"')}",
  },
};`;
}

/**
 * Injects metadata into an existing page file content
 */
export function injectRouteMetadataIntoFile(
  content: string,
  profile: RouteSeoProfile,
  siteName: string = "CodeMorph App",
  baseUrl: string = "https://example.com"
): string {
  // If already has metadata, return untouched
  if (/export\s+(?:const\s+metadata|async\s+function\s+generateMetadata)/.test(content)) {
    return content;
  }

  const metadataSnippet = generateRouteMetadataSnippet(profile, siteName, baseUrl);

  // Next.js App Router rule: "use client" pages cannot export metadata directly.
  // If it's a client component, we comment that it should be wrapped in layout or server wrapper,
  // or prepend if server component.
  let updatedContent = content;

  if (profile.isClientComponent) {
    // Inject comment note + metadata for layout or refactored server wrapper
    const snippetWithNotice = `/**
 * NOTE: For Client Components ("use client"), Next.js expects metadata to be exported
 * from a parent layout.tsx or a Server Component wrapper.
 */
${metadataSnippet}\n\n`;

    // Put after directive
    updatedContent = updatedContent.replace(
      /^(\s*["']use client["'];?\r?\n)/,
      `$1import type { Metadata } from "next";\n\n${snippetWithNotice}`
    );
  } else {
    // Add import type { Metadata } from "next"; if missing
    if (!/from\s+["']next["']/.test(updatedContent) || !/Metadata/.test(updatedContent)) {
      updatedContent = `import type { Metadata } from "next";\n${updatedContent}`;
    }
    // Inject metadata before the default export
    const exportMatch = updatedContent.match(/(export\s+default\s+function|export\s+default\s+const)/);
    if (exportMatch && exportMatch.index !== undefined) {
      const idx = exportMatch.index;
      updatedContent = `${updatedContent.slice(0, idx)}${metadataSnippet}\n\n${updatedContent.slice(idx)}`;
    } else {
      updatedContent = `${updatedContent}\n\n${metadataSnippet}\n`;
    }
  }

  return updatedContent;
}

/**
 * Generates modern Next.js file-based app/sitemap.ts
 */
export function generateSitemapTs(profiles: RouteSeoProfile[], baseUrl: string = "https://example.com"): string {
  const cleanBase = baseUrl.replace(/\/$/, "");

  const sitemapEntries = profiles.map((p) => {
    const url = `${cleanBase}${p.route === "/" ? "" : p.route}`;
    const priority = p.route === "/" ? 1.0 : 0.8;
    const changeFreq = p.route === "/" ? "daily" : "weekly";

    return `    {
      url: "${url}",
      lastModified: new Date(),
      changeFrequency: "${changeFreq}",
      priority: ${priority},
    },`;
  });

  return `import type { MetadataRoute } from "next";

/**
 * Dynamic XML Sitemap generator for Next.js App Router
 * Automatically parsed by Google, Bing, and web crawlers
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
${sitemapEntries.join("\n")}
  ];
}
`;
}

/**
 * Generates modern Next.js file-based app/robots.ts
 */
export function generateRobotsTs(baseUrl: string = "https://example.com"): string {
  const cleanBase = baseUrl.replace(/\/$/, "");

  return `import type { MetadataRoute } from "next";

/**
 * Crawler Access Policy for Next.js App Router
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/private/"],
      },
    ],
    sitemap: "${cleanBase}/sitemap.xml",
  };
}
`;
}

/**
 * Generates modern Next.js file-based app/manifest.ts (PWA Web App Manifest)
 */
export function generateManifestTs(siteName: string = "CodeMorph App"): string {
  return `import type { MetadataRoute } from "next";

/**
 * Web Application Manifest for Next.js App Router PWA compliance
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "${siteName.replace(/"/g, '\\"')}",
    short_name: "${siteName.slice(0, 12).replace(/"/g, '\\"')}",
    description: "Modern high-performance web application modernized with CodeMorph AI",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0f172a",
    icons: [
      {
        src: "/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
`;
}

/**
 * Generates Schema.org JSON-LD structured data script snippet
 */
export function generateJsonLdSnippet(
  profile: RouteSeoProfile,
  siteName: string = "CodeMorph App",
  baseUrl: string = "https://example.com"
): string {
  const cleanBase = baseUrl.replace(/\/$/, "");
  const pageUrl = `${cleanBase}${profile.route === "/" ? "" : profile.route}`;

  const schema = {
    "@context": "https://schema.org",
    "@type": profile.route === "/" ? "WebSite" : "WebPage",
    name: profile.inferredTitle,
    description: profile.inferredDescription,
    url: pageUrl,
    publisher: {
      "@type": "Organization",
      name: siteName,
      url: cleanBase,
    },
  };

  return JSON.stringify(schema, null, 2);
}

/**
 * Synthesizes complete SEO architecture: route profiles, metadata files, sitemap, robots, manifest
 */
export function synthesizeSeoArchitecture(entries: ZipEntry[], options: SeoOptions = {}): SeoArchitectureSynthesis {
  const siteName = options.siteName || "CodeMorph App";
  const baseUrl = options.baseUrl || "https://example.com";

  const profiles = extractRouteSeoProfiles(entries, siteName);
  const generatedFiles: GeneratedSeoFile[] = [];

  // 1. Sitemap file
  generatedFiles.push({
    path: "app/sitemap.ts",
    content: generateSitemapTs(profiles, baseUrl),
    type: "sitemap",
    description: "Dynamic XML Sitemap for search engines",
  });

  // 2. Robots file
  generatedFiles.push({
    path: "app/robots.ts",
    content: generateRobotsTs(baseUrl),
    type: "robots",
    description: "Crawler access policy & sitemap pointer",
  });

  // 3. Manifest file
  generatedFiles.push({
    path: "app/manifest.ts",
    content: generateManifestTs(siteName),
    type: "manifest",
    description: "Web App Manifest for mobile installation & PWA compliance",
  });

  // 4. Route metadata files / updates
  for (const p of profiles) {
    const originalEntry = entries.find((e) => e.path === p.filePath);
    if (originalEntry) {
      const injectedContent = injectRouteMetadataIntoFile(originalEntry.content, p, siteName, baseUrl);
      generatedFiles.push({
        path: p.filePath,
        content: injectedContent,
        type: "route_metadata",
        description: `Injected export const metadata into ${p.route}`,
        route: p.route,
      });
    }
  }

  // Calculate SEO score
  const routesCount = profiles.length;
  const routesWithMetadataCount = profiles.filter((p) => p.hasExistingMetadata).length;
  let score = 50; // base score for SSR
  if (routesCount > 0) {
    score += Math.round((routesWithMetadataCount / routesCount) * 25);
  }
  if (entries.some((e) => e.path === "app/sitemap.ts")) score += 10;
  if (entries.some((e) => e.path === "app/robots.ts")) score += 10;
  if (entries.some((e) => e.path === "app/manifest.ts")) score += 5;
  const overallSeoScore = Math.min(100, Math.max(40, score));

  return {
    overallSeoScore,
    routesCount,
    routesWithMetadataCount,
    profiles,
    generatedFiles,
    siteName,
    baseUrl,
  };
}

/**
 * Injects synthesized SEO files into the project entries
 */
export function injectSeoArchitecture(
  projectEntries: ZipEntry[],
  selectedFiles: GeneratedSeoFile[]
): { updatedEntries: ZipEntry[]; injectedCount: number } {
  const entriesMap = new Map<string, ZipEntry>();
  for (const entry of projectEntries) {
    entriesMap.set(entry.path, entry);
  }

  let injectedCount = 0;
  for (const file of selectedFiles) {
    entriesMap.set(file.path, { path: file.path, content: file.content });
    injectedCount++;
  }

  return {
    updatedEntries: Array.from(entriesMap.values()),
    injectedCount,
  };
}
