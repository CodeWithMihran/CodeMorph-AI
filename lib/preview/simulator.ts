import type { ZipEntry } from "@/lib/migration/zip";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Extracts raw JSX/HTML template from a React component file string.
 */
export function extractJsxMarkup(code: string): string {
  // 1. Look for explicit return (...) block
  const returnMatch = code.match(/return\s*\(\s*([\s\S]*?)\s*\)\s*;?\s*(?:}|\n|$)/);
  if (returnMatch && returnMatch[1]) {
    return returnMatch[1].trim();
  }

  // 2. Look for single line return <tag>...</tag>
  const singleReturnMatch = code.match(/return\s+(<[\s\S]+?>[\s\S]*?<\/[a-zA-Z0-9]+>|<[\s\S]+?\/>);?/);
  if (singleReturnMatch && singleReturnMatch[1]) {
    return singleReturnMatch[1].trim();
  }

  // 3. Fallback: extract any primary JSX element block
  const tagMatch = code.match(/<([a-zA-Z0-9]+)[\s\S]*?<\/\1>/);
  if (tagMatch) {
    return tagMatch[0].trim();
  }

  return "";
}

/**
 * Converts React JSX markup into browser-renderable HTML.
 */
export function convertJsxToHtml(jsx: string): string {
  if (!jsx) return "<div class='empty-preview-fallback'><p>No renderable UI found in this component.</p></div>";

  let html = jsx;

  // Replace className="..." with class="..."
  html = html.replace(/\bclassName=(["'])(.*?)\1/g, 'class="$2"');
  html = html.replace(/\bclassName=\{`([^`]+)`\}/g, 'class="$1"');

  // Strip React comments {/* ... */}
  html = html.replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

  // Transform simple JSX expressions {item} or {'Text'}
  html = html.replace(/\{(['"`])(.*?)\1\}/g, "$2");

  // Transform simple {variable} into readable text placeholder
  html = html.replace(/\{([a-zA-Z0-9_$.]+)\}/g, (match, expr) => {
    if (expr === "children") return "<div class='children-outlet'>[Dynamic Route Children]</div>";
    if (expr.includes("map(")) return "<div class='mapped-items'>[Dynamic List Items]</div>";
    return `<span class="jsx-var">${escapeHtml(expr)}</span>`;
  });

  // Handle standard self-closing tags
  html = html.replace(/<Image\b([^>]*?)\/?>/gi, (match, attrs) => {
    const srcMatch = attrs.match(/\bsrc=(["'])(.*?)\1/);
    const altMatch = attrs.match(/\balt=(["'])(.*?)\1/);
    const src = srcMatch ? srcMatch[2] : "https://via.placeholder.com/600x400?text=Next.js+Image";
    const alt = altMatch ? altMatch[2] : "Preview Image";
    return `<img src="${src}" alt="${alt}" class="preview-img" style="max-width:100%;height:auto;border-radius:8px;" />`;
  });

  // Convert <Link href="..."> to <a href="...">
  html = html.replace(/<Link\b([^>]*?)>/gi, "<a$1>");
  html = html.replace(/<\/Link>/gi, "</a>");

  return html;
}

/**
 * Generates an isolated HTML document string for a Next.js web preview.
 */
export function generateWebPreviewHtml(
  activeEntry: ZipEntry,
  allEntries: ZipEntry[]
): string {
  // Find global CSS
  const cssEntry = allEntries.find((e) =>
    e.path === "app/globals.css" || e.path === "global.css" || e.path === "src/index.css"
  );
  const globalCss = cssEntry ? cssEntry.content : "";

  // Extract JSX from active entry
  const rawJsx = extractJsxMarkup(activeEntry.content);
  const bodyHtml = convertJsxToHtml(rawJsx);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>CodeMorph Preview - ${escapeHtml(activeEntry.path)}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: #0b1120;
      color: #f8fafc;
      min-height: 100vh;
      line-height: 1.5;
    }
    a { color: #3cd070; text-decoration: none; }
    a:hover { text-decoration: underline; }
    button {
      cursor: pointer;
      font-family: inherit;
    }
    .preview-container {
      padding: 24px;
      max-width: 1200px;
      margin: 0 auto;
    }
    .jsx-var {
      background: rgba(60, 208, 112, 0.15);
      color: #3cd070;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 0.9em;
      font-family: monospace;
    }
    .children-outlet {
      padding: 20px;
      border: 2px dashed rgba(60, 208, 112, 0.4);
      border-radius: 8px;
      margin: 16px 0;
      text-align: center;
      color: #3cd070;
      font-size: 13px;
    }
    .empty-preview-fallback {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 200px;
      color: #94a3b8;
      font-size: 14px;
    }
    /* Injected project CSS */
    ${globalCss}
  </style>
</head>
<body>
  <div class="preview-container">
    ${bodyHtml}
  </div>
</body>
</html>`;
}

/**
 * Converts React Native JSX (<View>, <Text>, <TouchableOpacity>) into a simulated mobile screen HTML.
 */
export function generateMobilePreviewHtml(
  activeEntry: ZipEntry,
  allEntries: ZipEntry[] = []
): string {
  const rawJsx = extractJsxMarkup(activeEntry.content);
  let mobileHtml = rawJsx;
  const projectCss = allEntries.find((e) => e.path.endsWith(".css"))?.content || "";

  // Convert React Native primitives to styled HTML
  mobileHtml = mobileHtml.replace(/<View\b([^>]*?)>/gi, '<div class="rn-view"$1>');
  mobileHtml = mobileHtml.replace(/<\/View>/gi, "</div>");

  mobileHtml = mobileHtml.replace(/<Text\b([^>]*?)>/gi, '<span class="rn-text"$1>');
  mobileHtml = mobileHtml.replace(/<\/Text>/gi, "</span>");

  mobileHtml = mobileHtml.replace(/<TouchableOpacity\b([^>]*?)>/gi, '<button class="rn-touchable"$1>');
  mobileHtml = mobileHtml.replace(/<\/TouchableOpacity>/gi, "</button>");

  mobileHtml = mobileHtml.replace(/<SafeAreaView\b([^>]*?)>/gi, '<div class="rn-safe-area"$1>');
  mobileHtml = mobileHtml.replace(/<\/SafeAreaView>/gi, "</div>");

  mobileHtml = mobileHtml.replace(/<ScrollView\b([^>]*?)>/gi, '<div class="rn-scroll-view"$1>');
  mobileHtml = mobileHtml.replace(/<\/ScrollView>/gi, "</div>");

  // Clean remaining JSX props
  mobileHtml = mobileHtml.replace(/\bonPress=\{[^}]+\}/gi, "");
  mobileHtml = mobileHtml.replace(/\{(['"`])(.*?)\1\}/g, "$2");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      background: #0f172a;
      color: #ffffff;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      min-height: 100vh;
      overflow-x: hidden;
      -webkit-font-smoothing: antialiased;
    }
    .rn-view {
      display: flex;
      flex-direction: column;
      position: relative;
    }
    .rn-safe-area {
      display: flex;
      flex-direction: column;
      min-height: 100vh;
      padding: 16px;
    }
    .rn-text {
      font-size: 16px;
      line-height: 1.4;
      color: #f8fafc;
    }
    .rn-touchable {
      background: #2563eb;
      color: #ffffff;
      border: none;
      border-radius: 8px;
      padding: 12px 20px;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      margin: 8px 0;
    }
    .rn-touchable:active {
      opacity: 0.8;
    }
    .rn-scroll-view {
      display: flex;
      flex-direction: column;
      overflow-y: auto;
      padding: 16px;
      gap: 12px;
    }
    ${projectCss}
  </style>
</head>
<body>
  <div class="rn-safe-area">
    ${mobileHtml || '<div class="rn-view"><span class="rn-text" style="color:#94a3b8;text-align:center;">Empty Mobile Screen View</span></div>'}
  </div>
</body>
</html>`;
}
