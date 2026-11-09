import type { ZipEntry } from "@/lib/migration/zip";

export interface RouteChunkInfo {
  route: string;
  type: "static" | "dynamic" | "middleware";
  sourcePath: string;
  sizeBytes: number;
  firstLoadJsBytes: number;
  isClientComponent: boolean;
  issues: string[];
}

export interface BuildDiagnostic {
  severity: "error" | "warning" | "info";
  filePath: string;
  message: string;
  line?: number;
  codeSnippet?: string;
}

export interface SimulatedBuildResult {
  success: boolean;
  target: "nextjs" | "expo";
  durationMs: number;
  routes: RouteChunkInfo[];
  diagnostics: BuildDiagnostic[];
  totalBundleSizeBytes: number;
  estimatedGzipBytes: number;
  terminalLogs: string[];
}

export interface SimulatedExpoResult {
  success: boolean;
  port: number;
  metroUrl: string;
  registeredScreens: string[];
  moduleCount: number;
  asciiQrCode: string;
  diagnostics: BuildDiagnostic[];
  terminalLogs: string[];
}

/**
 * Checks whether file content uses browser-only hooks or event handlers without a "use client" directive.
 */
export function checkClientDirectives(filePath: string, content: string): BuildDiagnostic[] {
  const diagnostics: BuildDiagnostic[] = [];
  const isClient = /^\s*["']use client["']/m.test(content);

  // Only check React component files in App Router
  if (!filePath.endsWith(".tsx") && !filePath.endsWith(".jsx")) {
    return diagnostics;
  }

  const clientHooks = [
    "useState",
    "useEffect",
    "useRef",
    "useCallback",
    "useMemo",
    "useContext",
    "useReducer",
    "useLayoutEffect",
  ];

  const clientEvents = [
    "onClick",
    "onChange",
    "onSubmit",
    "onKeyDown",
    "onKeyUp",
    "onMouseEnter",
    "onMouseLeave",
  ];

  if (!isClient) {
    for (const hook of clientHooks) {
      const hookRegex = new RegExp(`\\b${hook}\\s*\\(`, "m");
      if (hookRegex.test(content)) {
        diagnostics.push({
          severity: "warning",
          filePath,
          message: `Hook '${hook}' used in Server Component. Add '"use client"' at the top of the file to enable client state/lifecycle.`,
          codeSnippet: `import { ${hook} } from "react";`,
        });
        break; // Report once per file for brevity
      }
    }

    for (const event of clientEvents) {
      const eventRegex = new RegExp(`\\b${event}=`, "m");
      if (eventRegex.test(content)) {
        diagnostics.push({
          severity: "warning",
          filePath,
          message: `Interactive event handler '${event}' used in Server Component. Add '"use client"' at the top of the file to attach event listeners.`,
          codeSnippet: `<button ${event}={...}>`,
        });
        break;
      }
    }
  }

  return diagnostics;
}

/**
 * Checks for unresolved relative imports across all provided project entries.
 */
export function checkUnresolvedRelativeImports(
  activeEntry: ZipEntry,
  allEntries: ZipEntry[]
): BuildDiagnostic[] {
  const diagnostics: BuildDiagnostic[] = [];
  const allPaths = new Set(allEntries.map((e) => e.path));

  // Match relative import statements: import ... from "./..." or from "../..."
  const importRegex = /(?:import|export)\s+(?:[\w*\s{},]+from\s+)?["'](\.[^"']+)["']/g;
  let match: RegExpExecArray | null;

  while ((match = importRegex.exec(activeEntry.content)) !== null) {
    const importPath = match[1];
    const currentDir = activeEntry.path.includes("/")
      ? activeEntry.path.substring(0, activeEntry.path.lastIndexOf("/"))
      : "";

    // Resolve relative path roughly
    const parts = currentDir ? currentDir.split("/") : [];
    const relParts = importPath.split("/");

    for (const p of relParts) {
      if (p === ".") continue;
      if (p === "..") {
        if (parts.length > 0) parts.pop();
      } else {
        parts.push(p);
      }
    }

    const resolvedBase = parts.join("/");
    const possiblePaths = [
      resolvedBase,
      `${resolvedBase}.ts`,
      `${resolvedBase}.tsx`,
      `${resolvedBase}.js`,
      `${resolvedBase}.jsx`,
      `${resolvedBase}/index.ts`,
      `${resolvedBase}/index.tsx`,
      `${resolvedBase}/index.js`,
      `${resolvedBase}/index.jsx`,
      `${resolvedBase}.css`,
    ];

    const found = possiblePaths.some((p) => allPaths.has(p));
    if (!found && !importPath.endsWith(".css")) {
      diagnostics.push({
        severity: "warning",
        filePath: activeEntry.path,
        message: `Cannot resolve relative import '${importPath}'. Target module does not exist in project bundle.`,
        codeSnippet: match[0],
      });
    }
  }

  return diagnostics;
}

/**
 * Simulates a Next.js App Router production build (`next build`).
 */
export function simulateNextBuild(entries: ZipEntry[]): SimulatedBuildResult {
  const routes: RouteChunkInfo[] = [];
  const diagnostics: BuildDiagnostic[] = [];
  const logs: string[] = [];

  const startTime = Date.now();
  logs.push("▲ Next.js 15.1.0 (turbopack simulation)");
  logs.push("  Creating an optimized production build ...");
  logs.push("✓ Compiled successfully in 1.4s");
  logs.push("  Collecting page data using workers ...");

  // Scan App Router routes
  for (const entry of entries) {
    // Check client directives
    const dirDiags = checkClientDirectives(entry.path, entry.content);
    diagnostics.push(...dirDiags);

    // Check imports
    const impDiags = checkUnresolvedRelativeImports(entry, entries);
    diagnostics.push(...impDiags);

    // Identify routes
    if (entry.path.startsWith("app/")) {
      let routePath = "";
      let type: "static" | "dynamic" | "middleware" = "static";

      if (entry.path === "app/page.tsx" || entry.path === "app/page.jsx" || entry.path === "app/page.js") {
        routePath = "/";
      } else if (entry.path.endsWith("/page.tsx") || entry.path.endsWith("/page.jsx") || entry.path.endsWith("/page.js")) {
        const seg = entry.path.replace(/^app\//, "").replace(/\/page\.[a-z]+$/, "");
        routePath = `/${seg}`;
        if (seg.includes("[") && seg.includes("]")) {
          type = "dynamic";
        }
      } else if (entry.path.endsWith("/route.ts") || entry.path.endsWith("/route.js")) {
        const seg = entry.path.replace(/^app\//, "").replace(/\/route\.[a-z]+$/, "");
        routePath = seg.startsWith("api/") ? `/${seg}` : `/api/${seg}`;
        type = "dynamic";
      }

      if (routePath) {
        const isClient = /^\s*["']use client["']/m.test(entry.content);
        const codeBytes = new TextEncoder().encode(entry.content).length;
        const sizeBytes = Math.max(120, Math.round(codeBytes * 0.45)); // tree-shaken estimate
        const firstLoadJsBytes = 87400 + sizeBytes; // shared runtime + page chunk

        routes.push({
          route: routePath,
          type,
          sourcePath: entry.path,
          sizeBytes,
          firstLoadJsBytes,
          isClientComponent: isClient,
          issues: dirDiags.map((d) => d.message),
        });
      }
    }
  }

  // Sort routes root first
  routes.sort((a, b) => (a.route === "/" ? -1 : b.route === "/" ? 1 : a.route.localeCompare(b.route)));

  // If no explicit page was found, synthesize root
  if (routes.length === 0) {
    routes.push({
      route: "/",
      type: "static",
      sourcePath: "app/page.tsx",
      sizeBytes: 142,
      firstLoadJsBytes: 87542,
      isClientComponent: false,
      issues: [],
    });
  }

  logs.push(`✓ Generating static pages (${routes.length}/${routes.length}) in 340ms`);
  logs.push("  Finalizing page optimization ...");
  logs.push("  Collecting build traces ...");
  logs.push("");
  logs.push("Route (app)                              Size     First Load JS");
  logs.push("┌ " + routes[0].route.padEnd(38) + `${(routes[0].sizeBytes / 1024).toFixed(2)} kB`.padStart(8) + `  ${(routes[0].firstLoadJsBytes / 1024).toFixed(1)} kB`.padStart(12));

  for (let i = 1; i < routes.length; i++) {
    const r = routes[i];
    const prefix = i === routes.length - 1 ? "└ " : "├ ";
    const glyph = r.type === "dynamic" ? "ƒ " : "○ ";
    const line = `${prefix}${glyph}${r.route}`.padEnd(41) + `${(r.sizeBytes / 1024).toFixed(2)} kB`.padStart(8) + `  ${(r.firstLoadJsBytes / 1024).toFixed(1)} kB`.padStart(12);
    logs.push(line);
  }

  logs.push("");
  logs.push("+ First Load JS shared by all            87.4 kB");
  logs.push("  ├ chunks/framework.js                  45.2 kB");
  logs.push("  ├ chunks/main.js                       31.6 kB");
  logs.push("  └ other shared chunks                  10.6 kB");
  logs.push("");
  logs.push("○  (Static)   prerendered as static content");
  logs.push("ƒ  (Dynamic)  server-rendered on demand");
  logs.push("");

  if (diagnostics.length > 0) {
    logs.push(`⚠️  ${diagnostics.length} diagnostic warnings detected during bundle inspection:`);
    for (const d of diagnostics) {
      logs.push(`  - [${d.severity.toUpperCase()}] ${d.filePath}: ${d.message}`);
    }
    logs.push("");
  }

  logs.push("✓ Production build ready for deployment.");

  const totalBundleSizeBytes = routes.reduce((sum, r) => sum + r.sizeBytes, 87400);
  const estimatedGzipBytes = Math.round(totalBundleSizeBytes * 0.32);

  return {
    success: true,
    target: "nextjs",
    durationMs: Date.now() - startTime + 1400,
    routes,
    diagnostics,
    totalBundleSizeBytes,
    estimatedGzipBytes,
    terminalLogs: logs,
  };
}

/**
 * Simulates Metro Bundler initialization for Expo Router projects (`npx expo start`).
 */
export function simulateExpoMetroStart(entries: ZipEntry[]): SimulatedExpoResult {
  const screens: string[] = [];
  const diagnostics: BuildDiagnostic[] = [];
  const logs: string[] = [];

  for (const entry of entries) {
    if (entry.path.startsWith("app/")) {
      screens.push(entry.path);
    }
    // Check for web globals in Expo code
    if (entry.path.endsWith(".tsx") || entry.path.endsWith(".ts")) {
      if (/\bwindow\b|\bdocument\b|\blocalStorage\b/.test(entry.content)) {
        diagnostics.push({
          severity: "warning",
          filePath: entry.path,
          message: "Reference to browser global (window/document/localStorage) detected in mobile component.",
          codeSnippet: "Platform.OS === 'web' guard recommended",
        });
      }
    }
  }

  const moduleCount = Math.max(12, entries.length * 3);

  const qrArt = [
    "  ██████████████  ▀█ ▄▄▀  ██████████████  ",
    "  ██          ██  ▄▀█ █▄  ██          ██  ",
    "  ██  ██████  ██  █▄▀▀▀█  ██  ██████  ██  ",
    "  ██  ██████  ██  ▀▄▀▄▄█  ██  ██████  ██  ",
    "  ██  ██████  ██  █▀▄███  ██  ██████  ██  ",
    "  ██          ██  ▄▄▄ █▀  ██          ██  ",
    "  ██████████████  █ █ █ █ ██████████████  ",
    "                  ▀▄▀▀█▀                  ",
    "  ███▄▀▀▄█▀▄▄▄▀█  ██▀ █▄  ▄▄█▄▄ █▀▄█▀███  ",
    "  ██████████████  █▄▀ ▀█  ██████████████  ",
  ].join("\n");

  logs.push("Starting Metro Bundler on port 8081...");
  logs.push("Fast - Web, Android, iOS bundler active");
  logs.push("");
  logs.push(qrArt);
  logs.push("");
  logs.push("› Metro waiting on exp://127.0.0.1:8081");
  logs.push("› Scan the QR code above with Expo Go (Android) or the Camera app (iOS)");
  logs.push("");
  logs.push("› Web is waiting on http://localhost:8081");
  logs.push(`› Loaded ${screens.length} Expo Router screens (${moduleCount} modules mapped)`);
  logs.push("");
  logs.push("Press 'w' │ open web");
  logs.push("Press 'a' │ open Android");
  logs.push("Press 'i' │ open iOS simulator");
  logs.push("Press 'r' │ reload app");
  logs.push("");

  if (diagnostics.length > 0) {
    logs.push(`⚠️  ${diagnostics.length} mobile compatibility warnings:`);
    for (const d of diagnostics) {
      logs.push(`  - [${d.severity.toUpperCase()}] ${d.filePath}: ${d.message}`);
    }
  }

  return {
    success: true,
    port: 8081,
    metroUrl: "exp://127.0.0.1:8081",
    registeredScreens: screens,
    moduleCount,
    asciiQrCode: qrArt,
    diagnostics,
    terminalLogs: logs,
  };
}

/**
 * Generates simulated live runtime request logs for the dev server.
 */
export function simulateLiveRequestLogs(
  routes: RouteChunkInfo[],
  target: "nextjs" | "expo"
): string[] {
  const logs: string[] = [];
  const now = new Date();

  if (target === "nextjs") {
    logs.push(`[${now.toLocaleTimeString()}] Ready in 842ms on http://localhost:3000`);
    for (const r of routes.slice(0, 3)) {
      const ms = Math.floor(Math.random() * 45) + 12;
      logs.push(`[${now.toLocaleTimeString()}] GET ${r.route} 200 in ${ms}ms`);
    }
    logs.push(`[${now.toLocaleTimeString()}] GET /_next/static/chunks/app/page.js 200 in 4ms`);
    logs.push(`[${now.toLocaleTimeString()}] GET /_next/static/css/app/layout.css 200 in 2ms`);
  } else {
    logs.push(`[${now.toLocaleTimeString()}] Metro: Fast Refresh connected (client: iPhone 16)`);
    logs.push(`[${now.toLocaleTimeString()}] BUNDLE ./app/index.tsx ░░░░░░░░░░░░░░░░ 100.0% (28/28 modules)`);
    logs.push(`[${now.toLocaleTimeString()}] Fast Refresh completed in 68ms`);
  }

  return logs;
}
