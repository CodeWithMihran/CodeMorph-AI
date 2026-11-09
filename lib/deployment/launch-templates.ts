import type { ZipEntry } from "@/lib/migration/zip";

export type CloudProviderId = "vercel" | "netlify" | "expo_eas" | "docker" | "env_example";

export interface DeploymentPreset {
  id: CloudProviderId;
  providerName: string;
  badge: string;
  icon: string;
  filename: string;
  content: string;
  deployUrl?: string;
  recommendedFor: "nextjs" | "expo" | "all";
  cliCommand?: string;
  checklist: string[];
}

export interface DeploymentPresetGroup {
  presets: DeploymentPreset[];
  discoveredEnvVars: string[];
  envExampleFile: { filename: string; content: string };
}

/**
 * Scans project code for environment variable references (process.env.* or EXPO_PUBLIC_*).
 */
export function extractEnvVariables(entries: ZipEntry[]): string[] {
  const envVars = new Set<string>();
  const envRegex = /\b(?:process\.env\.(NEXT_PUBLIC_[A-Z0-9_]+|EXPO_PUBLIC_[A-Z0-9_]+|[A-Z0-9_]+))\b/g;

  for (const entry of entries) {
    if (!entry.path.endsWith(".tsx") && !entry.path.endsWith(".ts") && !entry.path.endsWith(".js") && !entry.path.endsWith(".jsx")) {
      continue;
    }
    let match: RegExpExecArray | null;
    while ((match = envRegex.exec(entry.content)) !== null) {
      const varName = match[1];
      if (
        varName &&
        varName !== "NODE_ENV" &&
        varName !== "PWD" &&
        !varName.startsWith("npm_")
      ) {
        envVars.add(varName);
      }
    }
  }

  return Array.from(envVars).sort();
}

/**
 * Generates an official Vercel deployment configuration preset.
 */
export function generateVercelConfig(projectName = "my-migrated-app"): DeploymentPreset {
  const content = JSON.stringify(
    {
      $schema: "https://openapi.vercel.sh/vercel.json",
      framework: "nextjs",
      cleanUrls: true,
      headers: [
        {
          source: "/(.*)",
          headers: [
            { key: "X-Content-Type-Options", value: "nosniff" },
            { key: "X-Frame-Options", value: "DENY" },
            { key: "X-XSS-Protection", value: "1; mode=block" },
            { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          ],
        },
      ],
    },
    null,
    2
  );

  const safeName = encodeURIComponent(projectName.toLowerCase().replace(/[^a-z0-9-]/g, "-"));
  const deployUrl = `https://vercel.com/new/clone?repository-name=${safeName}&project-name=${safeName}&framework=nextjs`;

  return {
    id: "vercel",
    providerName: "Vercel",
    badge: "Official Next.js Cloud",
    icon: "▲",
    filename: "vercel.json",
    content,
    deployUrl,
    recommendedFor: "nextjs",
    cliCommand: "npx vercel --prod",
    checklist: [
      "Zero-configuration Next.js App Router support out-of-the-box",
      "Automatic Server Components, Server Actions, and streaming SSR edge runtime",
      "Global Image Optimization for Next.js <Image /> components",
      "Automatic SSL, preview deployments, and instant rollbacks",
    ],
  };
}

/**
 * Generates an official Netlify deployment configuration preset.
 */
export function generateNetlifyConfig(): DeploymentPreset {
  const content = `# Netlify Configuration for Next.js App Router
[build]
  command = "npm run build"
  publish = ".next"

[[plugins]]
  package = "@netlify/plugin-nextjs"

[build.environment]
  NODE_VERSION = "20"
  NPM_FLAGS = "--legacy-peer-deps"

[[headers]]
  for = "/*"
  [headers.values]
    X-Frame-Options = "DENY"
    X-Content-Type-Options = "nosniff"
    Referrer-Policy = "strict-origin-when-cross-origin"
`;

  return {
    id: "netlify",
    providerName: "Netlify",
    badge: "Jamstack & Edge Platform",
    icon: "💎",
    filename: "netlify.toml",
    content,
    deployUrl: "https://app.netlify.com/start",
    recommendedFor: "nextjs",
    cliCommand: "npx netlify deploy --prod",
    checklist: [
      "@netlify/plugin-nextjs handles App Router dynamic routing and API handlers",
      "Automated edge prerendering and CDN asset caching",
      "Environment variable encryption and team branch previews",
    ],
  };
}

/**
 * Generates an Expo Application Services (EAS) configuration preset.
 */
export function generateExpoEasConfig(projectName = "my-mobile-app"): DeploymentPreset {
  const safeName = encodeURIComponent(projectName.toLowerCase().replace(/[^a-z0-9-]/g, "-"));
  const content = JSON.stringify(
    {
      cli: {
        version: ">= 10.0.0",
        appVersionSource: "remote",
      },
      build: {
        development: {
          developmentClient: true,
          distribution: "internal",
          ios: {
            simulator: true,
          },
        },
        preview: {
          distribution: "internal",
          android: {
            buildType: "apk",
          },
        },
        production: {
          autoIncrement: true,
          android: {
            buildType: "app-bundle",
          },
          ios: {
            enterpriseProvisioning: "adhoc",
          },
        },
      },
      submit: {
        production: {
          android: {
            track: "internal",
          },
        },
      },
    },
    null,
    2
  );

  return {
    id: "expo_eas",
    providerName: "Expo Application Services (EAS)",
    badge: "Official Mobile Cloud",
    icon: "📱",
    filename: "eas.json",
    content,
    deployUrl: `https://expo.dev/accounts/create?project=${safeName}`,
    recommendedFor: "expo",
    cliCommand: "npx eas build --platform all",
    checklist: [
      "Cloud build pipelines for native iOS (.ipa) and Android (.aab) binaries without Xcode/Android Studio",
      "Instant OTA (Over-The-Air) updates with 'eas update' without App Store re-review",
      "Automated App Store & Google Play Store submission workflows",
    ],
  };
}

/**
 * Generates a production multi-stage Dockerfile optimized for Next.js standalone output.
 */
export function generateProductionDockerConfig(): DeploymentPreset {
  const content = `# Production Multi-Stage Next.js Dockerfile
FROM node:20-alpine AS base

# Step 1: Install dependencies
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

# Step 2: Build source code
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Step 3: Production runner
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

# Automatically leverage output traces to reduce image size
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
`;

  return {
    id: "docker",
    providerName: "Docker Container / AWS / GCP",
    badge: "Self-Hosted & Kubernetes",
    icon: "🐳",
    filename: "Dockerfile",
    content,
    recommendedFor: "all",
    cliCommand: "docker build -t codemorph-app . && docker run -p 3000:3000 codemorph-app",
    checklist: [
      "Multi-stage Docker build minimizing final image size (< 120 MB)",
      "Hardened security: non-root user execution ('nextjs:nodejs')",
      "Compatible with AWS ECS, Google Cloud Run, Azure Container Apps, and Railway",
    ],
  };
}

/**
 * Synthesizes an example environment variable configuration file (.env.example).
 */
export function generateEnvExamplePreset(discoveredVars: string[]): DeploymentPreset {
  let content = "# Required Environment Variables for Production Launch\n";
  if (discoveredVars.length === 0) {
    content += "# No custom process.env variables detected in migrated code.\n";
    content += "# Add any third-party API keys or database URLs below:\n";
    content += "NEXT_PUBLIC_APP_URL=https://my-app.vercel.app\n";
    content += "API_SECRET_KEY=your_secret_key_here\n";
  } else {
    for (const v of discoveredVars) {
      content += `${v}=your_${v.toLowerCase()}_here\n`;
    }
  }

  return {
    id: "env_example",
    providerName: "Environment Variables",
    badge: "Config & Secrets",
    icon: "🔐",
    filename: ".env.example",
    content,
    recommendedFor: "all",
    checklist: [
      "Ensure all NEXT_PUBLIC_* / EXPO_PUBLIC_* variables are defined in your cloud dashboard",
      "Never commit production secrets (.env.local) to source control",
      "Document required keys for team members in .env.example",
    ],
  };
}

/**
 * Returns all applicable deployment presets for the current migrated codebase.
 */
export function getDeploymentPresets(
  targetName: string,
  projectName = "codemorph-project",
  entries: ZipEntry[] = []
): DeploymentPresetGroup {
  const isExpo = targetName.toLowerCase().includes("expo");
  const discoveredVars = extractEnvVariables(entries);

  const vercel = generateVercelConfig(projectName);
  const netlify = generateNetlifyConfig();
  const expoEas = generateExpoEasConfig(projectName);
  const docker = generateProductionDockerConfig();
  const envExample = generateEnvExamplePreset(discoveredVars);

  const presets: DeploymentPreset[] = isExpo
    ? [expoEas, envExample, docker]
    : [vercel, netlify, docker, envExample];

  return {
    presets,
    discoveredEnvVars: discoveredVars,
    envExampleFile: {
      filename: envExample.filename,
      content: envExample.content,
    },
  };
}
