#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import readline from "node:readline";
import { spawn } from "node:child_process";
import WebSocket from "ws";

const ROOT = process.cwd();
const REPORT = process.env.FINANCE_SMOKE_REPORT || "/tmp/AVANTIQO_FINANCE_REAL_SMOKE.json";
const SCREENSHOT_DIR = process.env.FINANCE_SMOKE_SCREENSHOTS || "/tmp/AVANTIQO_FINANCE_SMOKE_SCREENSHOTS";
const SERVER_LOG = process.env.FINANCE_SMOKE_SERVER_LOG || "/tmp/AVANTIQO_FINANCE_SMOKE_SERVER.log";
const DEFAULT_PORT = Number(process.env.FINANCE_SMOKE_PORT || 3002);
const PAGE_TIMEOUT_MS = Number(process.env.FINANCE_SMOKE_PAGE_TIMEOUT_MS || 20000);
const SERVER_TIMEOUT_MS = Number(process.env.FINANCE_SMOKE_SERVER_TIMEOUT_MS || 90000);

const manifestPath = path.join(ROOT, "lib/finance/runtime/financeCapabilityRuntimeManifest.json");
const registryPath = path.join(ROOT, "lib/platform/registry/erpRegistry.js");
const contractsPath = path.join(ROOT, "lib/finance/workspaces/FinanceWorkspaceContracts.js");

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function read(relativeOrAbsolute) {
  const file = path.isAbsolute(relativeOrAbsolute)
    ? relativeOrAbsolute
    : path.join(ROOT, relativeOrAbsolute);
  return fs.readFileSync(file, "utf8");
}

function financeSection(source) {
  const start = source.indexOf("finance: {");
  if (start < 0) return "";
  const end = source.indexOf("\n    people:", start);
  return end > start ? source.slice(start, end) : source.slice(start);
}

function capabilityBlock(financeRegistry, id) {
  const marker = `id: "${id}"`;
  const start = financeRegistry.indexOf(marker);
  if (start < 0) return "";
  const next = financeRegistry.indexOf("{ id:", start + marker.length);
  return financeRegistry.slice(start, next > start ? next : start + 6000);
}

function firstMatch(text, pattern) {
  return text.match(pattern)?.[1] || null;
}

function hasContract(contracts, id) {
  return new RegExp(`\\b${id}\\s*:`).test(contracts);
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function safeFileName(value) {
  return String(value || "unknown").replace(/[^a-zA-Z0-9._-]+/g, "_");
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const values = {};
  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
  return values;
}

function promptVisible(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function promptHidden(question) {
  if (!process.stdin.isTTY) {
    return promptVisible(question);
  }

  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    const stdout = process.stdout;
    let value = "";

    stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    const cleanup = () => {
      stdin.removeListener("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
    };

    const onData = char => {
      if (char === "\u0003") {
        cleanup();
        stdout.write("\n");
        reject(new Error("Cancelled"));
        return;
      }
      if (char === "\r" || char === "\n") {
        cleanup();
        stdout.write("\n");
        resolve(value);
        return;
      }
      if (char === "\u007f" || char === "\b") {
        value = value.slice(0, -1);
        return;
      }
      value += char;
    };

    stdin.on("data", onData);
  });
}

async function findFreePort() {
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

async function probeServer(baseUrl) {
  try {
    const response = await fetch(`${baseUrl}/api/session/bootstrap`, {
      redirect: "manual",
      signal: AbortSignal.timeout(3000),
    });
    const contentType = response.headers.get("content-type") || "";
    return response.status !== 404 && response.status !== 405 && contentType.includes("application/json");
  } catch {
    return false;
  }
}

async function resolveServer() {
  const explicit = process.env.FINANCE_SMOKE_BASE_URL?.replace(/\/$/, "");
  if (explicit) {
    if (!(await probeServer(explicit))) {
      throw new Error(`FINANCE_SMOKE_BASE_URL is not a running Avantiqo server: ${explicit}`);
    }
    return { baseUrl: explicit, child: null };
  }

  const candidates = [DEFAULT_PORT, 3000, 3001, 3003]
    .filter((value, index, array) => array.indexOf(value) === index)
    .map(port => `http://localhost:${port}`);

  for (const candidate of candidates) {
    if (await probeServer(candidate)) {
      return { baseUrl: candidate, child: null };
    }
  }

  const logFd = fs.openSync(SERVER_LOG, "w");
  const child = spawn("npm", ["run", "dev", "--", "-p", String(DEFAULT_PORT)], {
    cwd: ROOT,
    env: process.env,
    stdio: ["ignore", logFd, logFd],
  });
  const baseUrl = `http://localhost:${DEFAULT_PORT}`;
  const deadline = Date.now() + SERVER_TIMEOUT_MS;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Avantiqo dev server exited early. See ${SERVER_LOG}`);
    }
    if (await probeServer(baseUrl)) {
      return { baseUrl, child };
    }
    await sleep(1000);
  }

  child.kill("SIGTERM");
  throw new Error(`Avantiqo dev server did not become ready. See ${SERVER_LOG}`);
}

function chromeCandidates() {
  return [
    process.env.FINANCE_SMOKE_CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
    "/Applications/Arc.app/Contents/MacOS/Arc",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);
}

function resolveChromePath() {
  for (const candidate of chromeCandidates()) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(
    "No Chromium browser found. Install Google Chrome, Chromium, Edge, Brave, or Arc, or set FINANCE_SMOKE_CHROME_PATH."
  );
}

async function launchChrome() {
  const executable = resolveChromePath();
  const port = await findFreePort();
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "avantiqo-finance-smoke-"));
  const child = spawn(executable, [
    "--headless=new",
    "--disable-gpu",
    "--disable-extensions",
    "--disable-background-networking",
    "--no-first-run",
    "--no-default-browser-check",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    "about:blank",
  ], {
    stdio: "ignore",
  });

  const endpoint = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Chromium exited early from ${executable}`);
    }
    try {
      const response = await fetch(`${endpoint}/json/version`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) {
        return { executable, endpoint, child, userDataDir };
      }
    } catch {}
    await sleep(250);
  }

  child.kill("SIGTERM");
  throw new Error("Chromium remote debugging endpoint did not become ready");
}

class CdpClient {
  constructor(url) {
    this.url = url;
    this.socket = null;
    this.sequence = 0;
    this.pending = new Map();
    this.listeners = new Map();
  }

  async connect() {
    this.socket = new WebSocket(this.url);
    await new Promise((resolve, reject) => {
      this.socket.once("open", resolve);
      this.socket.once("error", reject);
    });
    this.socket.on("message", raw => {
      const message = JSON.parse(String(raw));
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result || {});
        return;
      }
      const handlers = this.listeners.get(message.method) || [];
      for (const handler of handlers) handler(message.params || {});
    });
  }

  on(method, handler) {
    const handlers = this.listeners.get(method) || [];
    handlers.push(handler);
    this.listeners.set(method, handlers);
  }

  send(method, params = {}) {
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    try {
      this.socket?.close();
    } catch {}
  }
}

async function createPage(endpoint) {
  const response = await fetch(`${endpoint}/json/new?about:blank`, { method: "PUT" });
  if (!response.ok) throw new Error("Unable to create Chromium page target");
  const target = await response.json();
  const client = new CdpClient(target.webSocketDebuggerUrl);
  await client.connect();
  await Promise.all([
    client.send("Page.enable"),
    client.send("Runtime.enable"),
    client.send("Network.enable"),
    client.send("Log.enable"),
  ]);
  await client.send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1100,
    deviceScaleFactor: 1,
    mobile: false,
  });
  return client;
}

async function evaluate(client, expression) {
  const result = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || "Browser evaluation failed");
  }
  return result.result?.value;
}

async function waitForCondition(check, timeoutMs, message) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const value = await check();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await sleep(250);
  }
  if (lastError) throw lastError;
  throw new Error(message);
}

async function navigate(client, url, timeoutMs = PAGE_TIMEOUT_MS) {
  await client.send("Page.navigate", { url });
  await waitForCondition(
    async () => {
      const state = await evaluate(client, `({ href: location.href, ready: document.readyState })`);
      return state?.href === url && state.ready === "complete" ? state : null;
    },
    timeoutMs,
    `Navigation timeout: ${url}`
  );
  await sleep(1200);
}

async function captureScreenshot(client, filePath) {
  const result = await client.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
    fromSurface: true,
  });
  fs.writeFileSync(filePath, Buffer.from(result.data, "base64"));
}

async function login(client, baseUrl, email, password) {
  await navigate(client, `${baseUrl}/login`, 30000);

  const payload = JSON.stringify({ email, password });
  const loginResult = await evaluate(client, `(async () => {
    const values = ${payload};
    const inputs = Array.from(document.querySelectorAll("input"));
    const emailInput = inputs.find(input => input.type !== "password");
    const passwordInput = inputs.find(input => input.type === "password");
    const button = Array.from(document.querySelectorAll("button"))
      .find(item => item.textContent.trim().toLowerCase() === "login");
    if (!emailInput || !passwordInput || !button) {
      return { success: false, error: "Login controls not found" };
    }
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(emailInput, values.email);
    emailInput.dispatchEvent(new Event("input", { bubbles: true }));
    emailInput.dispatchEvent(new Event("change", { bubbles: true }));
    setter.call(passwordInput, values.password);
    passwordInput.dispatchEvent(new Event("input", { bubbles: true }));
    passwordInput.dispatchEvent(new Event("change", { bubbles: true }));
    button.click();
    return { success: true };
  })()`);

  if (!loginResult?.success) {
    throw new Error(loginResult?.error || "Unable to submit login form");
  }

  await waitForCondition(
    async () => {
      const state = await evaluate(client, `({
        href: location.href,
        body: document.body?.innerText || ""
      })`);
      if (/invalid login|invalid credentials|login failed/i.test(state?.body || "")) {
        throw new Error("Finance smoke login failed: invalid email or password");
      }
      return state?.href && !state.href.includes("/login") ? state : null;
    },
    45000,
    "Login did not complete"
  );

  const bootstrap = await waitForCondition(
    async () => evaluate(client, `(async () => {
      try {
        const response = await fetch("/api/session/bootstrap", { credentials: "include" });
        const contentType = response.headers.get("content-type") || "";
        const text = await response.text();
        let data = null;
        if (contentType.includes("application/json")) {
          try { data = JSON.parse(text); } catch {}
        }
        return { status: response.status, data, text: text.slice(0, 500) };
      } catch (error) {
        return { status: 0, error: error.message };
      }
    })()`),
    30000,
    "Authenticated session bootstrap did not become available"
  );

  if (bootstrap.status !== 200 || !bootstrap.data?.success) {
    throw new Error(`Session bootstrap failed: status=${bootstrap.status} body=${bootstrap.text || bootstrap.error || ""}`);
  }

  return bootstrap.data;
}

function resolveCapabilities() {
  const manifest = JSON.parse(read(manifestPath));
  const registry = read(registryPath);
  const financeRegistry = financeSection(registry);
  const contracts = read(contractsPath);

  return Object.entries(manifest).map(([id, definition]) => {
    const block = capabilityBlock(financeRegistry, id);
    const route = firstMatch(block, /route:\s*["']([^"']+)["']/);
    const name = firstMatch(block, /name:\s*["']([^"']+)["']/) || id;
    const registryApi = firstMatch(block, /api:\s*["']([^"']+)["']/);
    const listApi = firstMatch(block, /listApi:\s*["']([^"']+)["']/);
    const contract = hasContract(contracts, id);
    const api = definition.api || registryApi || listApi || (contract ? `/api/finance/workspaces/${id}` : null);
    return {
      id,
      name,
      route,
      api,
      kind: definition.kind,
      scope: definition.scope,
      contract,
    };
  });
}

async function inspectPage(client, expectedName) {
  const expected = JSON.stringify(normalizeText(expectedName));
  return evaluate(client, `(() => {
    const bodyText = (document.body?.innerText || "").replace(/\\s+/g, " ").trim();
    const normalized = bodyText.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\\s+/g, " ").trim();
    const main = document.querySelector("main") || document.querySelector('[role="main"]');
    const mainText = (main?.innerText || "").replace(/\\s+/g, " ").trim();
    const visibleElements = Array.from(document.querySelectorAll("body *")).filter(element => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || 1) > 0 && rect.width > 2 && rect.height > 2;
    });
    const visualCount = visibleElements.filter(element =>
      ["TABLE", "CANVAS", "SVG", "BUTTON", "INPUT", "SELECT", "TEXTAREA"].includes(element.tagName) ||
      (element.innerText || "").trim().length > 0
    ).length;
    const knownError = bodyText.match(/Application error|Unhandled Runtime Error|App Error|Internal Server Error|Something went wrong|Cannot read properties|ReferenceError:|TypeError:/i)?.[0] || null;
    const unavailable = bodyText.match(/Capability unavailable|This capability is not available|Coming soon|Planned capability/i)?.[0] || null;
    const loadingOnly = /loading/i.test(bodyText) && bodyText.length < 160;
    const expectedNameFound = normalized.includes(${expected});
    return {
      href: location.href,
      title: document.title,
      bodyLength: bodyText.length,
      mainLength: mainText.length,
      visibleCount: visibleElements.length,
      visualCount,
      expectedNameFound,
      knownError,
      unavailable,
      loadingOnly,
      bodyPreview: bodyText.slice(0, 700),
    };
  })()`);
}

async function fetchApi(client, api, context) {
  if (!api) return { skipped: true, reason: "no read API" };
  const url = new URL(api, "http://avantiqo.local");
  url.searchParams.set("organizationId", context.organizationId);
  url.searchParams.set("organization_id", context.organizationId);
  if (context.entityId) {
    url.searchParams.set("entityId", context.entityId);
    url.searchParams.set("entity_id", context.entityId);
  }
  if (context.periodId) {
    url.searchParams.set("periodId", context.periodId);
    url.searchParams.set("period_id", context.periodId);
  }
  const relative = `${url.pathname}${url.search}`;
  return evaluate(client, `(async () => {
    const response = await fetch(${JSON.stringify(relative)}, { credentials: "include" });
    const contentType = response.headers.get("content-type") || "";
    const text = await response.text();
    let data = null;
    if (contentType.includes("application/json")) {
      try { data = JSON.parse(text); } catch {}
    }
    const rows = Array.isArray(data) ? data :
      Array.isArray(data?.rows) ? data.rows :
      Array.isArray(data?.records) ? data.records :
      Array.isArray(data?.items) ? data.items :
      Array.isArray(data?.entries) ? data.entries :
      Array.isArray(data?.lines) ? data.lines :
      Array.isArray(data?.data) ? data.data : null;
    return {
      url: ${JSON.stringify(relative)},
      status: response.status,
      ok: response.ok,
      contentType,
      json: Boolean(data),
      success: data?.success,
      unavailable: data?.unavailable === true,
      rowCount: Array.isArray(rows) ? rows.length : null,
      bodyPreview: text.slice(0, 700),
    };
  })()`);
}

async function main() {
  if (!fs.existsSync(manifestPath) || !fs.existsSync(registryPath)) {
    throw new Error("Run this command from the Avantiqo repository root");
  }

  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const localEnv = parseEnvFile(path.join(ROOT, ".env.local"));
  const email = process.env.FINANCE_SMOKE_EMAIL || localEnv.FINANCE_SMOKE_EMAIL || await promptVisible("Finance smoke login email: ");
  const password = process.env.FINANCE_SMOKE_PASSWORD || localEnv.FINANCE_SMOKE_PASSWORD || await promptHidden("Finance smoke login password: ");
  if (!email || !password) throw new Error("Finance smoke login email and password are required");

  let server = null;
  let chrome = null;
  let client = null;

  const cleanup = () => {
    try { client?.close(); } catch {}
    try { chrome?.child?.kill("SIGTERM"); } catch {}
    try { server?.child?.kill("SIGTERM"); } catch {}
    try { if (chrome?.userDataDir) fs.rmSync(chrome.userDataDir, { recursive: true, force: true }); } catch {}
  };

  process.on("SIGINT", () => {
    cleanup();
    process.exit(130);
  });
  process.on("SIGTERM", () => {
    cleanup();
    process.exit(143);
  });

  try {
    console.log("============================================================");
    console.log("AVANTIQO FINANCE REAL BROWSER SMOKE");
    console.log("============================================================");

    server = await resolveServer();
    console.log(`SERVER=${server.baseUrl}`);
    if (server.child) console.log(`SERVER_LOG=${SERVER_LOG}`);

    chrome = await launchChrome();
    console.log(`BROWSER=${chrome.executable}`);
    client = await createPage(chrome.endpoint);

    const browserErrors = [];
    const networkErrors = [];
    let activeCapability = "bootstrap";

    client.on("Runtime.exceptionThrown", params => {
      browserErrors.push({
        capability: activeCapability,
        type: "exception",
        text: params.exceptionDetails?.exception?.description || params.exceptionDetails?.text || "Runtime exception",
      });
    });
    client.on("Log.entryAdded", params => {
      const entry = params.entry || {};
      if (["error", "warning"].includes(entry.level)) {
        browserErrors.push({
          capability: activeCapability,
          type: `log:${entry.level}`,
          text: entry.text || "Browser log entry",
          url: entry.url || null,
          lineNumber: entry.lineNumber ?? null,
        });
      }
    });
    client.on("Network.responseReceived", params => {
      const response = params.response || {};
      if (response.status >= 500) {
        networkErrors.push({
          capability: activeCapability,
          status: response.status,
          url: response.url,
          mimeType: response.mimeType || null,
        });
      }
    });

    const bootstrap = await login(client, server.baseUrl, email, password);
    const context = {
      organizationId: bootstrap.active_organization_id || bootstrap.organization_id || bootstrap.organization?.id || null,
      entityId: bootstrap.active_entity_id || bootstrap.entity_id || bootstrap.entity?.id || null,
      periodId: bootstrap.active_period_id || bootstrap.period_id || bootstrap.period?.id || null,
      organizationName: bootstrap.organization?.name || bootstrap.organization?.legal_name || null,
      entityName: bootstrap.entity?.name || bootstrap.entity?.legal_name || null,
      periodName: bootstrap.period?.name || bootstrap.period?.label || null,
    };

    if (!context.organizationId) throw new Error("Authenticated bootstrap returned no active organization");
    console.log(`ORGANIZATION_ID=${context.organizationId}`);
    console.log(`ENTITY_ID=${context.entityId || "none"}`);
    console.log(`PERIOD_ID=${context.periodId || "none"}`);

    const expectedOrganization = process.env.FINANCE_SMOKE_ORGANIZATION_ID || null;
    const expectedEntity = process.env.FINANCE_SMOKE_ENTITY_ID || null;
    const expectedPeriod = process.env.FINANCE_SMOKE_PERIOD_ID || null;
    if (expectedOrganization && expectedOrganization !== context.organizationId) {
      throw new Error(`Active organization mismatch: expected ${expectedOrganization}, received ${context.organizationId}`);
    }
    if (expectedEntity && expectedEntity !== context.entityId) {
      throw new Error(`Active entity mismatch: expected ${expectedEntity}, received ${context.entityId}`);
    }
    if (expectedPeriod && expectedPeriod !== context.periodId) {
      throw new Error(`Active period mismatch: expected ${expectedPeriod}, received ${context.periodId}`);
    }

    const capabilities = resolveCapabilities();
    const results = [];

    for (const capability of capabilities) {
      activeCapability = capability.id;
      const startedAt = Date.now();
      const pageErrorsBefore = browserErrors.length;
      const networkErrorsBefore = networkErrors.length;
      const reasons = [];
      let pageInspection = null;
      let apiInspection = null;
      let screenshot = null;
      const pageUrl = `${server.baseUrl}/workspace/${context.organizationId}${capability.route}`;

      try {
        await navigate(client, pageUrl);
        pageInspection = await inspectPage(client, capability.name);

        if (pageInspection.href.includes("/login") || pageInspection.href.includes("/onboarding")) {
          reasons.push(`unexpected redirect: ${pageInspection.href}`);
        }
        if (pageInspection.knownError) reasons.push(`page error: ${pageInspection.knownError}`);
        if (pageInspection.unavailable) reasons.push(`unavailable page: ${pageInspection.unavailable}`);
        if (pageInspection.loadingOnly) reasons.push("page remained in loading state");
        if (pageInspection.bodyLength < 30 || pageInspection.visualCount < 3) reasons.push("page rendered as blank or visually empty");
        if (!pageInspection.expectedNameFound) reasons.push("capability title/content was not rendered");

        apiInspection = await fetchApi(client, capability.api, context);
        if (!apiInspection.skipped) {
          if (!apiInspection.ok) reasons.push(`read API returned HTTP ${apiInspection.status}`);
          if (!apiInspection.json) reasons.push("read API did not return JSON");
          if (apiInspection.unavailable) reasons.push("read API reports missing source table");
          if (apiInspection.success === false) reasons.push("read API returned success=false");
        }
      } catch (error) {
        reasons.push(error.message);
      }

      const capabilityBrowserErrors = browserErrors.slice(pageErrorsBefore)
        .filter(error => error.capability === capability.id);
      const capabilityNetworkErrors = networkErrors.slice(networkErrorsBefore)
        .filter(error => error.capability === capability.id);

      for (const error of capabilityBrowserErrors) {
        if (/favicon|ResizeObserver loop limit exceeded/i.test(error.text || "")) continue;
        reasons.push(`browser ${error.type}: ${String(error.text).slice(0, 220)}`);
      }
      for (const error of capabilityNetworkErrors) {
        reasons.push(`network HTTP ${error.status}: ${error.url}`);
      }

      const uniqueReasons = [...new Set(reasons)];
      const status = uniqueReasons.length === 0 ? "PASS" : "FAIL";

      if (status === "FAIL") {
        screenshot = path.join(SCREENSHOT_DIR, `${safeFileName(capability.id)}.png`);
        try {
          await captureScreenshot(client, screenshot);
        } catch (error) {
          uniqueReasons.push(`screenshot failed: ${error.message}`);
          screenshot = null;
        }
      }

      const result = {
        id: capability.id,
        name: capability.name,
        kind: capability.kind,
        scope: capability.scope,
        route: capability.route,
        pageUrl,
        api: capability.api,
        status,
        durationMs: Date.now() - startedAt,
        reasons: uniqueReasons,
        page: pageInspection,
        apiResult: apiInspection,
        browserErrors: capabilityBrowserErrors,
        networkErrors: capabilityNetworkErrors,
        screenshot,
      };
      results.push(result);

      const suffix = status === "PASS"
        ? `page=${result.page?.bodyLength || 0} chars apiRows=${result.apiResult?.rowCount ?? "n/a"}`
        : uniqueReasons.join("; ");
      console.log(`${status.padEnd(5)} ${capability.id.padEnd(28)} ${suffix}`);
    }

    const totals = {
      capabilities: results.length,
      passed: results.filter(item => item.status === "PASS").length,
      failed: results.filter(item => item.status === "FAIL").length,
      pagesWithRows: results.filter(item => Number(item.apiResult?.rowCount) > 0).length,
      emptyButHealthy: results.filter(item => item.status === "PASS" && item.apiResult?.rowCount === 0).length,
    };

    const report = {
      suite: "Avantiqo Finance Real Browser Smoke",
      generatedAt: new Date().toISOString(),
      baseUrl: server.baseUrl,
      browser: chrome.executable,
      context,
      totals,
      results,
      globalBrowserErrors: browserErrors,
      globalNetworkErrors: networkErrors,
      screenshotDirectory: SCREENSHOT_DIR,
      serverLog: server.child ? SERVER_LOG : null,
      claims: {
        realAuthenticatedSession: true,
        realOrganizationData: true,
        browserRenderedAllFinancePages: true,
        writeTransactionsExecuted: false,
      },
    };

    fs.writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`);

    console.log("");
    console.log("================ FINAL RESULT ================");
    console.log(`CAPABILITIES=${totals.capabilities}`);
    console.log(`PASS=${totals.passed}`);
    console.log(`FAIL=${totals.failed}`);
    console.log(`PAGES_WITH_REAL_ROWS=${totals.pagesWithRows}`);
    console.log(`HEALTHY_EMPTY_PAGES=${totals.emptyButHealthy}`);
    console.log(`REPORT=${REPORT}`);
    console.log(`SCREENSHOTS=${SCREENSHOT_DIR}`);

    process.exitCode = totals.failed === 0 ? 0 : 1;
  } finally {
    cleanup();
  }
}

main().catch(error => {
  console.error("FINANCE REAL BROWSER SMOKE FAILED");
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
