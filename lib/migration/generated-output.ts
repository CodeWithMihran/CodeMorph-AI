import { builtinModules } from "node:module";
import * as ts from "typescript";
import { isJsonRecord } from "@/lib/github/api";
import { containsCredentialPattern } from "@/lib/github/source";
import { ModelError, type GeneratedFile } from "./model";
import type { MigrationTarget } from "./plan";

const MAX_OUTPUT_FILES = 24;
const MAX_OUTPUT_FILE_BYTES = 40_000;
const MAX_OUTPUT_BYTES = 250_000;

function validGeneratedPath(path: string, target: MigrationTarget = "nextjs") {
  if (path.length > 200 || path.startsWith("/") || path.includes("\\") || path.includes(":") || path.includes("\u0000")) return false;
  const segments = path.split("/");
  if (segments.some((part) => !part || part === "." || part === ".." || part.startsWith("."))) return false;
  if (target === "expo") {
    if (!/^(?:app\/(?!api\/)[a-zA-Z0-9_./-]+|components\/[a-zA-Z0-9_./-]+)\.tsx?$/.test(path)) return false;
    if (["app/_layout.tsx", "package.json", "app.json", "tsconfig.json"].includes(path)) return false;
    return true;
  }
  if (!/^(?:app\/(?!api\/)[a-zA-Z0-9_./-]+|components\/[a-zA-Z0-9_./-]+)\.(?:tsx?|css)$/.test(path)) return false;
  if (["app/layout.tsx", "package.json", "tsconfig.json", "next.config.ts"].includes(path)) return false;
  return true;
}

function moduleSpecifiers(file: GeneratedFile) {
  const source = ts.createSourceFile(file.path, file.content, ts.ScriptTarget.Latest, false,
    file.path.endsWith(".tsx") ? ts.ScriptKind.TSX : file.path.endsWith(".ts") ? ts.ScriptKind.TS : ts.ScriptKind.JSX);
  const specifiers: string[] = [];
  const add = (value: ts.Expression | undefined) => {
    if (value && ts.isStringLiteralLike(value)) specifiers.push(value.text);
  };
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) add(node.moduleSpecifier);
    else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) add(node.argument.literal as ts.Expression);
    else if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        if (node.arguments.length === 0 || !ts.isStringLiteralLike(node.arguments[0])) {
          throw new ModelError("The generated output used a computed dynamic import that cannot be safely validated.");
        }
        add(node.arguments[0]);
      }
      else if (ts.isIdentifier(node.expression) && node.expression.text === "require" && node.arguments.length === 1) add(node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return specifiers;
}

function packageRoot(specifier: string) {
  if (specifier.startsWith("@")) return specifier.split("/").slice(0, 2).join("/");
  return specifier.split("/")[0];
}

function isNodeBuiltin(specifier: string) {
  const unprefixed = specifier.replace(/^node:/, "");
  return specifier.startsWith("node:") || builtinModules.includes(unprefixed);
}

function isAllowedPackage(specifier: string, target: MigrationTarget = "nextjs") {
  if (target === "expo") {
    return (
      specifier === "react" ||
      specifier.startsWith("react/") ||
      specifier === "react-native" ||
      specifier.startsWith("react-native/") ||
      specifier === "expo" ||
      specifier.startsWith("expo/") ||
      specifier === "expo-router" ||
      specifier.startsWith("expo-router/") ||
      specifier === "expo-status-bar" ||
      specifier === "expo-constants" ||
      specifier === "expo-linking" ||
      specifier === "react-native-safe-area-context" ||
      specifier === "react-native-screens"
    );
  }
  return (
    specifier === "react" ||
    specifier.startsWith("react/") ||
    specifier === "react-dom" ||
    specifier.startsWith("react-dom/") ||
    specifier === "next" ||
    specifier.startsWith("next/")
  );
}

export function validateGeneratedFiles(value: unknown, target: MigrationTarget = "nextjs"): GeneratedFile[] {
  const minFiles = target === "expo" ? 1 : 2;
  if (!Array.isArray(value) || value.length < minFiles || value.length > MAX_OUTPUT_FILES) {
    throw new ModelError("The model generated an incomplete or oversized file set. Try again with a smaller source.");
  }
  const files: GeneratedFile[] = [];
  const seen = new Set<string>();
  let totalBytes = 0;
  for (const item of value) {
    if (!isJsonRecord(item) || typeof item.path !== "string" || typeof item.content !== "string" || !validGeneratedPath(item.path, target)) {
      throw new ModelError("The model returned an invalid project file path. The output was blocked.");
    }
    if (seen.has(item.path)) throw new ModelError("The model returned duplicate project files. Try generating again.");
    const size = Buffer.byteLength(item.content, "utf8");
    if (size > MAX_OUTPUT_FILE_BYTES) throw new ModelError("A generated file exceeded the output size limit.");
    if (containsCredentialPattern(item.content)) throw new ModelError("The generated output contained a credential-like value and was blocked. Try again.");
    if (/\b(?:eval\s*\(|new\s+Function\s*\(|require\s*\()/i.test(item.content)) {
      throw new ModelError("The generated output used a blocked dynamic-code or operating-system API.");
    }
    if (target === "expo" && /<(?:div|span|p|button|a|h[1-6]|input|textarea|select|option|img|section|header|footer|main|nav|aside|article|ul|ol|li|table|thead|tbody|tr|td|th|form|label|iframe|canvas|video|audio)\b/i.test(item.content)) {
      throw new ModelError("The generated Expo mobile project contained web HTML elements instead of React Native primitives (View, Text, Pressable, Image).");
    }
    totalBytes += size;
    if (totalBytes > MAX_OUTPUT_BYTES) throw new ModelError("The generated project exceeded the total output size limit.");
    seen.add(item.path);
    files.push({ path: item.path, content: item.content });
  }

  if (target === "expo") {
    if (!seen.has("app/index.tsx")) {
      throw new ModelError("The model did not return the required Expo mobile entry screen (app/index.tsx). Try again.");
    }
  } else {
    if (!seen.has("app/page.tsx") || !seen.has("app/globals.css")) {
      throw new ModelError("The model did not return the required Next.js page and stylesheet. Try again.");
    }
  }

  const scaffoldFiles = target === "expo"
    ? ["app/_layout.tsx", "package.json", "app.json", "tsconfig.json", ".gitignore", "README.md", "MIGRATION-REPORT.md"]
    : ["app/layout.tsx", "package.json", "tsconfig.json", "next.config.ts", ".gitignore", "README.md", "MIGRATION-REPORT.md"];
  const available = new Set([...seen, ...scaffoldFiles]);

  for (const file of files) {
    for (const specifier of moduleSpecifiers(file)) {
      if (isNodeBuiltin(specifier)) {
        throw new ModelError("The generated output imported a Node.js built-in module, which is not allowed.");
      }
      if (isAllowedPackage(specifier, target)) continue;
      if (specifier.startsWith("@/")) {
        const stem = specifier.slice(2);
        if (![stem, `${stem}.tsx`, `${stem}.ts`, `${stem}.css`, `${stem}/index.tsx`, `${stem}/index.ts`].some((path) => available.has(path))) {
          throw new ModelError(`A generated file imports a path that was not included (${specifier}). Try generating again.`);
        }
        continue;
      }
      if (specifier.startsWith("./") || specifier.startsWith("../")) {
        const base = file.path.split("/").slice(0, -1).join("/");
        const stem = `${base}/${specifier}`.split("/").reduce<string[]>((segments, part) => {
          if (part === "..") segments.pop();
          else if (part !== "." && part) segments.push(part);
          return segments;
        }, []).join("/");
        if (![stem, `${stem}.tsx`, `${stem}.ts`, `${stem}.css`, `${stem}/index.tsx`, `${stem}/index.ts`].some((path) => available.has(path))) {
          throw new ModelError(`A generated file imports a file that was not included (${specifier}). Try generating again.`);
        }
        continue;
      }
      throw new ModelError(`The generated project requested an unsupported dependency (${packageRoot(specifier)}). Try generating again.`);
    }
  }
  return files;
}

export function generatedRoutePaths(files: GeneratedFile[], target: MigrationTarget = "nextjs") {
  const routes = new Set<string>();
  for (const file of files) {
    if (target === "expo") {
      if (file.path === "app/index.tsx") {
        routes.add("/");
        continue;
      }
      const matchScreen = /^app\/(.*)\.tsx$/i.exec(file.path);
      if (matchScreen) {
        const routeName = matchScreen[1].replace(/\/index$/, "");
        if (routeName && routeName !== "_layout") {
          routes.add(`/${routeName}`);
        }
      }
    } else {
      const match = /^app\/(.*\/)?page\.tsx$/i.exec(file.path);
      if (!match) continue;
      const segments = (match[1] ?? "").replace(/\/$/, "").split("/").filter(Boolean);
      routes.add(segments.length ? `/${segments.join("/")}` : "/");
    }
  }
  if (!routes.has("/")) routes.add("/");
  return [...routes].sort((left, right) => left === "/" ? -1 : right === "/" ? 1 : left.localeCompare(right));
}
