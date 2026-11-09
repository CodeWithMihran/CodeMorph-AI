/* eslint-disable @typescript-eslint/no-require-imports */

const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
require.extensions[".ts"] = (module, filename) => {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  module._compile(output, filename);
};
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request.startsWith("@/")) request = path.join(root, request.slice(2));
  return resolveFilename.call(this, request, parent, isMain, options);
};

const { classifySource } = require("../lib/github/classify-source.ts");
const { analyzeSourceRoutes } = require("../lib/migration/source-routes.ts");
const { generatedRoutePaths, validateGeneratedFiles } = require("../lib/migration/generated-output.ts");
const { validateGeneratedProject } = require("../lib/migration/validation.ts");
const { evaluateFeasibility } = require("../lib/analysis/feasibility.ts");

function readTree(directory) {
  const files = [];
  function visit(current) {
    for (const item of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, item.name);
      if (item.isSymbolicLink()) throw new Error(`Fixture symlink is not allowed: ${absolute}`);
      if (item.isDirectory()) visit(absolute);
      else if (item.isFile()) files.push({ path: path.relative(directory, absolute).split(path.sep).join("/"), content: fs.readFileSync(absolute, "utf8") });
    }
  }
  visit(directory);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

function sha256(files) {
  const crypto = require("node:crypto");
  const hash = crypto.createHash("sha256");
  for (const file of files) hash.update(file.path).update("\0").update(file.content).update("\0");
  return hash.digest("hex");
}

function getProfile(files) {
  const manifestFile = files.find((file) => file.path === "package.json");
  let manifest = null;
  if (manifestFile) {
    try { manifest = JSON.parse(manifestFile.content); }
    catch { manifest = { note: "invalid manifest" }; }
  }
  return classifySource(new Set(files.map((file) => file.path).filter((file) => !file.includes("/"))), manifest);
}

function evaluateStaticFixture(name) {
  const fixtureDirectory = path.join(root, "fixtures", "migrations", name);
  const expected = JSON.parse(fs.readFileSync(path.join(fixtureDirectory, "expected.json"), "utf8"));
  const sourceBefore = readTree(path.join(fixtureDirectory, "source"));
  const sourceHash = sha256(sourceBefore);
  const profile = getProfile(sourceBefore);
  const checks = [];
  const check = (label, passed, detail) => checks.push({ label, status: passed ? "passed" : "failed", detail });
  check("source classification", profile.sourceType === expected.sourceType && profile.framework === expected.framework, `expected ${expected.framework} (${expected.sourceType}); got ${profile.framework} (${profile.sourceType})`);

  const allPaths = sourceBefore.map((f) => f.path);
  const keyFiles = ["package.json", "index.html", "src/main.tsx", "src/App.tsx"].filter((p) => allPaths.includes(p));
  const feasibility = evaluateFeasibility({
    sourceType: profile.sourceType,
    framework: profile.framework,
    supportReason: profile.supportReason,
    filePaths: allPaths,
    keyFiles,
    routeCandidates: expected.routeCandidates || [],
    files: sourceBefore,
  });

  if (expected.sourceType === "unsupported") {
    check("feasibility assessment", feasibility.score === 0 && feasibility.tier === "incompatible", `unsupported fixture scored 0% with incompatible tier`);
    check("unsupported source is gated", !profile.supported && expected.expectedRoutes.length === 0 && !fs.existsSync(path.join(fixtureDirectory, "target")), "unsupported fixture has no target artifact and must not enter generation");
  } else {
    check("feasibility assessment", feasibility.score >= 80 && feasibility.tier === "high", `fixture scored ${feasibility.score}% (${feasibility.tier})`);
    const targetFiles = readTree(path.join(fixtureDirectory, "target"));
    let targetValid = true;
    try { validateGeneratedFiles(targetFiles); } catch { targetValid = false; }
    check("target file contract", targetValid, targetValid ? `${targetFiles.length} generated files passed output validation` : "generated target contains invalid or unsafe files");
    const routes = generatedRoutePaths(targetFiles);
    check("expected route coverage", JSON.stringify(routes) === JSON.stringify(expected.expectedRoutes), `expected ${expected.expectedRoutes.join(", ")}; got ${routes.join(", ") || "no routes"}`);
    for (const assertion of expected.targetAssertions) {
      const file = targetFiles.find((entry) => entry.path === assertion.file);
      check(`content: ${assertion.file}`, Boolean(file?.content.includes(assertion.includes)), file?.content.includes(assertion.includes) ? `contains expected text: ${assertion.includes}` : `missing expected text: ${assertion.includes}`);
    }
    const inventory = analyzeSourceRoutes({ sourceType: expected.sourceType, files: sourceBefore, routeCandidates: expected.routeCandidates });
    check("source route contract", JSON.stringify(inventory.required.map((route) => route.path)) === JSON.stringify(expected.expectedRoutes), `source analysis requires ${inventory.required.map((route) => route.path).join(", ") || "no routes"}`);
  }
  check("source immutability", sha256(readTree(path.join(fixtureDirectory, "source"))) === sourceHash, "source fixture hash is unchanged");
  return { name, sourceType: expected.sourceType, checks, status: checks.every((item) => item.status === "passed") ? "passed" : "failed" };
}

async function evaluateWorkerFixture(name, directory, expectedStatus, expectedBuild, routes) {
  let result;
  try { result = await validateGeneratedProject(readTree(directory), routes); }
  catch (error) {
    return { name, status: "failed", validation: "failed", build: "not-run", routes: routes.map((route) => ({ path: route, status: "not-run" })), durationMs: 0, message: error instanceof Error ? error.message : "Worker invocation failed." };
  }
  const routesMatch = result.status === "not-run"
    ? result.routeChecks.every((route) => route.status === "not-run")
    : expectedStatus === "passed"
      ? result.routeChecks.length === routes.length && result.routeChecks.every((route) => route.status === "passed")
      : result.routeChecks.every((route) => route.status === "not-run");
  const expectedMatch = result.status === "not-run" || (result.status === expectedStatus && result.build === expectedBuild && routesMatch);
  return {
    name, status: result.status === "not-run" ? "not-run" : expectedMatch ? "passed" : "failed",
    validation: result.status, build: result.build, routes: result.routeChecks, durationMs: result.durationMs,
    message: result.message, diagnostics: result.diagnostics.slice(-8),
  };
}

function markdownReport(report) {
  const lines = [
    "# Migration evaluation report", "", `- Overall: **${report.status}**`, `- Generated: ${report.generatedAt}`,
    `- Mode: ${report.mode}`, `- Live OpenAI generation: **not run** (this harness never sends billable model requests)`, "",
    "## Deterministic migration fixtures", "",
    "| Fixture | Status | Checks |", "|---|---|---|",
    ...report.migrationFixtures.map((fixture) => `| ${fixture.name} | ${fixture.status} | ${fixture.checks.filter((check) => check.status === "passed").length}/${fixture.checks.length} passed |`),
    "", "## Isolated worker fixtures", "",
    report.workerFixtures.length ? "| Fixture | Status | Build | Routes | Duration |" : "Worker checks were not requested.",
    ...(report.workerFixtures.length ? ["|---|---|---|---|---:|", ...report.workerFixtures.map((fixture) => `| ${fixture.name} | ${fixture.status} | ${fixture.build} | ${fixture.routes.map((route) => `${route.path}: ${route.status}`).join(", ")} | ${fixture.durationMs} ms |`)] : []),
    "", "## Details", "",
    ...report.migrationFixtures.flatMap((fixture) => [`### ${fixture.name} — ${fixture.status}`, ...fixture.checks.map((check) => `- ${check.status.toUpperCase()}: ${check.label} — ${check.detail}`), ""]),
    ...report.workerFixtures.flatMap((fixture) => [`### Worker: ${fixture.name} — ${fixture.status}`, `- ${fixture.message}`, ...(fixture.diagnostics ?? []).map((line) => `- ${line}`), ""]),
    "## Interpretation", "", "A passing fixture validates only its recorded checks. It does not establish full behavioral parity, accessibility, responsive quality, or production readiness. A worker result of `not-run` is an environment limitation, not a pass.", "",
  ];
  return `${lines.join("\n")}\n`;
}

function parseArgs(args) {
  const options = { staticOnly: false, output: path.join(root, ".codemorph", "evaluations") };
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--static-only") options.staticOnly = true;
    else if (args[index] === "--output" && args[index + 1]) options.output = path.resolve(args[++index]);
    else throw new Error(`Unknown or incomplete argument: ${args[index]}`);
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const migrationFixtures = [
    "static-landing",
    "react-vite-multi-route",
    "enterprise-hybrid-dashboard",
    "ecommerce-storefront-platform",
    "unsupported-backend",
  ].map(evaluateStaticFixture);
  const workerFixtures = [];
  if (!options.staticOnly) {
    const validationFixtureRoot = path.join(root, "fixtures", "validation");
    const cases = [
      ["worker-known-good", path.join(validationFixtureRoot, "known-good"), "passed", "passed", ["/"]],
      ["worker-invalid-source", path.join(validationFixtureRoot, "invalid-source"), "failed", "failed", ["/"]],
      ["migration-static-landing", path.join(root, "fixtures", "migrations", "static-landing", "target"), "passed", "passed", ["/"]],
      ["migration-react-vite-multi-route", path.join(root, "fixtures", "migrations", "react-vite-multi-route", "target"), "passed", "passed", ["/", "/about"]],
      ["migration-enterprise-hybrid-dashboard", path.join(root, "fixtures", "migrations", "enterprise-hybrid-dashboard", "target"), "passed", "passed", ["/", "/analytics", "/dashboard"]],
      ["migration-ecommerce-storefront-platform", path.join(root, "fixtures", "migrations", "ecommerce-storefront-platform", "target"), "passed", "passed", ["/", "/cart", "/catalog", "/checkout"]],
    ];
    for (const [name, directory, expectedStatus, expectedBuild, routes] of cases) workerFixtures.push(await evaluateWorkerFixture(name, directory, expectedStatus, expectedBuild, routes));
  }
  const staticFailed = migrationFixtures.some((fixture) => fixture.status === "failed");
  const workerFailed = workerFixtures.some((fixture) => fixture.status === "failed");
  const workerUnrun = workerFixtures.some((fixture) => fixture.status === "not-run");
  const status = staticFailed || workerFailed ? "failed" : workerUnrun ? "unverified" : "passed";
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    mode: options.staticOnly ? "static-contracts-only" : "static-contracts-and-isolated-worker",
    status,
    migrationFixtures,
    workerFixtures,
  };
  fs.mkdirSync(options.output, { recursive: true });
  const stem = `migration-evaluation-${report.generatedAt.replace(/[:.]/g, "-")}`;
  const jsonPath = path.join(options.output, `${stem}.json`);
  const markdownPath = path.join(options.output, `${stem}.md`);
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  fs.writeFileSync(markdownPath, markdownReport(report), { encoding: "utf8", flag: "wx" });
  for (const fixture of migrationFixtures) console.log(`${fixture.name}: ${fixture.status} (${fixture.checks.filter((item) => item.status === "passed").length}/${fixture.checks.length} checks)`);
  for (const fixture of workerFixtures) console.log(`${fixture.name}: ${fixture.status}; build=${fixture.build}; routes=${fixture.routes.map((route) => `${route.path}=${route.status}`).join(", ")}; ${fixture.durationMs} ms`);
  console.log(`Overall: ${status}`);
  console.log(`Reports: ${jsonPath} and ${markdownPath}`);
  if (status === "failed") process.exitCode = 1;
  else if (status === "unverified") process.exitCode = 2;
}

if (require.main === module) main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Migration evaluation failed.");
  process.exitCode = 1;
});

module.exports = { evaluateStaticFixture, markdownReport, parseArgs };
