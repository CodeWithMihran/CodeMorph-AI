/**
 * Automated API Route Handler & Server Action Synthesizer Engine
 * Discovers legacy client-side API calls (fetch, axios, REST patterns),
 * infers resource schemas, and synthesizes Next.js App Router Route Handlers (app/api/**\/route.ts)
 * and React 19 Server Actions (app/actions/*.ts) with mock fixture data.
 * Pure TypeScript, client-safe with zero host execution.
 */

import type { ZipEntry } from "@/lib/migration/zip";

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

export interface DiscoveredApiCall {
  endpoint: string;
  normalizedRoute: string; // e.g. "/api/users" or "/api/users/[id]"
  method: HttpMethod;
  sourceFile: string;
  clientType: "fetch" | "axios" | "custom";
  rawSnippet: string;
}

export interface DiscoveredEndpointSummary {
  normalizedRoute: string;
  resourceName: string; // e.g. "users"
  methods: HttpMethod[];
  callingFiles: string[];
  suggestedRouteHandlerPath: string; // e.g. "app/api/users/route.ts"
  suggestedServerActionPath: string; // e.g. "app/actions/users.ts"
  hasDynamicParam: boolean;
  paramName?: string; // e.g. "id"
}

export interface GeneratedApiFile {
  path: string;
  content: string;
  type: "route_handler" | "server_action" | "types" | "mock_db";
  description: string;
  resourceName: string;
}

export interface ApiArchitectureSynthesis {
  totalEndpointsDiscovered: number;
  totalCallsDiscovered: number;
  endpoints: DiscoveredEndpointSummary[];
  generatedFiles: GeneratedApiFile[];
  typesFile: GeneratedApiFile;
  mockDbFile: GeneratedApiFile;
}

/**
 * Normalizes an API path into a clean Next.js App Router route path
 * e.g., "/api/users/:id" -> "/api/users/[id]"
 * e.g., "api/users/${id}" -> "/api/users/[id]"
 */
export function normalizeApiEndpoint(rawEndpoint: string): { normalizedRoute: string; paramName?: string } {
  let cleaned = rawEndpoint.trim();
  // Strip protocol/host if present (e.g. https://api.example.com/api/users -> /api/users)
  cleaned = cleaned.replace(/^https?:\/\/[^/]+/i, "");
  // Ensure leading slash
  if (!cleaned.startsWith("/")) {
    cleaned = "/" + cleaned;
  }
  // Strip query parameters
  cleaned = cleaned.split("?")[0];

  let paramName: string | undefined;

  // Replace :param with [param]
  cleaned = cleaned.replace(/:([a-zA-Z0-9_]+)/g, (_, name) => {
    paramName = name;
    return `[${name}]`;
  });

  // Replace ${param} template literal placeholders
  cleaned = cleaned.replace(/\$\{([a-zA-Z0-9_.]+)\}/g, (_, name) => {
    const simple = name.split(".").pop() || "id";
    paramName = simple;
    return `[${simple}]`;
  });

  // If path doesn't start with /api, prefix it
  if (!cleaned.startsWith("/api/")) {
    cleaned = cleaned.startsWith("/") ? `/api${cleaned}` : `/api/${cleaned}`;
  }

  // Clean trailing slashes unless root
  if (cleaned.length > 5 && cleaned.endsWith("/")) {
    cleaned = cleaned.slice(0, -1);
  }

  return { normalizedRoute: cleaned, paramName };
}

/**
 * Derives a clean singular and plural resource name from a route
 * e.g., "/api/users" -> { plural: "users", singular: "user", capitalized: "User" }
 */
export function deriveResourceNames(route: string): { plural: string; singular: string; capitalized: string } {
  const segments = route.replace(/^\/api\//, "").split("/").filter((s) => !s.startsWith("[") && s.length > 0);
  const raw = segments.length > 0 ? segments[segments.length - 1] : "item";
  const plural = raw.toLowerCase();
  
  let singular = plural;
  if (plural.endsWith("ies")) {
    singular = plural.slice(0, -3) + "y";
  } else if (plural.endsWith("es") && !plural.endsWith("ses") && !plural.endsWith("zes")) {
    singular = plural.slice(0, -2);
  } else if (plural.endsWith("s") && !plural.endsWith("ss")) {
    singular = plural.slice(0, -1);
  }

  const capitalized = singular.charAt(0).toUpperCase() + singular.slice(1);
  return { plural, singular, capitalized };
}

/**
 * Scans project code entries for API calls (fetch, axios, etc.)
 */
export function scanApiEndpoints(entries: ZipEntry[]): DiscoveredApiCall[] {
  const calls: DiscoveredApiCall[] = [];

  const codeFiles = entries.filter(
    (e) =>
      !e.path.startsWith(".codemorph/") &&
      !e.path.startsWith("node_modules/") &&
      (e.path.endsWith(".tsx") || e.path.endsWith(".jsx") || e.path.endsWith(".ts") || e.path.endsWith(".js"))
  );

  for (const file of codeFiles) {
    const content = file.content;

    // 1. Check fetch calls: fetch("...", { method: "POST" }) supporting multi-line options
    const fetchRegex = /fetch\s*\(\s*([`"'])([^`"'\r\n]+)\1(?:,\s*\{([\s\S]*?)\})?\s*\)/g;
    let fetchMatch: RegExpExecArray | null;

    while ((fetchMatch = fetchRegex.exec(content)) !== null) {
      const rawPath = fetchMatch[2];
      // Only target relative API paths or paths starting with /api, api, /v1
      if (
        rawPath.startsWith("/api") ||
        rawPath.startsWith("api/") ||
        rawPath.startsWith("/v1") ||
        rawPath.startsWith("/") ||
        rawPath.includes("${")
      ) {
        let method: HttpMethod = "GET";
        const optionsSnippet = fetchMatch[3] || "";
        const methodMatch = optionsSnippet.match(/method\s*:\s*["'](GET|POST|PUT|DELETE|PATCH)["']/i);
        if (methodMatch) {
          method = methodMatch[1].toUpperCase() as HttpMethod;
        }

        const { normalizedRoute } = normalizeApiEndpoint(rawPath);
        calls.push({
          endpoint: rawPath,
          normalizedRoute,
          method,
          sourceFile: file.path,
          clientType: "fetch",
          rawSnippet: fetchMatch[0].slice(0, 100).trim(),
        });
      }
    }

    // 2. Check axios calls: axios.get(...), axios.post(...)
    const axiosRegex = /(?:axios|api|client)\.(get|post|put|delete|patch)\s*\(\s*([`"'])([^`"'\r\n]+)\2/gi;
    let axiosMatch: RegExpExecArray | null;

    while ((axiosMatch = axiosRegex.exec(content)) !== null) {
      const method = axiosMatch[1].toUpperCase() as HttpMethod;
      const rawPath = axiosMatch[3];
      const { normalizedRoute } = normalizeApiEndpoint(rawPath);

      calls.push({
        endpoint: rawPath,
        normalizedRoute,
        method,
        sourceFile: file.path,
        clientType: "axios",
        rawSnippet: axiosMatch[0].slice(0, 100).trim(),
      });
    }
  }

  return calls;
}

/**
 * Groups raw API calls into structured endpoint summaries
 */
export function groupApiEndpoints(calls: DiscoveredApiCall[]): DiscoveredEndpointSummary[] {
  const map = new Map<string, { methods: Set<HttpMethod>; files: Set<string>; hasDynamic: boolean; paramName?: string }>();

  for (const call of calls) {
    const existing = map.get(call.normalizedRoute) || {
      methods: new Set<HttpMethod>(),
      files: new Set<string>(),
      hasDynamic: call.normalizedRoute.includes("["),
    };

    existing.methods.add(call.method);
    existing.files.add(call.sourceFile);
    if (call.normalizedRoute.includes("[")) {
      existing.hasDynamic = true;
      const paramMatch = call.normalizedRoute.match(/\[([a-zA-Z0-9_]+)\]/);
      if (paramMatch) existing.paramName = paramMatch[1];
    }

    map.set(call.normalizedRoute, existing);
  }

  const summaries: DiscoveredEndpointSummary[] = [];

  for (const [route, info] of map.entries()) {
    const { plural, singular } = deriveResourceNames(route);
    const subPath = route.replace(/^\/api\//, "");
    const routeHandlerPath = `app/api/${subPath}/route.ts`;
    const serverActionPath = `app/actions/${singular}.ts`;

    // Ensure at least GET is present if empty
    const methodList = Array.from(info.methods);
    if (methodList.length === 0) methodList.push("GET");

    summaries.push({
      normalizedRoute: route,
      resourceName: plural,
      methods: methodList,
      callingFiles: Array.from(info.files),
      suggestedRouteHandlerPath: routeHandlerPath,
      suggestedServerActionPath: serverActionPath,
      hasDynamicParam: info.hasDynamic,
      paramName: info.paramName || (info.hasDynamic ? "id" : undefined),
    });
  }

  // Sort by route
  return summaries.sort((a, b) => a.normalizedRoute.localeCompare(b.normalizedRoute));
}

/**
 * Generates sample seed mock records for a given resource
 */
function generateSampleMockRecords(resourceName: string): string {
  const { singular, capitalized } = deriveResourceNames(`/api/${resourceName}`);

  if (resourceName.includes("user") || resourceName.includes("account")) {
    return `[
  { id: "usr_1", name: "Alex Morgan", email: "alex@example.com", role: "admin", createdAt: "2026-01-15T08:00:00Z" },
  { id: "usr_2", name: "Taylor Swift", email: "taylor@example.com", role: "member", createdAt: "2026-02-20T10:30:00Z" },
  { id: "usr_3", name: "Jordan Lee", email: "jordan@example.com", role: "viewer", createdAt: "2026-03-05T14:15:00Z" }
]`;
  }

  if (resourceName.includes("post") || resourceName.includes("article") || resourceName.includes("blog")) {
    return `[
  { id: "post_1", title: "Modernizing Legacy React SPAs with Next.js App Router", slug: "modernizing-legacy-react", published: true, authorId: "usr_1", createdAt: "2026-01-10T12:00:00Z" },
  { id: "post_2", title: "Zero Host Execution & Procedural Memory in CodeMorph AI", slug: "zero-host-execution", published: true, authorId: "usr_2", createdAt: "2026-02-14T09:45:00Z" }
]`;
  }

  if (resourceName.includes("product") || resourceName.includes("item") || resourceName.includes("cart") || resourceName.includes("order")) {
    return `[
  { id: "prod_1", title: "Enterprise Cloud Subscription", price: 299, currency: "USD", inStock: true, sku: "SKU-CLOUD-ENT" },
  { id: "prod_2", title: "Developer Pro License", price: 49, currency: "USD", inStock: true, sku: "SKU-DEV-PRO" }
]`;
  }

  // Generic fallback
  return `[
  { id: "${singular}_1", title: "Sample ${capitalized} One", status: "active", createdAt: "2026-01-01T00:00:00Z" },
  { id: "${singular}_2", title: "Sample ${capitalized} Two", status: "pending", createdAt: "2026-02-01T00:00:00Z" }
]`;
}

/**
 * Generates TypeScript code for a Next.js App Router Route Handler (app/api/.../route.ts)
 */
export function generateRouteHandlerCode(endpoint: DiscoveredEndpointSummary): string {
  const { plural, singular, capitalized } = deriveResourceNames(endpoint.normalizedRoute);
  const typeName = capitalized;
  const isDynamic = endpoint.hasDynamicParam;
  const param = endpoint.paramName || "id";

  const lines: string[] = [
    `import { NextRequest, NextResponse } from "next/server";`,
    `import type { ${typeName} } from "@/types/api";`,
    `import { mockDatabase } from "@/lib/mocks/mock-db";`,
    ``,
  ];

  // GET Method
  if (endpoint.methods.includes("GET") || endpoint.methods.length === 0) {
    if (isDynamic) {
      lines.push(
        `/**`,
        ` * GET ${endpoint.normalizedRoute}`,
        ` * Fetches a single ${singular} by ${param}`,
        ` */`,
        `export async function GET(`,
        `  request: NextRequest,`,
        `  context: { params: Promise<{ ${param}: string }> }`,
        `): Promise<NextResponse> {`,
        `  const { ${param} } = await context.params;`,
        `  const item = mockDatabase.${plural}.find((i) => i.id === ${param});`,
        ``,
        `  if (!item) {`,
        `    return NextResponse.json(`,
        `      { error: "${capitalized} not found with ${param} " + ${param} },`,
        `      { status: 404 }`,
        `    );`,
        `  }`,
        ``,
        `  return NextResponse.json(item, { status: 200 });`,
        `}`,
        ``
      );
    } else {
      lines.push(
        `/**`,
        ` * GET ${endpoint.normalizedRoute}`,
        ` * Returns all ${plural} records with optional query filtering`,
        ` */`,
        `export async function GET(request: NextRequest): Promise<NextResponse> {`,
        `  const searchParams = request.nextUrl.searchParams;`,
        `  const query = searchParams.get("query")?.toLowerCase();`,
        ``,
        `  let results: ${typeName}[] = mockDatabase.${plural};`,
        `  if (query) {`,
        `    results = results.filter((item) => JSON.stringify(item).toLowerCase().includes(query));`,
        `  }`,
        ``,
        `  return NextResponse.json(results, { status: 200 });`,
        `}`,
        ``
      );
    }
  }

  // POST Method
  if (endpoint.methods.includes("POST")) {
    lines.push(
      `/**`,
      ` * POST ${endpoint.normalizedRoute}`,
      ` * Creates a new ${singular} record`,
      ` */`,
      `export async function POST(request: NextRequest): Promise<NextResponse> {`,
      `  try {`,
      `    const body = await request.json();`,
      `    if (!body || typeof body !== "object") {`,
      `      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });`,
      `    }`,
      ``,
      `    const newItem: ${typeName} = {`,
      `      ...body,`,
      `      id: "${singular}_" + Date.now().toString(36),`,
      `      createdAt: new Date().toISOString(),`,
      `    };`,
      ``,
      `    mockDatabase.${plural}.push(newItem);`,
      `    return NextResponse.json(newItem, { status: 201 });`,
      `  } catch {`,
      `    return NextResponse.json({ error: "Malformed request payload" }, { status: 400 });`,
      `  }`,
      `}`,
      ``
    );
  }

  // PUT / PATCH Method
  if (endpoint.methods.includes("PUT") || endpoint.methods.includes("PATCH")) {
    const methodName = endpoint.methods.includes("PUT") ? "PUT" : "PATCH";
    if (isDynamic) {
      lines.push(
        `/**`,
        ` * ${methodName} ${endpoint.normalizedRoute}`,
        ` * Updates an existing ${singular} record`,
        ` */`,
        `export async function ${methodName}(`,
        `  request: NextRequest,`,
        `  context: { params: Promise<{ ${param}: string }> }`,
        `): Promise<NextResponse> {`,
        `  const { ${param} } = await context.params;`,
        `  const index = mockDatabase.${plural}.findIndex((i) => i.id === ${param});`,
        ``,
        `  if (index === -1) {`,
        `    return NextResponse.json({ error: "${capitalized} not found" }, { status: 404 });`,
        `  }`,
        ``,
        `  const updates = await request.json();`,
        `  mockDatabase.${plural}[index] = { ...mockDatabase.${plural}[index], ...updates };`,
        `  return NextResponse.json(mockDatabase.${plural}[index], { status: 200 });`,
        `}`,
        ``
      );
    }
  }

  // DELETE Method
  if (endpoint.methods.includes("DELETE")) {
    if (isDynamic) {
      lines.push(
        `/**`,
        ` * DELETE ${endpoint.normalizedRoute}`,
        ` * Removes a ${singular} record`,
        ` */`,
        `export async function DELETE(`,
        `  _request: NextRequest,`,
        `  context: { params: Promise<{ ${param}: string }> }`,
        `): Promise<NextResponse> {`,
        `  const { ${param} } = await context.params;`,
        `  const initialLength = mockDatabase.${plural}.length;`,
        `  mockDatabase.${plural} = mockDatabase.${plural}.filter((i) => i.id !== ${param});`,
        ``,
        `  if (mockDatabase.${plural}.length === initialLength) {`,
        `    return NextResponse.json({ error: "${capitalized} not found" }, { status: 404 });`,
        `  }`,
        ``,
        `  return NextResponse.json({ success: true, deletedId: ${param} }, { status: 200 });`,
        `}`,
        ``
      );
    }
  }

  return lines.join("\n");
}

/**
 * Generates TypeScript code for React 19 Server Actions (app/actions/*.ts)
 */
export function generateServerActionCode(endpoint: DiscoveredEndpointSummary): string {
  const { plural, singular, capitalized } = deriveResourceNames(endpoint.normalizedRoute);
  const typeName = capitalized;

  return `"use server";

import { revalidatePath } from "next/cache";
import type { ${typeName} } from "@/types/api";
import { mockDatabase } from "@/lib/mocks/mock-db";

/**
 * React 19 Server Action: Fetches all ${plural} directly on the server
 * Eliminates client-side REST waterfalls
 */
export async function get${capitalized}List(): Promise<${typeName}[]> {
  // Direct server-side data access
  return mockDatabase.${plural};
}

/**
 * React 19 Server Action: Fetches a single ${singular} by ID
 */
export async function get${capitalized}ById(id: string): Promise<${typeName} | null> {
  const item = mockDatabase.${plural}.find((i) => i.id === id);
  return item || null;
}

/**
 * React 19 Server Action: Creates or mutates a ${singular}
 * Revalidates App Router route caches on completion
 */
export async function mutate${capitalized}(payload: Partial<${typeName}>): Promise<{ success: boolean; data?: ${typeName}; error?: string }> {
  try {
    if (!payload) {
      return { success: false, error: "Empty payload provided" };
    }

    const newItem: ${typeName} = {
      ...(payload as ${typeName}),
      id: "${singular}_" + Date.now().toString(36),
      createdAt: new Date().toISOString(),
    };

    mockDatabase.${plural}.push(newItem);
    revalidatePath("/${plural}");
    return { success: true, data: newItem };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to mutate ${singular}" };
  }
}

/**
 * React 19 Server Action: Removes a ${singular}
 */
export async function delete${capitalized}(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    mockDatabase.${plural} = mockDatabase.${plural}.filter((i) => i.id !== id);
    revalidatePath("/${plural}");
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to delete" };
  }
}
`;
}

/**
 * Synthesizes complete TypeScript interfaces file (types/api.ts)
 */
export function generateTypesDefinitionFile(endpoints: DiscoveredEndpointSummary[]): GeneratedApiFile {
  const interfaces: string[] = [
    `/**`,
    ` * CodeMorph AI — Auto-Synthesized API Types & Schema Contracts`,
    ` * Deterministically inferred from legacy client fetch & axios requests`,
    ` */`,
    ``,
  ];

  const processedTypes = new Set<string>();

  for (const ep of endpoints) {
    const { capitalized } = deriveResourceNames(ep.normalizedRoute);
    if (processedTypes.has(capitalized)) continue;
    processedTypes.add(capitalized);

    if (ep.resourceName.includes("user") || ep.resourceName.includes("account")) {
      interfaces.push(
        `export interface ${capitalized} {`,
        `  id: string;`,
        `  name: string;`,
        `  email: string;`,
        `  role: "admin" | "member" | "viewer";`,
        `  createdAt: string;`,
        `}`,
        ``
      );
    } else if (ep.resourceName.includes("post") || ep.resourceName.includes("article")) {
      interfaces.push(
        `export interface ${capitalized} {`,
        `  id: string;`,
        `  title: string;`,
        `  slug: string;`,
        `  published: boolean;`,
        `  authorId?: string;`,
        `  createdAt: string;`,
        `}`,
        ``
      );
    } else if (ep.resourceName.includes("product") || ep.resourceName.includes("item")) {
      interfaces.push(
        `export interface ${capitalized} {`,
        `  id: string;`,
        `  title: string;`,
        `  price: number;`,
        `  currency: string;`,
        `  inStock: boolean;`,
        `  sku: string;`,
        `}`,
        ``
      );
    } else {
      interfaces.push(
        `export interface ${capitalized} {`,
        `  id: string;`,
        `  title?: string;`,
        `  name?: string;`,
        `  status?: string;`,
        `  createdAt?: string;`,
        `  [key: string]: unknown;`,
        `}`,
        ``
      );
    }
  }

  // Fallback if no endpoints
  if (processedTypes.size === 0) {
    interfaces.push(
      `export interface ApiResponse<T = unknown> {`,
      `  data?: T;`,
      `  error?: string;`,
      `  status: number;`,
      `}`,
      ``
    );
  }

  return {
    path: "types/api.ts",
    content: interfaces.join("\n"),
    type: "types",
    description: "Inferred TypeScript interface contracts",
    resourceName: "api",
  };
}

/**
 * Synthesizes in-memory mock database fixture (lib/mocks/mock-db.ts)
 */
export function generateMockDbFile(endpoints: DiscoveredEndpointSummary[]): GeneratedApiFile {
  const imports: string[] = [`import type { `];
  const typeNames: string[] = [];
  const processedTypes = new Set<string>();

  for (const ep of endpoints) {
    const { capitalized } = deriveResourceNames(ep.normalizedRoute);
    if (!processedTypes.has(capitalized)) {
      processedTypes.add(capitalized);
      typeNames.push(capitalized);
    }
  }

  if (typeNames.length > 0) {
    imports.push(`${typeNames.join(", ")} } from "@/types/api";\n\n`);
  } else {
    imports.length = 0;
  }

  const lines: string[] = [
    ...imports,
    `export interface MockDatabaseSchema {`,
  ];

  const processedPlurals = new Set<string>();
  for (const ep of endpoints) {
    const { plural, capitalized } = deriveResourceNames(ep.normalizedRoute);
    if (!processedPlurals.has(plural)) {
      processedPlurals.add(plural);
      lines.push(`  ${plural}: ${capitalized}[];`);
    }
  }

  lines.push(
    `}`,
    ``,
    `// Global singleton mock database fixture for offline development & testing`,
    `export const mockDatabase: MockDatabaseSchema = {`
  );

  processedPlurals.clear();
  for (const ep of endpoints) {
    const { plural } = deriveResourceNames(ep.normalizedRoute);
    if (!processedPlurals.has(plural)) {
      processedPlurals.add(plural);
      lines.push(`  ${plural}: ${generateSampleMockRecords(plural)},`);
    }
  }

  lines.push(`};`, ``);

  return {
    path: "lib/mocks/mock-db.ts",
    content: lines.join("\n"),
    type: "mock_db",
    description: "In-memory seed database fixture",
    resourceName: "mock-db",
  };
}

/**
 * Complete synthesis orchestration: scans project entries, groups calls,
 * and generates Next.js App Router Route Handlers, Server Actions, and types.
 */
export function synthesizeApiArchitecture(entries: ZipEntry[]): ApiArchitectureSynthesis {
  const calls = scanApiEndpoints(entries);
  let endpoints = groupApiEndpoints(calls);

  // If no endpoints were explicitly detected via regex, provide a starter suite based on existing project routes
  if (endpoints.length === 0) {
    const starterRoute = "/api/users";
    endpoints = [
      {
        normalizedRoute: starterRoute,
        resourceName: "users",
        methods: ["GET", "POST"],
        callingFiles: ["app/page.tsx"],
        suggestedRouteHandlerPath: "app/api/users/route.ts",
        suggestedServerActionPath: "app/actions/user.ts",
        hasDynamicParam: false,
      },
    ];
  }

  const typesFile = generateTypesDefinitionFile(endpoints);
  const mockDbFile = generateMockDbFile(endpoints);

  const generatedFiles: GeneratedApiFile[] = [typesFile, mockDbFile];

  for (const ep of endpoints) {
    // 1. Generate Route Handler
    generatedFiles.push({
      path: ep.suggestedRouteHandlerPath,
      content: generateRouteHandlerCode(ep),
      type: "route_handler",
      description: `App Router Route Handler for ${ep.normalizedRoute}`,
      resourceName: ep.resourceName,
    });

    // 2. Generate Server Action
    generatedFiles.push({
      path: ep.suggestedServerActionPath,
      content: generateServerActionCode(ep),
      type: "server_action",
      description: `React 19 Server Action for ${ep.resourceName}`,
      resourceName: ep.resourceName,
    });
  }

  return {
    totalEndpointsDiscovered: endpoints.length,
    totalCallsDiscovered: calls.length,
    endpoints,
    generatedFiles,
    typesFile,
    mockDbFile,
  };
}

/**
 * Injects selected synthesized API files into the project entries
 */
export function injectGeneratedApiFiles(
  projectEntries: ZipEntry[],
  selectedFiles: GeneratedApiFile[]
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
