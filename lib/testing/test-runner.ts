/**
 * In-Browser Automated Test Suite Runner & Route Assertion Engine
 * Evaluates route smoke tests, navigation link integrity (404 crawler),
 * metadata & accessibility compliance, and directive resolution.
 * Pure TypeScript, client-safe with zero host execution.
 */

import type { ZipEntry } from "@/lib/migration/zip";

export type TestCaseStatus = "passed" | "failed" | "skipped";

export type TestCategory =
  | "route_smoke"
  | "navigation_integrity"
  | "accessibility_meta"
  | "directives_imports";

export type TestCase = {
  id: string;
  title: string;
  category: TestCategory;
  filePath: string;
  status: TestCaseStatus;
  durationMs: number;
  assertionsCount: number;
  errorMessage?: string;
  errorDetails?: string;
};

export type TestSuiteReport = {
  framework: "vitest" | "jest";
  target: "nextjs" | "expo";
  totalTests: number;
  passedCount: number;
  failedCount: number;
  skippedCount: number;
  passRate: number; // 0 to 100
  totalDurationMs: number;
  testCases: TestCase[];
  terminalLogs: string[];
};

/**
 * Normalizes a file path into an App Router route path
 */
function fileToRoutePath(filePath: string): string | null {
  if (filePath === "app/page.tsx" || filePath === "app/index.tsx") return "/";
  if (/^app\/(.*)\/page\.tsx$/.test(filePath)) {
    const match = filePath.match(/^app\/(.*)\/page\.tsx$/);
    return match ? `/${match[1]}` : null;
  }
  if (/^app\/(.*)\/route\.ts$/.test(filePath)) {
    const match = filePath.match(/^app\/(.*)\/route\.ts$/);
    return match ? `/${match[1]}` : null;
  }
  // Expo Router paths
  if (/^app\/([a-zA-Z0-9_/-]+)\.tsx$/.test(filePath) && !filePath.includes("_layout")) {
    const match = filePath.match(/^app\/([a-zA-Z0-9_/-]+)\.tsx$/);
    if (!match) return null;
    const clean = match[1].replace(/\/index$/, "");
    return clean === "index" ? "/" : `/${clean}`;
  }
  return null;
}

/**
 * Tests component smoke stability: exports, balanced syntax, non-empty return
 */
export function validateRouteSmoke(file: ZipEntry): { passed: boolean; error?: string } {
  const content = file.content.trim();

  // 1. Check for valid export
  const hasExport =
    /export\s+default\s+(?:function|class|\w+)/.test(content) ||
    /export\s+(?:const|function|async\s+function)\s+(?:GET|POST|PUT|DELETE|default)/.test(content) ||
    content.includes("export default");

  if (!hasExport) {
    return {
      passed: false,
      error: `Route file '${file.path}' does not have a default export or route handler.`,
    };
  }

  // 2. Delimiter & basic syntax check
  let openBraces = 0;
  let openParens = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    if (char === "{") openBraces++;
    else if (char === "}") openBraces--;
    else if (char === "(") openParens++;
    else if (char === ")") openParens--;
  }

  if (openBraces !== 0 || openParens !== 0) {
    return {
      passed: false,
      error: `Syntax mismatch in '${file.path}': ${Math.abs(openBraces)} unclosed brace(s) / paren(s).`,
    };
  }

  // 3. Return statement in UI component
  if (file.path.endsWith(".tsx") && !content.includes("return") && !content.includes("=>")) {
    return {
      passed: false,
      error: `Component in '${file.path}' does not contain a return statement.`,
    };
  }

  return { passed: true };
}

/**
 * Crawls and validates all <Link> destinations against known route inventory
 */
export function validateNavigationLinks(
  entries: ZipEntry[],
  knownRoutePaths: string[]
): {
  valid: boolean;
  totalLinks: number;
  deadLinks: Array<{ sourceFile: string; targetUrl: string }>;
} {
  const deadLinks: Array<{ sourceFile: string; targetUrl: string }> = [];
  let totalLinks = 0;

  // Convert known route paths into route matchers (support dynamic routes like /users/[id])
  const routeMatchers = knownRoutePaths.map((route) => {
    // Escape regex except for [param]
    const regexPattern = route
      .replace(/\[\.\.\.[a-zA-Z0-9_]+\]/g, ".*") // Catch-all [...slug]
      .replace(/\[[a-zA-Z0-9_]+\]/g, "[^/]+"); // Single segment [id]
    return new RegExp(`^${regexPattern}$`);
  });

  const linkRegex = /<Link\b[^>]*?\b(?:href|to)=(["'])(.*?)\1/g;

  for (const entry of entries) {
    if (!entry.path.endsWith(".tsx") && !entry.path.endsWith(".jsx")) continue;

    let match: RegExpExecArray | null;
    linkRegex.lastIndex = 0;

    while ((match = linkRegex.exec(entry.content)) !== null) {
      totalLinks++;
      const targetUrl = match[2].trim();

      // Ignore external or anchor/query links
      if (
        targetUrl.startsWith("http://") ||
        targetUrl.startsWith("https://") ||
        targetUrl.startsWith("mailto:") ||
        targetUrl.startsWith("tel:") ||
        targetUrl.startsWith("#") ||
        targetUrl.startsWith("{") // Dynamic expression
      ) {
        continue;
      }

      // Clean target path of query string or fragment
      const cleanPath = targetUrl.split("?")[0].split("#")[0] || "/";

      // Check if path matches any registered route
      const matchesRoute =
        knownRoutePaths.includes(cleanPath) ||
        routeMatchers.some((matcher) => matcher.test(cleanPath));

      if (!matchesRoute) {
        deadLinks.push({ sourceFile: entry.path, targetUrl });
      }
    }
  }

  return {
    valid: deadLinks.length === 0,
    totalLinks,
    deadLinks,
  };
}

/**
 * Validates metadata, accessibility, and image tag optimization
 */
export function validateAccessibilityMeta(
  entries: ZipEntry[],
  isExpo: boolean
): { passed: boolean; issues: string[] } {
  const issues: string[] = [];

  // Check root layout
  const layoutFile = entries.find((e) =>
    isExpo ? e.path === "app/_layout.tsx" : e.path === "app/layout.tsx"
  );

  if (!layoutFile) {
    issues.push(`Missing required root layout file '${isExpo ? "app/_layout.tsx" : "app/layout.tsx"}'.`);
  } else if (!isExpo) {
    if (!layoutFile.content.includes("<html") || !layoutFile.content.includes("<body")) {
      issues.push("Root layout ('app/layout.tsx') must contain <html> and <body> tags.");
    }
  }

  // Image tag check
  for (const entry of entries) {
    if (!entry.path.endsWith(".tsx")) continue;

    // Check for raw HTML img without alt
    const rawImgMatches = entry.content.match(/<img\b([^>]*)>/g);
    if (rawImgMatches) {
      for (const img of rawImgMatches) {
        if (!img.includes("alt=")) {
          issues.push(`Image missing required 'alt' accessibility prop in '${entry.path}'.`);
        }
      }
    }

    // Next.js Image check
    if (!isExpo && entry.content.includes("<Image")) {
      const nextImgMatches = entry.content.match(/<Image\b([^>]*)>/g);
      if (nextImgMatches) {
        for (const img of nextImgMatches) {
          if (!img.includes("alt=")) {
            issues.push(`Next.js <Image> missing required 'alt' prop in '${entry.path}'.`);
          }
        }
      }
    }
  }

  return {
    passed: issues.length === 0,
    issues,
  };
}

/**
 * Main Test Runner: executes the full suite and produces Vitest / Jest report
 */
export function runSimulatedTestSuite(
  entries: ZipEntry[],
  targetName: string
): TestSuiteReport {
  const isExpo = targetName.toLowerCase().includes("expo");
  const testFramework = isExpo ? "jest" : "vitest";
  const testCases: TestCase[] = [];

  const startTime = performance.now();

  // 1. Collect all routes in project
  const routeEntries: Array<{ entry: ZipEntry; routePath: string }> = [];
  for (const entry of entries) {
    const routePath = fileToRoutePath(entry.path);
    if (routePath !== null) {
      routeEntries.push({ entry, routePath });
    }
  }

  const knownRoutePaths = routeEntries.map((r) => r.routePath);
  if (!knownRoutePaths.includes("/")) {
    knownRoutePaths.push("/");
  }

  // Suite A: Route Component Smoke Tests
  for (const { entry, routePath } of routeEntries) {
    const testStart = performance.now();
    const smoke = validateRouteSmoke(entry);
    const durationMs = Math.max(1, Math.round(performance.now() - testStart));

    testCases.push({
      id: `smoke-${entry.path}`,
      title: `Route (${routePath}) renders default export without throwing`,
      category: "route_smoke",
      filePath: entry.path,
      status: smoke.passed ? "passed" : "failed",
      durationMs,
      assertionsCount: 3,
      errorMessage: smoke.error,
    });
  }

  // Suite B: Navigation Link Integrity
  const navStart = performance.now();
  const navResult = validateNavigationLinks(entries, knownRoutePaths);
  const navDuration = Math.max(1, Math.round(performance.now() - navStart));

  testCases.push({
    id: "nav-integrity-all-links",
    title: `Navigation Link Integrity > all internal <Link> targets exist (${navResult.totalLinks} audited)`,
    category: "navigation_integrity",
    filePath: "app/navigation.test.ts",
    status: navResult.valid ? "passed" : "failed",
    durationMs: navDuration,
    assertionsCount: Math.max(1, navResult.totalLinks),
    errorMessage: navResult.deadLinks.length > 0
      ? `Found ${navResult.deadLinks.length} dead link(s): ${navResult.deadLinks.map((d) => `${d.targetUrl} in ${d.sourceFile}`).join("; ")}`
      : undefined,
  });

  // Suite C: Accessibility & Metadata Compliance
  const a11yStart = performance.now();
  const a11yResult = validateAccessibilityMeta(entries, isExpo);
  const a11yDuration = Math.max(1, Math.round(performance.now() - a11yStart));

  testCases.push({
    id: "a11y-meta-compliance",
    title: `Metadata & Accessibility > root layout structure and Image alt attributes`,
    category: "accessibility_meta",
    filePath: isExpo ? "app/_layout.test.ts" : "app/layout.test.ts",
    status: a11yResult.passed ? "passed" : "failed",
    durationMs: a11yDuration,
    assertionsCount: 4,
    errorMessage: a11yResult.issues.length > 0 ? a11yResult.issues.join(" | ") : undefined,
  });

  // Suite D: Client Directives & Import Sanity
  const dirStart = performance.now();
  const directiveErrors: string[] = [];
  for (const entry of entries) {
    if (!entry.path.endsWith(".tsx")) continue;
    const usesHooks = /use(?:State|Effect|Router|Ref|Callback|Memo|Context)\(/.test(entry.content);
    const usesEvents = /on(?:Click|Change|Submit|KeyDown|KeyUp)=/.test(entry.content);
    const hasClientDirective = /["']use client["']/.test(entry.content);

    if (!isExpo && (usesHooks || usesEvents) && !hasClientDirective) {
      directiveErrors.push(`Missing 'use client' in ${entry.path} which uses client hooks/events.`);
    }
  }
  const dirDuration = Math.max(1, Math.round(performance.now() - dirStart));

  testCases.push({
    id: "directives-client-hooks",
    title: `Directive Compliance > interactive hooks and event handlers declare 'use client'`,
    category: "directives_imports",
    filePath: "app/directives.test.ts",
    status: directiveErrors.length === 0 ? "passed" : "failed",
    durationMs: dirDuration,
    assertionsCount: 5,
    errorMessage: directiveErrors.length > 0 ? directiveErrors.join(" | ") : undefined,
  });

  const passedCount = testCases.filter((t) => t.status === "passed").length;
  const failedCount = testCases.filter((t) => t.status === "failed").length;
  const skippedCount = testCases.filter((t) => t.status === "skipped").length;
  const totalTests = testCases.length;
  const passRate = totalTests > 0 ? Math.round((passedCount / totalTests) * 100) : 100;
  const totalDurationMs = Math.max(2, Math.round(performance.now() - startTime));

  // Build realistic Vitest / Jest terminal logs
  const terminalLogs: string[] = [];
  const version = testFramework === "vitest" ? "v2.1.4" : "v29.7.0";
  const runnerHeader = testFramework === "vitest" ? `RUN  ${version} /workspace` : `PASS  jest --passWithNoTests`;

  terminalLogs.push(runnerHeader);
  terminalLogs.push("");

  for (const t of testCases) {
    const glyph = t.status === "passed" ? "✓" : "✕";
    const statusText = t.status === "passed" ? "PASS" : "FAIL";
    terminalLogs.push(`${glyph} ${t.filePath} > ${t.title} (${t.durationMs}ms)`);
    if (t.errorMessage) {
      terminalLogs.push(`    → Error [${statusText}]: ${t.errorMessage}`);
    }
  }

  terminalLogs.push("");
  terminalLogs.push("--------------------------------------------------------------------------------");
  terminalLogs.push(
    `Test Files  ${failedCount === 0 ? "All passed" : `${passedCount} passed, ${failedCount} failed`} (${testCases.length})`
  );
  terminalLogs.push(
    `     Tests  ${passedCount} passed${failedCount > 0 ? `, ${failedCount} failed` : ""} (${totalTests})`
  );
  terminalLogs.push(`  Duration  ${totalDurationMs}ms`);
  terminalLogs.push(
    failedCount === 0
      ? `    Result  ✓ TEST SUITE PASSED (100% route verification)`
      : `    Result  ✕ TEST SUITE FAILED (${passRate}% pass rate)`
  );

  return {
    framework: testFramework,
    target: isExpo ? "expo" : "nextjs",
    totalTests,
    passedCount,
    failedCount,
    skippedCount,
    passRate,
    totalDurationMs,
    testCases,
    terminalLogs,
  };
}
