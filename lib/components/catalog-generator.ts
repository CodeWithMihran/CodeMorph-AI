/**
 * Component Discovery & Static Props Analyzer Engine
 * Discovers UI components across migrated projects, parses TypeScript props interfaces,
 * synthesizes mock props, renders interactive previews, and generates Storybook CSF 3 stories.
 * Pure TypeScript, client-safe with zero host execution.
 */

import type { ZipEntry } from "@/lib/migration/zip";

export type ComponentPropType =
  | "string"
  | "number"
  | "boolean"
  | "enum"
  | "function"
  | "object"
  | "node"
  | "unknown";

export interface ComponentPropDef {
  name: string;
  type: ComponentPropType;
  rawType: string;
  required: boolean;
  defaultValue?: unknown;
  enumValues?: string[];
  description?: string;
}

export interface DiscoveredComponent {
  id: string;
  name: string;
  filePath: string;
  isClientComponent: boolean;
  props: ComponentPropDef[];
  defaultMockProps: Record<string, unknown>;
  exportType: "default" | "named";
  sampleUsageCode: string;
  storybookStoryCode: string;
}

export interface CatalogSummary {
  totalComponents: number;
  clientComponentsCount: number;
  serverComponentsCount: number;
  components: DiscoveredComponent[];
  timestamp: string;
}

export interface StorybookInjectionResult {
  updatedEntries: ZipEntry[];
  generatedStoriesCount: number;
  injectedStoryPaths: string[];
}

/**
 * Checks if a file path is a reusable component rather than a route, layout, or config.
 */
function isComponentFilePath(path: string): boolean {
  if (!path.endsWith(".tsx") && !path.endsWith(".jsx")) return false;
  if (path.startsWith(".codemorph/")) return false;
  if (path.endsWith(".test.tsx") || path.endsWith(".spec.tsx") || path.endsWith(".stories.tsx")) return false;

  // Exclude root layouts and pages
  if (path === "app/layout.tsx" || path === "app/_layout.tsx") return false;
  if (path.endsWith("/layout.tsx") || path.endsWith("/layout.jsx")) return false;
  if (path.endsWith("/page.tsx") || path.endsWith("/page.jsx") || path === "app/page.tsx") return false;

  // Include components/ directory or any files in a components folder
  if (path.startsWith("components/") || path.includes("/components/")) return true;
  if (path.startsWith("src/components/")) return true;

  // Include capitalized TSX files (standard React component naming convention)
  const basename = path.split("/").pop() || "";
  const nameWithoutExt = basename.replace(/\.[^.]+$/, "");
  return /^[A-Z][A-Za-z0-9]+$/.test(nameWithoutExt);
}

/**
 * Parses type annotation into simplified ComponentPropType and enum options
 */
function parseTypeDetails(rawType: string): { type: ComponentPropType; enumValues?: string[] } {
  const clean = rawType.trim();

  // Check string literal union (enum) e.g. "primary" | "secondary" | "danger"
  if (/^("[^"]+"|'[^']+')(\s*\|\s*("[^"]+"|'[^']+')?)+$/.test(clean)) {
    const enumValues = clean
      .split("|")
      .map((val) => val.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean);
    return { type: "enum", enumValues };
  }

  if (clean === "string") return { type: "string" };
  if (clean === "number") return { type: "number" };
  if (clean === "boolean") return { type: "boolean" };
  if (clean.includes("=>") || clean.startsWith("(") || clean.includes("EventHandler") || clean.includes("VoidFunction")) {
    return { type: "function" };
  }
  if (clean === "ReactNode" || clean === "React.ReactNode" || clean === "ReactElement") {
    return { type: "node" };
  }
  if (clean.endsWith("[]") || clean.startsWith("Array<") || clean.startsWith("Record<") || clean.startsWith("{")) {
    return { type: "object" };
  }

  return { type: "unknown" };
}

/**
 * Generates context-aware mock value for a prop
 */
function generateMockValue(name: string, type: ComponentPropType, enumValues?: string[]): unknown {
  const lower = name.toLowerCase();

  switch (type) {
    case "boolean":
      return lower.includes("open") || lower.includes("visible") || lower.includes("active");
    case "number":
      if (lower.includes("count") || lower.includes("total")) return 5;
      if (lower.includes("price")) return 99.99;
      if (lower.includes("rating")) return 4.8;
      return 42;
    case "enum":
      return enumValues && enumValues.length > 0 ? enumValues[0] : "default";
    case "function":
      return `() => console.log('Action: ${name}')`;
    case "node":
      return `<p>Sample Child Content for ${name}</p>`;
    case "object":
      return {};
    case "string":
    default:
      if (lower.includes("title") || lower.includes("heading")) return "Modern Architecture";
      if (lower.includes("name")) return "Alex Morgan";
      if (lower.includes("label") || lower.includes("text")) return "Get Started Now";
      if (lower.includes("desc") || lower.includes("summary")) return "Synthesized and verified component built with Next.js App Router.";
      if (lower.includes("href") || lower.includes("url")) return "/overview";
      if (lower.includes("src") || lower.includes("image") || lower.includes("avatar")) return "/placeholder-avatar.png";
      if (lower.includes("placeholder")) return "Enter value...";
      if (lower.includes("badge") || lower.includes("tag")) return "Modernized";
      return `Sample ${name}`;
  }
}

/**
 * Extracts props definition from TypeScript interface or type alias
 */
function extractPropsFromContent(content: string, componentName: string): ComponentPropDef[] {
  const props: ComponentPropDef[] = [];

  // Look for interface or type ending with Props or named after component
  const propTypesRegex = new RegExp(
    `(?:export\\s+)?(?:interface|type)\\s+(${componentName}Props|[A-Za-z0-9_]+Props)\\s*(?:=\\s*\\{)?\\s*\\{?([\\s\\S]*?)\\}`,
    "g"
  );

  let match: RegExpExecArray | null;
  while ((match = propTypesRegex.exec(content)) !== null) {
    const body = match[2];
    if (!body) continue;

    const propLineRegex = /^\s*([A-Za-z0-9_$]+)(\??)\s*:\s*([^;\n]+)/gm;
    let propMatch: RegExpExecArray | null;
    while ((propMatch = propLineRegex.exec(body)) !== null) {
      const propName = propMatch[1];
      const isOptional = propMatch[2] === "?";
      const rawType = propMatch[3].trim().replace(/;$/, "");

      if (props.some((p) => p.name === propName)) continue;

      const { type, enumValues } = parseTypeDetails(rawType);
      props.push({
        name: propName,
        type,
        rawType,
        required: !isOptional,
        enumValues,
        defaultValue: generateMockValue(propName, type, enumValues),
      });
    }
  }

  // Fallback: If no interface found, inspect destructured function params: function Button({ label, onClick }: ...)
  if (props.length === 0) {
    const destructuredMatch = content.match(
      new RegExp(`(?:export\\s+)?(?:function|const)\\s+${componentName}\\s*(?:=\\s*)?\\(\\s*\\{\\s*([^}]+)\\s*\\}`)
    );
    if (destructuredMatch && destructuredMatch[1]) {
      const paramNames = destructuredMatch[1]
        .split(",")
        .map((p) => p.trim().split("=")[0].trim())
        .filter((p) => p && !p.startsWith("..."));

      for (const pName of paramNames) {
        const { type } = parseTypeDetails("string");
        props.push({
          name: pName,
          type,
          rawType: "string",
          required: false,
          defaultValue: generateMockValue(pName, type),
        });
      }
    }
  }

  return props;
}

/**
 * Synthesizes standard Storybook CSF 3 Component Story Format code
 */
function generateStorybookStoryCode(
  componentName: string,
  exportType: "default" | "named",
  filePath: string,
  mockProps: Record<string, unknown>
): string {
  const importStatement =
    exportType === "default"
      ? `import ${componentName} from "./${componentName}";`
      : `import { ${componentName} } from "./${componentName}";`;

  const categoryPath = filePath.startsWith("components/")
    ? filePath.replace(/^components\//, "").replace(/\/[^/]+$/, "")
    : "UI";

  const groupTitle = categoryPath && categoryPath !== filePath ? `Components/${categoryPath}/${componentName}` : `Components/${componentName}`;

  return [
    `import type { Meta, StoryObj } from "@storybook/react";`,
    importStatement,
    ``,
    `const meta: Meta<typeof ${componentName}> = {`,
    `  title: "${groupTitle}",`,
    `  component: ${componentName},`,
    `  parameters: {`,
    `    layout: "centered",`,
    `  },`,
    `  tags: ["autodocs"],`,
    `};`,
    ``,
    `export default meta;`,
    `type Story = StoryObj<typeof ${componentName}>;`,
    ``,
    `export const Default: Story = {`,
    `  args: ${JSON.stringify(mockProps, null, 4).replace(/"\(\) => console\.log\([^)]+\)"/g, '() => {}')},`,
    `};`,
    ``,
    `export const InteractivePreview: Story = {`,
    `  args: {`,
    `    ...Default.args,`,
    `  },`,
    `};`,
  ].join("\n");
}

/**
 * Synthesizes JSX usage snippet
 */
function generateSampleUsageCode(
  componentName: string,
  exportType: "default" | "named",
  filePath: string,
  mockProps: Record<string, unknown>
): string {
  const importStatement =
    exportType === "default"
      ? `import ${componentName} from "@/${filePath.replace(/\.[^.]+$/, "")}";`
      : `import { ${componentName} } from "@/${filePath.replace(/\.[^.]+$/, "")}";`;

  const propsLines = Object.entries(mockProps).map(([key, val]) => {
    if (typeof val === "string") return `  ${key}="${val}"`;
    if (typeof val === "boolean") return val ? `  ${key}` : `  ${key}={false}`;
    if (typeof val === "number") return `  ${key}={${val}}`;
    return `  ${key}={${JSON.stringify(val)}}`;
  });

  return [
    importStatement,
    ``,
    `export function Preview() {`,
    `  return (`,
    `    <${componentName}`,
    ...propsLines,
    `    />`,
    `  );`,
    `}`,
  ].join("\n");
}

/**
 * Discovers and parses all reusable components and their props in project entries
 */
export function discoverComponentsAndProps(entries: ZipEntry[]): CatalogSummary {
  const components: DiscoveredComponent[] = [];
  let clientComponentsCount = 0;
  let serverComponentsCount = 0;

  for (const entry of entries) {
    if (!isComponentFilePath(entry.path)) continue;

    const content = entry.content;
    const isClient = /^\s*["']use client["']/.test(content);

    // Find component name from export default or export function/const
    let componentName = "";
    let exportType: "default" | "named" = "named";

    const exportDefaultMatch = content.match(/export\s+default\s+function\s+([A-Za-z0-9_]+)/);
    if (exportDefaultMatch && exportDefaultMatch[1]) {
      componentName = exportDefaultMatch[1];
      exportType = "default";
    } else {
      const namedFuncMatch = content.match(/export\s+function\s+([A-Z][A-Za-z0-9_]+)/);
      if (namedFuncMatch && namedFuncMatch[1]) {
        componentName = namedFuncMatch[1];
        exportType = "named";
      } else {
        const namedConstMatch = content.match(/export\s+const\s+([A-Z][A-Za-z0-9_]+)\s*=/);
        if (namedConstMatch && namedConstMatch[1]) {
          componentName = namedConstMatch[1];
          exportType = "named";
        }
      }
    }

    if (!componentName) {
      // Fallback: derive from file basename
      const basename = entry.path.split("/").pop() || "";
      const nameFromPath = basename.replace(/\.[^.]+$/, "");
      if (/^[A-Z][A-Za-z0-9]+$/.test(nameFromPath)) {
        componentName = nameFromPath;
      } else {
        continue;
      }
    }

    const props = extractPropsFromContent(content, componentName);

    const defaultMockProps: Record<string, unknown> = {};
    for (const p of props) {
      defaultMockProps[p.name] = p.defaultValue;
    }

    if (isClient) clientComponentsCount++;
    else serverComponentsCount++;

    const sampleUsageCode = generateSampleUsageCode(componentName, exportType, entry.path, defaultMockProps);
    const storybookStoryCode = generateStorybookStoryCode(componentName, exportType, entry.path, defaultMockProps);

    components.push({
      id: `comp-${entry.path}`,
      name: componentName,
      filePath: entry.path,
      isClientComponent: isClient,
      props,
      defaultMockProps,
      exportType,
      sampleUsageCode,
      storybookStoryCode,
    });
  }

  return {
    totalComponents: components.length,
    clientComponentsCount,
    serverComponentsCount,
    components,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Injects Storybook stories (*.stories.tsx) and configuration into project entries
 */
export function injectStorybookStoriesIntoProject(
  entries: ZipEntry[],
  components: DiscoveredComponent[]
): StorybookInjectionResult {
  const updatedEntries = [...entries];
  const injectedStoryPaths: string[] = [];
  let generatedStoriesCount = 0;

  for (const comp of components) {
    const storyPath = comp.filePath.replace(/\.(tsx|jsx)$/, ".stories.tsx");
    const exists = updatedEntries.some((e) => e.path === storyPath);

    if (!exists) {
      updatedEntries.push({
        path: storyPath,
        content: comp.storybookStoryCode,
      });
      injectedStoryPaths.push(storyPath);
      generatedStoriesCount++;
    }
  }

  // Ensure .storybook/main.ts exists
  if (!updatedEntries.some((e) => e.path === ".storybook/main.ts")) {
    updatedEntries.push({
      path: ".storybook/main.ts",
      content: [
        `import type { StorybookConfig } from "@storybook/nextjs";`,
        ``,
        `const config: StorybookConfig = {`,
        `  stories: ["../components/**/*.stories.@(js|jsx|ts|tsx)", "../src/**/*.stories.@(js|jsx|ts|tsx)"],`,
        `  addons: [`,
        `    "@storybook/addon-links",`,
        `    "@storybook/addon-essentials",`,
        `    "@storybook/addon-interactions",`,
        `  ],`,
        `  framework: {`,
        `    name: "@storybook/nextjs",`,
        `    options: {},`,
        `  },`,
        `  docs: {`,
        `    autodocs: "tag",`,
        `  },`,
        `};`,
        `export default config;`,
      ].join("\n"),
    });
  }

  // Ensure .storybook/preview.ts exists
  if (!updatedEntries.some((e) => e.path === ".storybook/preview.ts")) {
    updatedEntries.push({
      path: ".storybook/preview.ts",
      content: [
        `import type { Preview } from "@storybook/react";`,
        `import "../app/globals.css";`,
        ``,
        `const preview: Preview = {`,
        `  parameters: {`,
        `    controls: {`,
        `      matchers: {`,
        `        color: /(background|color)$/i,`,
        `        date: /Date$/i,`,
        `      },`,
        `    },`,
        `  },`,
        `};`,
        `export default preview;`,
      ].join("\n"),
    });
  }

  return {
    updatedEntries,
    generatedStoriesCount,
    injectedStoryPaths,
  };
}
