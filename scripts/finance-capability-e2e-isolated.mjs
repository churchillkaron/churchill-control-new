#!/usr/bin/env node

import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const DIST_DIR = process.env.FINANCE_E2E_DIST_DIR || ".next-finance-e2e";
const SERVER_LOG = process.env.FINANCE_E2E_SERVER_LOG || "/tmp/AVANTIQO_FINANCE_E2E_SERVER.log";
const SERVER_TIMEOUT_MS = Number(process.env.FINANCE_E2E_SERVER_TIMEOUT_MS || 120000);

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

async function serverReady(baseUrl) {
  try {
    const response = await fetch(`${baseUrl}/api/session/bootstrap`, {
      redirect: "manual",
      signal: AbortSignal.timeout(10000),
    });
    const contentType = response.headers.get("content-type") || "";
    return response.status !== 404 &&
      response.status !== 405 &&
      contentType.includes("application/json");
  } catch {
    return false;
  }
}

const distPath = path.join(ROOT, DIST_DIR);
fs.rmSync(distPath, { recursive: true, force: true });

const port = await findFreePort();
const baseUrl = `http://127.0.0.1:${port}`;
const logFd = fs.openSync(SERVER_LOG, "w");
const child = spawn(
  process.platform === "win32" ? "npm.cmd" : "npm",
  ["run", "dev", "--", "-p", String(port)],
  {
    cwd: ROOT,
    env: {
      ...process.env,
      AVANTIQO_NEXT_DIST_DIR: DIST_DIR,
    },
    stdio: ["ignore", logFd, logFd],
  }
);

let cleaned = false;
function cleanup() {
  if (cleaned) return;
  cleaned = true;
  try { child.kill("SIGTERM"); } catch {}
  try { fs.closeSync(logFd); } catch {}
  try { fs.rmSync(distPath, { recursive: true, force: true }); } catch {}
}

process.once("SIGINT", () => {
  cleanup();
  process.exit(130);
});
process.once("SIGTERM", () => {
  cleanup();
  process.exit(143);
});
process.once("exit", cleanup);

try {
  const deadline = Date.now() + SERVER_TIMEOUT_MS;
  let consecutiveReadyChecks = 0;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Isolated Finance E2E server exited early. See ${SERVER_LOG}`);
    }

    if (await serverReady(baseUrl)) {
      consecutiveReadyChecks += 1;
      if (consecutiveReadyChecks >= 3) break;
    } else {
      consecutiveReadyChecks = 0;
    }

    await sleep(750);
  }

  if (consecutiveReadyChecks < 3) {
    throw new Error(`Isolated Finance E2E server did not become stable. See ${SERVER_LOG}`);
  }

  process.env.FINANCE_SMOKE_BASE_URL = baseUrl;
  process.env.FINANCE_E2E_VERIFIED_BASE_URL = baseUrl;
  process.env.AVANTIQO_NEXT_DIST_DIR = DIST_DIR;

  console.log(`FINANCE_E2E_SERVER=${baseUrl}`);
  console.log(`FINANCE_E2E_DIST_DIR=${DIST_DIR}`);
  console.log(`FINANCE_E2E_SERVER_LOG=${SERVER_LOG}`);
  console.log("FINANCE_E2E_SERVER_VERIFIED=true");

  await import(
    `${pathToFileURL(path.join(ROOT, "scripts/finance-capability-e2e-audit-stable.mjs")).href}?v=${Date.now()}`
  );
} finally {
  cleanup();
}
