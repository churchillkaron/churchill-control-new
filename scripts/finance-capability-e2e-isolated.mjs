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
const PAGE_TIMEOUT_MS = Number(process.env.FINANCE_SMOKE_PAGE_TIMEOUT_MS || 120000);

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
  process.env.FINANCE_SMOKE_PAGE_TIMEOUT_MS = String(PAGE_TIMEOUT_MS);

  console.log(`FINANCE_E2E_SERVER=${baseUrl}`);
  console.log(`FINANCE_E2E_DIST_DIR=${DIST_DIR}`);
  console.log(`FINANCE_E2E_SERVER_LOG=${SERVER_LOG}`);
  console.log(`FINANCE_E2E_PAGE_TIMEOUT_MS=${PAGE_TIMEOUT_MS}`);
  console.log("FINANCE_E2E_AUTH_VALIDATION=server-cookie");
  console.log("FINANCE_E2E_SERVER_VERIFIED=true");

  const stablePath = path.join(ROOT, "scripts/finance-capability-e2e-audit-stable.mjs");
  const patchedStablePath = path.join(
    ROOT,
    "scripts",
    `.finance-capability-e2e-server-auth-${process.pid}.mjs`
  );
  const stableSource = fs.readFileSync(stablePath, "utf8");
  const authStart = stableSource.indexOf('  await client.send("Network.setCookies", { cookies });');
  const authEnd = stableSource.indexOf("\n}\n`;", authStart);

  if (authStart < 0 || authEnd < 0) {
    throw new Error("FINANCE_E2E_SERVER_AUTH_PATCH_TARGET_NOT_FOUND");
  }

  const serverValidation = [
    '  await client.send("Network.setCookies", { cookies });',
    '  const cookieHeader = [...cookieJar.entries()]',
    '    .map(([name, value]) => name + "=" + value)',
    '    .join("; ");',
    '  const response = await fetch(baseUrl + "/api/session/bootstrap", {',
    '    headers: { cookie: cookieHeader },',
    '    redirect: "manual",',
    '  });',
    '  const contentType = response.headers.get("content-type") || "";',
    '  const text = await response.text();',
    '  let bootstrapData = null;',
    '  if (contentType.includes("application/json")) {',
    '    try { bootstrapData = JSON.parse(text); } catch {}',
    '  }',
    '  if (response.status !== 200 || !bootstrapData?.success) {',
    '    throw new Error(',
    '      "Finance E2E authenticated bootstrap failed: status=" + response.status + " body=" + text.slice(0, 700)',
    '    );',
    '  }',
    '  console.log("AUTH=SUPABASE_SSR_COOKIE");',
    '  return bootstrapData;',
  ].join("\n");

  const patchedStableSource =
    stableSource.slice(0, authStart) +
    serverValidation +
    stableSource.slice(authEnd);

  fs.writeFileSync(patchedStablePath, patchedStableSource);
  try {
    await import(`${pathToFileURL(patchedStablePath).href}?v=${Date.now()}`);
  } finally {
    fs.rmSync(patchedStablePath, { force: true });
  }
} finally {
  cleanup();
}
