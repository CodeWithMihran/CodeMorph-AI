/**
 * Universal Cross-Platform Target Synchronizer & Transpiler Engine
 * Synthesizes cross-platform twins between Next.js App Router (Web) and Expo Router (React Native Mobile),
 * mapping JSX primitives, navigation paradigms, event handlers, and universal monorepo bundling.
 * Pure TypeScript, client-safe with zero host execution.
 */

import type { ZipEntry } from "@/lib/migration/zip";

export type PlatformTarget = "nextjs" | "expo";

export interface SynchronizedFilePair {
  sourcePath: string;
  targetPath: string;
  sourcePlatform: PlatformTarget;
  targetPlatform: PlatformTarget;
  sourceContent: string;
  targetContent: string;
  mappedPrimitivesCount: number;
  appliedTransforms: string[];
}

export interface UniversalSyncResult {
  sourcePlatform: PlatformTarget;
  targetPlatform: PlatformTarget;
  filePairs: SynchronizedFilePair[];
  targetEntries: ZipEntry[];
  universalMonorepoEntries: ZipEntry[];
  totalMappedPrimitives: number;
  summary: string;
}

/**
 * Transpiles Next.js Web JSX elements into React Native / Expo primitives
 */
export function transpileWebCodeToExpo(code: string): { transpiled: string; mappedCount: number; transforms: string[] } {
  let mappedCount = 0;
  const transforms: string[] = [];
  let result = code;

  // 1. Remove "use client" directive (Expo/React Native runs natively on client)
  if (/^\s*["']use client["'];?\r?\n\r?\n?/.test(result)) {
    result = result.replace(/^\s*["']use client["'];?\r?\n\r?\n?/, "");
    transforms.push("Removed 'use client' directive (native client runtime)");
  }

  // 2. Map HTML layout elements to <View>
  const layoutTags = ["div", "section", "article", "header", "footer", "main", "aside", "nav"];
  for (const tag of layoutTags) {
    const openRegex = new RegExp(`<${tag}(\\s+[^>]*|)>`, "g");
    const closeRegex = new RegExp(`</${tag}>`, "g");

    if (openRegex.test(result)) {
      result = result.replace(openRegex, "<View$1>");
      result = result.replace(closeRegex, "</View>");
      mappedCount++;
      transforms.push(`Mapped <${tag}> to <View>`);
    }
  }

  // 3. Map HTML text elements to <Text>
  const textTags = ["p", "span", "h1", "h2", "h3", "h4", "h5", "h6", "label", "b", "strong", "i", "em", "small"];
  for (const tag of textTags) {
    const openRegex = new RegExp(`<${tag}(\\s+[^>]*|)>`, "g");
    const closeRegex = new RegExp(`</${tag}>`, "g");

    if (openRegex.test(result)) {
      result = result.replace(openRegex, "<Text$1>");
      result = result.replace(closeRegex, "</Text>");
      mappedCount++;
      transforms.push(`Mapped <${tag}> to <Text>`);
    }
  }

  // 4. Map <button onClick={...}> to <Pressable onPress={...}>
  if (/<button(\s+[^>]*|)>/.test(result)) {
    result = result.replace(/<button(\s+[^>]*|)>/g, "<Pressable$1>");
    result = result.replace(/<\/button>/g, "</Pressable>");
    result = result.replace(/\bonClick\s*=/g, "onPress=");
    mappedCount++;
    transforms.push("Mapped <button onClick> to <Pressable onPress>");
  }

  // 5. Map <input type="text"> to <TextInput>
  if (/<input\s+[^>]*\/?>/.test(result)) {
    result = result.replace(/<input(\s+[^>]*?)(\/?)>/g, (_m, attrs) => {
      let cleaned = attrs.replace(/\btype=["'][^"']*["']/g, "");
      cleaned = cleaned.replace(/\bonChange\s*=/g, "onChangeText=");
      cleaned = cleaned.replace(/\bvalue\s*=/g, "value=");
      return `<TextInput${cleaned} />`;
    });
    mappedCount++;
    transforms.push("Mapped <input> to <TextInput>");
  }

  // 6. Map next/image or <img> to Expo / React Native Image
  if (/<img\s+[^>]*\/?>/.test(result) || /from\s+["']next\/image["']/.test(result)) {
    result = result.replace(/from\s+["']next\/image["']/g, 'from "expo-image"');
    result = result.replace(/<img(\s+[^>]*?)(\/?)>/g, (_m, attrs) => {
      let cleaned = attrs.replace(/\bsrc=["']([^"']*)["']/g, 'source={{ uri: "$1" }}');
      cleaned = cleaned.replace(/\balt=["']([^"']*)["']/g, 'accessibilityLabel="$1"');
      return `<Image${cleaned} />`;
    });
    mappedCount++;
    transforms.push("Mapped <img> to <Image source={{ uri }}>");
  }

  // 7. Navigation: map next/link & next/navigation to expo-router
  if (/from\s+["']next\/link["']/.test(result) || /from\s+["']next\/navigation["']/.test(result)) {
    result = result.replace(/from\s+["']next\/link["']/g, 'from "expo-router"');
    result = result.replace(/from\s+["']next\/navigation["']/g, 'from "expo-router"');
    transforms.push("Mapped Next.js navigation imports to expo-router");
  }

  // 8. Collect required React Native primitive imports
  const rnImportsNeeded = new Set<string>();
  if (/\bView\b/.test(result)) rnImportsNeeded.add("View");
  if (/\bText\b/.test(result)) rnImportsNeeded.add("Text");
  if (/\bPressable\b/.test(result)) rnImportsNeeded.add("Pressable");
  if (/\bTextInput\b/.test(result)) rnImportsNeeded.add("TextInput");
  if (/\bStyleSheet\b/.test(result)) rnImportsNeeded.add("StyleSheet");
  if (/\bImage\b/.test(result) && !result.includes('from "expo-image"')) rnImportsNeeded.add("Image");

  if (rnImportsNeeded.size > 0 && !result.includes('from "react-native"')) {
    const importList = Array.from(rnImportsNeeded).join(", ");
    result = `import { ${importList} } from "react-native";\n${result}`;
  }

  return { transpiled: result, mappedCount, transforms };
}

/**
 * Transpiles Expo React Native JSX elements into Next.js Web primitives
 */
export function transpileExpoCodeToWeb(code: string): { transpiled: string; mappedCount: number; transforms: string[] } {
  let mappedCount = 0;
  const transforms: string[] = [];
  let result = code;

  // 1. Remove React Native imports
  if (/import\s*\{[^}]*\}\s*from\s*["']react-native["'];?\r?\n?/.test(result)) {
    result = result.replace(/import\s*\{[^}]*\}\s*from\s*["']react-native["'];?\r?\n?/, "");
    transforms.push("Removed 'react-native' primitive imports");
  }

  // 2. Map <View> to <div>
  if (/<View(\s+[^>]*|)>/.test(result)) {
    result = result.replace(/<View(\s+[^>]*|)>/g, "<div$1>");
    result = result.replace(/<\/View>/g, "</div>");
    mappedCount++;
    transforms.push("Mapped <View> to <div>");
  }

  // 3. Map <Text> to <p>
  if (/<Text(\s+[^>]*|)>/.test(result)) {
    result = result.replace(/<Text(\s+[^>]*|)>/g, "<p$1>");
    result = result.replace(/<\/Text>/g, "</p>");
    mappedCount++;
    transforms.push("Mapped <Text> to <p>");
  }

  // 4. Map <Pressable onPress={...}> to <button onClick={...}>
  if (/<Pressable(\s+[^>]*|)>/.test(result)) {
    result = result.replace(/<Pressable(\s+[^>]*|)>/g, "<button$1>");
    result = result.replace(/<\/Pressable>/g, "</button>");
    result = result.replace(/\bonPress\s*=/g, "onClick=");
    mappedCount++;
    transforms.push("Mapped <Pressable onPress> to <button onClick>");
  }

  // 5. Map <TextInput> to <input type="text">
  if (/<TextInput(\s+[^>]*|)\/?>/.test(result)) {
    result = result.replace(/<TextInput(\s+[^>]*?)(\/?)>/g, (_m, attrs) => {
      let cleaned = attrs.replace(/\bonChangeText\s*=/g, "onChange=");
      if (!cleaned.includes("type=")) cleaned = ` type="text"${cleaned}`;
      return `<input${cleaned} />`;
    });
    mappedCount++;
    transforms.push("Mapped <TextInput> to <input>");
  }

  // 6. Navigation: map expo-router to next/link & next/navigation
  if (/from\s+["']expo-router["']/.test(result)) {
    result = result.replace(/from\s+["']expo-router["']/g, 'from "next/link"');
    transforms.push("Mapped expo-router imports to Next.js navigation");
  }

  // 7. Inject "use client" if interactive hooks/handlers are used
  const hasHooks = /\b(useState|useEffect|useRef|useCallback|useRouter|usePathname)\b/.test(result);
  const hasHandlers = /\b(onClick|onChange|onSubmit)\s*=/.test(result);
  if ((hasHooks || hasHandlers) && !/^\s*["']use client["']/.test(result)) {
    result = `"use client";\n\n${result}`;
    transforms.push("Injected 'use client' directive for interactive web components");
  }

  return { transpiled: result, mappedCount, transforms };
}

/**
 * Maps a file path from Web (Next.js) convention to Mobile (Expo Router) convention
 */
function mapWebPathToExpo(path: string): string {
  if (path === "app/page.tsx") return "app/index.tsx";
  if (path === "app/page.jsx") return "app/index.jsx";
  if (path === "app/layout.tsx") return "app/_layout.tsx";
  if (path === "app/layout.jsx") return "app/_layout.jsx";

  // E.g. app/catalog/page.tsx -> app/catalog.tsx
  const subPageMatch = path.match(/^app\/(.+)\/page\.(tsx|jsx)$/);
  if (subPageMatch) {
    return `app/${subPageMatch[1]}.${subPageMatch[2]}`;
  }

  return path;
}

/**
 * Maps a file path from Mobile (Expo Router) convention to Web (Next.js App Router) convention
 */
function mapExpoPathToWeb(path: string): string {
  if (path === "app/index.tsx") return "app/page.tsx";
  if (path === "app/index.jsx") return "app/page.jsx";
  if (path === "app/_layout.tsx") return "app/layout.tsx";
  if (path === "app/_layout.jsx") return "app/layout.jsx";

  // E.g. app/catalog.tsx -> app/catalog/page.tsx
  const subRouteMatch = path.match(/^app\/([a-zA-Z0-9_-]+)\.(tsx|jsx)$/);
  if (subRouteMatch && subRouteMatch[1] !== "_layout" && subRouteMatch[1] !== "index") {
    return `app/${subRouteMatch[1]}/page.${subRouteMatch[2]}`;
  }

  return path;
}

/**
 * Synthesizes a standard Expo SDK 58 package.json & configuration for the mobile twin
 */
function generateExpoScaffoldEntries(): ZipEntry[] {
  return [
    {
      path: "package.json",
      content: JSON.stringify(
        {
          name: "codemorph-expo-twin",
          version: "1.0.0",
          main: "expo-router/entry",
          scripts: {
            start: "expo start",
            android: "expo run:android",
            ios: "expo run:ios",
            web: "expo start --web",
          },
          dependencies: {
            expo: "~58.0.0",
            "expo-constants": "~17.0.0",
            "expo-linking": "~7.0.0",
            "expo-router": "~4.0.0",
            "expo-status-bar": "~2.0.0",
            "expo-image": "~2.0.0",
            react: "19.3.0",
            "react-native": "0.88.0",
            "react-native-safe-area-context": "4.12.0",
            "react-native-screens": "~4.4.0",
            nativewind: "^4.0.1",
            "react-native-reanimated": "~4.7.1",
            "react-native-worklets": "~0.13.0",
          },
          devDependencies: {
            "@types/react": "~19.3.0",
            typescript: "^5.3.3",
            "babel-preset-expo": "~58.0.20",
            tailwindcss: "^3.4.17",
          },
        },
        null,
        2
      ) + "\n",
    },
    {
      path: "app.json",
      content: JSON.stringify(
        {
          expo: {
            name: "CodeMorph Mobile",
            slug: "codemorph-mobile",
            version: "1.0.0",
            orientation: "portrait",
            icon: "./assets/icon.png",
            userInterfaceStyle: "automatic",
            scheme: "codemorph",
            plugins: ["expo-router"],
            experiments: { typedRoutes: true },
          },
        },
        null,
        2
      ) + "\n",
    },
    {
      path: "app/_layout.tsx",
      content: [
        'import { Stack } from "expo-router";',
        'import { StatusBar } from "expo-status-bar";',
        'import "../global.css";',
        "",
        "export default function RootLayout() {",
        "  return (",
        "    <>",
        "      <StatusBar style=\"auto\" />",
        '      <Stack screenOptions={{ headerShown: true, headerBackTitle: "Back" }} />',
        "    </>",
        "  );",
        "}",
      ].join("\n") + "\n",
    },
    {
      path: "babel.config.js",
      content: [
        "module.exports = function (api) {",
        "  api.cache(true);",
        "  return {",
        '    presets: [["babel-preset-expo", { jsxImportSource: "nativewind" }], "nativewind/babel"],',
        "  };",
        "};",
        "",
      ].join("\n"),
    },
    {
      path: "metro.config.js",
      content: [
        'const { getDefaultConfig } = require("expo/metro-config");',
        'const { withNativeWind } = require("nativewind/metro");',
        "const config = getDefaultConfig(__dirname);",
        'module.exports = withNativeWind(config, { input: "./global.css" });',
        "",
      ].join("\n"),
    },
    {
      path: "tailwind.config.js",
      content: [
        "/** @type {import('tailwindcss').Config} */",
        "module.exports = {",
        '  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],',
        '  presets: [require("nativewind/preset")],',
        "  theme: { extend: {} },",
        "  plugins: [],",
        "};",
        "",
      ].join("\n"),
    },
    {
      path: "global.css",
      content: "@tailwind base;\n@tailwind components;\n@tailwind utilities;\n",
    },
  ];
}

/**
 * Synthesizes standard Next.js 15 App Router package.json & root layout for web twin
 */
function generateNextScaffoldEntries(): ZipEntry[] {
  return [
    {
      path: "package.json",
      content: JSON.stringify(
        {
          name: "codemorph-next-twin",
          version: "1.0.0",
          scripts: {
            dev: "next dev",
            build: "next build",
            start: "next start",
          },
          dependencies: {
            next: "^15.1.0",
            react: "^19.0.0",
            "react-dom": "^19.0.0",
          },
          devDependencies: {
            "@types/node": "^22.0.0",
            "@types/react": "^19.0.0",
            "@types/react-dom": "^19.0.0",
            typescript: "^5.3.3",
            tailwindcss: "^3.4.1",
            postcss: "^8.4.35",
            autoprefixer: "^10.4.18",
          },
        },
        null,
        2
      ) + "\n",
    },
    {
      path: "app/layout.tsx",
      content: [
        'import React from "react";',
        'import "./globals.css";',
        "",
        "export const metadata = {",
        '  title: "CodeMorph Modernized Web Application",',
        '  description: "Synthesized Next.js App Router universal twin",',
        "};",
        "",
        "export default function RootLayout({ children }: { children: React.ReactNode }) {",
        "  return (",
        '    <html lang="en">',
        "      <body>{children}</body>",
        "    </html>",
        "  );",
        "}",
      ].join("\n") + "\n",
    },
    {
      path: "app/globals.css",
      content: "@tailwind base;\n@tailwind components;\n@tailwind utilities;\n",
    },
  ];
}

/**
 * Synchronizes and transpiles an active project into its universal cross-platform twin
 */
export function synchronizeCrossPlatformTwin(
  entries: ZipEntry[],
  currentPlatform: PlatformTarget = "nextjs"
): UniversalSyncResult {
  const targetPlatform: PlatformTarget = currentPlatform === "nextjs" ? "expo" : "nextjs";
  const filePairs: SynchronizedFilePair[] = [];
  const targetEntries: ZipEntry[] = [];
  let totalMappedPrimitives = 0;

  // Process code files
  for (const entry of entries) {
    if (entry.path.startsWith(".codemorph/")) continue;

    // Handle TSX/JSX component and route files
    if (entry.path.endsWith(".tsx") || entry.path.endsWith(".jsx")) {
      const isWebToMobile = currentPlatform === "nextjs";
      const targetPath = isWebToMobile ? mapWebPathToExpo(entry.path) : mapExpoPathToWeb(entry.path);

      const { transpiled, mappedCount, transforms } = isWebToMobile
        ? transpileWebCodeToExpo(entry.content)
        : transpileExpoCodeToWeb(entry.content);

      totalMappedPrimitives += mappedCount;

      const pair: SynchronizedFilePair = {
        sourcePath: entry.path,
        targetPath,
        sourcePlatform: currentPlatform,
        targetPlatform,
        sourceContent: entry.content,
        targetContent: transpiled,
        mappedPrimitivesCount: mappedCount,
        appliedTransforms: transforms,
      };

      filePairs.push(pair);
      targetEntries.push({ path: targetPath, content: transpiled });
    } else if (
      entry.path.endsWith(".ts") ||
      entry.path.endsWith(".js") ||
      entry.path.endsWith(".json") ||
      entry.path.endsWith(".css") ||
      entry.path.endsWith(".md")
    ) {
      // Retain non-JSX helper files unless they are platform-specific configs
      if (
        entry.path !== "package.json" &&
        entry.path !== "app.json" &&
        entry.path !== "next.config.ts" &&
        entry.path !== "next.config.js" &&
        entry.path !== "metro.config.js" &&
        entry.path !== "babel.config.js"
      ) {
        targetEntries.push({ path: entry.path, content: entry.content });
      }
    }
  }

  // Inject target platform scaffold files
  const scaffoldEntries = targetPlatform === "expo" ? generateExpoScaffoldEntries() : generateNextScaffoldEntries();
  for (const sc of scaffoldEntries) {
    if (!targetEntries.some((e) => e.path === sc.path)) {
      targetEntries.push(sc);
    }
  }

  // Synthesize Universal Monorepo Entries (apps/web + apps/mobile + packages/shared)
  const universalMonorepoEntries: ZipEntry[] = [];

  // Root Monorepo package.json
  universalMonorepoEntries.push({
    path: "package.json",
    content: JSON.stringify(
      {
        name: "codemorph-universal-monorepo",
        private: true,
        workspaces: ["apps/*"],
        scripts: {
          "dev:web": "npm --workspace=apps/web run dev",
          "dev:mobile": "npm --workspace=apps/mobile start",
          build: "npm --workspace=apps/web run build",
        },
      },
      null,
      2
    ) + "\n",
  });

  universalMonorepoEntries.push({
    path: "README.md",
    content: [
      "# 🌐 CodeMorph AI Universal Monorepo",
      "",
      "This monorepo was automatically synchronized and packaged by **CodeMorph AI**, containing both a production Next.js 15 App Router web application and an Expo SDK 58 mobile twin.",
      "",
      "## Workspace Layout",
      "- `apps/web`: Next.js 15 App Router (TypeScript, Tailwind)",
      "- `apps/mobile`: Expo SDK 58 React Native Router (NativeWind, Metro)",
      "",
      "## Getting Started",
      "```bash",
      "# Install monorepo dependencies",
      "npm install",
      "",
      "# Run web application",
      "npm run dev:web",
      "",
      "# Run mobile application",
      "npm run dev:mobile",
      "```",
    ].join("\n") + "\n",
  });

  // Package web files under apps/web
  const webFiles = currentPlatform === "nextjs" ? entries : targetEntries;
  for (const w of webFiles) {
    if (!w.path.startsWith(".codemorph/")) {
      universalMonorepoEntries.push({
        path: `apps/web/${w.path}`,
        content: w.content,
      });
    }
  }

  // Package mobile files under apps/mobile
  const mobileFiles = currentPlatform === "expo" ? entries : targetEntries;
  for (const m of mobileFiles) {
    if (!m.path.startsWith(".codemorph/")) {
      universalMonorepoEntries.push({
        path: `apps/mobile/${m.path}`,
        content: m.content,
      });
    }
  }

  const summary = `Synchronized ${filePairs.length} files from ${currentPlatform} to ${targetPlatform} with ${totalMappedPrimitives} mapped JSX primitives and generated universal monorepo bundle.`;

  return {
    sourcePlatform: currentPlatform,
    targetPlatform,
    filePairs,
    targetEntries,
    universalMonorepoEntries,
    totalMappedPrimitives,
    summary,
  };
}
