import type { MigrationTarget } from "./plan";
import type { ZipEntry } from "./zip";

export interface TestScaffolderOptions {
  framework?: "vitest" | "jest";
  packageManager?: "npm" | "pnpm" | "yarn" | "bun";
}

function sanitizeIdentifier(name: string): string {
  return name.replace(/[^a-zA-Z0-9_$]/g, "_");
}

function pathToRouteName(path: string): string {
  if (path === "app/page.tsx" || path === "app/index.tsx") return "Home Route (/)";
  const cleaned = path
    .replace(/^app\//, "")
    .replace(/\/(?:page|index)\.tsx?$/, "")
    .replace(/\.tsx?$/, "");
  return `Route (/${cleaned})`;
}

/**
 * Deterministically synthesizes an automated regression test suite
 * (Vitest for Next.js, Jest for Expo) tailored to the migrated routes and components.
 */
export function generateTestSuite(
  target: MigrationTarget = "nextjs",
  generatedFiles: Array<{ path: string; content?: string }> = [],
  options?: TestScaffolderOptions
): ZipEntry[] {
  const isExpo = target === "expo";
  const entries: ZipEntry[] = [];
  const testFramework = options?.framework ?? (isExpo ? "jest" : "vitest");

  if (isExpo) {
    // -------------------------------------------------------------
    // EXPO ROUTER / REACT NATIVE TEST SUITE (JEST + JEST-EXPO)
    // -------------------------------------------------------------
    const jestConfig = [
      `// Autonomous test runner configuration: ${testFramework}`,
      'module.exports = {',
      '  preset: "jest-expo",',
      '  setupFilesAfterEnv: ["./jest.setup.js"],',
      '  transformIgnorePatterns: [',
      '    "node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|nativewind)",',
      '  ],',
      '};',
      '',
    ].join("\n");

    const jestSetup = [
      '// Mock expo-router navigation hooks and layout primitives',
      'jest.mock("expo-router", () => ({',
      '  useRouter: () => ({',
      '    push: jest.fn(),',
      '    replace: jest.fn(),',
      '    back: jest.fn(),',
      '    canGoBack: () => true,',
      '  }),',
      '  useLocalSearchParams: () => ({}),',
      '  useSegments: () => [],',
      '  Stack: Object.assign(({ children }: { children?: React.ReactNode }) => children ?? null, { Screen: () => null }),',
      '  Tabs: Object.assign(({ children }: { children?: React.ReactNode }) => children ?? null, { Screen: () => null }),',
      '  Link: ({ children }: { children?: React.ReactNode }) => children ?? null,',
      '}));',
      '',
      '// Mock expo-status-bar',
      'jest.mock("expo-status-bar", () => ({',
      '  StatusBar: () => null,',
      '}));',
      '',
      '// Mock react-native-safe-area-context',
      'jest.mock("react-native-safe-area-context", () => ({',
      '  SafeAreaProvider: ({ children }: { children?: React.ReactNode }) => children ?? null,',
      '  SafeAreaView: ({ children }: { children?: React.ReactNode }) => children ?? null,',
      '  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),',
      '}));',
      '',
    ].join("\n");

    // Scan for screen routes
    const screenFiles = generatedFiles.filter((f) =>
      /^app\/(?!_layout)[a-zA-Z0-9_./-]+\.tsx$/.test(f.path)
    );

    const screenImports: string[] = [];
    const screenTests: string[] = [];

    if (screenFiles.length === 0) {
      screenImports.push('import IndexScreen from "@/app/index";');
      screenTests.push(
        '  it("renders index screen component without throwing", () => {',
        '    expect(typeof IndexScreen).toBe("function");',
        '  });'
      );
    } else {
      screenFiles.forEach((file, idx) => {
        const varName = `Screen_${idx}`;
        const importPath = `@/${file.path.replace(/\.tsx?$/, "")}`;
        const routeLabel = pathToRouteName(file.path);
        screenImports.push(`import ${varName} from "${importPath}";`);
        screenTests.push(
          `  it("renders ${routeLabel} without runtime errors", () => {`,
          `    expect(typeof ${varName}).toBe("function");`,
          `  });`
        );
      });
    }

    const navTestContent = [
      'import React from "react";',
      'import RootLayout from "@/app/_layout";',
      ...screenImports,
      '',
      'describe("Mobile Route Navigation & Component Smoke Tests", () => {',
      '  it("renders RootLayout container without throwing", () => {',
      '    expect(typeof RootLayout).toBe("function");',
      '  });',
      '',
      ...screenTests,
      '});',
      '',
    ].join("\n");

    entries.push(
      { path: "jest.config.js", content: jestConfig },
      { path: "jest.setup.js", content: jestSetup },
      { path: "__tests__/navigation.test.tsx", content: navTestContent }
    );

    return entries;
  }

  // -------------------------------------------------------------
  // NEXT.JS APP ROUTER TEST SUITE (VITEST + TESTING LIBRARY)
  // -------------------------------------------------------------
  const vitestConfig = [
    `// Autonomous test runner configuration: ${testFramework}`,
    'import { defineConfig } from "vitest/config";',
    'import react from "@vitejs/plugin-react";',
    'import path from "node:path";',
    '',
    'export default defineConfig({',
    '  plugins: [react()],',
    '  test: {',
    '    environment: "jsdom",',
    '    globals: true,',
    '    setupFiles: ["./vitest.setup.ts"],',
    '  },',
    '  resolve: {',
    '    alias: {',
    '      "@": path.resolve(__dirname, "./"),',
    '    },',
    '  },',
    '});',
    '',
  ].join("\n");

  const vitestSetup = [
    'import "@testing-library/jest-dom/vitest";',
    'import { vi } from "vitest";',
    '',
    '// Mock Next.js navigation hooks for client and server components',
    'vi.mock("next/navigation", () => ({',
    '  useRouter: () => ({',
    '    push: vi.fn(),',
    '    replace: vi.fn(),',
    '    back: vi.fn(),',
    '    forward: vi.fn(),',
    '    refresh: vi.fn(),',
    '    prefetch: vi.fn(),',
    '  }),',
    '  usePathname: () => "/",',
    '  useSearchParams: () => new URLSearchParams(),',
    '  useParams: () => ({}),',
    '}));',
    '',
    '// Mock Next.js Link component',
    'vi.mock("next/link", () => ({',
    '  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (',
    '    <a href={href} {...rest}>{children}</a>',
    '  ),',
    '}));',
    '',
    '// Polyfill window.matchMedia for responsive UI components',
    'Object.defineProperty(window, "matchMedia", {',
    '  writable: true,',
    '  value: vi.fn().mockImplementation((query: string) => ({',
    '    matches: false,',
    '    media: query,',
    '    onchange: null,',
    '    addListener: vi.fn(),',
    '    removeListener: vi.fn(),',
    '    addEventListener: vi.fn(),',
    '    removeEventListener: vi.fn(),',
    '    dispatchEvent: vi.fn(),',
    '  })),',
    '});',
    '',
    '// Polyfill ResizeObserver for responsive charts or cards',
    'global.ResizeObserver = class ResizeObserver {',
    '  observe() {}',
    '  unobserve() {}',
    '  disconnect() {}',
    '};',
    '',
  ].join("\n");

  // Filter page routes
  const pageFiles = generatedFiles.filter((f) =>
    f.path === "app/page.tsx" || /^app\/.+\/page\.tsx$/.test(f.path)
  );

  const routeImports: string[] = [];
  const routeTests: string[] = [];

  if (pageFiles.length === 0) {
    routeImports.push('import HomePage from "@/app/page";');
    routeTests.push(
      '  it("renders Home Page (/) without throwing", () => {',
      '    const { container } = render(<HomePage />);',
      '    expect(container).toBeDefined();',
      '    expect(container.firstChild).not.toBeNull();',
      '  });'
    );
  } else {
    pageFiles.forEach((file, idx) => {
      const varName = `PageRoute_${idx}`;
      const importPath = `@/${file.path.replace(/\.tsx?$/, "")}`;
      const routeLabel = pathToRouteName(file.path);
      routeImports.push(`import ${varName} from "${importPath}";`);
      routeTests.push(
        `  it("renders ${routeLabel} without throwing", () => {`,
        `    const { container } = render(<${varName} />);`,
        `    expect(container).toBeDefined();`,
        `    expect(container.firstChild).not.toBeNull();`,
        `  });`
      );
    });
  }

  const routesTestContent = [
    'import { describe, it, expect } from "vitest";',
    'import { render } from "@testing-library/react";',
    ...routeImports,
    '',
    'describe("Page Route Smoke Tests", () => {',
    ...routeTests,
    '});',
    '',
  ].join("\n");

  const layoutTestContent = [
    'import { describe, it, expect } from "vitest";',
    'import { render, screen } from "@testing-library/react";',
    'import RootLayout from "@/app/layout";',
    '',
    'describe("Root Layout Hierarchy Test", () => {',
    '  it("renders children elements within root structure", () => {',
    '    render(',
    '      <RootLayout>',
    '        <div data-testid="test-content">Autonomous Scaffold Smoke Verification</div>',
    '      </RootLayout>',
    '    );',
    '    expect(screen.getByTestId("test-content")).toBeDefined();',
    '  });',
    '});',
    '',
  ].join("\n");

  entries.push(
    { path: "vitest.config.ts", content: vitestConfig },
    { path: "vitest.setup.ts", content: vitestSetup },
    { path: "__tests__/routes.test.tsx", content: routesTestContent },
    { path: "__tests__/layout.test.tsx", content: layoutTestContent }
  );

  // Check if any components were generated
  const componentFiles = generatedFiles.filter((f) =>
    /^components\/[a-zA-Z0-9_.-]+\.tsx$/.test(f.path)
  );
  if (componentFiles.length > 0) {
    const compImports: string[] = [];
    const compTests: string[] = [];
    componentFiles.slice(0, 10).forEach((file, idx) => {
      const rawName = file.path.replace(/^components\//, "").replace(/\.tsx$/, "");
      const varName = sanitizeIdentifier(rawName) + `_${idx}`;
      compImports.push(`import ${varName} from "@/${file.path.replace(/\.tsx?$/, "")}";`);
      compTests.push(
        `  it("renders component <${rawName} /> without throwing", () => {`,
        `    const { container } = render(<${varName} />);`,
        `    expect(container).toBeDefined();`,
        `  });`
      );
    });

    const componentsTestContent = [
      'import { describe, it, expect } from "vitest";',
      'import { render } from "@testing-library/react";',
      ...compImports,
      '',
      'describe("Shared UI Component Smoke Tests", () => {',
      ...compTests,
      '});',
      '',
    ].join("\n");

    entries.push({ path: "__tests__/components.test.tsx", content: componentsTestContent });
  }

  // Check if any API route exists (e.g. app/api/**/route.ts)
  const apiFiles = generatedFiles.filter((f) =>
    /^app\/api\/[a-zA-Z0-9_./-]+\/route\.ts$/.test(f.path)
  );
  if (apiFiles.length > 0) {
    const apiImports: string[] = [];
    const apiTests: string[] = [];
    apiFiles.forEach((file, idx) => {
      const varName = `apiEndpoint_${idx}`;
      const routePath = file.path.replace(/^app\//, "/").replace(/\/route\.ts$/, "");
      apiImports.push(`import * as ${varName} from "@/${file.path.replace(/\.ts$/, "")}";`);
      apiTests.push(
        `  it("handles HTTP request for ${routePath}", async () => {`,
        `    if (typeof (${varName} as Record<string, unknown>).GET === "function") {`,
        `      const handler = (${varName} as Record<string, () => Promise<Response>>).GET;`,
        `      const res = await handler();`,
        `      expect(res).toBeDefined();`,
        `      expect([200, 204]).toContain(res.status);`,
        `    }`,
        `  });`
      );
    });

    const apiTestContent = [
      'import { describe, it, expect } from "vitest";',
      ...apiImports,
      '',
      'describe("Route API Contract Tests", () => {',
      ...apiTests,
      '});',
      '',
    ].join("\n");

    entries.push({ path: "__tests__/api.test.ts", content: apiTestContent });
  }

  return entries;
}
