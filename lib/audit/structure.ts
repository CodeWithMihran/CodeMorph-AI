import { builtinModules } from "node:module";
import path from "node:path";
import * as ts from "typescript";
import { isAuditableSourcePath, type SourceManifest } from "@/lib/source/manifest";
import type { AuditFinding } from "./types";
import { redactAuditEvidence } from "./sanitize";

type ImportReference = { specifier: string; line: number; column: number };
type StructuralResult = {
  findings: AuditFinding[];
  metrics: {
    parsedFiles: number;
    syntaxErrors: number;
    internalImports: number;
    resolvedInternalImports: number;
    unresolvedInternalImports: number;
    packageImports: number;
    undeclaredPackageImports: number;
  };
};

const CODE_FILE = /\.(?:[cm]?[jt]sx?)$/i;
const RESOLVE_EXTENSIONS = ["", ".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs", ".json", ".css", ".scss", ".sass"];
const RESOLVE_INDEXES = ["index.ts", "index.tsx", "index.mts", "index.cts", "index.js", "index.jsx", "index.mjs", "index.cjs", "index.json"];

function lineAt(content: string, line: number) {
  return content.split(/\r?\n/)[line - 1] ?? "";
}

function finding(input: {
  ruleId: string;
  title: string;
  file: string;
  content: string;
  line: number;
  column?: number;
  severity: AuditFinding["severity"];
  explanation: string;
  recommendation: string;
  evidence?: string;
}): AuditFinding {
  return {
    id: `${input.ruleId}:${input.file}:${input.line}:${input.column ?? 1}`,
    ruleId: input.ruleId,
    title: input.title,
    category: "correctness",
    severity: input.severity,
    confidence: "high",
    file: input.file,
    line: input.line,
    ...(input.column ? { column: input.column } : {}),
    evidence: redactAuditEvidence(input.evidence ?? lineAt(input.content, input.line)),
    explanation: input.explanation,
    recommendation: input.recommendation,
    provenance: "typescript-parser",
  };
}

function isCodePath(file: string) {
  return CODE_FILE.test(file) && isAuditableSourcePath(file);
}

function parseTsconfig(manifest: SourceManifest) {
  const file = manifest.metadataFiles.find((item) => item.path === "tsconfig.json") ?? manifest.files.find((item) => item.path === "tsconfig.json");
  if (!file) return { baseUrl: "", paths: {} as Record<string, string[]> };
  const parsed = ts.parseConfigFileTextToJson(file.path, file.content);
  if (parsed.error || !parsed.config || typeof parsed.config !== "object") return { baseUrl: "", paths: {} as Record<string, string[]> };
  const options = parsed.config.compilerOptions && typeof parsed.config.compilerOptions === "object" ? parsed.config.compilerOptions : {};
  const rawPaths = options.paths && typeof options.paths === "object" ? options.paths : {};
  const paths: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(rawPaths)) {
    if (Array.isArray(value)) paths[key] = value.filter((item): item is string => typeof item === "string").slice(0, 16);
  }
  return { baseUrl: typeof options.baseUrl === "string" ? options.baseUrl : "", paths };
}

function parseDeclaredPackages(manifest: SourceManifest) {
  const declared = new Set<string>();
  const workspaceNames = new Set<string>();
  for (const file of manifest.metadataFiles.filter((item) => item.path.toLowerCase().endsWith("package.json"))) {
    try {
      const pkg: unknown = JSON.parse(file.content);
      if (!pkg || typeof pkg !== "object") continue;
      const record = pkg as Record<string, unknown>;
      for (const key of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
        const table = record[key];
        if (table && typeof table === "object" && !Array.isArray(table)) {
          for (const name of Object.keys(table)) declared.add(name);
        }
      }
      if (typeof record.name === "string") workspaceNames.add(record.name);
    } catch {
      // Invalid manifests are reported by the package-metadata pass, not interpreted as dependencies.
    }
  }
  return { declared, workspaceNames };
}

function moduleSpecifiers(source: ts.SourceFile) {
  const refs: ImportReference[] = [];
  const add = (node: ts.Node, value: ts.Expression | undefined) => {
    if (!value || !ts.isStringLiteralLike(value)) return;
    const location = source.getLineAndCharacterOfPosition(node.getStart(source));
    refs.push({ specifier: value.text, line: location.line + 1, column: location.character + 1 });
  };
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) add(node, node.moduleSpecifier);
    else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) add(node, node.argument.literal as ts.Expression);
    else if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments.length === 1) add(node, node.arguments[0]);
      else if (ts.isIdentifier(node.expression) && node.expression.text === "require" && node.arguments.length === 1) add(node, node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return refs;
}

function resolveBase(base: string, known: Set<string>) {
  const clean = path.posix.normalize(base.replaceAll("\\", "/")).replace(/^\.\//, "");
  const explicitExtension = /\.(?:[cm]?[jt]sx?|json|css|scss|sass)$/i.exec(clean)?.[0];
  const extensionless = explicitExtension ? clean.slice(0, -explicitExtension.length) : clean;
  const substitutions = explicitExtension === ".js" ? [".js", ".ts", ".tsx", ".d.ts"]
    : explicitExtension === ".jsx" ? [".jsx", ".tsx", ".d.ts"]
      : explicitExtension === ".mjs" ? [".mjs", ".mts", ".d.mts"]
        : explicitExtension === ".cjs" ? [".cjs", ".cts", ".d.cts"] : RESOLVE_EXTENSIONS;
  for (const extension of substitutions) if (known.has(explicitExtension ? extensionless + extension : clean + extension)) return true;
  for (const index of RESOLVE_INDEXES) if (known.has(`${clean.replace(/\/$/, "")}/${index}`)) return true;
  return false;
}

function aliasTargets(specifier: string, paths: Record<string, string[]>, baseUrl: string) {
  const results: string[] = [];
  for (const [pattern, targets] of Object.entries(paths)) {
    const star = pattern.indexOf("*");
    if (star < 0) {
      if (specifier !== pattern) continue;
      results.push(...targets.map((target) => path.posix.join(baseUrl, target)));
      continue;
    }
    const prefix = pattern.slice(0, star);
    const suffix = pattern.slice(star + 1);
    if (!specifier.startsWith(prefix) || !specifier.endsWith(suffix)) continue;
    const capture = specifier.slice(prefix.length, specifier.length - suffix.length);
    results.push(...targets.map((target) => path.posix.join(baseUrl, target.replace("*", capture))));
  }
  if (specifier.startsWith("@/")) results.push(specifier.slice(2));
  if (specifier.startsWith("~/")) results.push(specifier.slice(2));
  return results;
}

function packageRoot(specifier: string) {
  if (specifier.startsWith("@")) return specifier.split("/").slice(0, 2).join("/");
  return specifier.split("/")[0];
}

export function auditStructure(manifest: SourceManifest): StructuralResult {
  const knownPaths = new Set(manifest.files.map((file) => file.path));
  const { baseUrl, paths } = parseTsconfig(manifest);
  const { declared, workspaceNames } = parseDeclaredPackages(manifest);
  const findings: AuditFinding[] = [];
  const metrics = {
    parsedFiles: 0,
    syntaxErrors: 0,
    internalImports: 0,
    resolvedInternalImports: 0,
    unresolvedInternalImports: 0,
    packageImports: 0,
    undeclaredPackageImports: 0,
  };

  for (const file of manifest.files) {
    if (!isCodePath(file.path)) continue;
    metrics.parsedFiles += 1;
    const extension = path.posix.extname(file.path).toLowerCase();
    const scriptKind = extension === ".tsx" ? ts.ScriptKind.TSX
      : extension === ".jsx" ? ts.ScriptKind.JSX
        : [".ts", ".mts", ".cts"].includes(extension) ? ts.ScriptKind.TS : ts.ScriptKind.JS;
    const source = ts.createSourceFile(file.path, file.content, ts.ScriptTarget.Latest, false, scriptKind);
    for (const diagnostic of (source as ts.SourceFile & { parseDiagnostics: readonly ts.Diagnostic[] }).parseDiagnostics) {
      const location = diagnostic.start === undefined ? { line: 0, character: 0 } : source.getLineAndCharacterOfPosition(diagnostic.start);
      const line = location.line + 1;
      metrics.syntaxErrors += 1;
      findings.push(finding({
        ruleId: "AST001", title: "JavaScript or TypeScript syntax error", file: file.path, content: file.content,
        line, column: location.character + 1, severity: "high",
        explanation: redactAuditEvidence(ts.flattenDiagnosticMessageText(diagnostic.messageText, " ")),
        recommendation: "Fix the reported parse error, then run the project’s compiler or build to check for additional type and configuration issues.",
      }));
    }

    for (const reference of moduleSpecifiers(source)) {
      const specifier = reference.specifier;
      if (!specifier || /^(?:https?:|data:|https?:\/\/)/i.test(specifier) || specifier.startsWith("#")) continue;
      const assetSuffix = /\.(?:svg|png|jpe?g|gif|webp|avif|ico|pdf|mp[34]|webm|woff2?|ttf|otf|wasm|md|txt|xml)(?:\?.*)?$/i.test(specifier);
      if (assetSuffix) continue;

      if (specifier.startsWith(".") || specifier.startsWith("/")) {
        metrics.internalImports += 1;
        const importerDirectory = path.posix.dirname(file.path);
        const resolved = specifier.startsWith("/") ? specifier.slice(1) : path.posix.join(importerDirectory, specifier);
        if (resolved === ".." || resolved.startsWith("../")) {
          metrics.unresolvedInternalImports += 1;
          findings.push(finding({
            ruleId: "IMP002", title: "Import escapes the project root", file: file.path, content: file.content,
            line: reference.line, column: reference.column, severity: "high",
            explanation: `The relative import ${specifier} resolves outside the repository root.`,
            recommendation: "Move the shared module inside the project root or update the import to a valid in-project path.",
          }));
        } else if (resolveBase(resolved, knownPaths)) metrics.resolvedInternalImports += 1;
        else {
          metrics.unresolvedInternalImports += 1;
          findings.push(finding({
            ruleId: "IMP001", title: "Internal import does not resolve", file: file.path, content: file.content,
            line: reference.line, column: reference.column, severity: "high",
            explanation: `No scanned source file matches the relative import ${specifier}. The target may be omitted or use an unsupported extension.`,
            recommendation: "Check the import path and casing, and ensure the referenced file is included in the source archive.",
          }));
        }
        continue;
      }

      const alias = aliasTargets(specifier, paths, baseUrl);
      if (alias.length > 0) {
        metrics.internalImports += 1;
        if (alias.some((target) => resolveBase(target, knownPaths))) metrics.resolvedInternalImports += 1;
        else {
          metrics.unresolvedInternalImports += 1;
          findings.push(finding({
            ruleId: "IMP001", title: "Path alias does not resolve", file: file.path, content: file.content,
            line: reference.line, column: reference.column, severity: "high",
            explanation: `No scanned source file matches the configured alias import ${specifier}.`,
            recommendation: "Check the tsconfig path mapping and the referenced file path and casing.",
          }));
        }
        continue;
      }

      if (specifier.startsWith("node:") || builtinModules.includes(specifier)) continue;
      metrics.packageImports += 1;
      const root = packageRoot(specifier);
      if (!declared.has(root) && !workspaceNames.has(root)) {
        metrics.undeclaredPackageImports += 1;
        findings.push(finding({
          ruleId: "DEP002", title: "Imported package is not declared", file: file.path, content: file.content,
          line: reference.line, column: reference.column, severity: "medium",
          explanation: `The import ${specifier} does not match a dependency in the scanned package manifests.`,
          recommendation: "Add the package to the appropriate package.json or confirm that it is provided by a custom resolver.",
        }));
      }
    }
  }
  return { findings, metrics };
}
