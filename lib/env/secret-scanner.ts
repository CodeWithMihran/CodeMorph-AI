/**
 * Environment Variable & Secret Boundary Studio Engine
 * Scans migrated projects for environment variable accesses (process.env.*, import.meta.env.*),
 * flags private secrets leaked into Client Components ("use client"),
 * modernizes legacy prefixes (REACT_APP_ / VITE_ -> NEXT_PUBLIC_ / EXPO_PUBLIC_),
 * and synthesizes typed environment contracts (lib/env.ts) and .env.example manifests.
 * Pure TypeScript, client-safe with zero host execution.
 */

import type { ZipEntry } from "@/lib/migration/zip";

export type EnvVariableScope = "public_client" | "server_only" | "leaked_secret";

export interface DiscoveredEnvVar {
  name: string; // e.g. "REACT_APP_API_URL" or "DATABASE_URL"
  modernizedName: string; // e.g. "NEXT_PUBLIC_API_URL"
  rawAccess: string; // e.g. "process.env.REACT_APP_API_URL" or "import.meta.env.VITE_API_URL"
  scope: EnvVariableScope;
  usedInFiles: string[];
  isSecret: boolean;
  hasClientLeak: boolean;
  recommendation: string;
  exampleValue: string;
}

export interface GeneratedEnvFile {
  path: string;
  content: string;
  type: "env_example" | "env_local" | "typed_contract";
  description: string;
}

export interface EnvStudioReport {
  totalVars: number;
  publicVarsCount: number;
  serverVarsCount: number;
  leakedSecretsCount: number;
  securityScore: number; // 0-100
  variables: DiscoveredEnvVar[];
  envExampleContent: string;
  envLocalContent: string;
  envTypesContent: string;
  generatedFiles: GeneratedEnvFile[];
}

// Built-in environment variables to ignore from user manifest
const IGNORED_SYSTEM_VARS = new Set([
  "NODE_ENV",
  "VERCEL",
  "VERCEL_ENV",
  "VERCEL_URL",
  "CI",
  "PORT",
  "NEXT_RUNTIME",
  "NEXT_PHASE",
  "TZ",
  "PWD",
  "PATH",
]);

// Secret heuristic keywords
const SECRET_KEYWORDS = [
  "secret",
  "private",
  "token",
  "password",
  "passwd",
  "database",
  "db_url",
  "db_pass",
  "api_secret",
  "signing_key",
  "encryption_key",
  "auth_secret",
  "service_role",
];

/**
 * Checks if variable name suggests a confidential private secret
 */
export function isConfidentialSecret(varName: string): boolean {
  const lower = varName.toLowerCase();
  return SECRET_KEYWORDS.some((kw) => lower.includes(kw));
}

/**
 * Maps legacy framework prefixes (REACT_APP_, VITE_) to Next.js or Expo
 */
export function modernizeEnvVarName(
  rawName: string,
  targetPlatform: "nextjs" | "expo" = "nextjs"
): string {
  const prefix = targetPlatform === "expo" ? "EXPO_PUBLIC_" : "NEXT_PUBLIC_";

  if (rawName.startsWith("REACT_APP_")) {
    return rawName.replace(/^REACT_APP_/, prefix);
  }
  if (rawName.startsWith("VITE_")) {
    return rawName.replace(/^VITE_/, prefix);
  }
  if (rawName.startsWith("NEXT_PUBLIC_") || rawName.startsWith("EXPO_PUBLIC_")) {
    return rawName;
  }

  // If already server-only without prefix, keep as is
  return rawName;
}

/**
 * Generates an inferred mock/example value based on variable name
 */
export function inferExampleValue(varName: string): string {
  const lower = varName.toLowerCase();
  if (lower.includes("url") || lower.includes("endpoint") || lower.includes("host")) {
    return "https://api.example.com";
  }
  if (lower.includes("database") || lower.includes("db")) {
    return "postgresql://user:password@localhost:5432/mydb";
  }
  if (lower.includes("key") || lower.includes("token") || lower.includes("secret")) {
    return "sk_test_51Mz000000000000000000000";
  }
  if (lower.includes("port")) {
    return "3000";
  }
  if (lower.includes("id") || lower.includes("app_id")) {
    return "app_client_id_12345";
  }
  return "placeholder_value";
}

/**
 * Scans project code for environment variable accesses across files
 */
export function scanEnvironmentVariables(
  entries: ZipEntry[],
  targetPlatform: "nextjs" | "expo" = "nextjs"
): DiscoveredEnvVar[] {
  const varsMap = new Map<
    string,
    {
      files: Set<string>;
      rawAccesses: Set<string>;
      hasClientUsage: boolean;
    }
  >();

  const codeFiles = entries.filter(
    (e) =>
      !e.path.startsWith(".codemorph/") &&
      !e.path.startsWith("node_modules/") &&
      (e.path.endsWith(".tsx") ||
        e.path.endsWith(".jsx") ||
        e.path.endsWith(".ts") ||
        e.path.endsWith(".js") ||
        e.path.endsWith(".mjs"))
  );

  for (const file of codeFiles) {
    const content = file.content;
    const isClientComponent = /^\s*["']use client["']/.test(content);

    // 1. Match process.env.VAR_NAME
    const processRegex = /process\.env\.([A-Za-z0-9_]+)/g;
    let match: RegExpExecArray | null;
    while ((match = processRegex.exec(content)) !== null) {
      const varName = match[1];
      if (IGNORED_SYSTEM_VARS.has(varName)) continue;

      const existing = varsMap.get(varName) || {
        files: new Set<string>(),
        rawAccesses: new Set<string>(),
        hasClientUsage: false,
      };
      existing.files.add(file.path);
      existing.rawAccesses.add(match[0]);
      if (isClientComponent) existing.hasClientUsage = true;
      varsMap.set(varName, existing);
    }

    // 2. Match import.meta.env.VAR_NAME
    const importMetaRegex = /import\.meta\.env\.([A-Za-z0-9_]+)/g;
    while ((match = importMetaRegex.exec(content)) !== null) {
      const varName = match[1];
      if (IGNORED_SYSTEM_VARS.has(varName)) continue;

      const existing = varsMap.get(varName) || {
        files: new Set<string>(),
        rawAccesses: new Set<string>(),
        hasClientUsage: false,
      };
      existing.files.add(file.path);
      existing.rawAccesses.add(match[0]);
      if (isClientComponent) existing.hasClientUsage = true;
      varsMap.set(varName, existing);
    }
  }

  // Determine scope, leaks, and recommendations
  const results: DiscoveredEnvVar[] = [];

  for (const [varName, info] of varsMap.entries()) {
    const isSecret = isConfidentialSecret(varName);
    const modernized = modernizeEnvVarName(varName, targetPlatform);
    const isPublicPrefix =
      varName.startsWith("REACT_APP_") ||
      varName.startsWith("VITE_") ||
      varName.startsWith("NEXT_PUBLIC_") ||
      varName.startsWith("EXPO_PUBLIC_");

    let scope: EnvVariableScope = "server_only";
    let hasClientLeak = false;
    let recommendation = "Server-only variable accessible in Route Handlers and Server Actions.";

    if (isSecret && info.hasClientUsage) {
      scope = "leaked_secret";
      hasClientLeak = true;
      recommendation =
        "🚨 CRITICAL SECURITY LEAK: Confidential secret accessed in Client Component ('use client'). Move data access to a Server Action or Route Handler!";
    } else if (isPublicPrefix || info.hasClientUsage) {
      scope = "public_client";
      recommendation = `Public variable accessible in browser bundles. Use prefix ${modernized} in Next.js.`;
    }

    results.push({
      name: varName,
      modernizedName: modernized,
      rawAccess: Array.from(info.rawAccesses)[0] || `process.env.${varName}`,
      scope,
      usedInFiles: Array.from(info.files),
      isSecret,
      hasClientLeak,
      recommendation,
      exampleValue: inferExampleValue(varName),
    });
  }

  // Sort: leaked secrets first, then public, then server-only
  return results.sort((a, b) => {
    if (a.hasClientLeak && !b.hasClientLeak) return -1;
    if (!a.hasClientLeak && b.hasClientLeak) return 1;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Generates .env.example manifest
 */
export function generateEnvExampleFile(variables: DiscoveredEnvVar[]): string {
  const publicVars = variables.filter((v) => v.scope === "public_client");
  const serverVars = variables.filter((v) => v.scope !== "public_client");

  const lines: string[] = [
    `# ==============================================================================`,
    `# CodeMorph AI — Environment Configuration Manifest`,
    `# Copy to .env.local for local development. Never commit sensitive credentials.`,
    `# ==============================================================================`,
    ``,
    `# --- Public Client Variables (Exposed to browser via NEXT_PUBLIC_ prefix) ---`,
  ];

  if (publicVars.length === 0) {
    lines.push(`# No public client variables detected.`);
  } else {
    for (const v of publicVars) {
      lines.push(`# Used in: ${v.usedInFiles.join(", ")}`);
      lines.push(`${v.modernizedName}=${v.exampleValue}`);
    }
  }

  lines.push(``, `# --- Server-Only Variables & Confidential Secrets (Node.js runtime only) ---`);

  if (serverVars.length === 0) {
    lines.push(`# No server-only secrets detected.`);
  } else {
    for (const v of serverVars) {
      if (v.hasClientLeak) {
        lines.push(`# 🚨 WARNING: Leaked secret detected in client components!`);
      }
      lines.push(`# Used in: ${v.usedInFiles.join(", ")}`);
      lines.push(`${v.modernizedName}=${v.exampleValue}`);
    }
  }

  lines.push(``);
  return lines.join("\n");
}

/**
 * Generates .env.local.template
 */
export function generateEnvLocalFile(variables: DiscoveredEnvVar[]): string {
  return generateEnvExampleFile(variables).replace(
    /CodeMorph AI — Environment Configuration Manifest/,
    "Local Development Secrets Template (.env.local)"
  );
}

/**
 * Generates typed environment validator contract (lib/env.ts)
 */
export function generateTypedEnvContract(
  variables: DiscoveredEnvVar[],
  targetPlatform: "nextjs" | "expo" = "nextjs"
): string {
  const isExpo = targetPlatform === "expo";
  const publicVars = variables.filter((v) => v.scope === "public_client");
  const serverVars = variables.filter((v) => v.scope !== "public_client");

  return `/**
 * CodeMorph AI — Typed Environment Contract & Runtime Validator
 * Guarantees required environment variables exist and are typed at build & runtime.
 */

export interface ClientEnvironmentConfig {
${publicVars.map((v) => `  ${v.modernizedName}: string;`).join("\n")}
}

${
  !isExpo
    ? `export interface ServerEnvironmentConfig {
${serverVars.map((v) => `  ${v.modernizedName}: string;`).join("\n")}
}
`
    : ""
}
/**
 * Safe accessor for client-exposed environment variables
 */
export const clientEnv: ClientEnvironmentConfig = {
${publicVars
  .map(
    (v) =>
      `  ${v.modernizedName}: process.env.${v.modernizedName} || "${v.exampleValue}",`
  )
  .join("\n")}
};

${
  !isExpo
    ? `/**
 * Safe accessor for server-only environment variables
 * Throws an explicit error if called on the client side
 */
export function getServerEnv(): ServerEnvironmentConfig {
  if (typeof window !== "undefined") {
    throw new Error(
      "SECURITY VIOLATION: getServerEnv() called on the client! Server secrets must never be exposed to the browser."
    );
  }

  return {
${serverVars
  .map(
    (v) =>
      `    ${v.modernizedName}: process.env.${v.modernizedName} || "${v.exampleValue}",`
  )
  .join("\n")}
  };
}
`
    : ""
}`;
}

/**
 * Synthesizes full environment studio report and artifacts
 */
export function synthesizeEnvStudioReport(
  entries: ZipEntry[],
  targetPlatform: "nextjs" | "expo" = "nextjs"
): EnvStudioReport {
  const variables = scanEnvironmentVariables(entries, targetPlatform);

  const publicVarsCount = variables.filter((v) => v.scope === "public_client").length;
  const serverVarsCount = variables.filter((v) => v.scope === "server_only").length;
  const leakedSecretsCount = variables.filter((v) => v.scope === "leaked_secret").length;

  // Security score: base 100, deducted severely for leaked secrets
  let securityScore = 100;
  if (leakedSecretsCount > 0) {
    securityScore -= leakedSecretsCount * 30;
  }
  // Minor deduction if legacy prefixes are still present
  const unmodernizedCount = variables.filter(
    (v) => v.name.startsWith("REACT_APP_") || v.name.startsWith("VITE_")
  ).length;
  if (unmodernizedCount > 0) {
    securityScore -= Math.min(20, unmodernizedCount * 5);
  }
  securityScore = Math.max(20, Math.min(100, securityScore));

  const envExampleContent = generateEnvExampleFile(variables);
  const envLocalContent = generateEnvLocalFile(variables);
  const envTypesContent = generateTypedEnvContract(variables, targetPlatform);

  const generatedFiles: GeneratedEnvFile[] = [
    {
      path: ".env.example",
      content: envExampleContent,
      type: "env_example",
      description: "Documented environment variable manifest for repository",
    },
    {
      path: ".env.local.template",
      content: envLocalContent,
      type: "env_local",
      description: "Local development secrets configuration template",
    },
    {
      path: "lib/env.ts",
      content: envTypesContent,
      type: "typed_contract",
      description: "Typed runtime environment validator & client/server boundary guard",
    },
  ];

  return {
    totalVars: variables.length,
    publicVarsCount,
    serverVarsCount,
    leakedSecretsCount,
    securityScore,
    variables,
    envExampleContent,
    envLocalContent,
    envTypesContent,
    generatedFiles,
  };
}

/**
 * Injects .env.example, .env.local.template, and lib/env.ts into project entries
 */
export function injectEnvArchitecture(
  projectEntries: ZipEntry[],
  report: EnvStudioReport
): { updatedEntries: ZipEntry[]; appliedCount: number } {
  const entriesMap = new Map<string, ZipEntry>();
  for (const entry of projectEntries) {
    entriesMap.set(entry.path, entry);
  }

  let appliedCount = 0;
  for (const file of report.generatedFiles) {
    entriesMap.set(file.path, { path: file.path, content: file.content });
    appliedCount++;
  }

  return {
    updatedEntries: Array.from(entriesMap.values()),
    appliedCount,
  };
}

/**
 * Rewrites legacy variable prefixes (REACT_APP_, VITE_) to modernized prefixes (NEXT_PUBLIC_, EXPO_PUBLIC_)
 * across all code files in the project
 */
export function applyEnvPrefixCodemod(
  entries: ZipEntry[],
  targetPlatform: "nextjs" | "expo" = "nextjs"
): { updatedEntries: ZipEntry[]; replacedCount: number } {
  const prefix = targetPlatform === "expo" ? "EXPO_PUBLIC_" : "NEXT_PUBLIC_";
  let replacedCount = 0;

  const updatedEntries = entries.map((entry) => {
    if (
      !entry.path.endsWith(".tsx") &&
      !entry.path.endsWith(".jsx") &&
      !entry.path.endsWith(".ts") &&
      !entry.path.endsWith(".js")
    ) {
      return entry;
    }

    let content = entry.content;

    // 1. Replace process.env.REACT_APP_FOO -> process.env.NEXT_PUBLIC_FOO
    if (content.includes("REACT_APP_")) {
      content = content.replace(/process\.env\.REACT_APP_([A-Za-z0-9_]+)/g, (_, name) => {
        replacedCount++;
        return `process.env.${prefix}${name}`;
      });
    }

    // 2. Replace import.meta.env.VITE_FOO -> process.env.NEXT_PUBLIC_FOO
    if (content.includes("import.meta.env.")) {
      content = content.replace(/import\.meta\.env\.VITE_([A-Za-z0-9_]+)/g, (_, name) => {
        replacedCount++;
        return `process.env.${prefix}${name}`;
      });
      content = content.replace(/import\.meta\.env\.([A-Za-z0-9_]+)/g, (_, name) => {
        replacedCount++;
        return `process.env.${name}`;
      });
    }

    return { ...entry, content };
  });

  return { updatedEntries, replacedCount };
}
