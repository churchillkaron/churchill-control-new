#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import crypto from "node:crypto";

const ROOT = process.cwd();
const BASE_URL = String(process.env.FINANCE_CERT_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const ORGANIZATION_ID = String(process.env.FINANCE_CERT_ORGANIZATION_ID || "").trim();
const ENTITY_ID = String(process.env.FINANCE_CERT_ENTITY_ID || "").trim();
const PERIOD_ID = String(process.env.FINANCE_CERT_PERIOD_ID || "").trim();
const ACCESS_TOKEN = String(process.env.FINANCE_CERT_ACCESS_TOKEN || "").trim();
const COOKIE = String(process.env.FINANCE_CERT_COOKIE || "").trim();
const REPORT = String(process.env.FINANCE_CERT_REPORT || `/tmp/AVANTIQO_FINANCE_UI_ACTION_SECURITY_${Date.now()}.json`);
const FOCUS = new Set(
  String(process.env.FINANCE_CERT_FOCUS || "")
    .split(",")
    .map(value => value.trim())
    .filter(Boolean)
);
const FOCUSED = FOCUS.size > 0;
const ZERO_UUID = "00000000-0000-0000-0000-000000000000";
const FOREIGN_ORG = crypto.randomUUID();
const FOREIGN_ENTITY = crypto.randomUUID();
const results = [];

function add(category, name, passed, details = {}) {
  const row = { category, name, passed: Boolean(passed), ...details };
  results.push(row);
  const suffix = details.message ? ` - ${details.message}` : "";
  console.log(`${passed ? "PASS" : "FAIL"} ${category.padEnd(26)} ${name}${suffix}`);
}

function required(value, name) {
  if (!value) throw new Error(`${name} required`);
  return value;
}

function read(relative) {
  return fs.readFileSync(path.join(ROOT, relative), "utf8");
}

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

function extractBalanced(source, marker, open, close) {
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) return "";
  const start = source.indexOf(open, markerIndex);
  if (start < 0) return "";
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === open) depth += 1;
    if (char === close && --depth === 0) return source.slice(start, index + 1);
  }
  return "";
}

function financeSection(registry) {
  const workspaceStart = registry.indexOf("workspaces: {");
  const start = registry.indexOf("\n    finance: {", workspaceStart);
  const end = registry.indexOf("\n    people:", start);
  return start >= 0 ? registry.slice(start, end > start ? end : undefined) : "";
}

function policyIds(policy) {
  const block = extractBalanced(policy, "FINANCE_PRIMARY_ACTION_POLICY", "{", "}");
  return [...block.matchAll(/^  ([a-z0-9_]+):/gm)].map(match => match[1]);
}

function contractIds(contracts) {
  const block = extractBalanced(contracts, "FINANCE_WORKSPACE_CONTRACTS", "{", "}");
  return [...block.matchAll(/^  ([a-z0-9_]+):\s*(entityWorkspace|organizationWorkspace)\s*\(/gm)]
    .map(match => ({ id: match[1], scope: match[2] === "entityWorkspace" ? "entity" : "organization" }));
}

function registryRoutes(registry, ids) {
  const section = financeSection(registry);
  return ids.map(id => {
    const safe = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = section.match(new RegExp(`\\bid:\\s*["']${safe}["'][\\s\\S]{0,6500}?\\broute:\\s*["'](\\/finance(?:\\/[^"']*)?)["']`));
    return { id, route: match?.[1] || null };
  });
}

function registeredForms(forms) {
  return new Set([...forms.matchAll(/^\s{2}["']([^"']+)["']:\s*\{/gm)].map(match => match[1]));
}

function referencedForms(source) {
  return [...new Set([...source.matchAll(/\b(?:form|formId):\s*["']([^"']+)["']/g)].map(match => match[1]))];
}

function rowActionCount(registry) {
  const section = financeSection(registry);
  let cursor = 0;
  let count = 0;
  while (true) {
    const index = section.indexOf("rowActions:", cursor);
    if (index < 0) break;
    const array = extractBalanced(section.slice(index), "rowActions:", "[", "]");
    count += [...array.matchAll(/\blabel:\s*["'][^"']+["']/g)].length;
    cursor = index + Math.max(array.length, 12);
  }
  return count;
}

function apiManifest() {
  return walk(path.join(ROOT, "app", "api", "finance"))
    .filter(file => file.endsWith(`${path.sep}route.js`))
    .map(file => {
      const relative = path.relative(ROOT, file).split(path.sep).join("/");
      const route = `/${relative.replace(/^app\//, "").replace(/\/route\.js$/, "")}`;
      const source = fs.readFileSync(file, "utf8");
      const methods = [...source.matchAll(/export\s+(?:async\s+)?function\s+(GET|POST|PATCH|PUT|DELETE)\b/g)].map(match => match[1]);
      return { file: relative, route, source, methods };
    });
}

function materializeRoute(route, firstContract) {
  return route
    .replace(/\[\[\.\.\.([^\]]+)\]\]/g, "probe")
    .replace(/\[\.\.\.([^\]]+)\]/g, "probe")
    .replace(/\[capabilityId\]/g, firstContract)
    .replace(/\[[^\]]*[iI]d\]/g, ZERO_UUID)
    .replace(/\[[^\]]+\]/g, "probe");
}

function routePattern(route) {
  const escaped = route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped
    .replace(/\\\[\\\[\\\.\\\.\\\.([^\]]+)\\\]\\\]/g, ".*")
    .replace(/\\\[\\\.\\\.\\\.([^\]]+)\\\]/g, ".+")
    .replace(/\\\[[^\]]+\\\]/g, "[^/]+")}$`);
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    redirect: "manual",
    ...options,
    headers: {
      accept: options.accept || "application/json",
      authorization: `Bearer ${ACCESS_TOKEN}`,
      ...(COOKIE ? { cookie: COOKIE } : {}),
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = null; }
  return { response, text, body };
}

function controlledStatus(status) {
  return status >= 200 && status < 500 && status !== 300 && status !== 301 && status !== 302 && status !== 307 && status !== 308;
}

function failureDetails({ response, body, text }) {
  const values = [
    body?.error,
    body?.message,
    body?.details,
    body?.hint,
    body?.code,
  ].filter(Boolean).map(value => String(value));

  const message = values.length
    ? values.join(" | ")
    : String(text || "").replace(/\s+/g, " ").trim().slice(0, 400);

  return {
    status: response.status,
    message: message || `HTTP ${response.status}`,
    response: body || String(text || "").slice(0, 2000),
  };
}

async function main() {
  required(ORGANIZATION_ID, "FINANCE_CERT_ORGANIZATION_ID");
  required(ENTITY_ID, "FINANCE_CERT_ENTITY_ID");
  required(ACCESS_TOKEN, "FINANCE_CERT_ACCESS_TOKEN");
  required(COOKIE, "FINANCE_CERT_COOKIE");

  const registry = read("lib/platform/registry/erpRegistry.js");
  const policy = read("lib/finance/ui/FinancePrimaryActionPolicy.js");
  const contractsSource = read("lib/finance/workspaces/FinanceWorkspaceContracts.js");
  const formsSource = read("lib/platform/forms/FormRegistry.js");
  const formContract = read("lib/platform/forms/FinanceFormContract.js");
  const genericRoute = read("app/api/finance/workspaces/[capabilityId]/route.js");
  const ids = policyIds(policy);
  const contracts = contractIds(contractsSource);
  const routes = registryRoutes(registry, ids);
  const forms = registeredForms(formsSource);
  const formRefs = referencedForms(`${policy}\n${financeSection(registry)}`);
  const apiRoutes = apiManifest();

  if (!FOCUSED) {
    console.log("================ STATIC EXECUTION CONTRACTS ================");
    add("structure", "67 workspace policies", ids.length === 67, { actual: ids.length });
    add("structure", "67 live registry routes", routes.filter(row => row.route).length === 67, { actual: routes.filter(row => row.route).length });
    add("structure", "25 generic contracts", contracts.length === 25, { actual: contracts.length });
    add("structure", "216 Finance row actions", rowActionCount(registry) === 216, { actual: rowActionCount(registry) });
    add("structure", "generic POST available", /export async function POST/.test(genericRoute));
    add("structure", "generic PATCH available", /export async function PATCH/.test(genericRoute));
    add("structure", "generic archive available", /export async function DELETE/.test(genericRoute));
    add("structure", "no tenant boundary", !/tenant_id|tenantId/.test(`${financeSection(registry)}\n${contractsSource}\n${genericRoute}`));
    add("structure", "no fixed Finance defaults", !/default(?:Value)?\s*:\s*["'](?:THB|USD|EUR|GBP|Thailand)["']/i.test(formContract));

    for (const formId of formRefs) {
      add("form-binding", formId, forms.has(formId), { message: forms.has(formId) ? null : "Referenced form is not registered" });
    }

    const referencedApiRoutes = [...new Set(walk(path.join(ROOT, "lib", "finance"))
      .filter(file => /\.(?:js|jsx|mjs)$/.test(file))
      .flatMap(file => [...fs.readFileSync(file, "utf8").matchAll(/["'`](\/api\/finance\/[^"'`?\s]+)/g)].map(match => match[1])))];
    for (const reference of referencedApiRoutes) {
      const exists = apiRoutes.some(item => routePattern(item.route).test(reference));
      add("api-reference", reference, exists, { message: exists ? null : "No matching app/api/finance route" });
    }

    console.log("\n================ 67 AUTHENTICATED WORKSPACE PAGES ================");
    for (const { id, route } of routes) {
      if (!route) continue;
      try {
        const { response, text } = await request(`${BASE_URL}/workspace/${ORGANIZATION_ID}${route}`, { accept: "text/html" });
        const passed = response.status === 200 && !/Application error|Internal Server Error|404: This page could not be found/i.test(text);
        add("live-page", id, passed, { status: response.status, route });
      } catch (error) {
        add("live-page", id, false, { route, message: error.message });
      }
    }

    console.log("\n================ GENERIC WORKSPACE SECURITY ================");
    for (const contract of contracts) {
      const scopeParams = new URLSearchParams({ organizationId: ORGANIZATION_ID });
      if (contract.scope === "entity") scopeParams.set("entityId", ENTITY_ID);
      const base = `${BASE_URL}/api/finance/workspaces/${contract.id}`;
      const normal = await request(`${base}?${scopeParams}`);
      add("list-contract", contract.id, normal.response.status === 200 && normal.body?.success === true, { status: normal.response.status });

      const foreignOrg = new URLSearchParams({ organizationId: FOREIGN_ORG, entityId: ENTITY_ID });
      const deniedOrg = await request(`${base}?${foreignOrg}`);
      add("scope-rejection", `${contract.id}.foreign_org`, [400, 401, 403, 404].includes(deniedOrg.response.status), { status: deniedOrg.response.status });

      if (contract.scope === "entity") {
        const foreignEntity = new URLSearchParams({ organizationId: ORGANIZATION_ID, entityId: FOREIGN_ENTITY });
        const deniedEntity = await request(`${base}?${foreignEntity}`);
        add("scope-rejection", `${contract.id}.foreign_entity`, [400, 401, 403, 404].includes(deniedEntity.response.status), { status: deniedEntity.response.status });
      }
    }
  } else {
    console.log(`================ FOCUSED HANDLER DIAGNOSTIC (${[...FOCUS].join(", ")}) ================`);
  }

  console.log("\n================ FINANCE GET HANDLER MATRIX ================");
  const firstContract = contracts[0]?.id || "opening_balances";
  const getHandlers = apiRoutes
    .filter(item => item.methods.includes("GET"))
    .filter(item => !FOCUSED || FOCUS.has(item.route));

  for (const item of getHandlers) {
    const target = materializeRoute(item.route, firstContract);
    const url = new URL(`${BASE_URL}${target}`);
    url.searchParams.set("organizationId", ORGANIZATION_ID);
    url.searchParams.set("organization_id", ORGANIZATION_ID);
    url.searchParams.set("entityId", ENTITY_ID);
    url.searchParams.set("entity_id", ENTITY_ID);
    if (PERIOD_ID) {
      url.searchParams.set("periodId", PERIOD_ID);
      url.searchParams.set("period_id", PERIOD_ID);
    }
    try {
      const result = await request(url.toString());
      const passed = controlledStatus(result.response.status) && !/Internal Server Error|Application error/i.test(result.text);
      const details = passed
        ? { status: result.response.status, file: item.file }
        : { ...failureDetails(result), file: item.file, url: url.toString() };
      add("get-handler", item.route, passed, details);
      if (/preview|report|statement|ledger|trial-balance|dashboard|insight/i.test(item.route)) {
        add("document-report", item.route, passed, details);
      }
    } catch (error) {
      add("get-handler", item.route, false, { file: item.file, message: error.message });
    }
  }

  if (!FOCUSED) {
    console.log("\n================ GENERIC WRITE GUARDS ================");
    const writable = contracts.find(contract => contract.id !== "customer_statements" && contract.id !== "vendor_statements" && contract.id !== "cash_management");
    const readOnly = contracts.find(contract => ["customer_statements", "vendor_statements", "cash_management"].includes(contract.id));
    if (writable) {
      const url = `${BASE_URL}/api/finance/workspaces/${writable.id}`;
      const emptyPost = await request(url, { method: "POST", body: JSON.stringify({ organizationId: ORGANIZATION_ID, entityId: ENTITY_ID }) });
      add("write-guard", "required fields reject empty POST", [400, 405].includes(emptyPost.response.status), { status: emptyPost.response.status });
      const emptyPatch = await request(url, { method: "PATCH", body: JSON.stringify({ organizationId: ORGANIZATION_ID, entityId: ENTITY_ID }) });
      add("write-guard", "PATCH requires record id", emptyPatch.response.status === 400, { status: emptyPatch.response.status });
      const emptyDelete = await request(url, { method: "DELETE", body: JSON.stringify({ organizationId: ORGANIZATION_ID, entityId: ENTITY_ID }) });
      add("write-guard", "DELETE requires record id", emptyDelete.response.status === 400, { status: emptyDelete.response.status });
    }
    if (readOnly) {
      const url = `${BASE_URL}/api/finance/workspaces/${readOnly.id}`;
      for (const method of ["POST", "PATCH", "DELETE"]) {
        const probe = await request(url, { method, body: JSON.stringify({ organizationId: ORGANIZATION_ID, entityId: ENTITY_ID, id: ZERO_UUID }) });
        add("read-only-guard", `${readOnly.id}.${method}`, probe.response.status === 405, { status: probe.response.status });
      }
    }
  }

  const passed = results.filter(row => row.passed).length;
  const failed = results.length - passed;
  const report = {
    generatedAt: new Date().toISOString(),
    mode: FOCUSED ? "focused_handler_diagnostic" : "full_certification",
    focus: [...FOCUS],
    organizationId: ORGANIZATION_ID,
    entityId: ENTITY_ID,
    periodId: PERIOD_ID || null,
    passed,
    failed,
    total: results.length,
    results,
  };
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
  console.log("\n================ FINAL RESULT ================");
  console.log(`PASSED=${passed}`);
  console.log(`FAILED=${failed}`);
  console.log(`TOTAL=${results.length}`);
  console.log(`REPORT=${REPORT}`);
  console.log(failed === 0 ? "FINANCE UI ACTION SECURITY CERTIFICATION PASSED" : "FINANCE UI ACTION SECURITY CERTIFICATION FAILED");
  process.exitCode = failed === 0 ? 0 : 1;
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
