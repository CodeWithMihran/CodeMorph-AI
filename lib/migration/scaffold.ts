import type { GeneratedFile } from "./model";
import type { MigrationTarget } from "./plan";
import type { ValidationResult } from "./validation";
import type { ZipEntry } from "./zip";
import type { FeasibilityReport } from "@/lib/analysis/feasibility";

export interface ScaffoldConfig {
  styling?: "tailwind" | "css-modules" | "standard-css" | "nativewind";
  strictTypeScript?: boolean;
  includeCiWorkflow?: boolean;
  includeDockerfile?: boolean;
  renderingMode?: "server-components" | "client-components";
  packageManager?: "npm" | "pnpm" | "yarn" | "bun";
}

export const DEFAULT_SCAFFOLD_CONFIG: ScaffoldConfig = {
  styling: "tailwind",
  strictTypeScript: true,
  includeCiWorkflow: true,
  includeDockerfile: true,
  renderingMode: "server-components",
  packageManager: "npm",
};

export function scaffold(
  summary: string,
  goal: string,
  target: MigrationTarget = "nextjs",
  config?: Partial<ScaffoldConfig>
): ZipEntry[] {
  const resolvedConfig: ScaffoldConfig = {
    ...DEFAULT_SCAFFOLD_CONFIG,
    ...(config ?? {}),
  };
  const pm = resolvedConfig.packageManager ?? "npm";
  const isStrict = resolvedConfig.strictTypeScript !== false;

  if (target === "expo") {
    const isNativeWind = resolvedConfig.styling === "nativewind";
    const expoPackageJson = {
      name: "codemorph-migrated-app",
      version: "1.0.0",
      main: "expo-router/entry",
      scripts: {
        start: "expo start",
        android: "expo start --android",
        ios: "expo start --ios",
        web: "expo start --web",
      },
      dependencies: {
        expo: "~52.0.0",
        "expo-constants": "~17.0.0",
        "expo-linking": "~7.0.0",
        "expo-router": "~4.0.0",
        "expo-status-bar": "~2.0.0",
        react: "18.3.1",
        "react-native": "0.76.0",
        "react-native-safe-area-context": "4.12.0",
        "react-native-screens": "~4.4.0",
        ...(isNativeWind ? { nativewind: "^4.0.1", "react-native-reanimated": "~3.16.1" } : {}),
      },
      devDependencies: {
        "@types/react": "~18.3.12",
        typescript: "^5.3.3",
        ...(isNativeWind ? { tailwindcss: "^3.4.0" } : {}),
      },
    };

    const appJson = {
      expo: {
        name: "Migrated Mobile App",
        slug: "migrated-mobile-app",
        version: "1.0.0",
        orientation: "portrait",
        scheme: "codemorph",
        userInterfaceStyle: "automatic",
        newArchEnabled: true,
        plugins: ["expo-router"],
      },
    };

    const tsConfig = {
      extends: "expo/tsconfig.base",
      compilerOptions: {
        strict: isStrict,
        ...(isStrict ? {} : { noImplicitAny: false, strictNullChecks: false }),
        paths: {
          "@/*": ["./*"],
        },
      },
      include: ["**/*.ts", "**/*.tsx", ".expo/types/**/*.ts", "expo-env.d.ts"],
    };

    const rootLayout = [
      'import { Stack } from "expo-router";',
      'import { StatusBar } from "expo-status-bar";',
      ...(isNativeWind ? ['import "../global.css";'] : []),
      "",
      "export default function RootLayout() {",
      "  return (",
      "    <>",
      "      <Stack",
      "        screenOptions={{",
      '          headerStyle: { backgroundColor: "#0f172a" },',
      '          headerTintColor: "#ffffff",',
      '          headerTitleStyle: { fontWeight: "bold" },',
      "        }}",
      "      >",
      '        <Stack.Screen name="index" options={{ title: "Home" }} />',
      "      </Stack>",
      '      <StatusBar style="light" />',
      "    </>",
      "  );",
      "}",
      "",
    ].join("\n");

    const runCmd =
      pm === "pnpm" ? "pnpm dlx expo" : pm === "yarn" ? "yarn expo" : pm === "bun" ? "bunx expo" : "npx expo";
    const installCmd =
      pm === "pnpm" ? "pnpm install" : pm === "yarn" ? "yarn install" : pm === "bun" ? "bun install" : "npm install";

    const readme = [
      "# Migrated Expo mobile application",
      "",
      summary,
      "",
      "## Run locally",
      "",
      "```bash",
      installCmd,
      `${runCmd} start`,
      "```",
      "",
      "Scan the QR code with a matching Expo Go version on your device, or press `a` for Android Emulator, `i` for iOS Simulator, or `w` for Web. For production or custom native modules, run `npx expo prebuild` and `npx expo run:android` / `npx expo run:ios`.",
      "",
      "## Requested outcome",
      "",
      goal,
      "",
      "See MIGRATION-REPORT.md for what was generated and what remains unverified.",
      "",
    ].join("\n");

    const entries: ZipEntry[] = [
      { path: "package.json", content: `${JSON.stringify(expoPackageJson, null, 2)}\n` },
      { path: "app.json", content: `${JSON.stringify(appJson, null, 2)}\n` },
      { path: "tsconfig.json", content: `${JSON.stringify(tsConfig, null, 2)}\n` },
      { path: ".gitignore", content: "node_modules/\n.expo/\ndist/\nweb-build/\n*.tsbuildinfo\n" },
      { path: "app/_layout.tsx", content: rootLayout },
      { path: "README.md", content: readme },
    ];

    if (isNativeWind) {
      entries.push({
        path: "global.css",
        content: "@tailwind base;\n@tailwind components;\n@tailwind utilities;\n",
      });
    }

    if (resolvedConfig.includeCiWorkflow) {
      const ciYaml = [
        "name: Mobile CI",
        "",
        "on:",
        "  push:",
        "    branches: [main, master]",
        "  pull_request:",
        "    branches: [main, master]",
        "",
        "jobs:",
        "  verify:",
        "    runs-on: ubuntu-latest",
        "    steps:",
        "      - name: Checkout repository",
        "        uses: actions/checkout@v4",
        "",
        "      - name: Setup Node.js",
        "        uses: actions/setup-node@v4",
        "        with:",
        "          node-version: 20",
        `          cache: ${pm === "yarn" ? "yarn" : pm === "pnpm" ? "pnpm" : "npm"}`,
        "",
        `      - name: Install dependencies`,
        `        run: ${installCmd}`,
        "",
        "      - name: Typecheck TypeScript",
        "        run: npx tsc --noEmit",
        "",
      ].join("\n");
      entries.push({ path: ".github/workflows/ci.yml", content: ciYaml });
    }

    if (resolvedConfig.includeDockerfile) {
      const easJson = {
        cli: {
          version: ">= 12.0.0",
        },
        build: {
          development: {
            developmentClient: true,
            distribution: "internal",
          },
          preview: {
            distribution: "internal",
          },
          production: {
            autoIncrement: true,
          },
        },
        submit: {
          production: {},
        },
      };
      entries.push({
        path: "eas.json",
        content: `${JSON.stringify(easJson, null, 2)}\n`,
      });
    }

    return entries;
  }

  // Target: Next.js
  const isTailwind = resolvedConfig.styling === "tailwind" || !resolvedConfig.styling;
  const isClientComponents = resolvedConfig.renderingMode === "client-components";
  const packageJson = {
    name: "codemorph-migrated-site",
    version: "0.1.0",
    private: true,
    scripts: { dev: "next dev", build: "next build", start: "next start" },
    dependencies: { next: "16.4.3", react: "19.3.0", "react-dom": "19.3.0" },
    devDependencies: {
      "@types/node": "^20",
      "@types/react": "^19",
      "@types/react-dom": "^19",
      typescript: "^5",
      ...(isTailwind ? { tailwindcss: "^4", "@tailwindcss/postcss": "^4" } : {}),
    },
  };

  const tsConfig = {
    compilerOptions: {
      target: "ES2017",
      lib: ["dom", "dom.iterable", "esnext"],
      allowJs: true,
      skipLibCheck: true,
      strict: isStrict,
      ...(isStrict ? {} : { noImplicitAny: false, strictNullChecks: false }),
      noEmit: true,
      esModuleInterop: true,
      module: "esnext",
      moduleResolution: "bundler",
      resolveJsonModule: true,
      isolatedModules: true,
      jsx: "react-jsx",
      incremental: true,
      plugins: [{ name: "next" }],
      paths: { "@/*": ["./*"] },
    },
    include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts", ".next/dev/types/**/*.ts", "**/*.mts"],
    exclude: ["node_modules"],
  };

  const nextConfigContent = resolvedConfig.includeDockerfile
    ? 'import type { NextConfig } from "next";\n\nconst nextConfig: NextConfig = {\n  output: "standalone",\n};\n\nexport default nextConfig;\n'
    : 'import type { NextConfig } from "next";\n\nconst nextConfig: NextConfig = {};\n\nexport default nextConfig;\n';

  const rootLayout = isClientComponents
    ? `"use client";

import type { ReactNode } from "react";
import "./globals.css";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <title>Migrated Website</title>
        <meta name="description" content="A website migration generated with CodeMorph AI." />
      </head>
      <body>{children}</body>
    </html>
  );
}
`
    : `import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = { title: "Migrated Website", description: "A website migration generated with CodeMorph AI." };

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
`;

  const installCmd =
    pm === "pnpm" ? "pnpm install" : pm === "yarn" ? "yarn install" : pm === "bun" ? "bun install" : "npm install";
  const devCmd =
    pm === "pnpm" ? "pnpm dev" : pm === "yarn" ? "yarn dev" : pm === "bun" ? "bun run dev" : "npm run dev";

  const readme = [
    "# Migrated website",
    "",
    summary,
    "",
    "## Run locally",
    "",
    "```bash",
    installCmd,
    devCmd,
    "```",
    "",
    "## Requested outcome",
    "",
    goal,
    "",
    "See MIGRATION-REPORT.md for what was generated and what remains unverified.",
    "",
  ].join("\n");

  const entries: ZipEntry[] = [
    { path: "package.json", content: `${JSON.stringify(packageJson, null, 2)}\n` },
    { path: "tsconfig.json", content: `${JSON.stringify(tsConfig, null, 2)}\n` },
    { path: "next.config.ts", content: nextConfigContent },
    { path: ".gitignore", content: "node_modules\n.next\n/out\n/build\n.env*\n*.tsbuildinfo\nnext-env.d.ts\n" },
    { path: "app/layout.tsx", content: rootLayout },
    { path: "README.md", content: readme },
  ];

  if (resolvedConfig.includeCiWorkflow) {
    const ciYaml = [
      "name: Next.js CI",
      "",
      "on:",
      "  push:",
      "    branches: [main, master]",
      "  pull_request:",
      "    branches: [main, master]",
      "",
      "jobs:",
      "  build-and-verify:",
      "    runs-on: ubuntu-latest",
      "    steps:",
      "      - name: Checkout repository",
      "        uses: actions/checkout@v4",
      "",
      "      - name: Setup Node.js",
      "        uses: actions/setup-node@v4",
      "        with:",
      "          node-version: 20",
      `          cache: ${pm === "yarn" ? "yarn" : pm === "pnpm" ? "pnpm" : "npm"}`,
      "",
      `      - name: Install dependencies`,
      `        run: ${installCmd}`,
      "",
      "      - name: Build Next.js application",
      "        run: npm run build",
      "",
    ].join("\n");
    entries.push({ path: ".github/workflows/ci.yml", content: ciYaml });
  }

  if (resolvedConfig.includeDockerfile) {
    const dockerfile = [
      "FROM node:20-alpine AS base",
      "",
      "FROM base AS deps",
      "RUN apk add --no-cache libc6-compat",
      "WORKDIR /app",
      "COPY package.json package-lock.json* yarn.lock* pnpm-lock.yaml* ./",
      "RUN npm ci",
      "",
      "FROM base AS builder",
      "WORKDIR /app",
      "COPY --from=deps /app/node_modules ./node_modules",
      "COPY . .",
      "ENV NEXT_TELEMETRY_DISABLED=1",
      "RUN npm run build",
      "",
      "FROM base AS runner",
      "WORKDIR /app",
      "ENV NODE_ENV=production",
      "ENV NEXT_TELEMETRY_DISABLED=1",
      "RUN addgroup --system --gid 1001 nodejs",
      "RUN adduser --system --uid 1001 nextjs",
      "COPY --from=builder /app/public ./public",
      "COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./",
      "COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static",
      "USER nextjs",
      "EXPOSE 3000",
      'ENV PORT=3000',
      'ENV HOSTNAME="0.0.0.0"',
      'CMD ["node", "server.js"]',
      "",
    ].join("\n");

    const dockerignore = [
      "Dockerfile",
      ".dockerignore",
      "node_modules",
      "npm-debug.log",
      "README.md",
      ".next",
      ".git",
      ".github",
      "",
    ].join("\n");

    entries.push(
      { path: "Dockerfile", content: dockerfile },
      { path: ".dockerignore", content: dockerignore }
    );
  }

  return entries;
}

export function migrationReport(input: {
  repository: string;
  commitSha: string;
  goal: string;
  summary: string;
  limitations: string[];
  sourceFileCount: number;
  excludedFileCount: number;
  generatedFiles: GeneratedFile[];
  validation: ValidationResult;
  manualRoutes: { pattern: string; reason: string }[];
  memoryRulesUsed: number;
  memoryRulesSaved: number;
  target?: MigrationTarget;
  feasibility?: FeasibilityReport;
  scaffoldConfig?: ScaffoldConfig;
}) {
  const isExpo = input.target === "expo";
  const targetLabel = isExpo ? "Expo Router (React Native) + TypeScript" : "Next.js App Router + TypeScript";
  const files = input.generatedFiles.map((file) => `- \`${file.path}\``).join("\n");
  const limitations = input.limitations.slice(0, 8).map((item) => `- ${item.replace(/[\r\n]/g, " ").slice(0, 300)}`).join("\n");
  const diagnostics = input.validation.diagnostics.map((line) => `- ${line}`).join("\n") || "- No worker diagnostics were returned.";
  const routeChecks = input.validation.routeChecks.map((route) => `- \`${route.path}\`: ${route.status}`).join("\n") || "- No route checks were requested.";
  const manualRoutes = input.manualRoutes.map((route) => `- \`${route.pattern}\`: ${route.reason}`).join("\n") || "- No dynamic or wildcard routes were detected.";
  const readiness = input.validation.status === "passed" ? "VERIFIED" : "UNVERIFIED — isolated build and route checks did not run.";

  const scaffoldSection = input.scaffoldConfig
    ? `\n## Scaffold Configuration\n\n- Styling Strategy: ${input.scaffoldConfig.styling ?? "tailwind"}\n- TypeScript Compiler: ${input.scaffoldConfig.strictTypeScript !== false ? "Strict Mode (strict: true)" : "Permissive Mode"}\n- CI/CD Automation: ${input.scaffoldConfig.includeCiWorkflow !== false ? "Enabled (.github/workflows/ci.yml)" : "Omitted"}\n- Containerization: ${input.scaffoldConfig.includeDockerfile !== false ? (isExpo ? "EAS Build Profile (eas.json)" : "Production Dockerfile") : "Omitted"}\n- Package Manager: ${input.scaffoldConfig.packageManager ?? "npm"}\n- Rendering Preference: ${input.scaffoldConfig.renderingMode ?? "server-components"}\n`
    : "";

  const feasibilitySection = input.feasibility
    ? `\n## Feasibility & Health Score\n\n- Overall Score: ${input.feasibility.score}% (${input.feasibility.tier.toUpperCase()})\n- Route Portability: ${input.feasibility.dimensions.routes.score}% — ${input.feasibility.dimensions.routes.detail}\n- Component Portability: ${input.feasibility.dimensions.components.score}% — ${input.feasibility.dimensions.components.detail}\n- Dependency Compatibility: ${input.feasibility.dimensions.dependencies.score}% — ${input.feasibility.dimensions.dependencies.detail}\n- Structural Integrity: ${input.feasibility.dimensions.structure.score}% — ${input.feasibility.dimensions.structure.detail}\n${input.feasibility.breakdown.risks.length > 0 ? `\n### Potential Risks / Manual Refactoring Needed\n\n${input.feasibility.breakdown.risks.map((r) => `- ${r}`).join("\n")}\n` : ""}`
    : "";

  return `# CodeMorph AI migration report\n\n- Readiness: ${readiness}\n- Source: ${input.repository}\n- Source commit: \`${input.commitSha}\`\n- Target: ${targetLabel}\n- Source files provided to the model: ${input.sourceFileCount}\n- Additional eligible source files omitted by inspection limits: ${input.excludedFileCount}\n- Promoted procedural rules applied: ${input.memoryRulesUsed}\n- New rule candidates queued after verified repair: ${input.memoryRulesSaved}\n- Validation status: ${input.validation.status}\n- Production build: ${input.validation.build}\n- Root route check: ${input.validation.rootRoute}\n- Validation duration: ${input.validation.durationMs} ms\n${scaffoldSection}${feasibilitySection}\n## Requested outcome\n\n${input.goal}\n\n## Generation summary\n\n${input.summary.replace(/[\r\n]/g, " ").slice(0, 500)}\n\n## Generated files\n\n${files}\n\n## Validation result\n\n${input.validation.message}\n\n### Expected route checks\n\n${routeChecks}\n\n### Source routes needing manual migration\n\n${manualRoutes}\n\n### Bounded diagnostics\n\n${diagnostics}\n\n## Limitations and manual work\n\n${limitations || "- Review the generated project and validation report before relying on it."}\n- Binary assets were not copied in this phase.\n- Build and route checks do not prove full feature parity or accessibility.\n- Check forms, touch gestures, mobile responsiveness, and external service setup manually.\n`;
}

export function repairContext(files: GeneratedFile[], diagnostics: string[], target: MigrationTarget = "nextjs") {
  const detail = diagnostics.join("\n").replace(/\\/g, "/").slice(0, 6_000);
  const mentioned = files.filter((file) => detail.includes(file.path));
  const baselinePaths = target === "expo" ? ["app/index.tsx"] : ["app/page.tsx", "app/globals.css"];
  const baseline = files.filter((file) => baselinePaths.includes(file.path));
  const selected = [...new Map([...baseline, ...mentioned].map((file) => [file.path, file])).values()];
  const previousFiles: GeneratedFile[] = [];
  let bytes = 0;
  for (const file of selected) {
    const content = file.content.slice(0, 16_000);
    const size = Buffer.byteLength(content, "utf8");
    if (bytes + size > 72_000) continue;
    previousFiles.push({ path: file.path, content });
    bytes += size;
  }
  return { diagnostics: diagnostics.slice(-20).map((line) => line.slice(0, 500)), previousFiles };
}
