#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const CONFIGURED_BASE_URL = String(process.env.FINANCE_MATRIX_BASE_URL || "").trim().replace(/\/$/, "");
const ORGANIZATION_ID = String(process.env.FINANCE_MATRIX_ORGANIZATION_ID || "").trim();
const ENTITY_ID = String(process.env.FINANCE_MATRIX_ENTITY_ID || "").trim();
const PERIOD_ID = String(process.env.FINANCE_MATRIX_PERIOD_ID || "").trim();
const COOKIE = String(process.env.FINANCE_MATRIX_COOKIE || "").trim();
const ACCESS_TOKEN = String(process.env.FINANCE_MATRIX_ACCESS_TOKEN || "").trim();
const REPORT = process.env.FINANCE_MATRIX_REPORT || "/tmp/AVANTIQO_FINANCE_LIVE_CAPABILITY_MATRIX.json";

for (const [name, value] of Object.entries({ ORGANIZATION_ID, ENTITY_ID, PERIOD_ID })) {
  if (!value) throw new Error(`FINANCE_MATRIX_${name} required`);
}
if (!COOKIE && !ACCESS_TOKEN) {
  throw new Error("FINANCE_MATRIX_COOKIE or FINANCE_MATRIX_ACCESS_TOKEN required");
}

const read = relative => fs.readFileSync(path.join(ROOT, relative), "utf8");
const manifest = JSON.parse(read("lib/finance/runtime/financeCapabilityRuntimeManifest.json"));
const registry = read("lib/platform/registry/erpRegistry.js");
const contracts = read("lib/finance/workspaces/FinanceWorkspaceContracts.js");

function financeSection(source) {
  const start = source.indexOf("finance: {");
  if (start < 0) return "";
  const end = source.indexOf("\n    people:", start);
  return end > start ? source.slice(start, end) : source.slice(start);
}

const financeRegistry = financeSection(registry);
const results = [];

function compactPreview(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

function responseDetails(result) {
  return {
    status: result.response.status,
    contentType: result.response.headers.get("content-type") || "",
    location: result.response.headers.get("location") || null,
    preview: compactPreview(result.text),
  };
}

function failureMessage(result, fallback = "request failed") {
  const details = responseDetails(result);
  return [
    `status=${details.status}`,
    details.contentType ? `content-type=${details.contentType}` : null,
    details.location ? `location=${details.location}` : null,
    details.preview ? `body=${details.preview}` : fallback,
  ].filter(Boolean).join(" | ");
}

function add(capability, check, passed, details = {}) {
  const row = { capability, check, passed: Boolean(passed), ...details };
  results.push(row);
  console.log(`${passed ? "PASS" : "FAIL"} ${capability.padEnd(28)} ${check}${details.message ? ` - ${details.message}` : ""}`);
}

function blockFor(id) {
  const marker = `id: "${id}"`;
  const start = financeRegistry.indexOf(marker);
  if (start < 0) return "";
  const next = financeRegistry.indexOf("{ id:", start + marker.length);
  return financeRegistry.slice(start, next > start ? next : start + 5000);
}

function match(block, pattern) {
  return block.match(pattern)?.[1] || null;
}

function hasWorkspaceContract(id) {
  return new RegExp(`\\b${id}\\s*:`).test(contracts);
}

function resolveReadApi(id, definition, block) {
  const registryApi = match(block, /api:\s*["']([^"']+)["']/);
  if (definition.api) return definition.api;
  if (registryApi) return registryApi;
  if (definition.kind === "records" && hasWorkspaceContract(id)) {
    return `/api/finance/workspaces/${id}`;
  }
  return null;
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    redirect: "manual",
    cache: "no-store",
    ...options,
    headers: {
      accept: options.headers?.accept || "application/json",
      ...(ACCESS_TOKEN ? { authorization: `Bearer ${ACCESS_TOKEN}` } : {}),
      ...(COOKIE ? { cookie: COOKIE } : {}),
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = null; }
  return { response, text, body };
}

async function detectBaseUrl() {
  const candidates = CONFIGURED_BASE_URL
    ? [CONFIGURED_BASE_URL]
    : [
        "http://localhost:3002",
        "http://127.0.0.1:3002",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
        "http://localhost:3003",
        "http://127.0.0.1:3003",
      ];

  const attempts = [];
  for (const baseUrl of candidates) {
    try {
      const probe = await request(`${baseUrl}/api/session/bootstrap`);
      const details = responseDetails(probe);
      attempts.push({ baseUrl, ...details });
      const isJson = details.contentType.includes("application/json") && probe.body !== null;
      if (isJson && ![404, 405].includes(probe.response.status)) {
        return { baseUrl, probe, attempts };
      }
    } catch (error) {
      attempts.push({ baseUrl, error: error.message });
    }
  }

  const diagnostic = attempts.map(item => `${item.baseUrl}: ${item.error || `status=${item.status} content-type=${item.contentType || "-"}`}`).join("\n");
  throw new Error(`Could not find the Avantiqo application server. Set FINANCE_MATRIX_BASE_URL to the exact running URL.\n${diagnostic}`);
}

async function validatePreflight(baseUrl, bootstrap) {
  const bootstrapDetails = responseDetails(bootstrap);
  const authFailure = [401, 403].includes(bootstrap.response.status) || bootstrap.body?.success === false;
  if (authFailure) {
    throw new Error(`Finance audit authentication failed at ${baseUrl}/api/session/bootstrap: ${failureMessage(bootstrap)}. Supply a current browser cookie or access token.`);
  }

  const route = "/finance/chart-of-accounts";
  const page = await request(`${baseUrl}/workspace/${ORGANIZATION_ID}${route}`, {
    headers: { accept: "text/html" },
  });
  const details = responseDetails(page);
  const redirected = page.response.status >= 300 && page.response.status < 400;
  const loginPage = /sign in|log in|login|authentication required/i.test(page.text);
  const healthy = page.response.status === 200 && details.contentType.includes("text/html") && !redirected && !loginPage;

  if (!healthy) {
    throw new Error(`Finance page preflight failed at ${baseUrl}: ${failureMessage(page)}. Check the localhost port and authentication cookie before running the matrix.`);
  }
}

async function main() {
  console.log("================ LIVE FINANCE CAPABILITY MATRIX ================");
  add("finance", "registry section", Boolean(financeRegistry));

  const detected = await detectBaseUrl();
  const BASE_URL = detected.baseUrl;
  console.log(`BASE_URL=${BASE_URL}`);
  await validatePreflight(BASE_URL, detected.probe);
  add("finance", "server and authentication preflight", true, { baseUrl: BASE_URL });

  for (const [id, definition] of Object.entries(manifest)) {
    const block = blockFor(id);
    const route = match(block, /route:\s*["']([^"']+)["']/);
    const api = resolveReadApi(id, definition, block);

    if (!route) {
      add(id, "route configured", false, { message: "no Finance route configured" });
      continue;
    }

    try {
      const pageUrl = `${BASE_URL}/workspace/${ORGANIZATION_ID}${route}`;
      const page = await request(pageUrl, { headers: { accept: "text/html" } });
      const details = responseDetails(page);
      const redirected = page.response.status >= 300 && page.response.status < 400;
      const pageHealthy = page.response.status === 200 &&
        details.contentType.includes("text/html") &&
        !redirected &&
        !/Application error|Internal Server Error|404: This page could not be found/i.test(page.text);
      add(id, "page", pageHealthy, {
        route,
        ...details,
        message: pageHealthy ? null : failureMessage(page),
      });
    } catch (error) {
      add(id, "page", false, { route, message: error.message });
    }

    if (!api) {
      const hasExecutableSurface = definition.kind === "process" || definition.kind === "report";
      add(id, "read runtime", hasExecutableSurface, {
        message: hasExecutableSurface
          ? "validated through process/report contract"
          : "no registry API or Finance workspace contract configured",
      });
      continue;
    }

    try {
      const url = new URL(api, BASE_URL);
      url.searchParams.set("organizationId", ORGANIZATION_ID);
      url.searchParams.set("organization_id", ORGANIZATION_ID);
      url.searchParams.set("entityId", ENTITY_ID);
      url.searchParams.set("entity_id", ENTITY_ID);
      url.searchParams.set("periodId", PERIOD_ID);
      url.searchParams.set("period_id", PERIOD_ID);
      const probe = await request(url.toString());
      const details = responseDetails(probe);
      const dataResponse = details.contentType.includes("application/json") && probe.body !== null;
      const healthy = probe.response.ok && dataResponse && probe.body?.success !== false;
      add(id, "read API", healthy, {
        api,
        ...details,
        message: healthy
          ? null
          : (probe.body?.error || failureMessage(probe, "response was not JSON")),
      });
    } catch (error) {
      add(id, "read API", false, { api, message: error.message });
    }
  }

  const capabilities = Object.keys(manifest).length;
  const failed = results.filter(row => !row.passed);
  const passed = results.length - failed.length;
  const report = {
    suite: "Avantiqo Finance Live Capability Matrix",
    generatedAt: new Date().toISOString(),
    context: { baseUrl: BASE_URL, organizationId: ORGANIZATION_ID, entityId: ENTITY_ID, periodId: PERIOD_ID },
    capabilities,
    totals: { passed, failed: failed.length, total: results.length },
    failures: failed,
    results,
  };
  fs.writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`);

  console.log("================ FINAL RESULT ================");
  console.log(`CAPABILITIES=${capabilities}`);
  console.log(`PASSED=${passed}`);
  console.log(`FAILED=${failed.length}`);
  console.log(`TOTAL=${results.length}`);
  console.log(`REPORT=${REPORT}`);
  process.exitCode = failed.length === 0 ? 0 : 1;
}

main().catch(error => {
  console.error("FINANCE LIVE MATRIX PRECHECK FAILED");
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
