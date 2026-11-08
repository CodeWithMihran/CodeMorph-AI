import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { ZipEntry } from "./zip";

const DEFAULT_IMAGE = "stackshift-validator:16.4.3-1";
const PREFLIGHT_TIMEOUT_MS = 8_000;
const VALIDATION_TIMEOUT_MS = 180_000;
const MAX_LOG_CHARS = 24_000;

export type ValidationResult = {
  status: "passed" | "failed" | "not-run";
  build: "passed" | "failed" | "not-run";
  rootRoute: "passed" | "failed" | "not-run";
  routeChecks: Array<{ path: string; status: "passed" | "failed" | "not-run" }>;
  durationMs: number;
  message: string;
  diagnostics: string[];
};

type ProcessResult = { code: number | null; stdout: string; stderr: string; timedOut: boolean; spawnError?: string };

function run(command: string, args: string[], input: Buffer | undefined, timeoutMs: number): Promise<ProcessResult> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let spawnError: string | undefined;
    const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    const append = (current: string, chunk: Buffer) => (current + chunk.toString("utf8")).slice(-MAX_LOG_CHARS);
    child.stdout.on("data", (chunk: Buffer) => { stdout = append(stdout, chunk); });
    child.stderr.on("data", (chunk: Buffer) => { stderr = append(stderr, chunk); });
    child.stdin.on("error", () => {});
    child.on("error", (error) => { spawnError = error.message; });
    child.on("close", (code) => resolve({ code, stdout, stderr, timedOut, ...(spawnError ? { spawnError } : {}) }));
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
    child.on("close", () => clearTimeout(timer));
    if (input) child.stdin.end(input);
    else child.stdin.end();
  });
}

function writeOctal(buffer: Buffer, offset: number, length: number, value: number) {
  const encoded = value.toString(8).padStart(length - 1, "0").slice(-(length - 1));
  buffer.write(`${encoded}\0`, offset, length, "ascii");
}

function tarHeader(filePath: string, content: Buffer) {
  const header = Buffer.alloc(512);
  const segments = filePath.split("/");
  const name = segments.pop() ?? "";
  const prefix = segments.join("/");
  if (!name || Buffer.byteLength(name) > 100 || Buffer.byteLength(prefix) > 155) throw new Error("A generated project path cannot be packaged for validation.");
  header.write(name, 0, 100, "utf8");
  writeOctal(header, 100, 8, 0o644);
  writeOctal(header, 108, 8, 10001);
  writeOctal(header, 116, 8, 10001);
  writeOctal(header, 124, 12, content.byteLength);
  writeOctal(header, 136, 12, 0);
  header.fill(0x20, 148, 156);
  header[156] = 0x30;
  header.write("ustar\0", 257, 6, "ascii");
  header.write("00", 263, 2, "ascii");
  if (prefix) header.write(prefix, 345, 155, "utf8");
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  header.write(checksum.toString(8).padStart(6, "0"), 148, 6, "ascii");
  header[154] = 0;
  header[155] = 0x20;
  return header;
}

function createInputTar(entries: ZipEntry[]) {
  const chunks: Buffer[] = [];
  for (const entry of entries) {
    if (entry.path.startsWith("/") || entry.path.includes("\\") || entry.path.split("/").some((part) => !part || part === "." || part === "..")) {
      throw new Error("A generated project path was rejected before validation.");
    }
    const content = Buffer.from(entry.content, "utf8");
    chunks.push(tarHeader(entry.path, content), content);
    const padding = (512 - (content.byteLength % 512)) % 512;
    if (padding) chunks.push(Buffer.alloc(padding));
  }
  chunks.push(Buffer.alloc(1024));
  return Buffer.concat(chunks);
}

function cleanDiagnostics(text: string) {
  return text
    .replace(/\u001b\[[0-9;]*m/g, "")
    .replace(/\b(?:sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|AKIA[A-Z0-9]{16})\b/g, "[REDACTED TOKEN]")
    .replace(/((?:api[_-]?key|client[_-]?secret|access[_-]?token|auth[_-]?token|password|secret)\s*[:=]\s*["'])([^"']{8,})(["'])/gi, "$1[REDACTED]$3")
    .split(/\r?\n/).map((line) => line.slice(0, 500)).filter(Boolean).slice(-35);
}

export function normalizeExpectedRoutes(routes: string[]) {
  if (!Array.isArray(routes) || routes.length > 25 || routes.some((route) =>
    typeof route !== "string" || route.length > 200 || !route.startsWith("/") || route.startsWith("//") ||
    route.includes("?") || route.includes("#") || route.includes("\\") || route.split("/").some((part) => part === "." || part === "..") ||
    !/^\/(?:[A-Za-z0-9._~-]+(?:\/[A-Za-z0-9._~-]+)*)?$/.test(route)
  )) return null;
  const unique = [...new Set(routes)];
  if (!unique.includes("/")) unique.unshift("/");
  return unique;
}

export function parseRouteCheckMarkers(output: string, expectedRoutes: string[]) {
  const markers = new Map<number, "passed" | "failed">();
  for (const match of output.matchAll(/^STACKSHIFT_ROUTE_(\d+)=(passed|failed)$/gm)) {
    markers.set(Number(match[1]), match[2] as "passed" | "failed");
  }
  return expectedRoutes.map((path, index) => ({ path, status: markers.get(index) ?? "not-run" as const }));
}

function unavailable(message: string, durationMs = 0, expectedRoutes = ["/"]): ValidationResult {
  const routeChecks = expectedRoutes.map((path) => ({ path, status: "not-run" as const }));
  return { status: "not-run", build: "not-run", rootRoute: "not-run", routeChecks, durationMs, message, diagnostics: [] };
}

/** Validates generated files only inside an isolated, network-disabled disposable container. */
export async function validateGeneratedProject(entries: ZipEntry[], requestedRoutes: string[] = ["/"]): Promise<ValidationResult> {
  const startedAt = Date.now();
  const expectedRoutes = normalizeExpectedRoutes(requestedRoutes);
  if (!expectedRoutes) return {
    status: "failed", build: "not-run", rootRoute: "not-run", routeChecks: [], durationMs: 0,
    message: "Validation was not run: one or more expected route paths are invalid or exceed the route limit.", diagnostics: [],
  };
  const configuredImage = process.env.STACKSHIFT_VALIDATOR_IMAGE?.trim();
  const image = configuredImage || DEFAULT_IMAGE;
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,180}$/.test(image)) return unavailable("Validation was not run: STACKSHIFT_VALIDATOR_IMAGE has an invalid image name.", 0, expectedRoutes);

  const dockerVersion = await run("docker", ["--version"], undefined, PREFLIGHT_TIMEOUT_MS);
  if (dockerVersion.code !== 0) return unavailable("Validation was not run: Docker is unavailable. Install and start Docker Desktop, then build the StackShift validator image.", Date.now() - startedAt, expectedRoutes);

  const daemon = await run("docker", ["info", "--format", "{{.ServerVersion}}"], undefined, PREFLIGHT_TIMEOUT_MS);
  if (daemon.code !== 0) return unavailable("Validation was not run: the Docker daemon is not running or is inaccessible.", Date.now() - startedAt, expectedRoutes);

  const imageCheck = await run("docker", ["image", "inspect", image], undefined, PREFLIGHT_TIMEOUT_MS);
  if (imageCheck.code !== 0) return unavailable(`Validation was not run: the validator image is missing. Build it with the command in README.md (${image}).`, Date.now() - startedAt, expectedRoutes);

  let input: Buffer;
  try { input = createInputTar(entries); }
  catch (error) {
    return { ...unavailable(error instanceof Error ? error.message : "The generated project could not be packaged for validation.", Date.now() - startedAt, expectedRoutes), status: "failed", build: "failed" };
  }

  const containerName = `stackshift-validation-${randomUUID().replaceAll("-", "").slice(0, 20)}`;
  const result = await run("docker", [
    "run", "--rm", "--interactive", "--name", containerName,
    "--network=none", "--memory=1536m", "--memory-swap=1536m", "--cpus=1", "--pids-limit=64",
    "--read-only", "--tmpfs", "/workspace:rw,noexec,nosuid,nodev,size=512m,uid=10001,gid=10001",
    "--tmpfs", "/tmp:rw,noexec,nosuid,nodev,size=128m,uid=10001,gid=10001",
    "--cap-drop=ALL", "--security-opt=no-new-privileges", "--user=10001:10001",
    "--env", `STACKSHIFT_EXPECTED_ROUTES=${Buffer.from(JSON.stringify(expectedRoutes)).toString("base64")}`,
    image,
  ], input, VALIDATION_TIMEOUT_MS);

  if (result.timedOut) {
    await run("docker", ["stop", "--time", "1", containerName], undefined, 5_000);
    await run("docker", ["rm", "--force", containerName], undefined, 5_000);
    return { status: "failed", build: "failed", rootRoute: "not-run", routeChecks: expectedRoutes.map((path) => ({ path, status: "not-run" })), durationMs: Date.now() - startedAt, message: "Validation exceeded the three-minute limit and the worker was stopped.", diagnostics: cleanDiagnostics(result.stdout + result.stderr) };
  }
  if (result.spawnError || result.code === null) {
    return unavailable("Validation worker could not be started. Check the Docker installation and retry.", Date.now() - startedAt, expectedRoutes);
  }

  const output = `${result.stdout}\n${result.stderr}`;
  const build = output.match(/^STACKSHIFT_BUILD=(passed|failed|not-run)$/m)?.[1] as ValidationResult["build"] | undefined;
  const rootRoute = output.match(/^STACKSHIFT_ROUTE_ROOT=(passed|failed|not-run)$/m)?.[1] as ValidationResult["rootRoute"] | undefined;
  const routeChecks = parseRouteCheckMarkers(output, expectedRoutes);
  const actualRootRoute = routeChecks.find((route) => route.path === "/")?.status ?? rootRoute ?? "not-run";
  if (!build) return { status: "failed", build: "failed", rootRoute: "not-run", routeChecks, durationMs: Date.now() - startedAt, message: "The validation worker exited without returning a build result.", diagnostics: cleanDiagnostics(output) };

  const diagnostics = cleanDiagnostics(output.replace(/^STACKSHIFT_(?:BUILD|ROUTE_ROOT|ROUTE_\d+)=.*$/gm, ""));
  const status = build === "passed" && routeChecks.every((route) => route.status === "passed") ? "passed" : "failed";
  return {
    status,
    build,
    rootRoute: actualRootRoute,
    routeChecks,
    durationMs: Date.now() - startedAt,
    message: status === "passed" ? `The production build passed and all ${routeChecks.length} expected route(s) returned HTTP 200.` : "Validation completed with issues. Review the bounded worker diagnostics and migration limitations.",
    diagnostics,
  };
}
