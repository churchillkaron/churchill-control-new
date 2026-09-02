#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(ROOT, relativePath));
}

function fail(message, failures) {
  failures.push(message);
}

function literalFinanceEndpoints(source) {
  const matches = source.matchAll(/["'`](\/api\/finance\/[^"'`?#\s]+(?:\?[^"'`\s]*)?)["'`]/g);
  return [...new Set([...matches].map((match) => match[1]))];
}

function endpointRoutePath(endpoint) {
  const pathname = String(endpoint || "").split("?")[0].replace(/^\//, "");
  return path.join("app", pathname, "route.js");
}

function mappingKeys(source, constName) {
  const start = source.indexOf(`const ${constName}`);
  if (start < 0) return [];
  const tail = source.slice(start);
  const end = tail.indexOf("});");
  const block = end >= 0 ? tail.slice(0, end + 3) : tail;
  const keys = [];
  for (const match of block.matchAll(/^\s{2}([a-z0-9_]+):\s*["'{]/gm)) {
    keys.push(match[1]);
  }
  return [...new Set(keys)];
}

function capabilitySegment(registrySource, capabilityId) {
  const patterns = [
    `{ id: "${capabilityId}"`,
    `{ id:"${capabilityId}"`,
    `{id: "${capabilityId}"`,
    `{id:"${capabilityId}"`,
  ];
  const positions = patterns.map((pattern) => registrySource.indexOf(pattern)).filter((value) => value >= 0);
  if (!positions.length) return "";
  const start = Math.min(...positions);
  const next = registrySource.indexOf("{ id:", start + 8);
  const nextCompact = registrySource.indexOf("{id:", start + 8);
  const candidates = [next, nextCompact].filter((value) => value > start);
  const end = candidates.length ? Math.min(...candidates) : Math.min(registrySource.length, start + 12000);
  return registrySource.slice(start, end);
}

function hasCreateEvidence(segment) {
  if (!segment) return false;
  if (!/\bcreate\s*:/.test(segment)) return false;
  return /(endpoint|api|form|schema|engine|capability|action)\s*:/.test(segment);
}

export async function auditFinanceWorldclassWorkflow() {
  const failures = [];
  const warnings = [];

  const manifestPath = "lib/finance/runtime/financeCapabilityRuntimeManifest.json";
  const presentationPath = "lib/finance/ui/FinanceCapabilityPresentation.js";
  const policyPath = "lib/finance/ui/FinancePrimaryActionPolicy.js";
  const registryPath = "lib/platform/registry/erpRegistry.base.js";
  const workspaceContractsPath = "lib/finance/workspaces/FinanceWorkspaceContracts.js";
  const rendererRegistryPath = "lib/platform/erp-engine/renderers/RendererRegistry.js";
  const actionContractPath = "lib/platform/actions/ActionContract.js";
  const recordsPath = "components/workspace/finance/FinanceAccountantRecordsWorkCenter.jsx";
  const reviewPanelPath = "components/workspace/finance/FinanceRecordReviewPanel.jsx";
  const reviewApiPath = "app/api/finance/review/route.js";
  const migrationPath = "supabase/migrations/20260902083500_finance_accountant_review_workflow.sql";

  for (const required of [
    manifestPath,
    presentationPath,
    policyPath,
    registryPath,
    rendererRegistryPath,
    actionContractPath,
    recordsPath,
    reviewPanelPath,
    reviewApiPath,
    migrationPath,
  ]) {
    if (!exists(required)) fail(`Missing required Finance workflow file: ${required}`, failures);
  }

  if (failures.length) return { ok: false, failures, warnings };

  const manifest = JSON.parse(read(manifestPath));
  const manifestIds = Object.keys(manifest);
  if (manifestIds.length !== 67) {
    fail(`Expected 67 Finance runtime capabilities, found ${manifestIds.length}`, failures);
  }

  const presentationSource = read(presentationPath);
  const presentationIds = new Set(mappingKeys(presentationSource, "FAMILY_BY_CAPABILITY"));
  for (const id of manifestIds) {
    if (!presentationIds.has(id)) fail(`Finance capability lacks presentation family: ${id}`, failures);
  }

  const policyModule = await import(`${pathToFileURL(path.join(ROOT, policyPath)).href}?audit=${Date.now()}`);
  const policy = policyModule.FINANCE_PRIMARY_ACTION_POLICY || {};
  for (const id of manifestIds) {
    if (!policy[id]) fail(`Finance capability lacks primary action policy: ${id}`, failures);
  }

  const registrySource = read(registryPath);
  const workspaceContractsSource = exists(workspaceContractsPath) ? read(workspaceContractsPath) : "";

  let readOnly = 0;
  let create = 0;
  let action = 0;
  let report = 0;
  let process = 0;
  let records = 0;

  for (const id of manifestIds) {
    const definition = manifest[id] || {};
    const mode = policy[id]?.mode;
    if (definition.kind === "report") report += 1;
    else if (definition.kind === "process") process += 1;
    else records += 1;

    if (mode === "none") {
      readOnly += 1;
      if (policy[id]?.create?.enabled === true) fail(`Read-only policy exposes create: ${id}`, failures);
      continue;
    }

    if (mode === "action") {
      action += 1;
      const configured = policy[id]?.action || {};
      const executable = Boolean(
        configured.endpoint || configured.api || configured.href || configured.engine ||
        (configured.capability && configured.action) || ["report", "reports"].includes(configured.type)
      );
      if (!executable) fail(`Controlled Finance action lacks execution target: ${id}`, failures);
      continue;
    }

    if (mode === "create") {
      create += 1;
      const explicit = policy[id]?.create || {};
      const explicitEvidence = Boolean(
        explicit.endpoint || explicit.api || explicit.form || explicit.schema?.length || explicit.engine ||
        (explicit.capability && explicit.action)
      );
      const registryEvidence = hasCreateEvidence(capabilitySegment(registrySource, id));
      const contractEvidence = new RegExp(`["']${id}["']`).test(workspaceContractsSource);
      if (!explicitEvidence && !registryEvidence && !contractEvidence) {
        fail(`Create-mode Finance capability has no create contract evidence: ${id}`, failures);
      }
      continue;
    }

    fail(`Finance capability has unsupported primary action mode '${mode}': ${id}`, failures);
  }

  const endpointSources = [
    read(policyPath),
    JSON.stringify(manifest),
    registrySource,
    workspaceContractsSource,
  ].join("\n");

  const missingEndpointRoutes = [];
  for (const endpoint of literalFinanceEndpoints(endpointSources)) {
    if (endpoint.includes("${")) continue;
    const routePath = endpointRoutePath(endpoint);
    if (!exists(routePath)) missingEndpointRoutes.push({ endpoint, routePath });
  }
  for (const missing of missingEndpointRoutes) {
    warnings.push(`Referenced Finance endpoint has no direct route.js at ${missing.routePath}: ${missing.endpoint}`);
  }

  const rendererSource = read(rendererRegistryPath);
  for (const requiredToken of [
    "FinanceAccountantRecordsWorkCenter",
    "FinanceAccountantReportWorkCenter",
    "FinanceAccountantProcessWorkCenter",
    "FinanceUnavailableWorkCenter",
  ]) {
    if (!rendererSource.includes(requiredToken)) fail(`Finance renderer convergence missing: ${requiredToken}`, failures);
  }

  const actionContractSource = read(actionContractPath);
  for (const requiredToken of ["sanitizeActionList", "isActionExecutable", "hasActionExecutionTarget"]) {
    if (!actionContractSource.includes(requiredToken)) fail(`Executable-action safety contract missing: ${requiredToken}`, failures);
  }

  const recordsSource = read(recordsPath);
  for (const requiredToken of [
    "FinanceRecordReviewPanel",
    "statusFilter",
    "sortDirection",
    "savedViews",
    'event.key === "/"',
    '"ArrowDown"',
    '"ArrowUp"',
  ]) {
    if (!recordsSource.includes(requiredToken)) fail(`Accountant explorer workflow feature missing: ${requiredToken}`, failures);
  }

  const reviewSource = read(reviewPanelPath);
  for (const requiredToken of [
    '"overview"',
    '"lines"',
    '"review"',
    '"documents"',
    '"audit"',
    '"PREPARER"',
    '"REVIEWER"',
    '"add_note"',
    '"resolve_note"',
  ]) {
    if (!reviewSource.includes(requiredToken)) fail(`Finance review workflow feature missing: ${requiredToken}`, failures);
  }

  const reviewApiSource = read(reviewApiPath);
  for (const requiredToken of [
    "requireOrganizationAccess",
    "checkFinancePermission",
    "finance_review_items",
    "finance_review_notes",
    "finance_review_signoffs",
    "finance_saved_views",
    "organization_documents",
    "organization_audit_logs",
  ]) {
    if (!reviewApiSource.includes(requiredToken)) fail(`Governed Finance review API contract missing: ${requiredToken}`, failures);
  }

  const migrationSource = read(migrationPath);
  for (const table of ["finance_review_items", "finance_review_notes", "finance_review_signoffs", "finance_saved_views"]) {
    if (!migrationSource.includes(`alter table public.${table} enable row level security`)) {
      fail(`Finance review table does not enable RLS in migration: ${table}`, failures);
    }
  }

  return {
    ok: failures.length === 0,
    failures,
    warnings,
    coverage: {
      capabilities: manifestIds.length,
      presentation: presentationIds.size,
      read_only: readOnly,
      create,
      controlled_action: action,
      runtime_records: records,
      runtime_reports: report,
      runtime_processes: process,
      endpoint_route_warnings: missingEndpointRoutes.length,
    },
  };
}

async function main() {
  const result = await auditFinanceWorldclassWorkflow();
  console.log("AVANTIQO FINANCE WORLDCLASS WORKFLOW AUDIT");
  console.log(JSON.stringify(result.coverage || {}, null, 2));
  for (const warning of result.warnings || []) console.warn(`WARN: ${warning}`);
  if (!result.ok) {
    for (const failure of result.failures) console.error(`FAIL: ${failure}`);
    process.exitCode = 1;
    return;
  }
  console.log("PASS: Finance capability, presentation, action-safety, review and workflow contracts are structurally covered.");
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  await main();
}
