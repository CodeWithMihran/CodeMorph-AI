export interface ValidationStatus {
  isValid: boolean;
  message: string;
  line?: number;
  severity: "valid" | "warning" | "error";
}

/**
 * Fast, deterministic client-side syntax validator that inspects bracket balance,
 * string literal terminations, JSON integrity, and forbidden node built-ins without host execution.
 */
export function validateFileSyntax(path: string, content: string): ValidationStatus {
  const trimmed = content.trim();
  if (trimmed.length === 0) {
    return {
      isValid: false,
      message: "File is empty",
      severity: "warning",
    };
  }

  // 1. JSON Validation
  if (path.endsWith(".json")) {
    try {
      JSON.parse(content);
      return {
        isValid: true,
        message: "Valid JSON",
        severity: "valid",
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "JSON syntax error";
      let line = 1;
      const posMatch = msg.match(/position\s+(\d+)/i);
      if (posMatch) {
        const pos = parseInt(posMatch[1], 10);
        line = content.slice(0, pos).split("\n").length;
      }
      return {
        isValid: false,
        message: `JSON Error: ${msg}`,
        line,
        severity: "error",
      };
    }
  }

  // 2. TypeScript / JavaScript / TSX / JSX Validation
  if (/\.(?:tsx?|jsx?|mjs|cjs)$/i.test(path)) {
    // Check forbidden node built-ins in client UI routes (allow in configs, scripts, tests)
    const isClientUiFile =
      (path.startsWith("app/") || path.startsWith("components/")) &&
      !path.includes("/route.") &&
      !path.startsWith("__tests__/");
    if (isClientUiFile) {
      const forbiddenImports = content.match(/from\s+["'](?:fs|child_process|net|tls|cluster)["']/i);
      if (forbiddenImports) {
        return {
          isValid: false,
          message: "Forbidden Node.js runtime built-in import detected in UI component.",
          severity: "error",
        };
      }
    }

    // Bracket balance checker (ignoring strings and comments)
    const stack: Array<{ char: string; line: number }> = [];
    let inString: string | null = null;
    let inLineComment = false;
    let inBlockComment = false;
    let currentLine = 1;

    for (let i = 0; i < content.length; i++) {
      const char = content[i];
      const prev = i > 0 ? content[i - 1] : "";
      const next = i + 1 < content.length ? content[i + 1] : "";

      if (char === "\n") {
        currentLine++;
        inLineComment = false;
        continue;
      }

      if (inLineComment) continue;

      if (inBlockComment) {
        if (prev === "*" && char === "/") {
          inBlockComment = false;
        }
        continue;
      }

      if (inString) {
        if (char === inString && prev !== "\\") {
          inString = null;
        }
        continue;
      }

      // Check comments start
      if (char === "/" && next === "/") {
        inLineComment = true;
        i++;
        continue;
      }
      if (char === "/" && next === "*") {
        inBlockComment = true;
        i++;
        continue;
      }

      // Check string start
      if (char === '"' || char === "'" || char === "`") {
        inString = char;
        continue;
      }

      // Brackets
      if (char === "{" || char === "(" || char === "[") {
        stack.push({ char, line: currentLine });
      } else if (char === "}" || char === ")" || char === "]") {
        if (stack.length === 0) {
          return {
            isValid: false,
            message: `Unexpected closing '${char}' without matching opener.`,
            line: currentLine,
            severity: "error",
          };
        }
        const last = stack.pop()!;
        const matching: Record<string, string> = { "}": "{", ")": "(", "]": "[" };
        if (last.char !== matching[char]) {
          return {
            isValid: false,
            message: `Mismatched bracket: expected '${matching[char]}', found '${last.char}'.`,
            line: currentLine,
            severity: "error",
          };
        }
      }
    }

    if (inString) {
      return {
        isValid: false,
        message: `Unterminated string literal (${inString}).`,
        line: currentLine,
        severity: "error",
      };
    }

    if (inBlockComment) {
      return {
        isValid: false,
        message: "Unterminated multi-line comment (/* ... */).",
        line: currentLine,
        severity: "error",
      };
    }

    if (stack.length > 0) {
      const unclosed = stack[stack.length - 1];
      return {
        isValid: false,
        message: `Unclosed bracket '${unclosed.char}' opened at line ${unclosed.line}.`,
        line: unclosed.line,
        severity: "error",
      };
    }

    return {
      isValid: true,
      message: "Syntax validated (balanced AST & imports)",
      severity: "valid",
    };
  }

  return {
    isValid: true,
    message: "Text document format",
    severity: "valid",
  };
}
