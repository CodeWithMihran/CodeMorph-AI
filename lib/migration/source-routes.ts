import * as ts from "typescript";
import type { SourceFile } from "@/lib/github/source";

export type SourceRouteInventory = {
  required: { path: string; evidence: string[] }[];
  manual: { pattern: string; evidence: string[]; reason: string }[];
};

function normalizeStaticPath(value: string) {
  if (typeof value !== "string" || value.includes("\\") || value.includes("?") || value.includes("#")) return null;
  const parts = value.split("/").filter(Boolean);
  if (parts.some((part) => part === "." || part === ".." || part.startsWith("[") || part.startsWith(":") || part === "*" || !/^[A-Za-z0-9._~-]+$/.test(part))) return null;
  return parts.length ? `/${parts.join("/")}` : "/";
}

function routePath(parent: string, child: string) {
  if (child.startsWith("/")) return child;
  return `${parent.replace(/\/$/, "")}/${child}` || "/";
}

function htmlPath(file: string) {
  const normalized = file.replace(/\\/g, "/").replace(/^\/?(?:public|pages)\//i, "");
  if (!/\.html?$/i.test(normalized)) return null;
  const withoutExt = normalized.replace(/\.html?$/i, "");
  if (withoutExt === "index" || withoutExt.endsWith("/index")) return normalizeStaticPath(`/${withoutExt.replace(/(?:^|\/)index$/, "")}`.replace(/\/$/, "") || "/");
  return normalizeStaticPath(`/${withoutExt}`);
}

export function analyzeSourceRoutes(input: { sourceType: "static" | "react-vite"; files: SourceFile[]; routeCandidates: string[] }): SourceRouteInventory {
  const required = new Map<string, Set<string>>();
  const manual = new Map<string, { evidence: Set<string>; reason: string }>();
  const add = (route: string, evidence: string) => {
    const files = required.get(route) ?? new Set<string>(); files.add(evidence); required.set(route, files);
  };
  const addManual = (pattern: string, file: string, reason: string) => {
    const item = manual.get(pattern) ?? { evidence: new Set<string>(), reason };
    item.evidence.add(file); manual.set(pattern, item);
  };

  if (input.sourceType === "static") {
    for (const file of input.files) {
      const route = htmlPath(file.path);
      if (route) add(route, file.path);
    }
    for (const candidate of input.routeCandidates) {
      const route = htmlPath(candidate);
      if (route) add(route, candidate);
    }
  } else {
    for (const file of input.files) {
      if (!/\.[jt]sx?$/.test(file.path)) continue;
      const ast = ts.createSourceFile(file.path, file.content, ts.ScriptTarget.Latest, true, file.path.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
      let foundJsxRoute = false;
      let foundRouteFactory = false;
      const elementName = (element: ts.JsxOpeningLikeElement) => element.tagName.getText(ast).split(".").at(-1);
      const routeChildren = (element: ts.JsxElement | ts.JsxSelfClosingElement) => ts.isJsxElement(element) ? element.children : [];
      const readPath = (element: ts.JsxOpeningLikeElement) => {
        const attr = element.attributes.properties.find((item): item is ts.JsxAttribute => ts.isJsxAttribute(item) && item.name.getText(ast) === "path");
        const value = attr?.initializer;
        if (value && ts.isStringLiteral(value)) return value.text;
        if (value && ts.isJsxExpression(value) && value.expression && ts.isStringLiteralLike(value.expression)) return value.expression.text;
        return undefined;
      };
      const routeAttributes = (element: ts.JsxElement | ts.JsxSelfClosingElement) => ts.isJsxElement(element) ? element.openingElement.attributes : element.attributes;
      const scanRoute = (element: ts.JsxElement | ts.JsxSelfClosingElement, parent: string) => {
        foundJsxRoute = true;
        const attrs = routeAttributes(element);
        const indexRoute = attrs.properties.some((attribute) => ts.isJsxAttribute(attribute) && attribute.name.getText(ast) === "index");
        const pathValue = readPath(ts.isJsxElement(element) ? element.openingElement : element);
        let current = parent;
        if (indexRoute) {
          add(parent || "/", file.path);
        } else if (pathValue !== undefined) {
          const composed = routePath(parent, pathValue);
          const normalized = normalizeStaticPath(composed);
          if (normalized) {
            add(normalized, file.path);
            current = normalized;
          } else {
            addManual(composed || "<empty route>", file.path, "Dynamic, wildcard, or unsupported route path needs a migration decision.");
            current = composed;
          }
        } else if (attrs.properties.some((attribute) => ts.isJsxAttribute(attribute) && attribute.name.getText(ast) === "path")) {
          addManual("<computed route>", file.path, "The route path is computed at runtime and cannot be verified automatically.");
        }
        for (const child of routeChildren(element)) {
          if (ts.isJsxElement(child) && elementName(child.openingElement) === "Route") scanRoute(child, current);
          else if (ts.isJsxSelfClosingElement(child) && elementName(child) === "Route") scanRoute(child, current);
          else if (ts.isJsxFragment(child)) {
            const walkFragment = (fragment: ts.JsxFragment, prefix: string) => {
              for (const nested of fragment.children) {
                if (ts.isJsxElement(nested) && elementName(nested.openingElement) === "Route") scanRoute(nested, prefix);
                else if (ts.isJsxSelfClosingElement(nested) && elementName(nested) === "Route") scanRoute(nested, prefix);
                else if (ts.isJsxFragment(nested)) walkFragment(nested, prefix);
              }
            };
            walkFragment(child, current);
          }
        }
      };
      const visit = (node: ts.Node) => {
        if (ts.isIdentifier(node) && ["useRoutes", "createBrowserRouter", "createRoutesFromElements"].includes(node.text)) foundRouteFactory = true;
        if (ts.isJsxElement(node) && elementName(node.openingElement) === "Routes") {
          for (const child of node.children) {
            if (ts.isJsxElement(child) && elementName(child.openingElement) === "Route") scanRoute(child, "");
            else if (ts.isJsxSelfClosingElement(child) && elementName(child) === "Route") scanRoute(child, "");
            else if (ts.isJsxFragment(child)) {
              const walk = (fragment: ts.JsxFragment) => {
                for (const nested of fragment.children) {
                  if (ts.isJsxElement(nested) && elementName(nested.openingElement) === "Route") scanRoute(nested, "");
                  else if (ts.isJsxSelfClosingElement(nested) && elementName(nested) === "Route") scanRoute(nested, "");
                  else if (ts.isJsxFragment(nested)) walk(nested);
                }
              };
              walk(child);
            } else if (ts.isJsxExpression(child) || (ts.isJsxElement(child) && elementName(child.openingElement) !== "Route") || ts.isJsxSelfClosingElement(child)) {
              addManual("<dynamic route element>", file.path, "The Routes tree contains elements that cannot be resolved into static page paths.");
            }
          }
          return;
        }
        if ((ts.isJsxElement(node) && elementName(node.openingElement) === "Route") || (ts.isJsxSelfClosingElement(node) && elementName(node) === "Route")) {
          scanRoute(node, "");
          return;
        }
        ts.forEachChild(node, visit);
      };
      visit(ast);
      if (foundRouteFactory) addManual("<computed route inventory>", file.path, "A React Router route factory was detected; its runtime route configuration is not fully enumerated by this analyzer.");
      if (!foundJsxRoute && /from\s*["']react-router(?:-dom)?["']/.test(file.content)) {
        addManual("<unresolved React Router routes>", file.path, "React Router is imported, but no statically extractable JSX Route declarations were found in the inspected files.");
      }
    }
  }
  if (!required.size) add("/", input.routeCandidates[0] ?? "application entry");
  return {
    required: [...required.entries()].sort(([a], [b]) => a === "/" ? -1 : b === "/" ? 1 : a.localeCompare(b)).map(([route, evidence]) => ({ path: route, evidence: [...evidence].sort() })),
    manual: [...manual.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([pattern, item]) => ({ pattern, evidence: [...item.evidence].sort(), reason: item.reason })),
  };
}
