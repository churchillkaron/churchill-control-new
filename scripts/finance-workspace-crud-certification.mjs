#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const ROOT = process.cwd();
const BASE_URL = String(process.env.FINANCE_CERT_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const ORGANIZATION_ID = String(process.env.FINANCE_CERT_ORGANIZATION_ID || "").trim();
const ENTITY_ID = String(process.env.FINANCE_CERT_ENTITY_ID || "").trim();
const ACTOR_ID = String(process.env.FINANCE_CERT_ACTOR_ID || "").trim();
const ACCESS_TOKEN = String(process.env.FINANCE_CERT_ACCESS_TOKEN || "").trim();
const COOKIE = String(process.env.FINANCE_CERT_COOKIE || "").trim();
const SUPABASE_URL = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
const SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const CONFIRM = String(process.env.FINANCE_CERT_CONFIRM || "").trim();
const REPORT = String(process.env.FINANCE_CERT_REPORT || path.join("/tmp", `AVANTIQO_FINANCE_WORKSPACE_CRUD_CERTIFICATION_${new Date().toISOString().replace(/[:.]/g, "-")}.json`));
const results = [];

function add(category, name, passed, details = {}) {
  const row = { category, name, passed: Boolean(passed), ...details };
  results.push(row);
  console.log(`${passed ? "PASS" : "FAIL"} ${category.padEnd(24)} ${name}${details.message ? ` - ${details.message}` : ""}`);
  return row;
}

function required(value, name) {
  if (!value) throw new Error(`${name} required`);
  return value;
}

function read(relative) {
  return fs.readFileSync(path.join(ROOT, relative), "utf8");
}

function extractObjectBlock(source, marker) {
  const start = source.indexOf(marker);
  if (start < 0) return "";
  const brace = source.indexOf("{", start);
  if (brace < 0) return "";
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let index = brace; index < source.length; index += 1) {
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
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  return source.slice(start);
}

function parsePolicyIds(policy) {
  const block = extractObjectBlock(policy, "FINANCE_PRIMARY_ACTION_POLICY");
  return [...block.matchAll(/^  ([a-z0-9_]+):/gm)].map(match => match[1]);
}

function financeSection(registry) {
  const workspaceStart = registry.indexOf("workspaces: {");
  const start = registry.indexOf("\n    finance: {", workspaceStart);
  const end = registry.indexOf("\n    people:", start);
  return start >= 0 ? registry.slice(start, end > start ? end : undefined) : "";
}

function parseRoutes(registry, ids) {
  const section = financeSection(registry);
  return ids.map(id => {
    const escaped = id.replace(/[.*+?^\x24{}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`\\bid:\\s*["']${escaped}["'][\\s\\S]{0,6500}?\\broute:\\s*["'](\\/finance(?:\\/[^"']*)?)["']`);
    const match = section.match(pattern);
    return match ? { id, route: match[1] } : { id, route: null };
  });
}

function parseContractIds(contracts) {
  const block = extractObjectBlock(contracts, "FINANCE_WORKSPACE_CONTRACTS");
  return [...block.matchAll(/^  ([a-z0-9_]+):\s*(?:entityWorkspace|organizationWorkspace)\s*\(/gm)].map(match => match[1]);
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
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text.slice(0, 500) }; }
  return { response, body, text };
}

async function main() {
  console.log("============================================================");
  console.log("AVANTIQO FINANCE WORKSPACE CRUD CERTIFICATION");
  console.log("============================================================");

  required(ORGANIZATION_ID, "FINANCE_CERT_ORGANIZATION_ID");
  required(ENTITY_ID, "FINANCE_CERT_ENTITY_ID");
  required(ACTOR_ID, "FINANCE_CERT_ACTOR_ID");
  required(ACCESS_TOKEN, "FINANCE_CERT_ACCESS_TOKEN");
  required(COOKIE, "FINANCE_CERT_COOKIE");
  required(SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL");
  required(SERVICE_ROLE_KEY, "SUPABASE_SERVICE_ROLE_KEY");

  const registry = read("lib/platform/registry/erpRegistry.js");
  const policy = read("lib/finance/ui/FinancePrimaryActionPolicy.js");
  const contracts = read("lib/finance/workspaces/FinanceWorkspaceContracts.js");
  const forms = read("lib/platform/forms/FormRegistry.js");
  const formContract = read("lib/platform/forms/FinanceFormContract.js");
  const workspaceRoute = read("app/api/finance/workspaces/[capabilityId]/route.js");
  const policyIds = parsePolicyIds(policy);
  const routes = parseRoutes(registry, policyIds);
  const contractIds = parseContractIds(contracts);

  console.log("\n================ 67-WORKSPACE STRUCTURE ================");
  add("structure", "67 primary-action policies", policyIds.length === 67, { actual: policyIds.length, expected: 67 });
  add("structure", "67 Finance routes", routes.filter(row => row.route).length === 67, {
    actual: routes.filter(row => row.route).length,
    missing: routes.filter(row => !row.route).map(row => row.id),
  });
  add("structure", "25 generic workspace contracts", contractIds.length === 25, { actual: contractIds.length, expected: 25 });
  add("structure", "Finance form default guard", !/default(?:Value)?\s*:\s*["'](?:THB|Thailand|USD|EUR|GBP)["']/i.test(formContract));
  add("structure", "typed invoice and journal lines", formContract.includes("calculated-money") && formContract.includes('lookup: "chart_of_accounts"'));

  for (const { id, route } of routes) {
    add("workspace-route", id, Boolean(route), { route });
  }

  console.log("\n================ FORM AND ACTION BINDINGS ================");
  const createPolicies = [...policy.matchAll(/^  ([a-z0-9_]+):[\s\S]{0,900}?mode:\s*["']create["']/gm)].map(match => match[1]);
  for (const id of policyIds) {
    const routeRow = routes.find(row => row.id === id);
    const hasPolicy = policy.includes(`${id}:`);
    const hasRoute = Boolean(routeRow?.route);
    add("binding", id, hasPolicy && hasRoute, { policy: hasPolicy, route: routeRow?.route || null });
  }
  add("binding", "form registry available", forms.includes("export const FormRegistry"));
  add("binding", "generic POST normalizes schema", workspaceRoute.includes("normalizePayload(contract, body)"));
  add("binding", "generic GET reads contract tables", workspaceRoute.includes("for (const table of contract.tables)"));
  add("binding", "generic update API", workspaceRoute.includes("export async function PATCH"), {
    message: workspaceRoute.includes("export async function PATCH") ? null : "PATCH is not implemented on the generic Finance workspace API",
  });
  add("binding", "generic archive API", workspaceRoute.includes("export async function DELETE"), {
    message: workspaceRoute.includes("export async function DELETE") ? null : "DELETE/archive is not implemented on the generic Finance workspace API",
  });
  add("binding", "create-policy coverage", createPolicies.length > 0, { actual: createPolicies.length });

  console.log("\n================ LIVE PAGES AND LIST READS ================");
  for (const { id, route } of routes) {
    try {
      const { response, text } = await request(`${BASE_URL}/workspace/${ORGANIZATION_ID}${route}`, { accept: "text/html" });
      const passed = response.status === 200 && !/Application error|Internal Server Error|404: This page could not be found/i.test(text);
      add("live-page", id, passed, { status: response.status, route });
    } catch (error) {
      add("live-page", id, false, { route, message: error.message });
    }
  }

  for (const id of contractIds) {
    const entityScoped = new RegExp(`${id}\\s*:\\s*entityWorkspace\\s*\\(`).test(contracts);
    const params = new URLSearchParams({ organizationId: ORGANIZATION_ID });
    if (entityScoped) params.set("entityId", ENTITY_ID);
    try {
      const { response, body } = await request(`${BASE_URL}/api/finance/workspaces/${id}?${params}`);
      const passed = response.status === 200 && body?.success === true && Array.isArray(body?.rows) && body?.unavailable === false;
      add("live-list", id, passed, {
        status: response.status,
        sourceTable: body?.sourceTable || null,
        rowCount: Array.isArray(body?.rows) ? body.rows.length : null,
        message: passed ? null : body?.error || "Invalid list response",
      });
    } catch (error) {
      add("live-list", id, false, { message: error.message });
    }
  }

  console.log("\n================ ROLLBACK-SAFE CRUD PROBE ================");
  if (CONFIRM !== "RUN_ROLLBACK_SAFE_FINANCE_CRUD_CERTIFICATION") {
    add("crud-probe", "explicit confirmation", false, { message: "Confirmation phrase did not match" });
  } else {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const postingDate = new Date().toISOString().slice(0, 10);
    const currencyMatch = registry.match(/currency/i);
    const { data: entity } = await supabase.from("legal_entities").select("*").eq("organization_id", ORGANIZATION_ID).eq("id", ENTITY_ID).maybeSingle();
    const currency = String(entity?.currency || entity?.currency_code || "").trim();
    const { data, error } = await supabase.rpc("finance_run_workspace_crud_certification_probe", {
      p_organization_id: ORGANIZATION_ID,
      p_entity_id: ENTITY_ID,
      p_actor_id: ACTOR_ID,
      p_posting_date: postingDate,
      p_currency_code: currency || (currencyMatch ? "XTS" : "XTS"),
    });
    if (error) {
      add("crud-probe", "RPC execution", false, { message: error.message });
    } else {
      add("crud-probe", "probe rolled back", data?.rolled_back === true);
      for (const row of data?.results || []) {
        add("database", row.name, row.passed === true, {
          ...(row.details || {}),
          message: row.message || null,
        });
      }
    }
  }

  const passed = results.filter(row => row.passed).length;
  const failed = results.length - passed;
  const report = {
    generatedAt: new Date().toISOString(),
    organizationId: ORGANIZATION_ID,
    entityId: ENTITY_ID,
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
  console.log(failed === 0 ? "FINANCE WORKSPACE CRUD CERTIFICATION PASSED" : "FINANCE WORKSPACE CRUD CERTIFICATION FAILED");
  process.exitCode = failed === 0 ? 0 : 1;
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
