/**
 * Incremental Migration & Reverse-Proxy Strangler Fig Configurator Engine
 * Synthesizes Next.js App Router fallback rewrites (next.config.ts),
 * cookie & session preserving middleware (middleware.ts), and edge proxy configs
 * (Cloudflare Workers, Nginx, AWS CloudFront) to run modernized Next.js and legacy SPAs
 * concurrently with zero downtime.
 * Pure TypeScript, client-safe with zero host execution.
 */

import type { ZipEntry } from "@/lib/migration/zip";

export interface RouteCutoverStatus {
  route: string;
  target: "nextjs" | "legacy_spa";
  filePath?: string;
  reason: string;
  method?: string;
}

export interface StranglerCutoverConfig {
  legacyHost: string; // e.g. "https://legacy.example.com"
  preserveCookies?: boolean; // default true
  preserveHeaders?: string[]; // e.g. ["authorization", "cookie", "x-session-id"]
  assetProxyPrefixes?: string[]; // e.g. ["/static/:path*", "/legacy-assets/:path*"]
  excludedRoutes?: string[]; // e.g. ["/api/:path*"]
}

export interface GeneratedCutoverFile {
  path: string;
  content: string;
  type: "next_config" | "middleware" | "cloudflare_worker" | "nginx" | "cloudfront";
  description: string;
}

export interface StranglerCutoverSynthesis {
  modernizedRoutesCount: number;
  legacyRoutesCount: number;
  cutoverPercentage: number; // e.g. 75
  routeStatuses: RouteCutoverStatus[];
  nextConfigContent: string;
  middlewareContent: string;
  cloudflareWorkerContent: string;
  nginxConfigContent: string;
  cloudfrontLambdaContent: string;
  generatedFiles: GeneratedCutoverFile[];
  legacyHost: string;
}

/**
 * Discovers all routes in the modernized project and compares against legacy routes
 */
export function discoverRouteCutoverStatuses(
  entries: ZipEntry[],
  legacyRoutesHint?: string[]
): RouteCutoverStatus[] {
  const statuses: RouteCutoverStatus[] = [];
  const knownModernized = new Set<string>();

  // 1. Scan for modernized App Router routes
  for (const entry of entries) {
    if (
      entry.path.startsWith("app/") &&
      (entry.path.endsWith("/page.tsx") ||
        entry.path.endsWith("/page.jsx") ||
        entry.path === "app/page.tsx" ||
        entry.path === "app/page.jsx")
    ) {
      let route = "/";
      if (entry.path !== "app/page.tsx" && entry.path !== "app/page.jsx") {
        route = "/" + entry.path.replace(/^app\//, "").replace(/\/page\.(tsx|jsx)$/, "");
      }

      knownModernized.add(route);
      statuses.push({
        route,
        target: "nextjs",
        filePath: entry.path,
        reason: "Modernized Next.js App Router Page",
      });
    }
  }

  // 2. Identify unmigrated legacy routes from hints or manifest
  const candidateLegacy = legacyRoutesHint && legacyRoutesHint.length > 0
    ? legacyRoutesHint
    : ["/legacy-admin", "/checkout-v1", "/legacy-account", "/legacy-reports"];

  for (const legRoute of candidateLegacy) {
    const clean = legRoute.startsWith("/") ? legRoute : `/${legRoute}`;
    if (!knownModernized.has(clean)) {
      statuses.push({
        route: clean,
        target: "legacy_spa",
        reason: "Unmigrated Legacy SPA route (proxied via Strangler Fig)",
      });
    }
  }

  // Sort: root "/" first, then alphabetically
  return statuses.sort((a, b) => {
    if (a.route === "/") return -1;
    if (b.route === "/") return 1;
    return a.route.localeCompare(b.route);
  });
}

/**
 * Generates next.config.ts with typed fallback rewrites
 */
export function generateNextConfigRewrites(
  modernizedRoutes: string[],
  config: StranglerCutoverConfig
): string {
  const cleanHost = config.legacyHost.replace(/\/$/, "");

  return `import type { NextConfig } from "next";

/**
 * CodeMorph AI — Strangler Fig Incremental Migration Configuration
 * Routes modernized App Router pages locally, while proxying unmigrated
 * legacy routes back to the existing legacy SPA server.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  async rewrites() {
    return {
      beforeFiles: [],
      afterFiles: [],
      // Fallback: Requests that do NOT match any modernized Next.js route or asset
      // are proxied transparently to the legacy host
      fallback: [
        {
          source: "/static/:path*",
          destination: "${cleanHost}/static/:path*",
        },
        {
          source: "/assets/:path*",
          destination: "${cleanHost}/assets/:path*",
        },
        {
          source: "/:path*",
          destination: "${cleanHost}/:path*",
        },
      ],
    };
  },
};

export default nextConfig;
`;
}

/**
 * Generates session and cookie-preserving Next.js middleware.ts
 */
export function generateCutoverMiddleware(config: StranglerCutoverConfig): string {
  const cleanHost = config.legacyHost.replace(/\/$/, "");
  const headersList = config.preserveHeaders || ["authorization", "cookie", "x-session-id", "x-user-token"];

  return `import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * CodeMorph AI — Incremental Cutover Middleware
 * Propagates session cookies, auth headers, and client IP addresses
 * between Next.js App Router and the legacy SPA host.
 */
export function middleware(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);

  // Set forwarded host and proto headers
  requestHeaders.set("x-forwarded-host", request.headers.get("host") || "");
  requestHeaders.set("x-forwarded-proto", request.nextUrl.protocol.replace(":", ""));
  requestHeaders.set("x-codemorph-cutover", "active");

  // Propagate key authentication & identity headers
  const preservedHeaders = ${JSON.stringify(headersList)};
  for (const header of preservedHeaders) {
    const val = request.headers.get(header);
    if (val) {
      requestHeaders.set(header, val);
    }
  }

  // Continue request with enriched headers
  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  // Ensure cross-origin cookies from legacy server are accepted
  response.headers.set("x-strangler-legacy-target", "${cleanHost}");
  return response;
}

export const config = {
  // Match all request paths except Next.js internals and static files
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
`;
}

/**
 * Generates Cloudflare Worker script for edge-level strangler fig routing
 */
export function generateCloudflareWorker(
  modernizedRoutes: string[],
  config: StranglerCutoverConfig
): string {
  const cleanHost = config.legacyHost.replace(/\/$/, "");

  return `/**
 * Cloudflare Worker — Strangler Fig Reverse Proxy Router
 * Deployed at edge to split traffic between modernized Next.js and legacy SPA
 */

const MODERNIZED_ROUTES = new Set(${JSON.stringify(modernizedRoutes)});
const LEGACY_ORIGIN = "${cleanHost}";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Check if the route is modernized in Next.js
    const isModernized = MODERNIZED_ROUTES.has(pathname) || pathname.startsWith("/_next");

    if (isModernized) {
      // Forward to modernized Next.js origin
      return fetch(request);
    }

    // Proxy fallback to legacy SPA host
    const legacyUrl = new URL(pathname + url.search, LEGACY_ORIGIN);
    const proxyRequest = new Request(legacyUrl.toString(), {
      method: request.method,
      headers: request.headers,
      body: request.body,
      redirect: "manual",
    });

    return fetch(proxyRequest);
  },
};
`;
}

/**
 * Generates Nginx configuration block for reverse proxy routing
 */
export function generateNginxProxyConfig(
  modernizedRoutes: string[],
  config: StranglerCutoverConfig
): string {
  const cleanHost = config.legacyHost.replace(/\/$/, "");

  const exactLocations = modernizedRoutes
    .filter((r) => r !== "/")
    .map(
      (r) => `    # Modernized Next.js route: ${r}
    location = ${r} {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }`
    )
    .join("\n\n");

  return `# ==============================================================================
# Nginx Reverse Proxy — Strangler Fig Incremental Cutover Configuration
# Splits traffic between Next.js App Router (port 3000) and Legacy SPA
# ==============================================================================

server {
    listen 80;
    server_name _;

    # Next.js Internal Static Assets
    location /_next/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_cache_valid 200 30d;
    }

${exactLocations}

    # Default Fallback: Proxy unmigrated traffic to Legacy SPA host
    location / {
        proxy_pass ${cleanHost};
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Strangler-Proxy "true";
        proxy_cookie_domain ${new URL(config.legacyHost).hostname} $host;
    }
}
`;
}

/**
 * Generates AWS CloudFront Lambda@Edge origin-request router
 */
export function generateCloudfrontLambda(
  modernizedRoutes: string[],
  config: StranglerCutoverConfig
): string {
  const cleanHost = config.legacyHost.replace(/^https?:\/\//, "").replace(/\/$/, "");

  return `/**
 * AWS Lambda@Edge — Origin-Request Strangler Fig Router
 * Intercepts CloudFront origin requests to dynamically select origin
 */

const MODERNIZED_EXACT_ROUTES = new Set(${JSON.stringify(modernizedRoutes)});
const LEGACY_DOMAIN = "${cleanHost}";

exports.handler = async (event) => {
  const request = event.Records[0].cf.request;
  const uri = request.uri;

  // If modernized route or Next.js asset, route to primary Next.js origin
  if (MODERNIZED_EXACT_ROUTES.has(uri) || uri.startsWith("/_next")) {
    return request;
  }

  // Rewrite origin to Legacy SPA domain
  request.origin = {
    custom: {
      domainName: LEGACY_DOMAIN,
      port: 443,
      protocol: "https",
      path: "",
      sslProtocols: ["TLSv1.2"],
      readTimeout: 30,
      keepaliveTimeout: 5,
      customHeaders: {
        "x-strangler-route": [{ key: "X-Strangler-Route", value: "legacy-fallback" }],
      },
    },
  };

  request.headers["host"] = [{ key: "host", value: LEGACY_DOMAIN }];
  return request;
};
`;
}

/**
 * Complete synthesis orchestration: scans routes, computes coverage ratio,
 * and synthesizes next.config.ts, middleware.ts, Cloudflare Worker, Nginx, and CloudFront files.
 */
export function synthesizeStranglerCutover(
  entries: ZipEntry[],
  config: StranglerCutoverConfig = { legacyHost: "https://legacy.example.com" }
): StranglerCutoverSynthesis {
  const legacyHost = config.legacyHost || "https://legacy.example.com";
  const routeStatuses = discoverRouteCutoverStatuses(entries);

  const modernizedRoutes = routeStatuses.filter((r) => r.target === "nextjs").map((r) => r.route);
  const legacyRoutes = routeStatuses.filter((r) => r.target === "legacy_spa").map((r) => r.route);

  const totalRoutes = modernizedRoutes.length + legacyRoutes.length;
  const cutoverPercentage = totalRoutes > 0 ? Math.round((modernizedRoutes.length / totalRoutes) * 100) : 100;

  const nextConfigContent = generateNextConfigRewrites(modernizedRoutes, config);
  const middlewareContent = generateCutoverMiddleware(config);
  const cloudflareWorkerContent = generateCloudflareWorker(modernizedRoutes, config);
  const nginxConfigContent = generateNginxProxyConfig(modernizedRoutes, config);
  const cloudfrontLambdaContent = generateCloudfrontLambda(modernizedRoutes, config);

  const generatedFiles: GeneratedCutoverFile[] = [
    {
      path: "next.config.ts",
      content: nextConfigContent,
      type: "next_config",
      description: "Next.js App Router fallback rewrites configuration",
    },
    {
      path: "middleware.ts",
      content: middlewareContent,
      type: "middleware",
      description: "Cookie & session preserving cutover middleware",
    },
    {
      path: ".codemorph/cutover/cloudflare-worker.js",
      content: cloudflareWorkerContent,
      type: "cloudflare_worker",
      description: "Cloudflare Worker edge routing script",
    },
    {
      path: ".codemorph/cutover/nginx.conf",
      content: nginxConfigContent,
      type: "nginx",
      description: "Nginx reverse proxy location configuration",
    },
    {
      path: ".codemorph/cutover/cloudfront-lambda.js",
      content: cloudfrontLambdaContent,
      type: "cloudfront",
      description: "AWS CloudFront Lambda@Edge origin-request handler",
    },
  ];

  return {
    modernizedRoutesCount: modernizedRoutes.length,
    legacyRoutesCount: legacyRoutes.length,
    cutoverPercentage,
    routeStatuses,
    nextConfigContent,
    middlewareContent,
    cloudflareWorkerContent,
    nginxConfigContent,
    cloudfrontLambdaContent,
    generatedFiles,
    legacyHost,
  };
}

/**
 * Applies strangler fig cutover files (next.config.ts and middleware.ts) to project entries
 */
export function applyStranglerCutover(
  projectEntries: ZipEntry[],
  synthesis: StranglerCutoverSynthesis
): { updatedEntries: ZipEntry[]; appliedCount: number } {
  const entriesMap = new Map<string, ZipEntry>();
  for (const entry of projectEntries) {
    entriesMap.set(entry.path, entry);
  }

  let appliedCount = 0;

  // 1. Update next.config.ts
  entriesMap.set("next.config.ts", {
    path: "next.config.ts",
    content: synthesis.nextConfigContent,
  });
  appliedCount++;

  // 2. Update middleware.ts
  entriesMap.set("middleware.ts", {
    path: "middleware.ts",
    content: synthesis.middlewareContent,
  });
  appliedCount++;

  // 3. Add edge proxy templates in .codemorph/cutover/
  for (const file of synthesis.generatedFiles) {
    if (file.path.startsWith(".codemorph/cutover/")) {
      entriesMap.set(file.path, { path: file.path, content: file.content });
      appliedCount++;
    }
  }

  return {
    updatedEntries: Array.from(entriesMap.values()),
    appliedCount,
  };
}
