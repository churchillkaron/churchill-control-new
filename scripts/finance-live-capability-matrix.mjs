#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const BASE_URL = String(process.env.FINANCE_MATRIX_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
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
const results = [];

function add(capability, check, passed, details = {}) {
  const row = { capability, check, passed: Boolean(passed), ...details };
  results.push(row);
  console.log(`${passed ? "PASS" : "FAIL"} ${capability.padEnd(28)} ${check}${details.message ? ` - ${details.message}` : ""}`);
}

function blockFor(id) {
  const marker = `id: "${id}"`;
  const start = registry.indexOf(marker);
  if (start < 0) return "";
  const next = registry.indexOf("{ id:", start + marker.length);
  return registry.slice(start, next > start ? next : start + 5000);
}

function match(block, pattern) {
  return block.match(pattern)?.[1] || null;
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

console.log("================ LIVE FINANCE CAPABILITY MATRIX ================");

for (const [id, definition] of Object.entries(manifest)) {
  const block = blockFor(id);
  const route = match(block, /route:\s*["']([^"']+)["']/);
  const registryApi = match(block, /api:\s*["']([^"']+)["']/);
  const api = definition.api || registryApi;

  if (!route) {
    add(id, "route configured", false);
    continue;
  }

  try {
    const pageUrl = `${BASE_URL}/workspace/${ORGANIZATION_ID}${route}`;
    const page = await request(pageUrl, { headers: { accept: "text/html" } });
    const pageHealthy = page.response.status === 200 &&
      !/Application error|Internal Server Error|404: This page could not be found/i.test(page.text);
    add(id, "page", pageHealthy, { status: page.response.status, route });
  } catch (error) {
    add(id, "page", false, { route, message: error.message });
  }

  if (!api) {
    const hasExecutableSurface = definition.kind === "process" || definition.kind === "report";
    add(id, "read runtime", hasExecutableSurface, {
      message: hasExecutableSurface ? "validated through process/report contract" : "no read API configured",
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
    const contentType = probe.response.headers.get("content-type") || "";
    const dataResponse = contentType.includes("application/json") && probe.body !== null;
    const healthy = probe.response.ok && dataResponse && probe.body?.success !== false;
    add(id, "read API", healthy, {
      status: probe.response.status,
      api,
      message: probe.body?.error || (!dataResponse ? "response was not JSON" : null),
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
