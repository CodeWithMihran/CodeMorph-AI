/**
 * Migration Health Doctor & Diagnostic Autofix Engine
 * Performs deep static audits on synthesized and edited migration projects,
 * computing real-time health scorecards, grading, and 1-click deterministic autofixes.
 * Pure TypeScript, client-safe with zero host execution.
 */

import type { ZipEntry } from "@/lib/migration/zip";

export type DoctorIssueSeverity = "critical" | "warning" | "suggestion";
export type DoctorCategory = "directives" | "routing" | "imports" | "accessibility" | "hygiene";

export interface DoctorIssue {
  id: string;
  category: DoctorCategory;
  severity: DoctorIssueSeverity;
  title: string;
  description: string;
  filePath: string;
  line?: number;
  canAutofix: boolean;
  autofixDescription?: string;
}

export interface DoctorCategorySummary {
  category: DoctorCategory;
  title: string;
  score: number; // 0-100
  totalIssues: number;
  criticalCount: number;
  warningCount: number;
}

export interface DoctorReport {
  overallScore: number; // 0-100
  grade: "A+" | "A" | "B" | "C" | "D" | "F";
  issues: DoctorIssue[];
  categories: DoctorCategorySummary[];
  totalFixable: number;
  criticalCount: number;
  warningCount: number;
  suggestionCount: number;
  passedChecksCount: number;
  timestamp: string;
}

export interface AutofixResult {
  updatedEntries: ZipEntry[];
  appliedFixesCount: number;
  fixedIssueIds: string[];
}

const CLIENT_HOOKS_REGEX = /\b(useState|useEffect|useRef|useCallback|useMemo|useContext|useReducer|useTransition|useId|useRouter|usePathname|useSearchParams|useActionState|useOptimistic|useFormStatus)\s*\(/;
const CLIENT_EVENT_HANDLERS_REGEX = /\b(onClick|onChange|onSubmit|onKeyDown|onKeyUp|onMouseEnter|onMouseLeave|onFocus|onBlur)\s*=/;
const BROWSER_GLOBALS_REGEX = /\b(window\.|localStorage\.|sessionStorage\.|navigator\.)/;

/**
 * Runs a comprehensive migration health diagnostic on project entries
 */
export function runMigrationDoctor(
  entries: ZipEntry[],
  targetFramework: string = "Next.js App Router"
): DoctorReport {
  const issues: DoctorIssue[] = [];
  let passedChecksCount = 0;
  const isExpo = targetFramework.toLowerCase().includes("expo");

  // Track file entry map for fast lookups
  const entryMap = new Map<string, string>();
  for (const e of entries) {
    if (!e.path.startsWith(".codemorph/")) {
      entryMap.set(e.path, e.content);
    }
  }

  // 1. DIRECTIVE INTEGRITY CHECKS
  let directivePassed = true;
  for (const [filePath, content] of entryMap.entries()) {
    if (!filePath.endsWith(".tsx") && !filePath.endsWith(".jsx")) continue;

    const hasDirective =
      content.startsWith('"use client"') ||
      content.startsWith("'use client'") ||
      /^\s*["']use client["']/.test(content);

    const hasHooks = CLIENT_HOOKS_REGEX.test(content);
    const hasHandlers = CLIENT_EVENT_HANDLERS_REGEX.test(content);
    const hasGlobals = BROWSER_GLOBALS_REGEX.test(content);

    if (!hasDirective && (hasHooks || hasHandlers || hasGlobals)) {
      directivePassed = false;
      const reasons: string[] = [];
      if (hasHooks) reasons.push("interactive React hooks");
      if (hasHandlers) reasons.push("DOM event handlers");
      if (hasGlobals) reasons.push("browser global APIs");

      // Find approximate line number
      const lines = content.split("\n");
      let triggerLine = 1;
      for (let i = 0; i < lines.length; i++) {
        if (
          CLIENT_HOOKS_REGEX.test(lines[i]) ||
          CLIENT_EVENT_HANDLERS_REGEX.test(lines[i]) ||
          BROWSER_GLOBALS_REGEX.test(lines[i])
        ) {
          triggerLine = i + 1;
          break;
        }
      }

      issues.push({
        id: `directive-missing-${filePath}`,
        category: "directives",
        severity: "critical",
        title: `Missing "use client" directive`,
        description: `File utilizes ${reasons.join(", ")} but is not marked as a Client Component, which will cause Next.js Server Component render errors.`,
        filePath,
        line: triggerLine,
        canAutofix: true,
        autofixDescription: `Prepend '"use client";' to top of ${filePath}`,
      });
    }
  }
  if (directivePassed) passedChecksCount++;

  // 2. ROUTING & APP STRUCTURE CHECKS
  let routingPassed = true;
  if (!isExpo) {
    // Check root layout
    const hasLayout = entryMap.has("app/layout.tsx") || entryMap.has("app/layout.jsx");
    if (!hasLayout) {
      routingPassed = false;
      issues.push({
        id: "routing-missing-layout",
        category: "routing",
        severity: "critical",
        title: "Missing Root Layout (app/layout.tsx)",
        description: "Next.js App Router requires a root layout (app/layout.tsx) with <html> and <body> tags to render routes.",
        filePath: "app/layout.tsx",
        canAutofix: false,
        autofixDescription: "Generate standard App Router root layout scaffolding",
      });
    } else {
      passedChecksCount++;
    }

    // Check all page routes for default export
    for (const [filePath, content] of entryMap.entries()) {
      if (
        filePath.startsWith("app/") &&
        (filePath.endsWith("/page.tsx") || filePath.endsWith("/page.jsx") || filePath === "app/page.tsx")
      ) {
        const hasDefaultExport =
          /\bexport\s+default\s+(function|class)?/.test(content) ||
          /\bexport\s*\{\s*[^}]*\bdefault\b[^}]*\}/.test(content);

        if (!hasDefaultExport) {
          routingPassed = false;
          issues.push({
            id: `routing-no-default-export-${filePath}`,
            category: "routing",
            severity: "critical",
            title: `Missing default export in page route`,
            description: `Route file ${filePath} does not export a default React component, causing routing failure in Next.js.`,
            filePath,
            canAutofix: false,
          });
        }
      }
    }
  } else {
    // Expo Router checks
    const hasExpoLayout = entryMap.has("app/_layout.tsx") || entryMap.has("app/_layout.jsx");
    if (!hasExpoLayout) {
      routingPassed = false;
      issues.push({
        id: "routing-missing-expo-layout",
        category: "routing",
        severity: "critical",
        title: "Missing Expo Root Layout (app/_layout.tsx)",
        description: "Expo Router requires an app/_layout.tsx Stack or Tabs navigator.",
        filePath: "app/_layout.tsx",
        canAutofix: false,
      });
    }
  }
  if (routingPassed) passedChecksCount++;

  // 3. IMPORTS & DEPENDENCY HYGIENE CHECKS
  let importsPassed = true;
  const pkgContent = entryMap.get("package.json");
  if (pkgContent) {
    try {
      const pkg = JSON.parse(pkgContent);
      const allDeps = {
        ...(pkg.dependencies || {}),
        ...(pkg.devDependencies || {}),
      };

      if (!isExpo) {
        if ("react-router-dom" in allDeps) {
          importsPassed = false;
          issues.push({
            id: "import-deprecated-react-router",
            category: "imports",
            severity: "warning",
            title: "Deprecated Package: react-router-dom in Next.js",
            description: "Next.js App Router uses native file-system routing and 'next/navigation'. Having react-router-dom can cause hydration and bundling conflicts.",
            filePath: "package.json",
            canAutofix: false,
            autofixDescription: "Remove react-router-dom from package.json dependencies",
          });
        }
        if ("react-scripts" in allDeps || "vite" in (pkg.dependencies || {})) {
          importsPassed = false;
          issues.push({
            id: "import-legacy-bundler-deps",
            category: "imports",
            severity: "warning",
            title: "Legacy Bundler Dependency in package.json",
            description: "Legacy tooling dependencies (react-scripts, Vite runtime) remain in package.json and should be removed.",
            filePath: "package.json",
            canAutofix: false,
          });
        }
      }
    } catch {
      // Ignore JSON parse errors
    }
  }

  // Check for forbidden Node built-in imports in client components
  for (const [filePath, content] of entryMap.entries()) {
    if (!filePath.endsWith(".tsx") && !filePath.endsWith(".jsx")) continue;
    const hasDirective = /^\s*["']use client["']/.test(content);
    if (hasDirective) {
      const nodeImportMatch = content.match(/import\s+.*\s+from\s+["'](node:(fs|path|crypto|os|child_process)|fs|path|crypto)["']/);
      if (nodeImportMatch) {
        importsPassed = false;
        issues.push({
          id: `import-node-in-client-${filePath}`,
          category: "imports",
          severity: "critical",
          title: `Node.js built-in module imported in Client Component`,
          description: `Client component imports '${nodeImportMatch[1]}', which cannot be resolved in browser bundles.`,
          filePath,
          canAutofix: false,
        });
      }
    }
  }
  if (importsPassed) passedChecksCount++;

  // 4. ACCESSIBILITY & ASSET HEALTH CHECKS
  let a11yPassed = true;
  for (const [filePath, content] of entryMap.entries()) {
    if (!filePath.endsWith(".tsx") && !filePath.endsWith(".jsx")) continue;

    // Check for raw <a> tags with internal hrefs in Next.js
    if (!isExpo) {
      const internalAnchorRegex = /<a\s+[^>]*href=["'](\/[^"']*)["'][^>]*>/;
      if (internalAnchorRegex.test(content)) {
        a11yPassed = false;
        issues.push({
          id: `a11y-unmigrated-anchor-${filePath}`,
          category: "accessibility",
          severity: "warning",
          title: "Unmigrated HTML <a> tag used for internal route",
          description: "Internal route navigation using <a> triggers full browser page reloads instead of fast SPA client-side transitions via <Link>.",
          filePath,
          canAutofix: true,
          autofixDescription: "Convert <a> to Next.js <Link> with prefetching",
        });
      }
    }

    // Check for raw <img> tags without alt attribute
    const imgMissingAltRegex = /<img\s+(?![^>]*\balt=)[^>]*>/;
    if (imgMissingAltRegex.test(content)) {
      a11yPassed = false;
      issues.push({
        id: `a11y-img-missing-alt-${filePath}`,
        category: "accessibility",
        severity: "warning",
        title: "Image element missing accessible alt attribute",
        description: "Screen readers require an alt attribute on image elements for accessibility compliance (WCAG 2.1 / Section 508).",
        filePath,
        canAutofix: true,
        autofixDescription: "Add alt=\"Image\" attribute to <img> elements",
      });
    }
  }
  if (a11yPassed) passedChecksCount++;

  // 5. CODE HYGIENE & QUALITY CHECKS
  let hygienePassed = true;
  for (const [filePath, content] of entryMap.entries()) {
    if (!filePath.endsWith(".tsx") && !filePath.endsWith(".ts") && !filePath.endsWith(".jsx")) continue;

    // Check for debugger statements
    if (/\bdebugger\s*;?/.test(content)) {
      hygienePassed = false;
      issues.push({
        id: `hygiene-debugger-${filePath}`,
        category: "hygiene",
        severity: "warning",
        title: "Leftover debugger statement in production code",
        description: "Found 'debugger;' breakpoint that halts browser execution if devtools are open.",
        filePath,
        canAutofix: true,
        autofixDescription: "Remove debugger; statements",
      });
    }

    // Check for empty catch blocks
    if (/catch\s*\([A-Za-z0-9_$]*\)\s*\{\s*\}/.test(content)) {
      hygienePassed = false;
      issues.push({
        id: `hygiene-empty-catch-${filePath}`,
        category: "hygiene",
        severity: "suggestion",
        title: "Silent empty catch block",
        description: "Catch block silently swallows errors without logging or handling.",
        filePath,
        canAutofix: false,
      });
    }
  }
  if (hygienePassed) passedChecksCount++;

  // Calculate scores & categories
  let criticalCount = 0;
  let warningCount = 0;
  let suggestionCount = 0;

  const categoryMap: Record<DoctorCategory, { total: number; critical: number; warning: number }> = {
    directives: { total: 0, critical: 0, warning: 0 },
    routing: { total: 0, critical: 0, warning: 0 },
    imports: { total: 0, critical: 0, warning: 0 },
    accessibility: { total: 0, critical: 0, warning: 0 },
    hygiene: { total: 0, critical: 0, warning: 0 },
  };

  for (const iss of issues) {
    if (iss.severity === "critical") criticalCount++;
    else if (iss.severity === "warning") warningCount++;
    else suggestionCount++;

    categoryMap[iss.category].total++;
    if (iss.severity === "critical") categoryMap[iss.category].critical++;
    if (iss.severity === "warning") categoryMap[iss.category].warning++;
  }

  // Weight deduction: 15 per critical, 5 per warning, 2 per suggestion
  const totalDeductions = criticalCount * 15 + warningCount * 5 + suggestionCount * 2;
  const overallScore = Math.max(0, 100 - totalDeductions);

  let grade: "A+" | "A" | "B" | "C" | "D" | "F" = "A+";
  if (overallScore >= 95) grade = "A+";
  else if (overallScore >= 85) grade = "A";
  else if (overallScore >= 75) grade = "B";
  else if (overallScore >= 60) grade = "C";
  else if (overallScore >= 40) grade = "D";
  else grade = "F";

  const categories: DoctorCategorySummary[] = [
    {
      category: "directives",
      title: "Directives & Client Scope",
      score: Math.max(0, 100 - categoryMap.directives.critical * 30 - categoryMap.directives.warning * 10),
      totalIssues: categoryMap.directives.total,
      criticalCount: categoryMap.directives.critical,
      warningCount: categoryMap.directives.warning,
    },
    {
      category: "routing",
      title: "App Router & Structure",
      score: Math.max(0, 100 - categoryMap.routing.critical * 30 - categoryMap.routing.warning * 10),
      totalIssues: categoryMap.routing.total,
      criticalCount: categoryMap.routing.critical,
      warningCount: categoryMap.routing.warning,
    },
    {
      category: "imports",
      title: "Dependencies & Imports",
      score: Math.max(0, 100 - categoryMap.imports.critical * 30 - categoryMap.imports.warning * 10),
      totalIssues: categoryMap.imports.total,
      criticalCount: categoryMap.imports.critical,
      warningCount: categoryMap.imports.warning,
    },
    {
      category: "accessibility",
      title: "Navigation & Accessibility",
      score: Math.max(0, 100 - categoryMap.accessibility.critical * 30 - categoryMap.accessibility.warning * 10),
      totalIssues: categoryMap.accessibility.total,
      criticalCount: categoryMap.accessibility.critical,
      warningCount: categoryMap.accessibility.warning,
    },
    {
      category: "hygiene",
      title: "Code Quality & Hygiene",
      score: Math.max(0, 100 - categoryMap.hygiene.critical * 30 - categoryMap.hygiene.warning * 10),
      totalIssues: categoryMap.hygiene.total,
      criticalCount: categoryMap.hygiene.critical,
      warningCount: categoryMap.hygiene.warning,
    },
  ];

  const totalFixable = issues.filter((i) => i.canAutofix).length;

  return {
    overallScore,
    grade,
    issues,
    categories,
    totalFixable,
    criticalCount,
    warningCount,
    suggestionCount,
    passedChecksCount,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Applies deterministic autofixes for all or selected fixable doctor issues
 */
export function applyDoctorAutofix(
  entries: ZipEntry[],
  issuesToFix?: DoctorIssue[] | string[]
): AutofixResult {
  let appliedFixesCount = 0;
  const fixedIssueIds: string[] = [];

  // Filter fixable issues if specified
  const fixableFilter =
    issuesToFix === undefined
      ? null
      : new Set(
          issuesToFix.map((item) => (typeof item === "string" ? item : item.id))
        );

  const updatedEntries: ZipEntry[] = entries.map((entry) => {
    let content = entry.content;
    let modified = false;

    // 1. Navigation: Convert <a> to <Link> for internal routes
    const anchorIssueId = `a11y-unmigrated-anchor-${entry.path}`;
    if (!fixableFilter || fixableFilter.has(anchorIssueId)) {
      if (entry.path.endsWith(".tsx") || entry.path.endsWith(".jsx")) {
        const anchorRegex = /<a(\s+[^>]*href=["']\/[^"']*["'][^>]*)>([\s\S]*?)<\/a>/g;
        if (anchorRegex.test(content)) {
          content = content.replace(anchorRegex, "<Link$1>$2</Link>");
          // Ensure Link import exists
          if (!/from\s+["']next\/link["']/.test(content)) {
            if (/^\s*["']use client["'];?/.test(content)) {
              content = content.replace(/^(\s*["']use client["'];?\r?\n\r?\n?)/, '$1import Link from "next/link";\n');
            } else {
              content = `import Link from "next/link";\n${content}`;
            }
          }
          modified = true;
          appliedFixesCount++;
          fixedIssueIds.push(anchorIssueId);
        }
      }
    }

    // 2. Accessibility: Add alt="Image" to <img> missing alt
    const imgAltIssueId = `a11y-img-missing-alt-${entry.path}`;
    if (!fixableFilter || fixableFilter.has(imgAltIssueId)) {
      if (entry.path.endsWith(".tsx") || entry.path.endsWith(".jsx")) {
        const rawImgRegex = /<img(\s+(?![^>]*\balt=)[^>]*?)(\/?)>/g;
        if (rawImgRegex.test(content)) {
          content = content.replace(rawImgRegex, `<img$1 alt="Image"$2>`);
          modified = true;
          appliedFixesCount++;
          fixedIssueIds.push(imgAltIssueId);
        }
      }
    }

    // 3. Hygiene: Remove debugger statements
    const debuggerIssueId = `hygiene-debugger-${entry.path}`;
    if (!fixableFilter || fixableFilter.has(debuggerIssueId)) {
      if (/\bdebugger\s*;?/.test(content)) {
        content = content.replace(/\bdebugger\s*;?/g, "");
        modified = true;
        appliedFixesCount++;
        fixedIssueIds.push(debuggerIssueId);
      }
    }

    // 4. Directives: Inject "use client"; at the absolute top of the file
    const directiveIssueId = `directive-missing-${entry.path}`;
    if (!fixableFilter || fixableFilter.has(directiveIssueId)) {
      const hasDirective = /^\s*["']use client["']/.test(content);
      const hasHooks = CLIENT_HOOKS_REGEX.test(content);
      const hasHandlers = CLIENT_EVENT_HANDLERS_REGEX.test(content);
      const hasGlobals = BROWSER_GLOBALS_REGEX.test(content);

      if (!hasDirective && (hasHooks || hasHandlers || hasGlobals)) {
        content = `"use client";\n\n${content}`;
        modified = true;
        appliedFixesCount++;
        fixedIssueIds.push(directiveIssueId);
      }
    }

    return modified ? { ...entry, content } : entry;
  });

  return {
    updatedEntries,
    appliedFixesCount,
    fixedIssueIds,
  };
}
