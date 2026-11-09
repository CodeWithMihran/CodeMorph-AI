import type { ZipEntry } from "@/lib/migration/zip";

export type GraphNodeKind = "route" | "component" | "state_hook" | "utility" | "style" | "package";

export interface GraphNode {
  id: string;
  label: string;
  kind: GraphNodeKind;
  fanIn: number;
  fanOut: number;
  instability: number; // 0 (completely stable) to 1 (completely unstable)
  isCircular: boolean;
  x: number;
  y: number;
  size: number;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  isCircular: boolean;
}

export interface CircularCycle {
  cycle: string[];
}

export interface ArchitectureMetrics {
  totalModules: number;
  totalEdges: number;
  routesCount: number;
  componentsCount: number;
  hooksCount: number;
  packagesCount: number;
  circularCycleCount: number;
  highestCoupledModule: { id: string; count: number } | null;
  mostUnstableModule: { id: string; instability: number } | null;
}

export interface ArchitectureGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  cycles: CircularCycle[];
  metrics: ArchitectureMetrics;
}

/**
 * Classifies a module path into a high-level architectural role.
 */
export function classifyNodeKind(path: string): GraphNodeKind {
  if (path.startsWith("app/") && (path.endsWith("/page.tsx") || path === "app/page.tsx" || path === "app/index.tsx" || path.endsWith("/route.ts"))) {
    return "route";
  }
  if (path.includes("components/") || path.includes("/components/")) {
    return "component";
  }
  if (path.includes("hooks/") || path.includes("context/") || path.includes("store/") || path.includes("state/")) {
    return "state_hook";
  }
  if (path.endsWith(".css") || path.endsWith(".scss")) {
    return "style";
  }
  if (path.includes("lib/") || path.includes("utils/") || path.includes("helpers/") || path.includes("services/")) {
    return "utility";
  }
  if (!path.includes("/")) {
    return "package";
  }
  return "component";
}

/**
 * Extracts all import/export specifiers from code using regex (safe for browser and server).
 */
export function extractImportSpecifiers(content: string): string[] {
  const specifiers = new Set<string>();
  const importRegex = /(?:import|export)\s+(?:[\w*\s{},]+from\s+)?["']([^"']+)["']/g;
  let match: RegExpExecArray | null;

  while ((match = importRegex.exec(content)) !== null) {
    const spec = match[1].trim();
    if (spec) specifiers.add(spec);
  }

  // Also match dynamic import("...")
  const dynamicRegex = /import\s*\(\s*["']([^"']+)["']\s*\)/g;
  while ((match = dynamicRegex.exec(content)) !== null) {
    const spec = match[1].trim();
    if (spec) specifiers.add(spec);
  }

  return Array.from(specifiers);
}

/**
 * Resolves a relative import path against the source file path.
 */
export function resolveModulePath(
  sourcePath: string,
  specifier: string,
  allPaths: Set<string>
): string | null {
  // Handle alias "@/..."
  if (specifier.startsWith("@/")) {
    const clean = specifier.slice(2);
    const candidates = [clean, `${clean}.tsx`, `${clean}.ts`, `${clean}.jsx`, `${clean}.js`, `${clean}/index.tsx`, `${clean}/index.ts`];
    for (const c of candidates) {
      if (allPaths.has(c)) return c;
    }
    return null;
  }

  // Handle relative imports "./..." or "../..."
  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    const sourceDir = sourcePath.includes("/")
      ? sourcePath.substring(0, sourcePath.lastIndexOf("/"))
      : "";
    const parts = sourceDir ? sourceDir.split("/") : [];
    const relParts = specifier.split("/");

    for (const p of relParts) {
      if (p === ".") continue;
      if (p === "..") {
        if (parts.length > 0) parts.pop();
      } else {
        parts.push(p);
      }
    }

    const base = parts.join("/");
    const candidates = [
      base,
      `${base}.tsx`,
      `${base}.ts`,
      `${base}.jsx`,
      `${base}.js`,
      `${base}/index.tsx`,
      `${base}/index.ts`,
      `${base}.css`,
    ];

    for (const c of candidates) {
      if (allPaths.has(c)) return c;
    }
    return null;
  }

  // Otherwise, it's an external package
  return null;
}

/**
 * Detects circular dependency cycles using Depth First Search (DFS).
 */
export function findCircularCycles(
  adjacencyMap: Map<string, Set<string>>
): { cycles: CircularCycle[]; circularNodeIds: Set<string>; circularEdgeKeys: Set<string> } {
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const currentPath: string[] = [];
  const cycles: CircularCycle[] = [];
  const circularNodeIds = new Set<string>();
  const circularEdgeKeys = new Set<string>();

  function dfs(node: string) {
    visited.add(node);
    recursionStack.add(node);
    currentPath.push(node);

    const neighbors = adjacencyMap.get(node) || new Set();
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        dfs(neighbor);
      } else if (recursionStack.has(neighbor)) {
        // Cycle detected!
        const cycleStartIndex = currentPath.indexOf(neighbor);
        if (cycleStartIndex !== -1) {
          const cycleLoop = [...currentPath.slice(cycleStartIndex), neighbor];
          cycles.push({ cycle: cycleLoop });

          for (let i = 0; i < cycleLoop.length - 1; i++) {
            circularNodeIds.add(cycleLoop[i]);
            circularEdgeKeys.add(`${cycleLoop[i]}->${cycleLoop[i + 1]}`);
          }
        }
      }
    }

    recursionStack.delete(node);
    currentPath.pop();
  }

  for (const node of adjacencyMap.keys()) {
    if (!visited.has(node)) {
      dfs(node);
    }
  }

  return { cycles, circularNodeIds, circularEdgeKeys };
}

/**
 * Builds the complete Architecture & Dependency Graph from project entries.
 */
export function buildArchitectureGraph(
  entries: ZipEntry[],
  includeExternalPackages = true
): ArchitectureGraph {
  const codeEntries = entries.filter(
    (e) =>
      e.path.endsWith(".tsx") ||
      e.path.endsWith(".ts") ||
      e.path.endsWith(".jsx") ||
      e.path.endsWith(".js") ||
      e.path.endsWith(".css")
  );

  const allPaths = new Set(codeEntries.map((e) => e.path));
  const adjacencyMap = new Map<string, Set<string>>();
  const inDegreeMap = new Map<string, number>();
  const outDegreeMap = new Map<string, number>();
  const externalPackages = new Set<string>();

  // Initialize maps
  for (const entry of codeEntries) {
    adjacencyMap.set(entry.path, new Set());
    inDegreeMap.set(entry.path, 0);
    outDegreeMap.set(entry.path, 0);
  }

  const rawEdges: Array<{ source: string; target: string }> = [];

  // Parse dependencies
  for (const entry of codeEntries) {
    const rawImports = extractImportSpecifiers(entry.content);
    for (const spec of rawImports) {
      const resolved = resolveModulePath(entry.path, spec, allPaths);
      if (resolved && resolved !== entry.path) {
        if (!adjacencyMap.get(entry.path)?.has(resolved)) {
          adjacencyMap.get(entry.path)!.add(resolved);
          rawEdges.push({ source: entry.path, target: resolved });

          inDegreeMap.set(resolved, (inDegreeMap.get(resolved) || 0) + 1);
          outDegreeMap.set(entry.path, (outDegreeMap.get(entry.path) || 0) + 1);
        }
      } else if (!spec.startsWith(".") && !spec.startsWith("@/")) {
        // External package
        const pkg = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0];
        if (includeExternalPackages && pkg) {
          externalPackages.add(pkg);
          rawEdges.push({ source: entry.path, target: pkg });
          outDegreeMap.set(entry.path, (outDegreeMap.get(entry.path) || 0) + 1);
        }
      }
    }
  }

  // Detect circular cycles
  const { cycles, circularNodeIds, circularEdgeKeys } = findCircularCycles(adjacencyMap);

  // Group nodes by architectural layer for 2D layout coordinates
  const columns: { [key in GraphNodeKind]: string[] } = {
    route: [],
    component: [],
    state_hook: [],
    utility: [],
    style: [],
    package: [],
  };

  for (const path of allPaths) {
    const kind = classifyNodeKind(path);
    columns[kind].push(path);
  }

  if (includeExternalPackages) {
    for (const pkg of externalPackages) {
      columns.package.push(pkg);
      inDegreeMap.set(pkg, (inDegreeMap.get(pkg) || 0) + 1);
      outDegreeMap.set(pkg, 0);
    }
  }

  // Compute 2D layered coordinates (X: Layer, Y: Vertical distribution)
  const columnOrder: GraphNodeKind[] = ["route", "component", "state_hook", "utility", "style", "package"];
  const nodeMap = new Map<string, GraphNode>();

  const startX = 80;
  const colSpacing = 220;
  const startY = 80;
  const rowSpacing = 90;

  columnOrder.forEach((kind, colIdx) => {
    const items = columns[kind];
    const x = startX + colIdx * colSpacing;
    const totalHeight = (items.length - 1) * rowSpacing;
    const offsetY = Math.max(0, (500 - totalHeight) / 2);

    items.forEach((id, rowIdx) => {
      const y = startY + offsetY + rowIdx * rowSpacing;
      const fanIn = inDegreeMap.get(id) || 0;
      const fanOut = outDegreeMap.get(id) || 0;
      const totalCoupling = fanIn + fanOut;
      const instability = totalCoupling === 0 ? 0 : Number((fanOut / totalCoupling).toFixed(2));
      const isCircular = circularNodeIds.has(id);
      const label = id.includes("/") ? id.split("/").pop() || id : id;

      nodeMap.set(id, {
        id,
        label,
        kind,
        fanIn,
        fanOut,
        instability,
        isCircular,
        x,
        y,
        size: Math.min(36, Math.max(22, 22 + fanIn * 2)),
      });
    });
  });

  const nodes = Array.from(nodeMap.values());
  const edges: GraphEdge[] = rawEdges.map((e) => ({
    id: `${e.source}->${e.target}`,
    source: e.source,
    target: e.target,
    isCircular: circularEdgeKeys.has(`${e.source}->${e.target}`),
  }));

  // Compute summary metrics
  let highestCoupled: { id: string; count: number } | null = null;
  let mostUnstable: { id: string; instability: number } | null = null;

  for (const node of nodes) {
    const coupling = node.fanIn + node.fanOut;
    if (!highestCoupled || coupling > highestCoupled.count) {
      highestCoupled = { id: node.id, count: coupling };
    }
    if (node.fanOut > 0 && (!mostUnstable || node.instability > mostUnstable.instability)) {
      mostUnstable = { id: node.id, instability: node.instability };
    }
  }

  const metrics: ArchitectureMetrics = {
    totalModules: nodes.length,
    totalEdges: edges.length,
    routesCount: columns.route.length,
    componentsCount: columns.component.length,
    hooksCount: columns.state_hook.length,
    packagesCount: columns.package.length,
    circularCycleCount: cycles.length,
    highestCoupledModule: highestCoupled,
    mostUnstableModule: mostUnstable,
  };

  return {
    nodes,
    edges,
    cycles,
    metrics,
  };
}
