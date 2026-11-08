import type { MigrationTarget } from "@/lib/migration/plan";

export type PortabilityTier = "drop-in" | "shim-available" | "refactor-required" | "incompatible";

export interface CodemodGuide {
  title: string;
  before: string;
  after: string;
}

export interface ShimRecipe {
  packagePattern: RegExp | string;
  category: "routing" | "styling" | "http" | "state-storage" | "dom-web" | "backend" | "general";
  target: "nextjs" | "expo" | "all";
  status: PortabilityTier;
  replacement: string;
  reason: string;
  codemodGuide?: CodemodGuide;
  recommendedPackages?: string[];
}

export interface AnalyzedDependency {
  name: string;
  version?: string;
  status: PortabilityTier;
  category: string;
  replacement: string;
  reason: string;
  codemodGuide?: CodemodGuide;
  recommendedPackages?: string[];
}

export interface DetectedBrowserApi {
  api: string;
  occurrences: number;
  files: string[];
  recommendation: string;
  shimPackage?: string;
}

export interface DependencyAnalysisResult {
  dependencies: AnalyzedDependency[];
  browserApis: DetectedBrowserApi[];
  compatibilityScore: number;
  summary: {
    total: number;
    dropIn: number;
    shimAvailable: number;
    refactorRequired: number;
    incompatible: number;
  };
  installShims: string[];
}

const RECIPES: ShimRecipe[] = [
  // 1. Routing
  {
    packagePattern: /^react-router(?:-dom)?$/i,
    category: "routing",
    target: "nextjs",
    status: "refactor-required",
    replacement: "next/navigation & next/link",
    reason: "Next.js App Router uses filesystem-based routing and native navigation hooks.",
    codemodGuide: {
      title: "React Router to Next.js App Router Navigation",
      before: `import { useNavigate, Link, useParams } from "react-router-dom";

export function Nav() {
  const navigate = useNavigate();
  const { id } = useParams();
  return <Link to="/about">About</Link>;
}`,
      after: `import Link from "next/link";
import { useRouter, useParams } from "next/navigation";

export function Nav() {
  const router = useRouter();
  const params = useParams();
  return <Link href="/about">About</Link>;
}`,
    },
  },
  {
    packagePattern: /^react-router(?:-dom)?$/i,
    category: "routing",
    target: "expo",
    status: "refactor-required",
    replacement: "expo-router",
    reason: "Expo Router uses file-based routing with native mobile screen stacks.",
    codemodGuide: {
      title: "React Router to Expo Router",
      before: `import { useNavigate, Link } from "react-router-dom";

export function Nav() {
  const navigate = useNavigate();
  return <button onClick={() => navigate("/details")}>Go</button>;
}`,
      after: `import { useRouter, Link } from "expo-router";
import { Pressable, Text } from "react-native";

export function Nav() {
  const router = useRouter();
  return (
    <Pressable onPress={() => router.push("/details")}>
      <Text>Go</Text>
    </Pressable>
  );
}`,
    },
    recommendedPackages: ["expo-router"],
  },
  {
    packagePattern: /^(?:wouter|@reach\/router)$/i,
    category: "routing",
    target: "nextjs",
    status: "refactor-required",
    replacement: "next/navigation & next/link",
    reason: "Replace client-only micro-router with Next.js App Router filesystem routes.",
  },
  {
    packagePattern: /^(?:wouter|@reach\/router)$/i,
    category: "routing",
    target: "expo",
    status: "refactor-required",
    replacement: "expo-router",
    reason: "Replace web routing with Expo Router mobile file routing.",
  },

  // 2. Styling & CSS-in-JS
  {
    packagePattern: /^styled-components$/i,
    category: "styling",
    target: "nextjs",
    status: "shim-available",
    replacement: "Tailwind CSS v4 or Next.js Styled Components Registry",
    reason: "Styled-components requires client-side CSS injection registry in App Router; Tailwind CSS is recommended for zero-runtime performance.",
    codemodGuide: {
      title: "Styled-Components to Tailwind Utility Classes",
      before: `const Container = styled.div\`
  padding: 16px;
  background-color: #f8fafc;
  border-radius: 8px;
\`;`,
      after: `export function Container({ children }) {
  return <div className="p-4 bg-slate-50 rounded-lg">{children}</div>;
}`,
    },
  },
  {
    packagePattern: /^styled-components$/i,
    category: "styling",
    target: "expo",
    status: "refactor-required",
    replacement: "React Native StyleSheet or NativeWind v4",
    reason: "Web styled-components cannot target native mobile views directly; use StyleSheet.create or NativeWind.",
    codemodGuide: {
      title: "Styled-Components to React Native StyleSheet",
      before: `const Box = styled.div\`
  flex: 1;
  padding: 20px;
\`;`,
      after: `import { View, StyleSheet } from "react-native";

const styles = StyleSheet.create({
  box: { flex: 1, padding: 20 },
});`,
    },
    recommendedPackages: ["nativewind"],
  },
  {
    packagePattern: /^@emotion\/(?:react|styled)$/i,
    category: "styling",
    target: "nextjs",
    status: "shim-available",
    replacement: "Tailwind CSS or CSS Modules",
    reason: "Emotion requires 'use client' boundaries and SSR emotion cache registry.",
  },
  {
    packagePattern: /^@emotion\/(?:react|styled)$/i,
    category: "styling",
    target: "expo",
    status: "refactor-required",
    replacement: "StyleSheet.create() or NativeWind",
    reason: "Emotion generates web CSS classes incompatible with React Native primitives.",
  },
  {
    packagePattern: /^(?:bootstrap|react-bootstrap)$/i,
    category: "styling",
    target: "nextjs",
    status: "shim-available",
    replacement: "Tailwind CSS v4 or Bootstrap CSS import",
    reason: "Import bootstrap CSS into globals.css or migrate to Tailwind classes for performance.",
  },
  {
    packagePattern: /^(?:bootstrap|react-bootstrap)$/i,
    category: "styling",
    target: "expo",
    status: "incompatible",
    replacement: "React Native Paper or native View/Text components",
    reason: "Bootstrap relies on HTML DOM tags (div, span, button) and browser cascading stylesheets.",
  },
  {
    packagePattern: /^@mui\/(?:material|icons-material)$/i,
    category: "styling",
    target: "nextjs",
    status: "shim-available",
    replacement: "@mui/material-nextjs or Tailwind CSS",
    reason: "Material UI in Next.js App Router requires client component wrappers or the official Next.js integration layer.",
  },
  {
    packagePattern: /^@mui\/(?:material|icons-material)$/i,
    category: "styling",
    target: "expo",
    status: "incompatible",
    replacement: "React Native Paper or Lucide React Native",
    reason: "MUI is strictly built for the DOM and HTML5 canvas/SVG.",
  },
  {
    packagePattern: /^@chakra-ui\/react$/i,
    category: "styling",
    target: "nextjs",
    status: "shim-available",
    replacement: "Chakra UI v3 / Tailwind CSS",
    reason: "Requires 'use client' wrapper at root layout.",
  },
  {
    packagePattern: /^@chakra-ui\/react$/i,
    category: "styling",
    target: "expo",
    status: "incompatible",
    replacement: "Gluestack UI or React Native StyleSheet",
    reason: "Chakra UI depends on web DOM elements.",
  },
  {
    packagePattern: /^sass$/i,
    category: "styling",
    target: "nextjs",
    status: "drop-in",
    replacement: "Native Sass support (.module.scss)",
    reason: "Next.js natively supports Sass modules without custom configuration.",
  },
  {
    packagePattern: /^sass$/i,
    category: "styling",
    target: "expo",
    status: "incompatible",
    replacement: "React Native StyleSheet",
    reason: "Sass compiles to CSS files which React Native does not execute.",
  },

  // 3. HTTP & Data Fetching
  {
    packagePattern: /^axios$/i,
    category: "http",
    target: "nextjs",
    status: "drop-in",
    replacement: "axios or native fetch() with Next.js caching",
    reason: "Axios works seamlessly in both server and client environments; native fetch() enables granular Next.js revalidation.",
  },
  {
    packagePattern: /^axios$/i,
    category: "http",
    target: "expo",
    status: "drop-in",
    replacement: "axios or native fetch()",
    reason: "Axios runs seamlessly on React Native mobile networking stack.",
  },
  {
    packagePattern: /^@?tanstack\/react-query$/i,
    category: "http",
    target: "nextjs",
    status: "drop-in",
    replacement: "@tanstack/react-query (QueryClientProvider + HydrationBoundary)",
    reason: "Fully supported in Next.js client components and SSR hydration.",
  },
  {
    packagePattern: /^@?tanstack\/react-query$/i,
    category: "http",
    target: "expo",
    status: "drop-in",
    replacement: "@tanstack/react-query",
    reason: "Fully compatible with React Native and mobile offline caching.",
  },
  {
    packagePattern: /^swr$/i,
    category: "http",
    target: "all",
    status: "drop-in",
    replacement: "swr",
    reason: "First-class support across Next.js and Expo platforms.",
  },

  // 4. State & Storage
  {
    packagePattern: /^localforage$/i,
    category: "state-storage",
    target: "nextjs",
    status: "shim-available",
    replacement: "Client-side indexedDB or js-cookie",
    reason: "localforage must only execute on the client side; use cookies for server-synchronized state.",
  },
  {
    packagePattern: /^localforage$/i,
    category: "state-storage",
    target: "expo",
    status: "shim-available",
    replacement: "@react-native-async-storage/async-storage",
    reason: "Mobile devices use native key-value storage via AsyncStorage.",
    recommendedPackages: ["@react-native-async-storage/async-storage"],
  },
  {
    packagePattern: /^(?:@reduxjs\/toolkit|redux|zustand|mobx)$/i,
    category: "state-storage",
    target: "all",
    status: "drop-in",
    replacement: "Same package (with client-only context where appropriate)",
    reason: "Pure JavaScript state stores operate reliably across Next.js and Expo.",
  },

  // 5. DOM & Web Utilities
  {
    packagePattern: /^react-helmet(?:-async)?$/i,
    category: "dom-web",
    target: "nextjs",
    status: "refactor-required",
    replacement: "Next.js Metadata API (export const metadata)",
    reason: "Next.js App Router manages `<head>` tags through built-in static or dynamic metadata exports.",
    codemodGuide: {
      title: "React Helmet to Next.js Metadata Export",
      before: `import { Helmet } from "react-helmet";

export default function Page() {
  return (
    <>
      <Helmet>
        <title>Dashboard</title>
        <meta name="description" content="User dashboard" />
      </Helmet>
      <h1>Dashboard</h1>
    </>
  );
}`,
      after: `import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "User dashboard",
};

export default function Page() {
  return <h1>Dashboard</h1>;
}`,
    },
  },
  {
    packagePattern: /^react-helmet(?:-async)?$/i,
    category: "dom-web",
    target: "expo",
    status: "refactor-required",
    replacement: "Expo Router <Stack.Screen options={{ title }} />",
    reason: "Mobile headers and title bars are configured via Expo Router navigation options.",
  },
  {
    packagePattern: /^web-vitals$/i,
    category: "dom-web",
    target: "nextjs",
    status: "refactor-required",
    replacement: "Next.js useReportWebVitals() hook",
    reason: "Next.js includes a native performance metric reporting hook in `next/navigation`.",
  },
  {
    packagePattern: /^web-vitals$/i,
    category: "dom-web",
    target: "expo",
    status: "incompatible",
    replacement: "Omit or use React Native Performance monitor",
    reason: "Core Web Vitals (LCP, FID, CLS) are browser-specific metrics not measured on native iOS/Android.",
  },
  {
    packagePattern: /^dompurify$/i,
    category: "dom-web",
    target: "nextjs",
    status: "shim-available",
    replacement: "isomorphic-dompurify",
    reason: "DOMPurify requires a browser window; isomorphic-dompurify adds JSDOM shims for SSR safety.",
    recommendedPackages: ["isomorphic-dompurify"],
  },
  {
    packagePattern: /^dompurify$/i,
    category: "dom-web",
    target: "expo",
    status: "incompatible",
    replacement: "Omit HTML sanitization; render native Text/View components",
    reason: "React Native does not parse or inject raw HTML strings into the UI tree.",
  },
  {
    packagePattern: /^moment$/i,
    category: "general",
    target: "all",
    status: "shim-available",
    replacement: "date-fns or native Intl.DateTimeFormat",
    reason: "Moment.js is in maintenance mode and adds 300KB+ overhead; date-fns is tree-shakeable and modular.",
    recommendedPackages: ["date-fns"],
  },

  // 6. Backend packages (when source is mixed)
  {
    packagePattern: /^(?:express|koa|fastify)$/i,
    category: "backend",
    target: "nextjs",
    status: "refactor-required",
    replacement: "Next.js App Router Route Handlers (app/api/**/route.ts)",
    reason: "Express server middleware should be migrated into Next.js standard Web Request/Response route handlers.",
  },
  {
    packagePattern: /^(?:express|koa|fastify)$/i,
    category: "backend",
    target: "expo",
    status: "incompatible",
    replacement: "Standalone backend API service",
    reason: "Expo mobile applications are client binaries that communicate with external remote APIs.",
  },
  {
    packagePattern: /^(?:mongoose|sequelize|typeorm|prisma|pg|mysql2?)$/i,
    category: "backend",
    target: "nextjs",
    status: "refactor-required",
    replacement: "Server Component database query or Server Action",
    reason: "Direct ORM / database drivers must run inside Server Components or Route Handlers, never client code.",
  },
  {
    packagePattern: /^(?:mongoose|sequelize|typeorm|prisma|pg|mysql2?)$/i,
    category: "backend",
    target: "expo",
    status: "incompatible",
    replacement: "Secure backend REST/GraphQL service",
    reason: "Mobile applications cannot open direct TCP database connections due to client credentials exposure.",
  },
];

const BROWSER_APIS = [
  {
    name: "localStorage",
    pattern: /\blocalStorage\.(?:getItem|setItem|removeItem|clear)\b/g,
    nextjsRec: "Wrap in 'use client' and check `typeof window !== 'undefined'`, or migrate to server-synced cookies.",
    expoRec: "Migrate to `@react-native-async-storage/async-storage` for asynchronous mobile key-value storage.",
    expoShim: "@react-native-async-storage/async-storage",
  },
  {
    name: "sessionStorage",
    pattern: /\bsessionStorage\.(?:getItem|setItem|removeItem|clear)\b/g,
    nextjsRec: "Ensure execution is within client components or check `typeof window !== 'undefined'`.",
    expoRec: "Migrate to in-memory React state, Zustand, or `@react-native-async-storage/async-storage`.",
    expoShim: "@react-native-async-storage/async-storage",
  },
  {
    name: "window",
    pattern: /\bwindow\.(?:location|navigator|innerWidth|innerHeight|addEventListener|scrollTo)\b/g,
    nextjsRec: "Access window inside `useEffect()` or guard with `if (typeof window !== 'undefined')`.",
    expoRec: "Use React Native `useWindowDimensions()`, `Platform`, or `Linking` APIs instead of window.",
  },
  {
    name: "document",
    pattern: /\bdocument\.(?:getElementById|querySelector|createElement|body|title)\b/g,
    nextjsRec: "Avoid direct DOM queries; refactor into React refs (`useRef`) and idiomatic component state.",
    expoRec: "React Native does not have a DOM document; use React refs and component trees.",
  },
  {
    name: "navigator.geolocation",
    pattern: /\bnavigator\.geolocation\b/g,
    nextjsRec: "Execute in client component with user permission prompt.",
    expoRec: "Replace with `expo-location` for native iOS & Android GPS services.",
    expoShim: "expo-location",
  },
  {
    name: "navigator.clipboard",
    pattern: /\bnavigator\.clipboard\b/g,
    nextjsRec: "Execute in client component on user click action.",
    expoRec: "Replace with `expo-clipboard` for native mobile clipboard integration.",
    expoShim: "expo-clipboard",
  },
];

/**
 * Analyzes package dependencies and source files against target framework requirements.
 */
export function analyzeDependencyCompatibility(
  dependencies: Record<string, string>,
  sourceFiles?: Array<{ path: string; content: string }>,
  target: MigrationTarget = "nextjs"
): DependencyAnalysisResult {
  const isExpo = target === "expo";
  const analyzed: AnalyzedDependency[] = [];
  const shimsToInstall = new Set<string>();

  for (const [depName, version] of Object.entries(dependencies)) {
    // Search recipes
    const matchingRecipes = RECIPES.filter((r) => {
      const matchPkg = typeof r.packagePattern === "string"
        ? r.packagePattern.toLowerCase() === depName.toLowerCase()
        : r.packagePattern.test(depName);
      if (!matchPkg) return false;
      return r.target === "all" || r.target === (isExpo ? "expo" : "nextjs");
    });

    if (matchingRecipes.length > 0) {
      const recipe = matchingRecipes[0];
      analyzed.push({
        name: depName,
        version,
        status: recipe.status,
        category: recipe.category,
        replacement: recipe.replacement,
        reason: recipe.reason,
        codemodGuide: recipe.codemodGuide,
        recommendedPackages: recipe.recommendedPackages,
      });

      if (recipe.recommendedPackages) {
        for (const pkg of recipe.recommendedPackages) {
          shimsToInstall.add(pkg);
        }
      }
    } else {
      // Default: If no adverse recipe matched, classify as drop-in or general
      analyzed.push({
        name: depName,
        version,
        status: "drop-in",
        category: "general",
        replacement: depName,
        reason: "No known architectural incompatibility with target runtime.",
      });
    }
  }

  // Scan source files for browser APIs
  const detectedApis: DetectedBrowserApi[] = [];
  if (sourceFiles && sourceFiles.length > 0) {
    for (const apiDef of BROWSER_APIS) {
      let count = 0;
      const matchingFiles: string[] = [];

      for (const file of sourceFiles) {
        // Reset regex state
        apiDef.pattern.lastIndex = 0;
        const matches = file.content.match(apiDef.pattern);
        if (matches && matches.length > 0) {
          count += matches.length;
          matchingFiles.push(file.path);
        }
      }

      if (count > 0) {
        detectedApis.push({
          api: apiDef.name,
          occurrences: count,
          files: matchingFiles,
          recommendation: isExpo ? apiDef.expoRec : apiDef.nextjsRec,
          shimPackage: isExpo ? apiDef.expoShim : undefined,
        });

        if (isExpo && apiDef.expoShim) {
          shimsToInstall.add(apiDef.expoShim);
        }
      }
    }
  }

  // Compute summary stats
  const total = analyzed.length;
  const dropIn = analyzed.filter((d) => d.status === "drop-in").length;
  const shimAvailable = analyzed.filter((d) => d.status === "shim-available").length;
  const refactorRequired = analyzed.filter((d) => d.status === "refactor-required").length;
  const incompatible = analyzed.filter((d) => d.status === "incompatible").length;

  // Compute score out of 100
  let score = 100;
  if (total > 0) {
    const penalty =
      (shimAvailable * 5 + refactorRequired * 15 + incompatible * 25) / total;
    score = Math.max(10, Math.round(100 - penalty));
  }

  // Additional penalty for browser API usage on mobile
  if (isExpo && detectedApis.length > 0) {
    score = Math.max(10, score - detectedApis.length * 4);
  }

  return {
    dependencies: analyzed,
    browserApis: detectedApis,
    compatibilityScore: score,
    summary: {
      total,
      dropIn,
      shimAvailable,
      refactorRequired,
      incompatible,
    },
    installShims: Array.from(shimsToInstall),
  };
}
