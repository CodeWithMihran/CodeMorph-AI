import { isJsonRecord } from "@/lib/github/api";

export type ClassifiedSource = {
  framework: string;
  sourceType: "static" | "react-vite" | "unsupported";
  supported: boolean;
  supportReason: string;
};

const KNOWN_FRAMEWORKS: Array<[string, string]> = [
  ["vue", "Vue"], ["nuxt", "Nuxt"], ["svelte", "Svelte"], ["@sveltejs/kit", "SvelteKit"],
  ["angular", "Angular"], ["@angular/core", "Angular"],
];
const BACKEND_FRAMEWORKS: Array<[string, string]> = [
  ["express", "Express"], ["fastify", "Fastify"], ["koa", "Koa"], ["@nestjs/core", "NestJS"],
];

export function classifySource(files: Set<string>, manifest: Record<string, unknown> | null): ClassifiedSource {
  if (manifest && typeof manifest.note === "string") {
    return { framework: "Unknown JavaScript project", sourceType: "unsupported", supported: false, supportReason: "The package manifest could not be safely parsed, so the source type could not be confirmed." };
  }
  const dependencies = {
    ...(isJsonRecord(manifest?.dependencies) ? manifest.dependencies : {}),
    ...(isJsonRecord(manifest?.devDependencies) ? manifest.devDependencies : {}),
  };
  const has = (name: string) => typeof dependencies[name] === "string";
  const hasReact = has("react");
  const hasVite = has("vite");
  if (hasReact && hasVite) {
    return { framework: "React + Vite", sourceType: "react-vite", supported: true, supportReason: "React + Vite is in the first supported migration path." };
  }
  if (has("next")) return { framework: "Next.js", sourceType: "unsupported", supported: false, supportReason: "Next.js repositories are recognized, but migrating from an existing Next.js app is outside the current source scope." };
  if (hasReact) return { framework: "React (other build setup)", sourceType: "unsupported", supported: false, supportReason: "This release supports React projects built with Vite. This repository uses another build setup." };
  if (hasVite) return { framework: "Vite (non-React)", sourceType: "unsupported", supported: false, supportReason: "This release currently supports React + Vite, not other Vite frameworks." };

  const known = KNOWN_FRAMEWORKS.find(([name]) => has(name));
  if (known) return { framework: known[1], sourceType: "unsupported", supported: false, supportReason: `${known[1]} is recognized, but this release does not migrate it yet.` };
  const backend = BACKEND_FRAMEWORKS.find(([name]) => has(name));
  if (backend) return { framework: backend[1], sourceType: "unsupported", supported: false, supportReason: `${backend[1]} backend projects are outside the current static-site and React + Vite migration scope.` };

  const hasRootHtml = files.has("index.html");
  const hasNoRuntimeDependencies = !isJsonRecord(manifest?.dependencies) || Object.keys(manifest.dependencies).length === 0;
  if (hasRootHtml && (!manifest || hasNoRuntimeDependencies)) {
    return {
      framework: "Static HTML/CSS/JavaScript",
      sourceType: "static",
      supported: true,
      supportReason: manifest
        ? "A root HTML entry point was found without runtime dependencies; this fits the static-site source path."
        : "A root HTML entry point was found with no package manifest; this fits the static-site source path.",
    };
  }
  if (manifest && typeof manifest.name === "string") {
    return { framework: "Unknown JavaScript project", sourceType: "unsupported", supported: false, supportReason: "A package manifest was found, but its framework could not be confidently identified." };
  }
  return { framework: "Unknown", sourceType: "unsupported", supported: false, supportReason: "No supported framework or recognizable site entry point was found." };
}
