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

function boundedConstSource(source, constName) {
  const start = source.indexOf(`const ${constName}`);
  if (start < 0) return "";
  const tail = source.slice(start);
  const end = tail.indexOf("});");
  return end >= 0 ? tail.slice(0, end + 3) : tail;
}

function topLevelObjectEntries(source, constName) {
  const block = boundedConstSource(source, constName);
  const matches = [...block.matchAll(/^\s{2}([a-z0-9_]+):\s*/gm)];
  const result = new Map();
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const end = index + 1 < matches.length ? matches[index + 1].index : block.length;
    result.set(match[1], block.slice(match.index, end));
  }
  return result;
}

function policyMode(segment) {
  return segment?.match(/\bmode\s*:\s*["'](none|create|action)["']/)?.[1] || null;
}

function policyHasExecutionEvidence(segment) {
  return /(endpoint|api|href|engine|capability)\s*:/.test(segment || "") ||
    /\btype\s*:\s*["']reports?["']/.test(segment || "");
}

function literalFinanceEndpoints(source) {
  const matches = source.matchAll(/["'`](\/api\/finance\/[^"'`?#\s]+(?:\?[^"'`\s]*)?)["'`]/g);
  return [...new Set([...matches].map((match) => match[1]))];
}

function endpointRoutePath(endpoint) {
  const pathname = String(endpoint || "").split("?")[0].replace(/^\//, "");
  return path.join("app", pathname, "route.js");
}

export async function auditFinanceWorldclassWorkflow() {
  const failures = [];
  const warnings = [];

  const files = {
    manifest: "lib/finance/runtime/financeCapabilityRuntimeManifest.json",
    presentation: "lib/finance/ui/FinanceCapabilityPresentation.js",
    policy: "lib/finance/ui/FinancePrimaryActionPolicy.js",
    renderer: "lib/platform/erp-engine/renderers/RendererRegistry.js",
    actionContract: "lib/platform/actions/ActionContract.js",
    records: "components/workspace/finance/FinanceAccountantRecordsWorkCenter.jsx",
    reviewPanel: "components/workspace/finance/FinanceRecordReviewPanel.jsx",
    reviewApi: "app/api/finance/review/route.js",
    commandCenter: "components/workspace/finance/FinanceCommandCenter.jsx",
    practiceControl: "components/workspace/finance/FinancePracticeControlTower.jsx",
    practiceApi: "app/api/workspace/finance/practice-control/route.js",
    migration: "supabase/migrations/20260902083500_finance_accountant_review_workflow.sql",
    reviewHistoryMigration: "supabase/migrations/20260902164500_finance_review_signoff_history.sql",
  };

  for (const required of Object.values(files)) {
    if (!exists(required)) fail(`Missing required Finance workflow file: ${required}`, failures);
  }
  if (failures.length) return { ok: false, failures, warnings, coverage: {} };

  const manifest = JSON.parse(read(files.manifest));
  const manifestIds = Object.keys(manifest);
  if (manifestIds.length !== 67) fail(`Expected 67 Finance runtime capabilities, found ${manifestIds.length}`, failures);

  const presentationEntries = topLevelObjectEntries(read(files.presentation), "FAMILY_BY_CAPABILITY");
  const policySource = read(files.policy);
  const policyEntries = topLevelObjectEntries(policySource, "FINANCE_PRIMARY_ACTION_POLICY");

  for (const id of manifestIds) {
    if (!presentationEntries.has(id)) fail(`Finance capability lacks presentation family: ${id}`, failures);
    if (!policyEntries.has(id)) fail(`Finance capability lacks primary action policy: ${id}`, failures);
  }
  for (const id of presentationEntries.keys()) if (!manifest[id]) fail(`Finance presentation references non-runtime capability: ${id}`, failures);
  for (const id of policyEntries.keys()) if (!manifest[id]) fail(`Finance action policy references non-runtime capability: ${id}`, failures);

  let readOnly = 0;
  let create = 0;
  let controlledAction = 0;
  let records = 0;
  let reports = 0;
  let processes = 0;

  for (const id of manifestIds) {
    const definition = manifest[id] || {};
    const segment = policyEntries.get(id) || "";
    const mode = policyMode(segment);
    if (definition.kind === "report") reports += 1;
    else if (definition.kind === "process") processes += 1;
    else records += 1;
    if (mode === "none") { readOnly += 1; continue; }
    if (mode === "create") { create += 1; continue; }
    if (mode === "action") {
      controlledAction += 1;
      if (!policyHasExecutionEvidence(segment)) fail(`Controlled Finance action lacks execution target: ${id}`, failures);
      continue;
    }
    fail(`Finance capability has unsupported primary action mode '${mode}': ${id}`, failures);
  }

  const endpointWarnings = [];
  for (const endpoint of literalFinanceEndpoints(policySource)) {
    const routePath = endpointRoutePath(endpoint);
    if (!exists(routePath)) endpointWarnings.push({ endpoint, routePath });
  }
  for (const item of endpointWarnings) warnings.push(`Primary Finance action endpoint has no direct route.js at ${item.routePath}: ${item.endpoint}`);

  const rendererSource = read(files.renderer);
  for (const token of ["FinanceAccountantRecordsWorkCenter", "FinanceAccountantReportWorkCenter", "FinanceAccountantProcessWorkCenter", "FinanceUnavailableWorkCenter"]) {
    if (!rendererSource.includes(token)) fail(`Finance renderer convergence missing: ${token}`, failures);
  }

  const actionContractSource = read(files.actionContract);
  for (const token of ["sanitizeActionList", "isActionExecutable", "hasActionExecutionTarget", "hasUsableCreateAction"]) {
    if (!actionContractSource.includes(token)) fail(`Executable-action safety contract missing: ${token}`, failures);
  }

  const recordsSource = read(files.records);
  for (const token of ["FinanceRecordReviewPanel", "statusFilter", "sortDirection", "savedViews", 'event.key === "/"', '"ArrowDown"', '"ArrowUp"', "saveCurrentView"]) {
    if (!recordsSource.includes(token)) fail(`Accountant explorer workflow feature missing: ${token}`, failures);
  }

  const reviewSource = read(files.reviewPanel);
  for (const token of ['"overview"', '"lines"', '"review"', '"documents"', '"audit"', '"PREPARER"', '"REVIEWER"', '"PARTNER"', "Partner clearance", "openNotes", "canPartnerClear", '"add_note"', '"resolve_note"']) {
    if (!reviewSource.includes(token)) fail(`Finance review workflow feature missing: ${token}`, failures);
  }

  const reviewApiSource = read(files.reviewApi);
  for (const token of ["requireOrganizationAccess", "checkFinancePermission", "finance_review_items", "finance_review_notes", "finance_review_signoffs", "finance_saved_views", "organization_documents", "organization_audit_logs", "signedRoles", "Preparer sign-off is required before reviewer sign-off", "Reviewer sign-off is required before partner clearance", "Resolve all open review points before final review clearance", "reviewItem?.id || recordKey"]) {
    if (!reviewApiSource.includes(token)) fail(`Governed Finance review API contract missing: ${token}`, failures);
  }

  const commandCenterSource = read(files.commandCenter);
  for (const token of ["FinancePracticeControlTower", "Accounting Control Center", "Review queue", "Overdue review", "Needs attention", "Finish the period with evidence", "Daily accounting", "Specialist capabilities"]) {
    if (!commandCenterSource.includes(token)) fail(`Finance command-center accounting-firm workflow missing: ${token}`, failures);
  }

  const practiceControlSource = read(files.practiceControl);
  for (const token of ["Practice control tower", "Accounting firm portfolio", "Ready", "Partner", "Overdue", "Review points", "Next deadline", "assigned_accountant", "assigned_reviewer"]) {
    if (!practiceControlSource.includes(token)) fail(`Finance practice-control UX missing: ${token}`, failures);
  }

  const practiceApiSource = read(files.practiceApi);
  for (const token of ["accounting_engagements", "accounting_client_profiles", "finance_review_items", "finance_review_notes", ".eq(\"accounting_firm_id\", access.organizationId)", ".in(\"organization_id\", clientIds)", "ready_for_review", "reviewed_pending_partner", "open_review_points", "next_deadline", "attention"]) {
    if (!practiceApiSource.includes(token)) fail(`Finance practice-control API contract missing: ${token}`, failures);
  }

  const migrationSource = read(files.migration);
  for (const table of ["finance_review_items", "finance_review_notes", "finance_review_signoffs", "finance_saved_views"]) {
    if (!migrationSource.includes(`alter table public.${table} enable row level security`)) fail(`Finance review table does not enable RLS in migration: ${table}`, failures);
  }

  const reviewHistoryMigration = read(files.reviewHistoryMigration);
  for (const token of ["cycle_no", "revoked_at", "finance_review_signoffs_history_idx"]) {
    if (!reviewHistoryMigration.includes(token)) fail(`Finance sign-off history migration contract missing: ${token}`, failures);
  }

  return {
    ok: failures.length === 0,
    failures,
    warnings,
    coverage: {
      capabilities: manifestIds.length,
      presentation: presentationEntries.size,
      primary_action_policy: policyEntries.size,
      read_only: readOnly,
      create,
      controlled_action: controlledAction,
      runtime_records: records,
      runtime_reports: reports,
      runtime_processes: processes,
      primary_action_endpoint_warnings: endpointWarnings.length,
      partner_clearance: true,
      review_point_clearance_gate: true,
      review_audit_identity: true,
      accounting_firm_practice_control: true,
      cross_client_exception_workflow: true,
    },
  };
}

async function main() {
  const result = await auditFinanceWorldclassWorkflow();
  console.log("AVANTIQO FINANCE WORLDCLASS WORKFLOW AUDIT");
  console.log(JSON.stringify(result.coverage || {}, null, 2));
  for (const warning of result.warnings || []) console.warn(`WARN: ${warning}`);
  if (!result.ok) {
    for (const failure of result.failures || []) console.error(`FAIL: ${failure}`);
    process.exitCode = 1;
    return;
  }
  console.log("PASS: Finance workflow, presentation, action-safety, accountant-review and practice-control contracts are structurally covered.");
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  await main();
}
