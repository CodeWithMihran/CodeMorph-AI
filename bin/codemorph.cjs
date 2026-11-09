#!/usr/bin/env node

/* eslint-disable @typescript-eslint/no-require-imports */

const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

// Configure TypeScript on-the-fly transpilation for CodeMorph engine modules
const root = path.resolve(__dirname, "..");
require.extensions[".ts"] = (module, filename) => {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  module._compile(output, filename);
};

const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    request = path.join(root, request.slice(2));
  }
  return resolveFilename.call(this, request, parent, isMain, options);
};

const {
  runAudit,
  runFeasibility,
  runScaffold,
  runCodemod,
  formatPrettyAudit,
  formatPrettyFeasibility,
  formatPrettyScaffold,
  formatPrettyCodemod,
} = require("../lib/cli/cli-engine.ts");

function printHelp() {
  console.log(`
  CodeMorph AI — Autonomous Code Migration & Modernization Engine (CLI)
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Usage:
    codemorph <command> [target-path] [options]

  Commands:
    audit [path]        Run deterministic AST security, syntax, and dependency CVE audit
    feasibility [path]  Evaluate codebase migration portability and health scorecard
    scaffold [path]     Synthesize target project scaffold, test suites, and CI workflows
    codemod [path]      Run deterministic text codemods (React Router -> Next.js, 'use client', <img>)
    version             Display CodeMorph AI CLI version
    help                Display this manual

  Options:
    --target=<framework>      Target framework ("nextjs" | "expo", default: "nextjs")
    --format=<type>           Output formatting ("pretty" | "json" | "markdown", default: "pretty")
    --output=<file>, -o       Write report or output to a specified destination file
    --out=<directory>         Directory to write scaffolded files (for scaffold command)
    --fix                     Write codemod transformations directly to disk
    --type=<type>             Codemod type ("all" | "react-router" | "use-client" | "next-image" | "expo-primitives")
    --fail-under=<score>      Exit with code 1 if feasibility score is below threshold (e.g. --fail-under=80)
    --fail-on-critical        Exit with code 1 if audit finds high or critical vulnerabilities
    --skip-dependencies       Skip network dependency vulnerability advisory lookups
    --no-tests                Omit automated test suite generation from scaffold
    --package-manager=<pm>    Package manager ("npm" | "pnpm" | "yarn" | "bun", default: "npm")
    --styling=<type>          Styling approach ("tailwind" | "nativewind" | "standard-css")

  Examples:
    codemorph audit . --fail-on-critical
    codemorph feasibility ./my-react-app --target=nextjs --fail-under=75
    codemorph scaffold ./my-react-app --target=nextjs --out=./migrated-nextjs
    codemorph codemod ./src --fix --target=nextjs
    codemorph audit project.zip --format=json --output=audit-report.json
`);
}

function parseArgs(args) {
  let command = "";
  let targetPath = ".";
  const options = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (!command && !arg.startsWith("-")) {
      command = arg;
      continue;
    }

    if (command && targetPath === "." && !arg.startsWith("-")) {
      targetPath = arg;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--version" || arg === "-v") {
      options.version = true;
    } else if (arg.startsWith("--format=")) {
      options.format = arg.split("=")[1];
    } else if (arg.startsWith("--target=")) {
      options.target = arg.split("=")[1];
    } else if (arg.startsWith("--output=")) {
      options.output = arg.split("=")[1];
    } else if (arg === "-o" && args[i + 1]) {
      options.output = args[++i];
    } else if (arg.startsWith("--out=")) {
      options.out = arg.split("=")[1];
    } else if (arg.startsWith("--fail-under=")) {
      options.failUnder = Number(arg.split("=")[1]);
    } else if (arg === "--fail-on-critical") {
      options.failOnCritical = true;
    } else if (arg === "--skip-dependencies") {
      options.skipDependencies = true;
    } else if (arg === "--no-tests") {
      options.noTests = true;
    } else if (arg === "--fix") {
      options.fix = true;
    } else if (arg.startsWith("--type=")) {
      options.type = arg.split("=")[1];
    } else if (arg.startsWith("--package-manager=")) {
      options.packageManager = arg.split("=")[1];
    } else if (arg.startsWith("--styling=")) {
      options.styling = arg.split("=")[1];
    }
  }

  return { command, targetPath, options };
}

async function main() {
  const { command, targetPath, options } = parseArgs(process.argv.slice(2));

  if (options.version || command === "version") {
    console.log("CodeMorph AI CLI v0.1.0");
    process.exit(0);
  }

  if (options.help || command === "help" || !command) {
    printHelp();
    process.exit(0);
  }

  try {
    switch (command) {
      case "audit": {
        const result = await runAudit(targetPath, options);
        if (options.format === "json") {
          console.log(JSON.stringify(result.report, null, 2));
        } else if (options.format === "markdown") {
          console.log(result.markdown);
        } else {
          console.log(formatPrettyAudit(result.report));
        }
        process.exit(result.exitCode);
        break;
      }

      case "feasibility": {
        const result = runFeasibility(targetPath, options);
        if (options.format === "json") {
          console.log(JSON.stringify(result.report, null, 2));
        } else {
          console.log(formatPrettyFeasibility(result.report));
        }
        process.exit(result.exitCode);
        break;
      }

      case "scaffold": {
        const result = runScaffold(targetPath, options);
        if (options.format === "json") {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(formatPrettyScaffold(result));
        }
        process.exit(result.exitCode);
        break;
      }

      case "codemod": {
        const result = runCodemod(targetPath, options);
        if (options.format === "json") {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(formatPrettyCodemod(result));
        }
        process.exit(result.exitCode);
        break;
      }

      default: {
        console.error(`\n  ✖ Unknown command: "${command}"\n  Run "codemorph --help" for available commands.\n`);
        process.exit(1);
      }
    }
  } catch (err) {
    console.error(`\n  ✖ Error: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { main, parseArgs };
