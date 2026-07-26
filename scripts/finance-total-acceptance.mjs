#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

const ROOT = process.cwd();
const BASE_URL = String(process.env.FINANCE_ACCEPTANCE_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const ORGANIZATION_ID = String(process.env.FINANCE_ACCEPTANCE_ORGANIZATION_ID || "").trim();
const ENTITY_ID = String(process.env.FINANCE_ACCEPTANCE_ENTITY_ID || "").trim();
const ACTOR_ID = String(process.env.FINANCE_ACCEPTANCE_ACTOR_ID || "").trim();
const ACCESS_TOKEN = String(process.env.FINANCE_ACCEPTANCE_ACCESS_TOKEN || "").trim();
const COOKIE = String(process.env.FINANCE_ACCEPTANCE_COOKIE || "").trim();
const SUPABASE_URL = String(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
const SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ADMIN_KEY || "").trim();
const CONFIRM = String(process.env.FINANCE_ACCEPTANCE_CONFIRM || "").trim();
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const REPORT = process.env.FINANCE_ACCEPTANCE_REPORT || path.join("/tmp", `AVANTIQO_FINANCE_TOTAL_ACCEPTANCE_${stamp}.json`);
const results = [];

function add(category, name, passed, details = {}) {
  const row = { category, name, passed: Boolean(passed), ...details };
  results.push(row);
  console.log(`${passed ? "PASS" : "FAIL"} ${category.padEnd(24)} ${name}${details.message ? ` - ${details.message}` : ""}`);
  return row;
}

function requireValue(value, name) {
  if (!value) throw new Error(`${name} required`);
  return value;
}

function read(relative) {
  return fs.readFileSync(path.join(ROOT, relative), "utf8");
}

function financeWorkspaceSection(registry) {
  const start = registry.indexOf("finance: {");
  if (start < 0) return "";
  const end = registry.indexOf("\n    people:", start);
  return end > start ? registry.slice(start, end) : registry.slice(start);
}

function parseFinanceRoutes(registry) {
  const section = financeWorkspaceSection(registry);
  const rows = [];
  const pattern = /\{\s*id:\s*["']([^"']+)["'][\s\S]{0,900}?route:\s*["'](\/finance(?:\/[^"']*)?)["']/g;
  let match;
  while ((match = pattern.exec(section))) {
    const id = match[1];
    const route = match[2];
    if (!route.startsWith("/finance")) continue;
    if (["new", "open", "edit", "delete", "history", "attachments", "reports", "automation", "ai", "export", "import"].includes(id)) continue;
    rows.push({ id, route });
  }
  return [...new Map(rows.map((row) => [row.route, row])).values()];
}

function parseOperationalEndpoints(policy) {
  return [...policy.matchAll(/endpoint:\s*["']([^"']+)["'][\s\S]{0,120}?method:\s*["']([^"']+)["']/g)]
    .map((match) => ({ endpoint: match[1], method: match[2] }));
}

async function fetchResult(url, options = {}) {
  const response = await fetch(url, {
    redirect: "manual",
    ...options,
    headers: {
      authorization: `Bearer ${ACCESS_TOKEN}`,
      ...(COOKIE ? { cookie: COOKIE } : {}),
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text.slice(0, 500) }; }
  return { response, text, body };
}

function normalize(value) {
  return String(value || "").trim().toUpperCase();
}

function chooseAccount(accounts, predicates) {
  return accounts.find((account) => predicates.some((predicate) => predicate(account))) || null;
}

async function main() {
  console.log("============================================================");
  console.log("AVANTIQO FINANCE TOTAL ACCEPTANCE");
  console.log("============================================================");

  requireValue(ORGANIZATION_ID, "FINANCE_ACCEPTANCE_ORGANIZATION_ID");
  requireValue(ENTITY_ID, "FINANCE_ACCEPTANCE_ENTITY_ID");
  requireValue(ACTOR_ID, "FINANCE_ACCEPTANCE_ACTOR_ID");
  requireValue(ACCESS_TOKEN, "FINANCE_ACCEPTANCE_ACCESS_TOKEN");
  requireValue(COOKIE, "FINANCE_ACCEPTANCE_COOKIE");
  requireValue(SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL");
  requireValue(SERVICE_ROLE_KEY, "SUPABASE_SERVICE_ROLE_KEY");

  const registry = read("lib/platform/registry/erpRegistry.js");
  const policy = read("lib/finance/ui/FinancePrimaryActionPolicy.js");
  const formContract = read("lib/platform/forms/FinanceFormContract.js");
  const routes = parseFinanceRoutes(registry);
  const endpoints = parseOperationalEndpoints(policy);

  console.log("\n================ FULL FINANCE REGISTRY ================");
  add("registry", "Finance routes discovered", routes.length >= 67, { actual: routes.length, expectedMinimum: 67 });
  add("registry", "Primary action policies", (policy.match(/mode:\s*["']/g) || []).length >= 67, {
    actual: (policy.match(/mode:\s*["']/g) || []).length,
    expectedMinimum: 67,
  });
  add("forms", "No fixed Finance defaults", !/default(?:Value)?\s*:\s*["'](?:THB|Thailand|USD|EUR|GBP)["']/i.test(formContract));
  add("forms", "Typed invoice lines", formContract.includes("calculated-money") && formContract.includes('lookup: "chart_of_accounts"'));

  console.log("\n================ ALL FINANCE PAGES ================");
  for (const item of routes) {
    const url = `${BASE_URL}/workspace/${ORGANIZATION_ID}${item.route}`;
    try {
      const { response, text } = await fetchResult(url, { headers: { accept: "text/html" } });
      const passed = response.status === 200 && !/Application error|Internal Server Error|404: This page could not be found/i.test(text);
      add("page", item.id, passed, { status: response.status, route: item.route });
    } catch (error) {
      add("page", item.id, false, { route: item.route, message: error.message });
    }
  }

  console.log("\n================ OPERATIONAL ROUTES ================");
  for (const action of endpoints) {
    try {
      const { response } = await fetchResult(`${BASE_URL}${action.endpoint}`, { method: "GET" });
      add("action-route", `${action.method} ${action.endpoint}`, response.status !== 404, { probeStatus: response.status });
    } catch (error) {
      add("action-route", `${action.method} ${action.endpoint}`, false, { message: error.message });
    }
  }

  console.log("\n================ HOSTILE SCOPE TESTS ================");
  const foreignOrganizationId = randomUUID();
  const hostileCases = [
    { name: "lookup rejects foreign organisation", url: `${BASE_URL}/api/platform/lookups?lookup=chart_of_accounts&organizationId=${foreignOrganizationId}&entityId=${ENTITY_ID}`, method: "GET" },
    { name: "workspace rejects foreign organisation", url: `${BASE_URL}/api/finance/workspaces/opening_balances?organizationId=${foreignOrganizationId}&entityId=${ENTITY_ID}`, method: "GET" },
    { name: "vendor write rejects foreign organisation", url: `${BASE_URL}/api/finance/vendors/upsert`, method: "POST", body: JSON.stringify({ organizationId: foreignOrganizationId, legal_name: "MUST NOT CREATE" }) },
    { name: "customer write rejects foreign organisation", url: `${BASE_URL}/api/customers/upsert`, method: "POST", body: JSON.stringify({ organizationId: foreignOrganizationId, customer_name: "MUST NOT CREATE" }) },
    { name: "journal rejects foreign organisation", url: `${BASE_URL}/api/finance/journals/create`, method: "POST", body: JSON.stringify({ organizationId: foreignOrganizationId, entityId: ENTITY_ID }) },
  ];

  for (const test of hostileCases) {
    try {
      const { response, body } = await fetchResult(test.url, { method: test.method, body: test.body });
      add("security", test.name, [401, 403, 404].includes(response.status), { status: response.status, message: body?.error || null });
    } catch (error) {
      add("security", test.name, false, { message: error.message });
    }
  }

  console.log("\n================ ACCOUNTING PREREQUISITES ================");
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { transport: WebSocket },
  });

  const [{ data: entity, error: entityError }, { data: periods, error: periodError }, { data: accounts, error: accountsError }, { data: banks, error: bankError }, { data: customers, error: customerError }, { data: vendors, error: vendorError }] = await Promise.all([
    supabase.from("legal_entities").select("*").eq("organization_id", ORGANIZATION_ID).eq("id", ENTITY_ID).maybeSingle(),
    supabase.from("accounting_periods").select("*").eq("organization_id", ORGANIZATION_ID).eq("entity_id", ENTITY_ID).in("status", ["open", "OPEN", "active", "ACTIVE"]).order("start_date", { ascending: false }).limit(20),
    supabase.from("chart_of_accounts").select("*").eq("organization_id", ORGANIZATION_ID).eq("entity_id", ENTITY_ID).limit(1000),
    supabase.from("bank_accounts").select("*").eq("organization_id", ORGANIZATION_ID).eq("entity_id", ENTITY_ID).limit(100),
    supabase.from("customer_loyalty_accounts").select("*").eq("organization_id", ORGANIZATION_ID).eq("entity_id", ENTITY_ID).limit(100),
    supabase.from("supplier_profiles").select("*, parties(*)").eq("organization_id", ORGANIZATION_ID).eq("is_active", true).limit(100),
  ]);

  if (entityError || periodError || accountsError || bankError || customerError || vendorError) {
    throw new Error([entityError, periodError, accountsError, bankError, customerError, vendorError].filter(Boolean).map((error) => error.message).join(" | "));
  }

  const period = periods?.find((row) => {
    const today = new Date().toISOString().slice(0, 10);
    return row.start_date <= today && row.end_date >= today;
  }) || periods?.[0];
  const postingDate = period
    ? new Date(Math.max(new Date(period.start_date).getTime(), Math.min(Date.now(), new Date(period.end_date).getTime()))).toISOString().slice(0, 10)
    : null;
  const currency = normalize(entity?.currency || banks?.[0]?.currency || "");
  const asset = chooseAccount(accounts || [], [
    (row) => ["ASSET", "CURRENT_ASSET", "BANK", "CASH", "RECEIVABLE"].includes(normalize(row.account_type)),
    (row) => ["ASSET", "CURRENT_ASSET"].includes(normalize(row.account_category)),
  ]);
  const revenue = chooseAccount(accounts || [], [
    (row) => ["REVENUE", "INCOME", "SALES"].includes(normalize(row.account_type)),
    (row) => ["REVENUE", "INCOME"].includes(normalize(row.account_category)),
  ]);
  const expense = chooseAccount(accounts || [], [
    (row) => ["EXPENSE", "COST", "COGS"].includes(normalize(row.account_type)),
    (row) => ["EXPENSE", "COST_OF_SALES"].includes(normalize(row.account_category)),
  ]);
  const liability = chooseAccount(accounts || [], [
    (row) => ["LIABILITY", "CURRENT_LIABILITY", "PAYABLE"].includes(normalize(row.account_type)),
    (row) => ["LIABILITY", "CURRENT_LIABILITY"].includes(normalize(row.account_category)),
  ]);
  const customer = customers?.[0] || null;
  const vendor = vendors?.find((row) => row.party_id) || null;
  const bank = banks?.[0] || null;

  const hardPrerequisites = {
    entity: entity?.id,
    period: period?.id,
    postingDate,
    currency,
    customer: customer?.id,
  };
  for (const [name, value] of Object.entries(hardPrerequisites)) {
    add("prerequisite", name, Boolean(value), { value: value || null });
  }

  const optionalMasters = {
    assetAccount: asset?.id,
    revenueAccount: revenue?.id,
    expenseAccount: expense?.id,
    liabilityAccount: liability?.id,
    bankAccount: bank?.id,
    vendorParty: vendor?.party_id,
  };
  for (const [name, value] of Object.entries(optionalMasters)) {
    add("probe-master", name, true, {
      value: value || null,
      message: value ? "existing master will be used" : "missing master will be provisioned and rolled back",
    });
  }

  console.log("\n================ ROLLBACK-SAFE TRANSACTION PROBE ================");
  if (CONFIRM !== "RUN_ROLLBACK_SAFE_FINANCE_ACCEPTANCE") {
    add("transaction", "explicit confirmation", false, { message: "FINANCE_ACCEPTANCE_CONFIRM must equal RUN_ROLLBACK_SAFE_FINANCE_ACCEPTANCE" });
  } else if (Object.values(hardPrerequisites).some((value) => !value)) {
    add("transaction", "accounting probe", false, { message: "Core accounting prerequisites are incomplete" });
  } else {
    const { data, error } = await supabase.rpc("finance_run_total_acceptance_probe_v2", {
      p_organization_id: ORGANIZATION_ID,
      p_entity_id: ENTITY_ID,
      p_actor_id: ACTOR_ID,
      p_posting_date: postingDate,
      p_currency_code: currency,
      p_exchange_rate: 1,
      p_asset_account_id: asset?.id || null,
      p_revenue_account_id: revenue?.id || null,
      p_expense_account_id: expense?.id || null,
      p_liability_account_id: liability?.id || null,
      p_bank_account_id: bank?.id || null,
      p_customer_id: customer.id,
      p_vendor_party_id: vendor?.party_id || null,
    });

    if (error) {
      add("transaction", "accounting probe RPC", false, { message: error.message });
    } else {
      add("transaction", "probe rolled back", data?.rolled_back === true, { runId: data?.run_id, tag: data?.tag });
      add("transaction", "prerequisite masters rolled back", data?.prerequisites_rolled_back === true, { provisioned: data?.provisioned || {} });
      for (const row of data?.results || []) {
        add("transaction", row.name, row.passed === true, { message: row.message || null, details: row.details || null });
      }
    }
  }

  const passed = results.filter((row) => row.passed).length;
  const failed = results.length - passed;
  const report = {
    suite: "Avantiqo Finance Total Acceptance",
    generatedAt: new Date().toISOString(),
    organizationId: ORGANIZATION_ID,
    entityId: ENTITY_ID,
    totals: { passed, failed, total: results.length },
    results,
  };
  fs.writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`);

  console.log("\n================ FINAL RESULT ================");
  console.log(`PASSED=${passed}`);
  console.log(`FAILED=${failed}`);
  console.log(`TOTAL=${results.length}`);
  console.log(`REPORT=${REPORT}`);
  console.log(failed === 0 ? "FINANCE TOTAL ACCEPTANCE PASSED" : "FINANCE TOTAL ACCEPTANCE FAILED");
  process.exitCode = failed === 0 ? 0 : 1;
}

main().catch((error) => {
  add("harness", "execution", false, { message: error.stack || error.message });
  const report = { suite: "Avantiqo Finance Total Acceptance", generatedAt: new Date().toISOString(), totals: { passed: results.filter((row) => row.passed).length, failed: results.filter((row) => !row.passed).length, total: results.length }, results };
  fs.writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`);
  console.error(error);
  console.log(`REPORT=${REPORT}`);
  process.exitCode = 1;
});
