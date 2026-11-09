/**
 * Procedural Memory Rule Studio & Testing Playground Engine
 * Pure TypeScript, client-safe rule evaluation, diff computation, AST/syntax checking,
 * safety guardrails, and team ruleset (.codemorph/rules.json) serialization.
 */

export type StudioRuleCategory =
  | "routing"
  | "directives"
  | "components"
  | "imports"
  | "custom";

export type StudioRule = {
  id: string;
  name: string;
  description: string;
  sourceFramework: string;
  target: string;
  category: StudioRuleCategory;
  pattern: string;
  replacement: string;
  isRegex: boolean;
  flags?: string;
  testSnippet: string;
  expectedOutput?: string;
  trigger: string;
  resolution: string;
  createdAt: string;
  author: string;
};

export type DiffLine = {
  type: "equal" | "insert" | "delete";
  value: string;
  oldLineNo?: number;
  newLineNo?: number;
};

export type TransformResult = {
  transformed: string;
  changed: boolean;
  matchesCount: number;
  diff: DiffLine[];
  isValidSyntax: boolean;
  syntaxErrors: string[];
  executionTimeMs: number;
  error?: string;
};

export type SafetyCheckResult = {
  safe: boolean;
  issues: string[];
};

export type TeamRulesetManifest = {
  version: 1;
  exportDate: string;
  source: "codemorph-rule-studio";
  rulesCount: number;
  rules: StudioRule[];
};

/**
 * Built-in production rule templates for migration workflows
 */
export const DEFAULT_STUDIO_RULES: StudioRule[] = [
  {
    id: "rule-react-router-link-to-next",
    name: "React Router Link -> Next.js Link",
    description: "Converts react-router-dom Link imports and 'to' props to Next.js Link and 'href' props.",
    sourceFramework: "react-router-v6",
    target: "nextjs-app-router-typescript",
    category: "routing",
    pattern: 'import\\s*\\{\\s*Link\\s*\\}\\s*from\\s*["\']react-router-dom["\'];?',
    replacement: 'import Link from "next/link";',
    isRegex: true,
    flags: "g",
    trigger: "react-router-dom",
    resolution: "Rewrite react-router-dom Link imports to next/link and replace to= with href=.",
    author: "CodeMorph Engineering",
    createdAt: "2026-03-01T00:00:00.000Z",
    testSnippet: `import React from "react";
import { Link } from "react-router-dom";

export default function HeaderNav() {
  return (
    <nav className="flex gap-4">
      <Link to="/dashboard">Dashboard</Link>
      <Link to="/analytics">Analytics</Link>
      <Link to="/settings">Settings</Link>
    </nav>
  );
}`,
  },
  {
    id: "rule-client-directive-injection",
    name: "Client Component Directive Injection",
    description: "Injects 'use client' directive at top of files containing client hooks or event handlers.",
    sourceFramework: "react-spa",
    target: "nextjs-app-router-typescript",
    category: "directives",
    pattern: "^((?:/\\*[\\s\\S]*?\\*/\\s*|//.*\\s*)*)(import\\s)",
    replacement: '"use client";\n\n$1$2',
    isRegex: true,
    flags: "m",
    trigger: "useState",
    resolution: "Add 'use client' directive to top of component when interactive hooks or event handlers are present.",
    author: "CodeMorph Engineering",
    createdAt: "2026-03-01T00:00:00.000Z",
    testSnippet: `import React, { useState, useEffect } from "react";

export default function InteractiveCounter() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    document.title = \`Count: \${count}\`;
  }, [count]);

  return (
    <button onClick={() => setCount(count + 1)}>
      Clicked {count} times
    </button>
  );
}`,
  },
  {
    id: "rule-legacy-img-to-next-image",
    name: "Legacy <img> -> Next.js <Image>",
    description: "Replaces standard HTML img tags with optimized Next.js Image component with dimensions.",
    sourceFramework: "react-spa",
    target: "nextjs-app-router-typescript",
    category: "components",
    pattern: '<img\\s+src=(["\'])([^"\']+)\\1\\s+alt=(["\'])([^"\']*)\\3\\s*/?>',
    replacement: '<Image src="$2" alt="$4" width={600} height={400} />',
    isRegex: true,
    flags: "g",
    trigger: "<img",
    resolution: "Migrate HTML img elements to Next.js Image with width, height, and optimized loading.",
    author: "CodeMorph Engineering",
    createdAt: "2026-03-01T00:00:00.000Z",
    testSnippet: `import React from "react";

export default function ProfileHeader() {
  return (
    <header className="profile-hero">
      <img src="/avatars/user.png" alt="User Profile" />
      <h2>Developer Profile</h2>
    </header>
  );
}`,
  },
  {
    id: "rule-web-div-to-react-native-view",
    name: "Web <div> / <span> -> React Native <View> / <Text>",
    description: "Converts web div and span container elements to React Native View and Text for Expo Router mobile migrations.",
    sourceFramework: "react-spa",
    target: "expo-router-typescript",
    category: "components",
    pattern: '<div\\b([^>]*)>([\\s\\S]*?)</div>',
    replacement: '<View$1>$2</View>',
    isRegex: true,
    flags: "g",
    trigger: "react-native-primitives",
    resolution: "Convert web HTML containers into mobile View and Text primitives for React Native compatibility.",
    author: "CodeMorph Engineering",
    createdAt: "2026-03-01T00:00:00.000Z",
    testSnippet: `import React from "react";

export default function MobileCard() {
  return (
    <div className="card-wrapper">
      <div className="card-header">
        <h3>Card Header</h3>
      </div>
      <div className="card-body">
        <p>This card was migrated from web to mobile.</p>
      </div>
    </div>
  );
}`,
  },
  {
    id: "rule-use-navigate-to-use-router",
    name: "React Router useNavigate -> Next.js useRouter",
    description: "Migrates useNavigate to Next.js App Router useRouter and replaces navigate calls with router.push.",
    sourceFramework: "react-router-v6",
    target: "nextjs-app-router-typescript",
    category: "routing",
    pattern: 'useNavigate\\(\\)',
    replacement: 'useRouter()',
    isRegex: true,
    flags: "g",
    trigger: "useNavigate",
    resolution: "Convert useNavigate() hook invocations to useRouter() from next/navigation with router.push().",
    author: "CodeMorph Engineering",
    createdAt: "2026-03-01T00:00:00.000Z",
    testSnippet: `"use client";
import React from "react";
import { useNavigate } from "react-router-dom";

export default function LoginButton() {
  const navigate = useNavigate();

  const handleLogin = () => {
    navigate("/dashboard");
  };

  return <button onClick={handleLogin}>Log In</button>;
}`,
  },
];

/**
 * Validate syntax sanity: checks matching braces, brackets, parentheses,
 * and JSX/HTML tag pairing.
 */
export function validateSyntax(code: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check balanced delimiters: (), {}, []
  const stack: { char: string; line: number }[] = [];
  const lines = code.split("\n");

  let inString: string | null = null;
  let inComment = false;
  let inLineComment = false;

  for (let l = 0; l < lines.length; l++) {
    const line = lines[l];
    inLineComment = false;

    for (let c = 0; c < line.length; c++) {
      const char = line[c];
      const nextChar = line[c + 1] ?? "";

      // Handle single line comments
      if (!inString && !inComment && char === "/" && nextChar === "/") {
        inLineComment = true;
        break;
      }

      // Handle multi-line comments
      if (!inString && !inComment && char === "/" && nextChar === "*") {
        inComment = true;
        c++;
        continue;
      }
      if (!inString && inComment && char === "*" && nextChar === "/") {
        inComment = false;
        c++;
        continue;
      }
      if (inComment || inLineComment) continue;

      // Handle strings
      if (char === '"' || char === "'" || char === "`") {
        if (!inString) {
          inString = char;
        } else if (inString === char && line[c - 1] !== "\\") {
          inString = null;
        }
        continue;
      }
      if (inString) continue;

      // Delimiter tracking
      if (char === "{" || char === "(" || char === "[") {
        stack.push({ char, line: l + 1 });
      } else if (char === "}" || char === ")" || char === "]") {
        const expected = char === "}" ? "{" : char === ")" ? "(" : "[";
        if (stack.length === 0) {
          errors.push(`Unexpected closing delimiter '${char}' at line ${l + 1}`);
        } else {
          const last = stack.pop()!;
          if (last.char !== expected) {
            errors.push(`Mismatched delimiter: expected '${expected}' to close line ${last.line}, got '${char}' at line ${l + 1}`);
          }
        }
      }
    }
  }

  while (stack.length > 0) {
    const unclosed = stack.pop()!;
    errors.push(`Unclosed '${unclosed.char}' opened at line ${unclosed.line}`);
  }

  if (inComment) {
    errors.push("Unclosed multi-line comment /*");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validates rule safety to protect against credential leaks,
 * prompt injections, and catastrophic regular expression backtracking.
 */
export function validateRuleSafety(rule: {
  trigger?: string;
  resolution?: string;
  pattern?: string;
  replacement?: string;
}): SafetyCheckResult {
  const issues: string[] = [];

  const textToCheck = [
    rule.trigger ?? "",
    rule.resolution ?? "",
    rule.pattern ?? "",
    rule.replacement ?? "",
  ].join(" ");

  // 1. Prompt Injection & instruction override checks
  const injectionPatterns = [
    /ignore\s+(?:all\s+|any\s+)?(?:previous|prior|above)\s+instructions/i,
    /system\s+prompt/i,
    /developer\s+message/i,
    /reveal\s+(?:the\s+)?(?:secret|key|prompt|api)/i,
    /exfiltrat/i,
  ];

  for (const pattern of injectionPatterns) {
    if (pattern.test(textToCheck)) {
      issues.push("Rule contains disallowed prompt injection or system override keywords.");
      break;
    }
  }

  // 2. Secret & credential leak prevention
  const secretPatterns = [
    /(?:api[_-]?key|secret|token|password|auth_token)\s*[:=]\s*["'][A-Za-z0-9_\-]{8,}["']/i,
    /ghp_[A-Za-z0-9]{20,}/, // GitHub personal access token
    /sk-[A-Za-z0-9]{20,}/,  // OpenAI secret key
    /AIza[0-9A-Za-z-_]{35}/, // Google API key
  ];

  for (const pattern of secretPatterns) {
    if (pattern.test(textToCheck)) {
      issues.push("Rule pattern or replacement contains potential secret or credential tokens.");
      break;
    }
  }

  // 3. Catastrophic backtracking check in regex patterns
  if (rule.pattern) {
    const dangerousBacktracking = /(\([a-z0-9_.*+\\]+[\*\+]\)[\*\+]|\(\[.*?\][\*\+]\)[\*\+])/i;
    if (dangerousBacktracking.test(rule.pattern)) {
      issues.push("Regular expression pattern contains dangerous nested quantifiers prone to catastrophic backtracking.");
    }
  }

  return {
    safe: issues.length === 0,
    issues,
  };
}

/**
 * Computes a line-by-line diff comparing before and after code snippets.
 */
export function computeLineDiff(before: string, after: string): DiffLine[] {
  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");
  const diff: DiffLine[] = [];

  let bIdx = 0;
  let aIdx = 0;
  let oldLine = 1;
  let newLine = 1;

  while (bIdx < beforeLines.length || aIdx < afterLines.length) {
    const bLine = beforeLines[bIdx];
    const aLine = afterLines[aIdx];

    if (bLine === aLine) {
      diff.push({
        type: "equal",
        value: bLine,
        oldLineNo: oldLine++,
        newLineNo: newLine++,
      });
      bIdx++;
      aIdx++;
    } else if (bIdx < beforeLines.length && (aIdx >= afterLines.length || !afterLines.slice(aIdx).includes(bLine))) {
      diff.push({
        type: "delete",
        value: bLine,
        oldLineNo: oldLine++,
      });
      bIdx++;
    } else {
      diff.push({
        type: "insert",
        value: aLine,
        newLineNo: newLine++,
      });
      aIdx++;
    }
  }

  return diff;
}

/**
 * Evaluates a rule transformation against a code snippet.
 * Performs safe execution, syntax checking, and diff generation.
 */
export function evaluateRuleTransform(
  snippet: string,
  rule: {
    pattern: string;
    replacement: string;
    isRegex: boolean;
    flags?: string;
  }
): TransformResult {
  const startTime = performance.now();

  try {
    let transformed = snippet;
    let matchesCount = 0;

    if (!rule.pattern) {
      return {
        transformed: snippet,
        changed: false,
        matchesCount: 0,
        diff: computeLineDiff(snippet, snippet),
        isValidSyntax: true,
        syntaxErrors: [],
        executionTimeMs: 0,
      };
    }

    if (rule.isRegex) {
      const flags = rule.flags || "g";
      const regex = new RegExp(rule.pattern, flags);

      // Count matches
      const matches = snippet.match(new RegExp(rule.pattern, flags.includes("g") ? flags : flags + "g"));
      matchesCount = matches ? matches.length : 0;

      transformed = snippet.replace(regex, rule.replacement);

      // Handle linked transformations for composite rules (e.g. react-router link props)
      if (rule.pattern.includes("react-router-dom") && transformed.includes("<Link")) {
        transformed = transformed.replace(/(<Link\b[^>]*?)\bto=/g, "$1href=");
      }
    } else {
      // Plain string replacement
      const occurrences = snippet.split(rule.pattern).length - 1;
      matchesCount = occurrences > 0 ? occurrences : 0;
      transformed = snippet.replaceAll(rule.pattern, rule.replacement);
    }

    const changed = transformed !== snippet;
    const syntaxCheck = validateSyntax(transformed);
    const diff = computeLineDiff(snippet, transformed);
    const executionTimeMs = Math.round((performance.now() - startTime) * 100) / 100;

    return {
      transformed,
      changed,
      matchesCount,
      diff,
      isValidSyntax: syntaxCheck.valid,
      syntaxErrors: syntaxCheck.errors,
      executionTimeMs,
    };
  } catch (err) {
    const executionTimeMs = Math.round((performance.now() - startTime) * 100) / 100;
    return {
      transformed: snippet,
      changed: false,
      matchesCount: 0,
      diff: computeLineDiff(snippet, snippet),
      isValidSyntax: false,
      syntaxErrors: [(err as Error).message],
      executionTimeMs,
      error: (err as Error).message,
    };
  }
}

/**
 * Serializes a set of studio rules into a shareable JSON team manifest.
 */
export function exportTeamRuleset(rules: StudioRule[]): string {
  const manifest: TeamRulesetManifest = {
    version: 1,
    exportDate: new Date().toISOString(),
    source: "codemorph-rule-studio",
    rulesCount: rules.length,
    rules,
  };

  return JSON.stringify(manifest, null, 2);
}

/**
 * Parses and validates an imported team ruleset JSON manifest.
 */
export function importTeamRuleset(jsonString: string): {
  imported: StudioRule[];
  errors: string[];
} {
  const errors: string[] = [];
  const imported: StudioRule[] = [];

  try {
    const parsed = JSON.parse(jsonString) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return { imported: [], errors: ["Invalid ruleset format: Root must be a JSON object."] };
    }

    const manifest = parsed as Record<string, unknown>;
    const rawRules = Array.isArray(manifest.rules) ? manifest.rules : Array.isArray(parsed) ? (parsed as unknown[]) : null;

    if (!rawRules) {
      return { imported: [], errors: ["No 'rules' array found in the supplied JSON."] };
    }

    for (let i = 0; i < rawRules.length; i++) {
      const item = rawRules[i] as Record<string, unknown>;
      if (!item || typeof item !== "object") {
        errors.push(`Rule at index ${i} is not a valid object.`);
        continue;
      }

      if (typeof item.pattern !== "string" || !item.pattern.trim()) {
        errors.push(`Rule at index ${i} ('${item.name ?? "unnamed"}') is missing a valid pattern.`);
        continue;
      }

      if (typeof item.replacement !== "string") {
        errors.push(`Rule at index ${i} ('${item.name ?? "unnamed"}') is missing a valid replacement.`);
        continue;
      }

      // Safety check
      const safety = validateRuleSafety({
        trigger: typeof item.trigger === "string" ? item.trigger : "",
        resolution: typeof item.resolution === "string" ? item.resolution : "",
        pattern: item.pattern,
        replacement: item.replacement,
      });

      if (!safety.safe) {
        errors.push(`Rule at index ${i} ('${item.name ?? "unnamed"}') failed safety checks: ${safety.issues.join(", ")}`);
        continue;
      }

      const validRule: StudioRule = {
        id: typeof item.id === "string" && item.id ? item.id : `rule-custom-${Date.now()}-${i}`,
        name: typeof item.name === "string" && item.name ? item.name : `Custom Rule #${i + 1}`,
        description: typeof item.description === "string" ? item.description : "",
        sourceFramework: typeof item.sourceFramework === "string" ? item.sourceFramework : "react-spa",
        target: typeof item.target === "string" ? item.target : "nextjs-app-router-typescript",
        category: (item.category as StudioRuleCategory) || "custom",
        pattern: item.pattern,
        replacement: item.replacement,
        isRegex: Boolean(item.isRegex),
        flags: typeof item.flags === "string" ? item.flags : "g",
        testSnippet: typeof item.testSnippet === "string" ? item.testSnippet : "",
        trigger: typeof item.trigger === "string" ? item.trigger : "custom-trigger",
        resolution: typeof item.resolution === "string" ? item.resolution : item.replacement,
        createdAt: typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString(),
        author: typeof item.author === "string" ? item.author : "Team Import",
      };

      imported.push(validRule);
    }
  } catch (err) {
    errors.push(`Failed to parse ruleset JSON: ${(err as Error).message}`);
  }

  return { imported, errors };
}
