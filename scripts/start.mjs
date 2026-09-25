#!/usr/bin/env node
/**
 * One-command launcher for ZeroCarbon.gov.
 *
 *   npm start             first run: create .env, install, build. Then run web + API and open the browser.
 *   npm run dev           same, with hot reload and no production build.
 *   npm run prepare:app   install and build only, then exit (used by the Dockerfile).
 *
 * Flags: --dev, --prepare, --no-open. Env: WEB_PORT, API_PORT, WEB_HOST, NO_OPEN.
 *
 * This file must have zero dependencies and avoid very new syntax: it runs
 * before `npm install`, and must be able to tell users on old Node versions
 * what to do.
 */
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import net from "node:net";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WEB_DIR = path.join(ROOT, "apps", "web");
const API_DIR = path.join(ROOT, "apps", "api");
const LOCKFILE = path.join(ROOT, "package-lock.json");
const BUILD_STAMP = path.join(WEB_DIR, ".next", ".zerocarbon-build");
const MIN_NODE = [20, 9, 0];
const IS_WIN = process.platform === "win32";

const flags = new Set(process.argv.slice(2));
const DEV = flags.has("--dev");
const PREPARE_ONLY = flags.has("--prepare");

const useColor = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
const paint = (code) => (text) => (useColor ? `\x1b[${code}m${text}\x1b[0m` : String(text));
const bold = paint(1);
const dim = paint(2);
const red = paint(31);
const green = paint(32);
const yellow = paint(33);
const magenta = paint(35);
const cyan = paint(36);

const step = (msg) => console.log(`${green("[setup]")} ${msg}`);
const warn = (msg) => console.warn(`${yellow("[setup]")} ${msg}`);
function fail(msg) {
  console.error(`\n${red("[setup] " + msg)}\n`);
  process.exit(1);
}

const children = [];
let shuttingDown = false;
const startedAt = Date.now();

main().catch((err) => {
  console.error(err);
  shutdown(1);
});

async function main() {
  checkNodeVersion();
  ensureEnvFile();
  ensureDependencies();
  if (!DEV) ensureWebBuild();
  if (PREPARE_ONLY) {
    step("Prepared. Run `npm start` to launch.");
    return;
  }
  await startServices();
}

function checkNodeVersion() {
  const [major, minor, patch] = process.versions.node.split(".").map(Number);
  const [reqMajor, reqMinor, reqPatch] = MIN_NODE;
  const ok =
    major > reqMajor ||
    (major === reqMajor && (minor > reqMinor || (minor === reqMinor && patch >= reqPatch)));
  if (!ok) {
    fail(
      `Node.js ${MIN_NODE.join(".")} or newer is required, but you have ${process.versions.node}.\n` +
        "  Install the LTS version from https://nodejs.org and run `npm start` again,\n" +
        "  or run the app with Docker instead: docker compose up --build",
    );
  }
}

function ensureEnvFile() {
  const envPath = path.join(ROOT, ".env");
  const examplePath = path.join(ROOT, ".env.example");
  if (!existsSync(envPath) && existsSync(examplePath)) {
    copyFileSync(examplePath, envPath);
    step("Created .env from .env.example (the defaults work as-is, no API keys needed)");
  }
  if (existsSync(envPath)) loadEnvFile(envPath);
}

// Minimal .env parser. Values already set in the real environment win.
function loadEnvFile(file) {
  const text = readFileSync(file, "utf8").replace(/^\uFEFF/, "");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    const key = match[1];
    let value = match[2];
    if (/^(["']).*\1$/.test(value)) value = value.slice(1, -1);
    else value = value.replace(/\s+#.*$/, "").trim();
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function dependenciesInstalled() {
  const hiddenLock = path.join(ROOT, "node_modules", ".package-lock.json");
  if (!existsSync(hiddenLock)) return false;
  const installedAt = statSync(hiddenLock).mtimeMs;
  const manifests = [
    LOCKFILE,
    path.join(ROOT, "package.json"),
    path.join(WEB_DIR, "package.json"),
    path.join(API_DIR, "package.json"),
    path.join(ROOT, "packages", "shared", "package.json"),
  ];
  if (manifests.some((file) => existsSync(file) && statSync(file).mtimeMs > installedAt + 1000)) return false;
  return ["next", "tsx", "express", "react"].every((pkg) =>
    existsSync(path.join(ROOT, "node_modules", pkg, "package.json")),
  );
}

function ensureDependencies() {
  if (dependenciesInstalled()) return;
  step("Installing dependencies. First run only, this can take a few minutes...");
  const common = ["--no-audit", "--no-fund", "--include=dev", "--loglevel=error"];
  let ok = existsSync(LOCKFILE) && runNpm(["ci", ...common]);
  if (!ok) {
    if (existsSync(LOCKFILE)) warn("`npm ci` failed, retrying with `npm install`...");
    ok = runNpm(["install", ...common]);
  }
  if (!ok) fail("Installing dependencies failed. See the npm output above (a network or proxy issue is the usual cause).");
}

function runNpm(args) {
  // Reuse the npm that launched us when possible: avoids PATH and Windows .cmd shims.
  const npmCli = process.env.npm_execpath;
  const viaNode = npmCli && /npm-cli\.c?js$/.test(npmCli);
  const result = spawnSync(viaNode ? process.execPath : "npm", viaNode ? [npmCli, ...args] : args, {
    cwd: ROOT,
    stdio: "inherit",
    shell: !viaNode && IS_WIN,
    env: process.env,
  });
  return result.status === 0;
}

function webSourceFingerprint() {
  const hash = createHash("sha256");
  const skip = new Set(["node_modules", ".next", ".turbo", "next-env.d.ts"]);
  const walk = (dir) => {
    const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1));
    for (const entry of entries) {
      if (skip.has(entry.name) || entry.name.endsWith(".md")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) {
        hash.update(path.relative(ROOT, full));
        hash.update(readFileSync(full));
      }
    }
  };
  walk(WEB_DIR);
  walk(path.join(ROOT, "packages"));
  if (existsSync(LOCKFILE)) hash.update(readFileSync(LOCKFILE));
  return hash.digest("hex");
}

function ensureWebBuild() {
  const fingerprint = webSourceFingerprint();
  const buildIntact = existsSync(path.join(WEB_DIR, ".next", "BUILD_ID")) && existsSync(BUILD_STAMP);
  if (buildIntact && readFileSync(BUILD_STAMP, "utf8") === fingerprint) return;
  step("Building the web app (first run or after code changes)...");
  const result = spawnSync(process.execPath, [resolveBin(WEB_DIR, "next/dist/bin/next"), "build"], {
    cwd: WEB_DIR,
    stdio: "inherit",
    env: childEnv({ NODE_ENV: "production" }),
  });
  if (result.status !== 0) fail("Building the web app failed. See the output above.");
  writeFileSync(BUILD_STAMP, fingerprint);
}

function resolveBin(fromDir, specifier) {
  return createRequire(path.join(fromDir, "package.json")).resolve(specifier);
}

function childEnv(extra) {
  const env = { ...process.env, NEXT_TELEMETRY_DISABLED: "1", ...extra };
  if (useColor) env.FORCE_COLOR = "1";
  return env;
}

async function startServices() {
  const webHost = process.env.WEB_HOST || "127.0.0.1";
  const preferredWeb = Number(process.env.WEB_PORT) || 3000;
  const preferredApi = Number(process.env.API_PORT) || 4000;
  const webPort = await findFreePort(preferredWeb, []);
  const apiPort = await findFreePort(preferredApi, [webPort]);
  if (webPort !== preferredWeb) warn(`Port ${preferredWeb} is busy, using ${webPort} for the web app.`);
  if (apiPort !== preferredApi) warn(`Port ${preferredApi} is busy, using ${apiPort} for the API.`);

  const mode = DEV ? "development" : "production";
  step(`Starting in ${mode} mode: API on port ${apiPort}, web on port ${webPort}...`);

  const apiArgs = DEV
    ? [resolveBin(API_DIR, "tsx/cli"), "watch", "--clear-screen=false", "src/index.ts"]
    : ["--import", "tsx", "src/index.ts"];
  startService("api", magenta, apiArgs, API_DIR, {
    NODE_ENV: mode,
    HOST: "127.0.0.1",
    PORT: String(apiPort),
  });

  const nextBin = resolveBin(WEB_DIR, "next/dist/bin/next");
  startService("web", cyan, [nextBin, DEV ? "dev" : "start", "--port", String(webPort), "--hostname", webHost], WEB_DIR, {
    NODE_ENV: mode,
    PORT: String(webPort),
    BACKEND_URL: `http://127.0.0.1:${apiPort}`,
  });

  const health = await waitForJson(`http://127.0.0.1:${webPort}/api/health`, DEV ? 240_000 : 90_000);
  if (shuttingDown) return;
  const url = `http://localhost:${webPort}`;
  if (!health) {
    warn(`Still starting up. Open ${url} in a minute; watch the logs above for errors.`);
    return;
  }
  if (DEV) await fetch(`http://127.0.0.1:${webPort}/`).catch(() => {});

  const aiMode =
    health.aiMode === "live"
      ? `live (OpenRouter${health.model ? `, ${health.model}` : ""})`
      : "demo (offline, no API key needed)";
  const line = dim("-".repeat(64));
  console.log(
    [
      "",
      line,
      `  ${bold(green("ZeroCarbon.gov is running"))}  ${dim(`ready in ${Math.round((Date.now() - startedAt) / 1000)}s`)}`,
      "",
      `  Open      ${bold(url)}`,
      `  AI mode   ${aiMode}`,
      "  Stop      Ctrl+C",
      line,
      "",
    ].join("\n"),
  );

  if (!flags.has("--no-open") && !process.env.NO_OPEN && !process.env.CI) openBrowser(url);
}

function startService(name, color, args, cwd, env) {
  const child = spawn(process.execPath, args, {
    cwd,
    env: childEnv(env),
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  const prefix = color(`[${name}]`);
  for (const stream of [child.stdout, child.stderr]) {
    readline.createInterface({ input: stream }).on("line", (line) => console.log(`${prefix} ${line}`));
  }
  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    console.error(red(`[${name}] stopped unexpectedly (${signal || `exit code ${code}`}). Shutting down.`));
    shutdown(code || 1);
  });
  children.push(child);
}

function isAlive(child) {
  return child.exitCode === null && child.signalCode === null;
}

function stopChild(child) {
  if (!isAlive(child)) return;
  if (IS_WIN) spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  else child.kill("SIGTERM");
}

function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  const alive = children.filter(isAlive);
  if (alive.length === 0) process.exit(code);
  let remaining = alive.length;
  for (const child of alive) {
    child.once("exit", () => {
      remaining -= 1;
      if (remaining === 0) process.exit(code);
    });
    stopChild(child);
  }
  setTimeout(() => {
    for (const child of alive) if (isAlive(child)) child.kill("SIGKILL");
    process.exit(code);
  }, 5000);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
process.on("exit", () => {
  for (const child of children) if (isAlive(child)) child.kill();
});

function canConnect(port, host) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host });
    const done = (result) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(500);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

function canListen(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once("error", () => resolve(false));
    server.listen({ port, exclusive: true }, () => server.close(() => resolve(true)));
  });
}

async function findFreePort(preferred, taken) {
  for (let port = preferred; port < preferred + 50; port++) {
    if (taken.includes(port)) continue;
    if (await canConnect(port, "127.0.0.1")) continue;
    if (await canConnect(port, "::1")) continue;
    if (await canListen(port)) return port;
  }
  fail(`No free port found between ${preferred} and ${preferred + 49}. Set WEB_PORT or API_PORT in .env.`);
}

async function waitForJson(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline && !shuttingDown) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (res.ok) return await res.json();
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return null;
}

function openBrowser(url) {
  const [command, args] =
    process.platform === "darwin"
      ? ["open", [url]]
      : IS_WIN
        ? ["cmd", ["/c", "start", "", url]]
        : ["xdg-open", [url]];
  try {
    const child = spawn(command, args, { stdio: "ignore", detached: true, windowsHide: true });
    child.on("error", () => {});
    child.unref();
  } catch {
    // no browser available (server, container, WSL): the URL is printed above
  }
}
