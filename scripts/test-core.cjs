/* eslint-disable @typescript-eslint/no-require-imports */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");
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

const { parseGitHubRepositoryUrl } = require("../lib/github/parse-repository-url.ts");
const { readMigrationSource } = require("../lib/github/source.ts");
const { inspectMigrationSource } = require("../lib/github/migration-source.ts");
const { classifySource } = require("../lib/github/classify-source.ts");
const { createMigrationPlan } = require("../lib/migration/plan.ts");

test("GitHub repository URL parser rejects non-GitHub and non-repository URLs", () => {
  assert.deepEqual(parseGitHubRepositoryUrl("https://github.com/Owner/Project.git"), { owner: "Owner", repository: "Project" });
  assert.equal(parseGitHubRepositoryUrl("http://github.com/Owner/Project"), null);
  assert.equal(parseGitHubRepositoryUrl("https://github.com/Owner/Project/tree/main"), null);
  assert.equal(parseGitHubRepositoryUrl("https://github.com.evil.test/Owner/Project"), null);
  assert.equal(parseGitHubRepositoryUrl("https://user@github.com/Owner/Project"), null);
});

test("source revalidation detects large manifests while metadata-only plans avoid source blobs", async (t) => {
  const commitSha = "a".repeat(40);
  const manifestObject = {
    name: "fixture",
    dependencies: Object.fromEntries([
      ...Array.from({ length: 100 }, (_, index) => [`filler-${index}`, "v".repeat(100)]),
      ["react", "19.0.0"],
      ["vite", "6.0.0"],
    ]),
    notes: "x".repeat(20_000),
  };
  const manifest = Buffer.from(JSON.stringify(manifestObject));
  assert.ok(manifest.byteLength > 16 * 1024);
  const blobs = {
    "manifest-sha": manifest,
    "index-sha": Buffer.from("<!doctype html><title>Fixture</title>"),
    "main-sha": Buffer.from("export default 1;"),
  };
  const tree = [
    { path: "package.json", type: "blob", sha: "manifest-sha", size: manifest.byteLength },
    { path: "index.html", type: "blob", sha: "index-sha", size: blobs["index-sha"].byteLength },
    { path: "src/main.tsx", type: "blob", sha: "main-sha", size: blobs["main-sha"].byteLength },
  ];
  const requested = [];
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  global.fetch = async (url) => {
    const pathname = new URL(url).pathname;
    requested.push(pathname);
    if (pathname === "/repos/owner/repo") return Response.json({ private: false, full_name: "owner/repo" });
    if (pathname.endsWith(`/git/commits/${commitSha}`)) return Response.json({ sha: commitSha, tree: { sha: "tree-sha" } });
    if (pathname.endsWith("/git/trees/tree-sha")) return Response.json({ truncated: false, tree });
    const blobSha = pathname.split("/").pop();
    if (!(blobSha in blobs)) return Response.json({ message: "missing blob" }, { status: 404 });
    return Response.json({ encoding: "base64", content: blobs[blobSha].toString("base64") });
  };

  const metadataOnly = await readMigrationSource("owner", "repo", commitSha, { includeSourceFiles: false });
  assert.deepEqual(metadataOnly.files.map((file) => file.path), ["package.json"]);
  assert.deepEqual(metadataOnly.keyFiles, ["package.json", "index.html", "src/main.tsx"]);
  assert.deepEqual(metadataOnly.routeCandidates, ["index.html"]);
  assert.equal(requested.filter((url) => url.includes("/git/blobs/")).length, 1);

  requested.length = 0;
  const fullSource = await readMigrationSource("owner", "repo", commitSha);
  assert.deepEqual(fullSource.keyFiles, metadataOnly.keyFiles);
  assert.deepEqual(fullSource.routeCandidates, metadataOnly.routeCandidates);

  requested.length = 0;
  const full = await inspectMigrationSource({
    repositoryUrl: "https://github.com/owner/repo",
    expectedFullName: "owner/repo",
    commitSha,
  });
  assert.equal(full.sourceType, "react-vite");
  assert.equal(full.framework, "React + Vite");
  assert.ok(full.files.length > 1);
  assert.ok(full.files.find((file) => file.path === "package.json").content.length < 16 * 1024);
});

test("source identity mismatch is rejected before additional GitHub requests", async (t) => {
  let requestCount = 0;
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  global.fetch = async () => { requestCount++; return Response.json({}); };
  await assert.rejects(
    inspectMigrationSource({ repositoryUrl: "https://github.com/owner/other", expectedFullName: "owner/repo", commitSha: "a".repeat(40) }),
    /repository identity changed/i,
  );
  assert.equal(requestCount, 0);
});

test("metadata-only validation still recognizes a static site without fetching source contents", async (t) => {
  const commitSha = "b".repeat(40);
  const originalFetch = global.fetch;
  const requested = [];
  t.after(() => { global.fetch = originalFetch; });
  global.fetch = async (url) => {
    const pathname = new URL(url).pathname;
    requested.push(pathname);
    if (pathname === "/repos/owner/static-site") return Response.json({ private: false, full_name: "owner/static-site" });
    if (pathname.endsWith(`/git/commits/${commitSha}`)) return Response.json({ sha: commitSha, tree: { sha: "static-tree" } });
    if (pathname.endsWith("/git/trees/static-tree")) return Response.json({ truncated: false, tree: [
      { path: "index.html", type: "blob", sha: "index-sha", size: 33 },
      { path: "styles.css", type: "blob", sha: "css-sha", size: 12 },
    ] });
    return Response.json({ message: "Unexpected blob fetch" }, { status: 500 });
  };

  const source = await inspectMigrationSource({
    repositoryUrl: "https://github.com/owner/static-site",
    expectedFullName: "owner/static-site",
    commitSha,
    includeSourceFiles: false,
  });
  assert.equal(source.sourceType, "static");
  assert.equal(source.framework, "Static HTML/CSS/JavaScript");
  assert.deepEqual(source.routeCandidates, ["index.html"]);
  assert.equal(requested.some((url) => url.includes("/git/blobs/")), false);
});

test("source classification supports tooling-only static manifests but rejects known backend frameworks", () => {
  assert.equal(classifySource(new Set(["index.html"]), { name: "static-site", scripts: { build: "echo build" }, devDependencies: { prettier: "3" } }).sourceType, "static");
  assert.equal(classifySource(new Set(["index.html"]), { name: "server", dependencies: { express: "4" } }).sourceType, "unsupported");
  assert.equal(classifySource(new Set(["index.html"]), { name: "vite-app", devDependencies: { vite: "6" } }).sourceType, "unsupported");
});

test("migration plan route rejects a browser-forged source profile", async (t) => {
  const migrationSourceModule = require("../lib/github/migration-source.ts");
  const originalInspect = migrationSourceModule.inspectMigrationSource;
  let inspectCalls = 0;
  migrationSourceModule.inspectMigrationSource = async () => {
    inspectCalls++;
    return {
      repository: "owner/repo",
      sourceType: "react-vite",
      framework: "React + Vite",
      keyFiles: ["package.json", "src/main.tsx"],
      routeCandidates: [],
    };
  };
  t.after(() => { migrationSourceModule.inspectMigrationSource = originalInspect; });

  const response = await require("../app/api/migrations/plan/route.ts").POST(new Request("http://localhost/api/migrations/plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      goal: "Migrate this portfolio website",
      analysis: {
        repository: { fullName: "owner/repo", url: "https://github.com/owner/repo" },
        revision: { commitSha: "c".repeat(40) },
        profile: { supported: true, sourceType: "static", framework: "Static HTML/CSS/JavaScript" },
      },
    }),
  }));

  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /profile no longer matches/i);
  assert.equal(inspectCalls, 1);
});

test("generation rejects altered profiles and plans before calling the model", async (t) => {
  const migrationSourceModule = require("../lib/github/migration-source.ts");
  const modelModule = require("../lib/migration/model.ts");
  const originalInspect = migrationSourceModule.inspectMigrationSource;
  const originalGenerate = modelModule.generateWithOpenAI;
  const originalKey = process.env.OPENAI_API_KEY;
  const commitSha = "d".repeat(40);
  const source = {
    repository: "owner/repo",
    sourceType: "static",
    framework: "Static HTML/CSS/JavaScript",
    keyFiles: ["index.html"],
    routeCandidates: ["index.html"],
    files: [{ path: "index.html", content: "<h1>Portfolio</h1>" }],
    assetPaths: [],
    fileCount: 1,
    excludedFileCount: 0,
  };
  let modelCalls = 0;
  migrationSourceModule.inspectMigrationSource = async () => source;
  modelModule.generateWithOpenAI = async () => {
    modelCalls++;
    throw new Error("Model must not be called for a forged request");
  };
  process.env.OPENAI_API_KEY = "test-key-that-is-never-used";
  t.after(() => {
    migrationSourceModule.inspectMigrationSource = originalInspect;
    modelModule.generateWithOpenAI = originalGenerate;
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
  });

  const goal = "Migrate this portfolio website";
  const canonicalPlan = createMigrationPlan({
    sourceType: "static",
    repository: "owner/repo",
    framework: "Static HTML/CSS/JavaScript",
    commitSha,
    goal,
    keyFiles: source.keyFiles,
    routeCandidates: source.routeCandidates,
  });
  const analysis = {
    repository: { fullName: "owner/repo", url: "https://github.com/owner/repo" },
    revision: { commitSha },
    profile: { supported: true, sourceType: "static", framework: "Static HTML/CSS/JavaScript" },
  };
  const route = require("../app/api/migrations/generate/route.ts");
  async function send(plan, profile = analysis.profile) {
    return route.POST(new Request("http://localhost/api/migrations/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmed: true, analysis: { ...analysis, profile }, plan, goal }),
    }));
  }

  const forgedProfile = await send(canonicalPlan, { supported: true, sourceType: "react-vite", framework: "React + Vite" });
  assert.equal(forgedProfile.status, 409);
  assert.match((await forgedProfile.json()).error, /profile no longer matches/i);

  const editedPlan = structuredClone(canonicalPlan);
  editedPlan.preserve[0].detail = "Changed by the browser";
  const forgedPlan = await send(editedPlan);
  assert.equal(forgedPlan.status, 409);
  assert.match((await forgedPlan.json()).error, /approved plan differs/i);
  assert.equal(modelCalls, 0);
});

