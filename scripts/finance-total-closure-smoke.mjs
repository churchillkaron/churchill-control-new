#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const BASE_URL = String(process.env.FINANCE_SMOKE_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const ORGANIZATION_ID = String(process.env.FINANCE_SMOKE_ORGANIZATION_ID || "").trim();
const ENTITY_ID = String(process.env.FINANCE_SMOKE_ENTITY_ID || "").trim();
const ACCESS_TOKEN = String(process.env.FINANCE_SMOKE_ACCESS_TOKEN || "").trim();
const COOKIE = String(process.env.FINANCE_SMOKE_COOKIE || "").trim();
const STATIC_ONLY = /^(1|true|yes)$/i.test(String(process.env.FINANCE_SMOKE_STATIC_ONLY || ""));
const PAGE_CHECKS = Boolean(COOKIE);
const startedAt = new Date();
const stamp = startedAt.toISOString().replace(/[:.]/g, "-");
const reportPath = process.env.FINANCE_SMOKE_REPORT || path.join("/tmp", `avantiqo-finance-smoke-${stamp}.json`);

const WORKSPACES = Object.freeze([
  { id: "opening_balances", route: "/finance/opening-balances", scope: "entity", sources: ["finance_opening_balance_batches"] },
  { id: "recurring_journals", route: "/finance/recurring-journals", scope: "entity", sources: ["finance_recurring_journal_templates"] },
  { id: "collections", route: "/finance/collections", scope: "entity", sources: ["finance_collection_cases", "accounts_receivable"] },
  { id: "customer_statements", route: "/finance/customer-statements", scope: "entity", readOnly: true, sources: ["accounts_receivable"] },
  { id: "revenue_recognition", route: "/finance/revenue-recognition", scope: "entity", sources: ["finance_revenue_recognition_schedules"] },
  { id: "vendor_statements", route: "/finance/vendor-statements", scope: "entity", readOnly: true, sources: ["accounts_payable"] },
  { id: "cash_management", route: "/finance/cash-management", scope: "entity", readOnly: true, sources: ["bank_ledger", "cash_flow_snapshots"] },
  { id: "bank_statements", route: "/finance/bank-statements", scope: "entity", sources: ["finance_bank_statement_imports"] },
  { id: "bank_reconciliation", route: "/finance/bank-reconciliation", scope: "entity", sources: ["finance_bank_reconciliation_runs"] },
  { id: "fx_revaluation", route: "/finance/fx-revaluation", scope: "entity", sources: ["finance_fx_revaluation_runs"] },
  { id: "vat_returns", route: "/finance/vat-returns", scope: "entity", sources: ["finance_vat_returns"] },
  { id: "depreciation", route: "/finance/depreciation", scope: "entity", sources: ["finance_depreciation_runs"] },
  { id: "statutory_filings", route: "/finance/statutory-filings", scope: "entity", sources: ["finance_statutory_filings"] },
  { id: "report_builder", route: "/finance/report-builder", scope: "organization", sources: ["finance_report_templates"] },
  { id: "scheduled_reports", route: "/finance/scheduled-reports", scope: "organization", sources: ["finance_scheduled_reports"] },
  { id: "organization_profile", route: "/finance/organization-profile", scope: "organization", singleton: true, sources: ["finance_organization_profiles"] },
  { id: "accounting_settings", route: "/finance/accounting-settings", scope: "organization", sources: ["finance_accounting_settings"] },
  { id: "number_sequences", route: "/finance/number-sequences", scope: "organization", sources: ["finance_number_sequences"] },
  { id: "posting_rules", route: "/finance/posting-rules", scope: "organization", sources: ["finance_posting_rules"] },
  { id: "approval_workflows", route: "/finance/approval-workflows", scope: "organization", sources: ["finance_approval_workflows"] },
  { id: "government_connections", route: "/finance/government-connections", scope: "organization", sources: ["finance_government_connections"] },
  { id: "banking_integrations", route: "/finance/banking-integrations", scope: "organization", sources: ["finance_banking_integrations"] },
  { id: "exchange_rates", route: "/finance/exchange-rates", scope: "organization", sources: ["finance_exchange_rates"] },
  { id: "e_invoicing", route: "/finance/e-invoicing", scope: "organization", sources: ["finance_e_invoicing_settings"] },
  { id: "document_templates", route: "/finance/document-templates", scope: "organization", sources: ["finance_document_templates"] },
]);

const READ_ONLY_IDS = new Set(WORKSPACES.filter((workspace) => workspace.readOnly).map((workspace) => workspace.id));
const results = [];

function result(type, target, passed, detail = {}) {
  const entry = { type, target, passed: Boolean(passed), ...detail };
  results.push(entry);
  const symbol = passed ? "PASS" : "FAIL";
  console.log(`${symbol.padEnd(4)} ${type.padEnd(24)} ${target}${detail.message ? ` - ${detail.message}` : ""}`);
  return entry;
}

function read(relativePath) {
  const absolutePath = path.join(ROOT, relativePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Missing source file: ${relativePath}`);
  }
  return fs.readFileSync(absolutePath, "utf8");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function staticChecks() {
  console.log("\n================ STATIC FINANCE CLOSURE ================");

  const registry = read("lib/platform/registry/erpRegistry.js");
  const contracts = read("lib/finance/workspaces/FinanceWorkspaceContracts.js");
  const serializer = read("lib/platform/registry/serializeCapability.js");
  const route = read("app/api/finance/workspaces/[capabilityId]/route.js");
  const page = read("app/(system)/workspace/[organizationId]/finance/[...financeRoute]/page.jsx");
  const migration = read("supabase/migrations/20260725200000_finance_workspace_forms_and_data.sql");

  result("static-count", "25 workspace contracts", WORKSPACES.length === 25, { actual: WORKSPACES.length });
  result("static-count", "22 writable workspaces", WORKSPACES.filter((workspace) => !workspace.readOnly).length === 22, {
    actual: WORKSPACES.filter((workspace) => !workspace.readOnly).length,
  });
  result("static-count", "3 read-only workspaces", READ_ONLY_IDS.size === 3, { actual: READ_ONLY_IDS.size });

  for (const workspace of WORKSPACES) {
    const registryPattern = new RegExp(
      `id\\s*:\\s*["']${escapeRegExp(workspace.id)}["'][\\s\\S]{0,450}?route\\s*:\\s*["']${escapeRegExp(workspace.route)}["']`
    );
    result("registry-route", workspace.id, registryPattern.test(registry), { route: workspace.route });

    const contractPattern = new RegExp(
      `${escapeRegExp(workspace.id)}\\s*:\\s*(?:entityWorkspace|organizationWorkspace)\\s*\\(`
    );
    result("workspace-contract", workspace.id, contractPattern.test(contracts), { scope: workspace.scope });

    for (const source of workspace.sources) {
      const sourcePresent = contracts.includes(`"${source}"`) || contracts.includes(`'${source}'`);
      result("contract-source", `${workspace.id}:${source}`, sourcePresent);
    }

    if (!workspace.readOnly && workspace.sources[0].startsWith("finance_")) {
      result("migration-table", `${workspace.id}:${workspace.sources[0]}`, migration.includes(`public.${workspace.sources[0]}`));
    }
  }

  for (const id of READ_ONLY_IDS) {
    const blockPattern = new RegExp(`${escapeRegExp(id)}\\s*:[\\s\\S]{0,500}?readOnly\\s*:\\s*true`);
    result("read-only-contract", id, blockPattern.test(contracts));
  }

  result("serializer", "workspace API normalisation", serializer.includes("/api/finance/workspaces/${capability.id}"));
  result("serializer", "MasterDataRuntimeWorkCenter", serializer.includes('renderer: "MasterDataRuntimeWorkCenter"'));
  result("api-contract", "authenticated GET", route.includes("export async function GET") && route.includes("requireOrganizationAccess"));
  result("api-contract", "authenticated POST", route.includes("export async function POST") && route.includes("normalizePayload"));
  result("api-contract", "read-only POST guard", route.includes("This Finance workspace is read-only"));
  result("page-contract", "dynamic Finance registry renderer", page.includes("getWorkspaceItemByRoute") && page.includes("serializeCapability"));
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    redirect: "manual",
    ...options,
    headers: {
      accept: "application/json",
      authorization: `Bearer ${ACCESS_TOKEN}`,
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text.slice(0, 500) };
  }
  return { response, body };
}

async function liveApiChecks() {
  console.log("\n================ LIVE FINANCE API ================");

  if (!ORGANIZATION_ID || !ENTITY_ID || !ACCESS_TOKEN) {
    throw new Error(
      "Live mode requires FINANCE_SMOKE_ORGANIZATION_ID, FINANCE_SMOKE_ENTITY_ID and FINANCE_SMOKE_ACCESS_TOKEN"
    );
  }

  for (const workspace of WORKSPACES) {
    const params = new URLSearchParams({ organizationId: ORGANIZATION_ID });
    if (workspace.scope === "entity") params.set("entityId", ENTITY_ID);
    const endpoint = `${BASE_URL}/api/finance/workspaces/${workspace.id}?${params}`;

    try {
      const { response, body } = await requestJson(endpoint);
      const sourceValid = workspace.sources.includes(body?.sourceTable);
      const passed = response.status === 200 && body?.success === true && Array.isArray(body?.rows) && body?.unavailable === false && sourceValid;
      result("live-list", workspace.id, passed, {
        status: response.status,
        sourceTable: body?.sourceTable || null,
        rowCount: Array.isArray(body?.rows) ? body.rows.length : null,
        message: passed ? `${body.sourceTable}, ${body.rows.length} rows` : body?.error || "Invalid list response",
      });
    } catch (error) {
      result("live-list", workspace.id, false, { message: error.message });
    }

    if (workspace.scope === "entity") {
      const missingEntityEndpoint = `${BASE_URL}/api/finance/workspaces/${workspace.id}?organizationId=${encodeURIComponent(ORGANIZATION_ID)}`;
      try {
        const { response, body } = await requestJson(missingEntityEndpoint);
        result("entity-required", workspace.id, response.status === 400 && /entity_id required/i.test(String(body?.error || "")), {
          status: response.status,
          message: body?.error || "Missing error body",
        });
      } catch (error) {
        result("entity-required", workspace.id, false, { message: error.message });
      }
    }

    const postBody = {
      organizationId: ORGANIZATION_ID,
      ...(workspace.scope === "entity" ? { entityId: ENTITY_ID } : {}),
    };

    try {
      const { response, body } = await requestJson(`${BASE_URL}/api/finance/workspaces/${workspace.id}`, {
        method: "POST",
        body: JSON.stringify(postBody),
      });

      if (workspace.readOnly) {
        result("read-only-enforced", workspace.id, response.status === 405 && /read-only/i.test(String(body?.error || "")), {
          status: response.status,
          message: body?.error || "Missing error body",
        });
      } else {
        result("form-validation", workspace.id, response.status === 400 && /required/i.test(String(body?.error || "")), {
          status: response.status,
          message: body?.error || "Missing required-field validation",
        });
      }
    } catch (error) {
      result(workspace.readOnly ? "read-only-enforced" : "form-validation", workspace.id, false, { message: error.message });
    }
  }

  try {
    const endpoint = `${BASE_URL}/api/finance/workspaces/__unknown__?organizationId=${encodeURIComponent(ORGANIZATION_ID)}`;
    const { response, body } = await requestJson(endpoint);
    result("unknown-workspace", "__unknown__", response.status === 404 && /unknown/i.test(String(body?.error || "")), {
      status: response.status,
      message: body?.error || "Missing unknown-workspace response",
    });
  } catch (error) {
    result("unknown-workspace", "__unknown__", false, { message: error.message });
  }
}

async function livePageChecks() {
  console.log("\n================ LIVE FINANCE PAGES ================");

  if (!PAGE_CHECKS) {
    console.log("SKIP Page checks: FINANCE_SMOKE_COOKIE was not provided.");
    return;
  }

  for (const workspace of WORKSPACES) {
    const url = `${BASE_URL}/workspace/${ORGANIZATION_ID}${workspace.route}`;
    try {
      const response = await fetch(url, {
        redirect: "manual",
        headers: { cookie: COOKIE, accept: "text/html" },
      });
      const text = await response.text();
      const passed = response.status === 200 && !/Application error|Internal Server Error|404: This page could not be found/i.test(text);
      result("live-page", workspace.id, passed, {
        status: response.status,
        route: workspace.route,
        message: passed ? workspace.route : `HTTP ${response.status}`,
      });
    } catch (error) {
      result("live-page", workspace.id, false, { route: workspace.route, message: error.message });
    }
  }
}

async function main() {
  console.log("AVANTIQO FINANCE TOTAL CLOSURE SMOKE");
  console.log(`Root: ${ROOT}`);
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Mode: ${STATIC_ONLY ? "static only" : "static + live API"}`);
  console.log(`Page checks: ${PAGE_CHECKS ? "enabled" : "skipped"}`);

  try {
    staticChecks();
    if (!STATIC_ONLY) {
      await liveApiChecks();
      await livePageChecks();
    }
  } catch (error) {
    result("harness", "execution", false, { message: error.stack || error.message });
  }

  const passed = results.filter((entry) => entry.passed).length;
  const failed = results.filter((entry) => !entry.passed).length;
  const report = {
    suite: "Avantiqo Finance Total Closure Smoke",
    startedAt: startedAt.toISOString(),
    completedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    organizationId: ORGANIZATION_ID || null,
    entityId: ENTITY_ID || null,
    staticOnly: STATIC_ONLY,
    pageChecks: PAGE_CHECKS,
    totals: { passed, failed, total: results.length },
    results,
  };

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log("\n================ RESULT ================");
  console.log(`PASSED=${passed}`);
  console.log(`FAILED=${failed}`);
  console.log(`TOTAL=${results.length}`);
  console.log(`REPORT=${reportPath}`);

  if (failed > 0) {
    console.log("FINANCE TOTAL CLOSURE SMOKE FAILED");
    process.exitCode = 1;
  } else {
    console.log("FINANCE TOTAL CLOSURE SMOKE PASSED");
  }
}

await main();
