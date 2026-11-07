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
const { readZipSourceManifest } = require("../lib/source/zip.ts");
const { auditSourceFiles } = require("../lib/audit/engine.ts");
const { auditDependencyAdvisories } = require("../lib/audit/dependencies.ts");
const { downloadPinnedGitHubArchive } = require("../lib/github/archive.ts");
const { containsCredentialPattern } = require("../lib/github/source.ts");
const { redactSecretText } = require("../lib/security/secrets.ts");
const { validateGeneratedFiles } = require("../lib/migration/generated-output.ts");
const { deflateRawSync } = require("node:zlib");

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeZip(inputEntries) {
  const local = [];
  const central = [];
  let localOffset = 0;
  for (const item of inputEntries) {
    const name = Buffer.from(item.name, "utf8");
    const data = Buffer.from(item.content ?? "", "utf8");
    const method = item.method ?? 0;
    const compressed = method === 8 ? deflateRawSync(data) : data;
    const checksum = item.crc === undefined ? crc32(data) : item.crc;
    const flags = item.flags ?? 0x0800;
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(flags, 6);
    localHeader.writeUInt16LE(method, 8);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(compressed.byteLength, 18);
    localHeader.writeUInt32LE(data.byteLength, 22);
    localHeader.writeUInt16LE(name.byteLength, 26);
    local.push(localHeader, name, compressed);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE((3 << 8) | 20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(flags, 8);
    centralHeader.writeUInt16LE(method, 10);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(compressed.byteLength, 20);
    centralHeader.writeUInt32LE(data.byteLength, 24);
    centralHeader.writeUInt16LE(name.byteLength, 28);
    centralHeader.writeUInt32LE((((item.mode ?? 0o100644) << 16) >>> 0), 38);
    centralHeader.writeUInt32LE(localOffset, 42);
    central.push(centralHeader, name);
    localOffset += localHeader.byteLength + name.byteLength + compressed.byteLength;
  }
  const centralDirectory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(inputEntries.length, 8);
  end.writeUInt16LE(inputEntries.length, 10);
  end.writeUInt32LE(centralDirectory.byteLength, 12);
  end.writeUInt32LE(localOffset, 16);
  return Buffer.concat([...local, centralDirectory, end]);
}

test("GitHub repository URL parser rejects non-GitHub and non-repository URLs", () => {
  assert.deepEqual(parseGitHubRepositoryUrl("https://github.com/Owner/Project.git"), { owner: "Owner", repository: "Project" });
  assert.equal(parseGitHubRepositoryUrl("http://github.com/Owner/Project"), null);
  assert.equal(parseGitHubRepositoryUrl("https://github.com/Owner/Project/tree/main"), null);
  assert.equal(parseGitHubRepositoryUrl("https://github.com.evil.test/Owner/Project"), null);
  assert.equal(parseGitHubRepositoryUrl("https://user@github.com/Owner/Project"), null);
});

test("provider credential formats are detected and redacted before source sharing", () => {
  const secrets = [
    `const STRIPE_KEY = "sk_live_${"s".repeat(24)}";`,
    `const STRIPE_SECRET_KEY = "${"s".repeat(32)}";`,
    `const secretValue = "${"v".repeat(32)}";`,
    `const googleKey = "AIza${"g".repeat(35)}";`,
    `const slackToken = "xoxb-${"s".repeat(24)}";`,
    `const githubToken = "github_pat_${"g".repeat(30)}";`,
    `const bearer = "Bearer ${"b".repeat(30)}";`,
  ];
  for (const source of secrets) {
    assert.equal(containsCredentialPattern(source), true, source);
    const redacted = redactSecretText(source);
    assert.doesNotMatch(redacted, /sk_live_|AIza|xoxb-|github_pat_|Bearer b{10}/);
    assert.match(redacted, /REDACTED/);
  }
});

test("generated output validation checks dynamic imports and blocks Node built-ins", () => {
  const validFiles = (page) => [
    { path: "app/page.tsx", content: page },
    { path: "app/globals.css", content: "body { color: black; }" },
  ];
  assert.throws(() => validateGeneratedFiles(validFiles('export default async function Page() { await import("node:fs"); return <main />; }')), /Node\.js built-in/i);
  assert.throws(() => validateGeneratedFiles(validFiles('export default async function Page() { await import("node:fs", { with: { "resolution-mode": "import" } }); return <main />; }')), /Node\.js built-in/i);
  assert.throws(() => validateGeneratedFiles(validFiles('export default function Page() { return import(moduleName); }')), /computed dynamic import/i);
  assert.throws(() => validateGeneratedFiles(validFiles('export default async function Page() { await import("unknown-package"); return <main />; }')), /unsupported dependency/i);
  assert.throws(() => validateGeneratedFiles(validFiles('export default function Page() { return import("./missing"); }')), /not included/i);
  assert.throws(() => validateGeneratedFiles(validFiles('export default function Page() { return import("@/missing"); }')), /not included/i);
  assert.equal(validateGeneratedFiles(validFiles('import "@/app/globals.css"; import "react-dom"; export default function Page() { return <main />; }')).length, 2);
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
  const stripeKey = `sk_live_${"s".repeat(24)}`;
  const blobs = {
    "manifest-sha": manifest,
    "index-sha": Buffer.from("<!doctype html><title>Fixture</title>"),
    "main-sha": Buffer.from(`const STRIPE_KEY = "${stripeKey}";\nexport default 1;`),
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
  const sharedSource = full.files.find((file) => file.path === "src/main.tsx").content;
  assert.doesNotMatch(sharedSource, new RegExp(stripeKey));
  assert.match(sharedSource, /REDACTED/);
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

test("ZIP ingestion creates a hashed source manifest and excludes unsafe or irrelevant files", () => {
  const archive = makeZip([
    { name: "site/index.html", content: "<!doctype html>\n<img src=\"logo.png\">", method: 8 },
    { name: "site/src/App.tsx", content: "// TODO: wire this up\nconsole.log('debug')" },
    { name: "site/.env", content: "API_KEY=private-value-that-must-not-leak" },
    { name: "site/node_modules/pkg/index.js", content: "eval('ignored')" },
    { name: "site/public/logo.png", content: "binary placeholder" },
  ]);
  const manifest = readZipSourceManifest(archive, "portfolio.zip");
  assert.equal(manifest.origin.kind, "zip");
  assert.equal(manifest.origin.label, "portfolio.zip");
  assert.match(manifest.origin.revision, /^[a-f\d]{64}$/);
  assert.deepEqual(manifest.files.map((file) => file.path), ["index.html", "src/App.tsx"]);
  assert.ok(manifest.files.every((file) => /^[a-f\d]{64}$/.test(file.sha256)));
  assert.ok(manifest.exclusions.some((item) => item.includes("secret or credential")));
  assert.ok(manifest.exclusions.some((item) => item.includes("generated or dependency")));
  const report = auditSourceFiles({ manifest });
  assert.ok(report.findings.some((finding) => finding.ruleId === "ACC001" && finding.file === "index.html"));
  assert.ok(report.findings.some((finding) => finding.ruleId === "MAINT002" && finding.file === "src/App.tsx"));
  assert.equal(report.source.kind, "zip");
  assert.equal(report.coverage.scannedFiles, 2);
});

test("ZIP ingestion rejects traversal, absolute paths, duplicate paths, and symlinks", () => {
  assert.throws(() => readZipSourceManifest(makeZip([{ name: "../escape.ts", content: "export {};" }]), "bad.zip"), /path traversal|absolute/i);
  assert.throws(() => readZipSourceManifest(makeZip([{ name: "C:/escape.ts", content: "export {};" }]), "bad.zip"), /absolute|path traversal/i);
  assert.throws(() => readZipSourceManifest(makeZip([
    { name: "src/App.tsx", content: "export {};" },
    { name: "src/app.tsx", content: "export {};" },
  ]), "bad.zip"), /duplicate|case-colliding/i);
  assert.throws(() => readZipSourceManifest(makeZip([{ name: "src/link.ts", content: "target", mode: 0o120777 }]), "bad.zip"), /symbolic link/i);
});

test("ZIP ingestion rejects expansion bombs, corrupt checksums, and encrypted entries", () => {
  assert.throws(() => readZipSourceManifest(makeZip([{ name: "src/huge.ts", content: "a".repeat(100_000), method: 8 }]), "bomb.zip"), /compression ratio/i);
  assert.throws(() => readZipSourceManifest(makeZip([{ name: "src/bad.ts", content: "export {};", crc: 1 }]), "bad.zip"), /checksum/i);
  assert.throws(() => readZipSourceManifest(makeZip([{ name: "src/secret.ts", content: "export {};", flags: 0x0801 }]), "encrypted.zip"), /encrypted/i);
});

test("ZIP audit upload route accepts multipart archives and rejects other request types", async () => {
  const route = require("../app/api/repositories/audit-upload/route.ts");
  const form = new FormData();
  form.set("file", new Blob([makeZip([{ name: "index.html", content: "<img src=\"x.png\">" }])]), "site.zip");
  const response = await route.POST(new Request("http://localhost/api/repositories/audit-upload", { method: "POST", body: form }));
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.report.source.kind, "zip");
  assert.match(result.markdown, /Code audit report/);

  const rejected = await route.POST(new Request("http://localhost/api/repositories/audit-upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  }));
  assert.equal(rejected.status, 415);
});

test("structural audit parses syntax and finds unresolved internal and undeclared package imports", () => {
  const archive = makeZip([
    { name: "fixture-root/package.json", content: JSON.stringify({ name: "fixture", dependencies: { react: "19.0.0" } }) },
    { name: "fixture-root/tsconfig.json", content: JSON.stringify({ compilerOptions: { paths: { "@/*": ["src/*"] } } }) },
    { name: "fixture-root/src/known.ts", content: "export const known = true;" },
    { name: "fixture-root/src/page.tsx", content: "import React from 'react';\nimport Known from '@/known';\nimport Missing from './missing';\nimport Ghost from 'ghost-package';\nconst value: = 1;" },
  ]);
  const manifest = readZipSourceManifest(archive, "syntax.zip");
  const report = auditSourceFiles({ manifest });
  assert.ok(manifest.metadataFiles.some((file) => file.path === "package.json"));
  assert.ok(report.coverage.scannedPaths.includes("src/page.tsx"));
  assert.ok(report.findings.some((finding) => finding.ruleId === "AST001" && finding.file === "src/page.tsx"));
  assert.ok(report.findings.some((finding) => finding.ruleId === "IMP001" && finding.file === "src/page.tsx"));
  assert.ok(report.findings.some((finding) => finding.ruleId === "DEP002" && finding.packageName === undefined));
  assert.equal(report.structure.parsedFiles, 2);
  assert.equal(report.structure.resolvedInternalImports, 1);
  assert.equal(report.structure.unresolvedInternalImports, 1);
  assert.equal(report.structure.undeclaredPackageImports, 1);
});

test("structural audit parses .mts and .cts files as TypeScript", () => {
  const manifest = readZipSourceManifest(makeZip([
    { name: "src/module.mts", content: "const value = <string>source; export { value };" },
    { name: "src/module.cts", content: "const value = <string>source; export { value };" },
  ]), "typed-modules.zip");
  const report = auditSourceFiles({ manifest });
  assert.equal(report.structure.parsedFiles, 2);
  assert.equal(report.structure.syntaxErrors, 0);
  assert.equal(report.findings.some((finding) => finding.ruleId === "AST001"), false);
});

test("structural audit resolves @/ alias to src/ even when tsconfig paths are omitted", () => {
  const archive = makeZip([
    { name: "fixture-root/package.json", content: JSON.stringify({ name: "fixture" }) },
    { name: "fixture-root/src/known.ts", content: "export const known = true;" },
    { name: "fixture-root/src/page.tsx", content: "import Known from '@/known';" },
  ]);
  const manifest = readZipSourceManifest(archive, "src-alias.zip");
  const report = auditSourceFiles({ manifest });
  assert.equal(report.structure.unresolvedInternalImports, 0);
  assert.equal(report.structure.resolvedInternalImports, 1);
});

test("dependency advisory audit queries exact locked npm versions and records OSV matches", async (t) => {
  const originalFetch = global.fetch;
  const requests = [];
  t.after(() => { global.fetch = originalFetch; });
  global.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    if (String(url).endsWith("/v1/querybatch")) {
      const body = JSON.parse(options.body);
      assert.deepEqual(body.queries.map((query) => query.version), ["1.2.3", "0.4.0", "2.0.0"]);
      return Response.json({ results: [{ vulns: [{ id: "GHSA-test-1234" }] }, {}, {}] });
    }
    if (String(url).endsWith("/v1/vulns/GHSA-test-1234")) {
      return Response.json({
        id: "GHSA-test-1234",
        summary: "Fixture advisory",
        details: "A fixture package version is affected.",
        affected: [{ ecosystem_specific: { severity: "HIGH" }, ranges: [{ events: [{ introduced: "0" }, { fixed: "1.2.4" }] }] }],
      });
    }
    throw new Error("Unexpected advisory request");
  };
  const manifest = readZipSourceManifest(makeZip([
    { name: "src/index.ts", content: "export const ready = true;" },
    { name: "package.json", content: JSON.stringify({ name: "fixture", dependencies: { vulnerable: "1.2.3" }, devDependencies: { builder: "0.4.0" } }) },
    { name: "package-lock.json", content: JSON.stringify({ lockfileVersion: 3, packages: {
      "": { dependencies: { vulnerable: "1.2.3" }, devDependencies: { builder: "0.4.0" } },
      "node_modules/vulnerable": { version: "1.2.3" },
      "node_modules/builder": { version: "0.4.0", dev: true },
      "node_modules/vulnerable/node_modules/transitive": { version: "2.0.0" },
    } }) },
  ]), "dependencies.zip");
  const initial = auditSourceFiles({ manifest });
  const report = await auditDependencyAdvisories(manifest, initial);
  assert.equal(report.dependencyAudit.status, "checked");
  assert.equal(report.dependencyAudit.queriedPackages, 3);
  assert.equal(report.dependencyAudit.vulnerablePackages, 1);
  const finding = report.findings.find((item) => item.advisoryId === "GHSA-test-1234");
  assert.equal(finding.severity, "high");
  assert.equal(finding.packageVersion, "1.2.3");
  assert.equal(finding.dependencyType, "production");
  assert.match(finding.recommendation, /1\.2\.4/);
  assert.equal(requests.length, 2);
});

test("dependency advisory failures are shown as unknown rather than clean", async (t) => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  global.fetch = async () => { throw new Error("Network unavailable"); };
  const manifest = readZipSourceManifest(makeZip([
    { name: "src/index.ts", content: "export {};" },
    { name: "package-lock.json", content: JSON.stringify({ lockfileVersion: 3, packages: { "node_modules/pkg": { version: "1.0.0" } } }) },
  ]), "network.zip");
  const report = await auditDependencyAdvisories(manifest, auditSourceFiles({ manifest }));
  assert.equal(report.dependencyAudit.status, "unavailable");
  assert.match(report.dependencyAudit.message, /unknown, not clean/i);
});

test("GitHub audit archive download pins the commit and permits only the codeload redirect host", async (t) => {
  const originalFetch = global.fetch;
  const commitSha = "e".repeat(40);
  const archive = makeZip([{ name: "repo/src/index.ts", content: "export const ready = true;" }]);
  const requested = [];
  t.after(() => { global.fetch = originalFetch; });
  global.fetch = async (url) => {
    const parsed = new URL(url);
    requested.push(parsed.href);
    if (parsed.pathname === "/repos/owner/repo") return Response.json({ private: false, full_name: "owner/repo" });
    if (parsed.pathname.endsWith(`/git/commits/${commitSha}`)) return Response.json({ sha: commitSha });
    if (parsed.pathname.endsWith(`/zipball/${commitSha}`)) return new Response(null, { status: 302, headers: { location: "https://codeload.github.com/owner/repo/legacy.zip/" + commitSha } });
    if (parsed.hostname === "codeload.github.com") return new Response(archive, { status: 200 });
    throw new Error("Unexpected archive request");
  };

  const result = await downloadPinnedGitHubArchive({ repositoryUrl: "https://github.com/owner/repo", expectedFullName: "owner/repo", commitSha });
  assert.deepEqual(result, archive);
  assert.ok(requested.some((url) => url.includes(`/zipball/${commitSha}`)));
  assert.ok(requested.every((url) => new URL(url).hostname === "api.github.com" || new URL(url).hostname === "codeload.github.com"));

  global.fetch = async (url) => {
    const parsed = new URL(url);
    if (parsed.pathname === "/repos/owner/repo") return Response.json({ private: false, full_name: "owner/repo" });
    if (parsed.pathname.endsWith(`/git/commits/${commitSha}`)) return Response.json({ sha: commitSha });
    if (parsed.pathname.endsWith(`/zipball/${commitSha}`)) return new Response(null, { status: 302, headers: { location: "https://evil.example/archive.zip" } });
    throw new Error("Untrusted host must not be requested");
  };
  await assert.rejects(downloadPinnedGitHubArchive({ repositoryUrl: "https://github.com/owner/repo", expectedFullName: "owner/repo", commitSha }), /unsupported archive download host/i);
});

