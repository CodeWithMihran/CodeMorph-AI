export interface CodemodResult {
  code: string;
  changed: boolean;
  description: string;
}

export interface CodemodAction {
  id: "react-router" | "use-client" | "next-image" | "expo-primitives";
  label: string;
  icon: string;
  description: string;
  apply: (content: string) => CodemodResult;
}

/**
 * 1. Transform React Router imports, hooks, and Link components to Next.js App Router equivalents.
 */
export function transformReactRouterToNext(content: string): CodemodResult {
  const hasRouterImport = /from\s+["']react-router(-dom)?["']/i.test(content);
  const hasRouterUsages =
    /\buseNavigate\s*\(|\buseLocation\s*\(|\buseParams\s*\(|<(?:Nav)?Link\b/i.test(content);

  if (!hasRouterImport && !hasRouterUsages) {
    return { code: content, changed: false, description: "No React Router patterns found." };
  }

  let code = content;

  // Track needed Next.js imports
  const nextNavImports = new Set<string>();
  let needsNextLink = false;

  // Replace useNavigate -> useRouter
  if (/\buseNavigate\b/.test(code)) {
    nextNavImports.add("useRouter");
    const navigateAliases = new Map<string, string>();
    code = code.replace(
      /(const|let|var)\s+([a-zA-Z_$][\w$]*)\s*=\s*useNavigate\s*\(\s*\);?/g,
      (_match, declaration, alias: string) => {
        const routerName = alias === "navigate" ? "router" : alias;
        navigateAliases.set(alias, routerName);
        return `${declaration} ${routerName} = useRouter();`;
      }
    );
    for (const [alias, routerName] of navigateAliases) {
      const escapedAlias = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const escapedRouter = routerName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      code = code.replace(new RegExp("\\b" + escapedAlias + "\\s*\\(\\s*(['\"`][^'\"`]+['\"`])\\s*\\)", "g"), `${routerName}.push($1)`);
      code = code.replace(new RegExp(`\\b${escapedAlias}\\s*\\(\\s*-1\\s*\\)`, "g"), `${routerName}.back()`);
      // Keep support for standalone navigate()/router() calls without a captured declaration.
      if (alias !== "navigate" && alias !== "router") continue;
      code = code.replace(new RegExp("\\b" + escapedRouter + "\\s*\\(\\s*(['\"`][^'\"`]+['\"`])\\s*\\)", "g"), `${routerName}.push($1)`);
      code = code.replace(new RegExp(`\\b${escapedRouter}\\s*\\(\\s*-1\\s*\\)`, "g"), `${routerName}.back()`);
    }
    if (!navigateAliases.has("navigate") && !navigateAliases.has("router")) {
      code = code.replace(/\bnavigate\s*\(\s*(['"`][^'"`]+['"`])\s*\)/g, "router.push($1)");
      code = code.replace(/\bnavigate\s*\(\s*-1\s*\)/g, "router.back()");
    }
  }

  // Replace useLocation -> usePathname
  if (/\buseLocation\b/.test(code)) {
    nextNavImports.add("usePathname");
    const locationAliases = new Set<string>();
    code = code.replace(
      /(const|let|var)\s+([a-zA-Z_$][\w$]*)\s*=\s*useLocation\s*\(\s*\);?/g,
      (_match, declaration, alias: string) => {
        const pathnameName = alias === "location" ? "pathname" : alias;
        locationAliases.add(alias);
        return `${declaration} ${pathnameName} = usePathname();`;
      }
    );
    for (const alias of locationAliases) {
      const escapedAlias = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const pathnameName = alias === "location" ? "pathname" : alias;
      code = code.replace(new RegExp(`\\b${escapedAlias}\\.pathname\\b`, "g"), pathnameName);
    }
    if (!locationAliases.has("location")) code = code.replace(/\blocation\.pathname\b/g, "pathname");
  }

  // Replace useParams
  if (/\buseParams\b/.test(code)) {
    nextNavImports.add("useParams");
  }

  // Replace <NavLink to=... / <Link to=...
  if (/<(?:Nav)?Link\b/i.test(code)) {
    needsNextLink = true;
    code = code.replace(/<NavLink\b/g, "<Link");
    code = code.replace(/<\/NavLink>/g, "</Link>");
    code = code.replace(/(<Link\b[^>]*)\bto=(["'{])/g, "$1href=$2");
  }

  // Remove react-router-dom / react-router import statements
  code = code.replace(/import\s+[^;]+from\s+["']react-router(-dom)?["'];?\r?\n?/g, "");

  // Build Next.js imports
  const newImports: string[] = [];
  if (needsNextLink && !/from\s+["']next\/link["']/i.test(code)) {
    newImports.push('import Link from "next/link";');
  }
  if (nextNavImports.size > 0 && !/from\s+["']next\/navigation["']/i.test(code)) {
    const symbols = Array.from(nextNavImports).sort().join(", ");
    newImports.push(`import { ${symbols} } from "next/navigation";`);
  }

  if (newImports.length > 0) {
    const clientMatch = code.match(/^(\s*["']use client["'];?\r?\n+)/);
    if (clientMatch) {
      code =
        clientMatch[1] +
        newImports.join("\n") +
        "\n" +
        code.slice(clientMatch[1].length);
    } else {
      code = newImports.join("\n") + "\n" + code;
    }
  }

  const changed = code !== content;
  return {
    code,
    changed,
    description: changed
      ? "Transformed React Router navigation, params, and Link components to Next.js App Router equivalents."
      : "No transformations applied.",
  };
}

/**
 * 2. Injects "use client"; directive when client-side React hooks or browser APIs are detected.
 */
export function transformInjectClientDirective(content: string): CodemodResult {
  // Check if "use client" is already present
  if (/^\s*["']use client["'];?/i.test(content)) {
    return { code: content, changed: false, description: "File already has 'use client' directive." };
  }

  const hasClientHooks =
    /\b(?:useState|useEffect|useLayoutEffect|useRef|useCallback|useMemo|useReducer|useContext)\s*\(/i.test(
      content
    );
  const hasBrowserApis =
    /\b(?:window\.|document\.|localStorage\.|sessionStorage\.|navigator\.)/i.test(content);
  const hasEventHandlers = /\bon(?:Click|Change|Submit|KeyDown|KeyUp|MouseEnter)\s*=/i.test(content);

  if (!hasClientHooks && !hasBrowserApis && !hasEventHandlers) {
    return { code: content, changed: false, description: "No client hooks or browser APIs found requiring 'use client'." };
  }

  const code = `"use client";\n\n${content.trimStart()}`;
  return {
    code,
    changed: true,
    description: "Added 'use client'; directive to satisfy React Server Component boundaries.",
  };
}

/**
 * 3. Migrates legacy HTML <img> tags to optimized next/image component.
 */
export function transformLegacyImgToNextImage(content: string): CodemodResult {
  if (!/<img\b/i.test(content)) {
    return { code: content, changed: false, description: "No legacy <img> tags detected." };
  }

  let code = content;

  // Replace <img ... /> or <img ...> with <Image ... />
  code = code.replace(/<img\b([^>]*?)(\/?)>/gi, (_match, attrs) => {
    let newAttrs = attrs.trimEnd();
    // Ensure alt exists
    if (!/\balt\s*=/i.test(newAttrs)) {
      newAttrs += ' alt=""';
    }
    // Ensure width and height exist if not using layout/fill
    if (!/\bwidth\s*=/i.test(newAttrs) && !/\bfill\b/i.test(newAttrs)) {
      newAttrs += " width={600} height={400}";
    }
    return `<Image${newAttrs} />`;
  });

  // Inject import Image from "next/image" if missing
  if (/<Image\b/.test(code) && !/from\s+["']next\/image["']/i.test(code)) {
    const clientMatch = code.match(/^(\s*["']use client["'];?\r?\n+)/);
    const importStmt = 'import Image from "next/image";\n';
    if (clientMatch) {
      code = clientMatch[1] + importStmt + code.slice(clientMatch[1].length);
    } else {
      code = importStmt + code;
    }
  }

  const changed = code !== content;
  return {
    code,
    changed,
    description: changed
      ? "Migrated legacy <img> tags to Next.js <Image /> with default dimensions and accessibility alt attributes."
      : "No transformations applied.",
  };
}

/**
 * 4. Converts web HTML elements (div, p, span, button) to React Native primitives (View, Text, TouchableOpacity).
 */
export function transformWebToExpoPrimitives(content: string): CodemodResult {
  const hasWebContainers =
    /<(?:div|section|article|main|p|span|button|h[1-6])\b/i.test(content);

  if (!hasWebContainers) {
    return { code: content, changed: false, description: "No web container elements detected." };
  }

  let code = content;
  const rnImports = new Set<string>();

  // div, section, article, main -> View
  if (/<(?:div|section|article|main)\b/i.test(code)) {
    rnImports.add("View");
    code = code.replace(/<(?:div|section|article|main)\b/gi, "<View");
    code = code.replace(/<\/(?:div|section|article|main)>/gi, "</View>");
  }

  // p, span, h1-h6 -> Text
  if (/<(?:p|span|h[1-6])\b/i.test(code)) {
    rnImports.add("Text");
    code = code.replace(/<(?:p|span|h[1-6])\b/gi, "<Text");
    code = code.replace(/<\/(?:p|span|h[1-6])>/gi, "</Text>");
  }

  // button -> TouchableOpacity
  if (/<button\b/i.test(code)) {
    rnImports.add("TouchableOpacity");
    code = code.replace(/<button\b/gi, "<TouchableOpacity");
    code = code.replace(/<\/button>/gi, "</TouchableOpacity>");
    // onClick -> onPress
    code = code.replace(/(<TouchableOpacity\b[^>]*)\bonClick=/gi, "$1onPress=");
  }

  // Add React Native imports if missing
  if (rnImports.size > 0) {
    const existingRn = code.match(/import\s*\{([^}]+)\}\s*from\s*["']react-native["'];?/);
    if (existingRn) {
      const existingSymbols = existingRn[1].split(",").map((s) => s.trim());
      for (const sym of rnImports) {
        if (!existingSymbols.includes(sym)) existingSymbols.push(sym);
      }
      code = code.replace(
        existingRn[0],
        `import { ${existingSymbols.join(", ")} } from "react-native";`
      );
    } else {
      const symbols = Array.from(rnImports).sort().join(", ");
      code = `import { ${symbols} } from "react-native";\n${code}`;
    }
  }

  const changed = code !== content;
  return {
    code,
    changed,
    description: changed
      ? "Converted web DOM elements (div, p, span, button) to React Native primitives (View, Text, TouchableOpacity)."
      : "No transformations applied.",
  };
}

/**
 * Discovers and returns all available codemods applicable to the specified file content and target.
 */
export function detectApplicableCodemods(
  path: string,
  content: string,
  target: "nextjs" | "expo" = "nextjs"
): CodemodAction[] {
  const isTsxOrJsx = /\.(?:tsx?|jsx?)$/i.test(path);
  if (!isTsxOrJsx) return [];

  const actions: CodemodAction[] = [];

  // 1. React Router -> Next.js (Next.js target)
  if (
    target === "nextjs" &&
    (/from\s+["']react-router(-dom)?["']/i.test(content) ||
      /\buseNavigate\s*\(|\buseLocation\s*\(|<(?:Nav)?Link\b/i.test(content))
  ) {
    actions.push({
      id: "react-router",
      label: "Fix React Router",
      icon: "⚡",
      description: "Convert React Router hooks and Link to Next.js App Router (useRouter, next/link).",
      apply: transformReactRouterToNext,
    });
  }

  // 2. Client directive (Next.js target)
  if (
    target === "nextjs" &&
    !/^\s*["']use client["'];?/i.test(content) &&
    (/\b(?:useState|useEffect|useRef|useCallback)\s*\(/i.test(content) ||
      /\b(?:window\.|document\.|localStorage\.)/i.test(content) ||
      /\bon(?:Click|Change|Submit)\s*=/i.test(content))
  ) {
    actions.push({
      id: "use-client",
      label: "Add 'use client'",
      icon: "🛡",
      description: "Prepend 'use client' directive required for browser APIs, state hooks, and events.",
      apply: transformInjectClientDirective,
    });
  }

  // 3. Legacy <img> -> next/image (Next.js target)
  if (target === "nextjs" && /<img\b/i.test(content)) {
    actions.push({
      id: "next-image",
      label: "Optimize <img>",
      icon: "🖼",
      description: "Migrate standard <img> tags to Next.js optimized <Image /> component.",
      apply: transformLegacyImgToNextImage,
    });
  }

  // 4. Web elements -> React Native (Expo target)
  if (
    target === "expo" &&
    /<(?:div|section|p|span|button|h[1-6])\b/i.test(content)
  ) {
    actions.push({
      id: "expo-primitives",
      label: "Web to Native",
      icon: "📱",
      description: "Convert web elements (div, p, span, button) to React Native (View, Text, TouchableOpacity).",
      apply: transformWebToExpoPrimitives,
    });
  }

  return actions;
}
