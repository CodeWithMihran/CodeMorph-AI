/* eslint-disable @typescript-eslint/no-require-imports */

const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

// Load the same TypeScript worker used by the Next.js route without adding a runtime dependency.
require.extensions[".ts"] = (module, filename) => {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  module._compile(output, filename);
};

const { validateGeneratedProject } = require("../lib/migration/validation.ts");
const fixtureRoot = path.resolve(__dirname, "../fixtures/validation");

function readFixture(directory) {
  const entries = [];
  function visit(current) {
    for (const item of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, item.name);
      if (item.isSymbolicLink()) throw new Error(`Fixture symlink is not allowed: ${absolute}`);
      if (item.isDirectory()) visit(absolute);
      else if (item.isFile()) {
        entries.push({ path: path.relative(directory, absolute).split(path.sep).join("/"), content: fs.readFileSync(absolute, "utf8") });
      }
    }
  }
  visit(directory);
  return entries;
}

async function main() {
  const fixtures = [
    { name: "known-good", directory: path.join(fixtureRoot, "known-good"), expected: "passed", build: "passed", routes: ["/"] },
    { name: "invalid-source", directory: path.join(fixtureRoot, "invalid-source"), expected: "failed", build: "failed", routes: ["/"] },
    { name: "migration-static-landing", directory: path.resolve(__dirname, "../fixtures/migrations/static-landing/target"), expected: "passed", build: "passed", routes: ["/"] },
    { name: "migration-react-vite-multi-route", directory: path.resolve(__dirname, "../fixtures/migrations/react-vite-multi-route/target"), expected: "passed", build: "passed", routes: ["/", "/about"] },
  ];
  let notRun = false;
  let failed = false;
  for (const fixture of fixtures) {
    const result = await validateGeneratedProject(readFixture(fixture.directory), fixture.routes);
    const routeSummary = result.routeChecks.map((route) => `${route.path}=${route.status}`).join(", ");
    console.log(`${fixture.name}: validation=${result.status}, build=${result.build}, routes=[${routeSummary}] (${result.durationMs} ms)`);
    if (result.status === "not-run") {
      notRun = true;
      console.error(result.message);
      continue;
    }
    const allExpectedRoutesPassed = fixture.expected === "passed"
      ? result.routeChecks.length === fixture.routes.length && result.routeChecks.every((route) => route.status === "passed")
      : result.routeChecks.every((route) => route.status === "not-run");
    if (result.status !== fixture.expected || result.build !== fixture.build || !allExpectedRoutesPassed) {
      failed = true;
      console.error(`Expected validation=${fixture.expected}, build=${fixture.build}, routes=${fixture.expected === "passed" ? "all passed" : "not run"}.`);
    }
    for (const line of result.diagnostics.slice(-8)) console.error(`  ${line}`);
  }
  if (notRun) {
    console.error("Fixture checks did not run. Start Docker Desktop and build the validator image using the README command.");
    process.exitCode = 2;
  } else if (failed) {
    process.exitCode = 1;
  } else {
    console.log("All worker and migration fixtures returned their expected results.");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Worker fixture validation failed.");
  process.exitCode = 1;
});
