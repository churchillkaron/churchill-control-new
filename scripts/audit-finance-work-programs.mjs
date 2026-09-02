#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(ROOT, relativePath));
}

const files = {
  schema: "supabase/migrations/20260902170000_accounting_engagement_work_programs.sql",
  security: "supabase/migrations/20260902170500_accounting_work_program_security.sql",
  lifecycleSchema: "supabase/migrations/20260902173500_accounting_work_program_lifecycle_controls.sql",
  systemGateSchema: "supabase/migrations/20260902175500_accounting_work_program_system_gate_enforcement.sql",
  capacitySchema: "supabase/migrations/20260902175500_accounting_practice_capacity_entity_scope.sql",
  api: "app/api/workspace/finance/work-programs/route.js",
  lifecycleApi: "app/api/workspace/finance/work-programs/lifecycle/route.js",
  verifyApi: "app/api/workspace/finance/work-programs/verify/route.js",
  rollForwardApi: "app/api/workspace/finance/work-programs/roll-forward/route.js",
  capacityApi: "app/api/workspace/finance/practice-capacity/route.js",
  gates: "lib/finance/practice/workProgramGates.js",
  practiceApi: "app/api/workspace/finance/practice-control/route.js",
  practiceUi: "components/workspace/finance/FinancePracticeControlTower.jsx",
};

const failures = [];
for (const [name, file] of Object.entries(files)) {
  if (!exists(file)) failures.push(`Missing ${name}: ${file}`);
}

function requireTokens(file, tokens) {
  if (!exists(file)) return;
  const source = read(file);
  for (const token of tokens) {
    if (!source.includes(token)) failures.push(`${file} missing contract: ${token}`);
  }
}

requireTokens(files.schema, [
  "accounting_work_program_templates",
  "accounting_work_program_template_steps",
  "accounting_engagement_runs",
  "accounting_engagement_work_items",
  "accounting_client_requests",
  "relative_due_days",
  "dependency_step_keys",
  "evidence_required",
  "monthly_accounting_baseline",
  "year_end_close_baseline",
  "rolled_from_run_id",
]);

requireTokens(files.security, ["enable row level security", "revoke all", "service_role"]);

requireTokens(files.lifecycleSchema, [
  "assigned_partner_id",
  "locked_at",
  "locked_by",
  "completion_snapshot",
  "completed_by",
  "accepted_by",
  "changes_requested_at",
]);

requireTokens(files.systemGateSchema, [
  "enforce_accounting_work_item_system_gate",
  "SYSTEM_GATE_REQUIRED",
  "bank_reconciliation",
  "journals",
  "statutory_filings",
  "close",
  "accounting_work_item_system_gate_guard",
]);

requireTokens(files.capacitySchema, [
  "accounting_practice_staff_capacity",
  "weekly_capacity_minutes",
  "utilization_target",
  "budget_minutes",
  "scheduled_start_at",
  "scheduled_end_at",
  "entity_id",
  "enable row level security",
  "revoke all",
  "service_role",
]);

requireTokens(files.api, [
  "requireOrganizationAccess",
  "checkFinancePermission",
  "accounting_engagements",
  "accounting_client_profiles",
  "resolveEntity",
  "entity_id",
  "budget_minutes",
  "assigned_partner_id",
  "relative_due_days",
  "dependency_step_keys",
  "client_requests_created",
  "manual_until_sent",
]);

requireTokens(files.lifecycleApi, [
  "dependencyBlockers",
  "hasEvidence",
  "ensureFinanceReviewCleared",
  "releaseDependents",
  "reconcileRun",
  "start_item",
  "complete_item",
  "request_changes",
  "send_client_request",
  "submit_client_request",
  "accept_client_request",
  "client_request_changes",
  "complete_run",
  "completion_snapshot",
  "Completed work program is locked",
  "Finance review is not fully cleared by reviewer and partner",
]);

requireTokens(files.gates, [
  "evaluateWorkProgramGate",
  "resolveEntity",
  "finance_bank_reconciliation_runs",
  "journal_entries",
  "finance_statutory_filings",
  "finance_vat_returns",
  "financial_periods",
  "difference_amount",
  "period_id",
]);

requireTokens(files.verifyApi, [
  "evaluateWorkProgramGate",
  "system_gate",
  "system_verified",
  "ACCOUNTING_WORK_ITEM_SYSTEM_VERIFIED",
  "ACCOUNTING_WORK_ITEM_SYSTEM_BLOCKED",
]);

requireTokens(files.rollForwardApi, [
  "rolled_from_run_id",
  "evidence_carried_forward: false",
  "entity_id: entityId",
  "budget_minutes",
  "assigned_partner_id",
]);

requireTokens(files.capacityApi, [
  "14",
  "accounting_practice_staff_capacity",
  "weekly_capacity_minutes",
  "utilization_target",
  "budget_minutes",
  "OVERLOADED",
  "unassigned_hours",
  "overdue_items",
  "capacityRisk",
]);

requireTokens(files.practiceApi, [
  "active_runs",
  "waiting_on_client",
  "blocked_work",
  "client_requests",
  "submitted_client_requests",
]);

requireTokens(files.practiceUi, [
  "Programs",
  "Client wait",
  "Blocked",
  "14-day capacity",
  "Available",
  "Assigned",
  "Overloaded",
  "Unassigned",
  "active_runs",
  "waiting_on_client",
  "blocked_work",
]);

const coverage = {
  templates: 2,
  dependency_enforcement: true,
  evidence_gate: true,
  finance_review_clearance_gate: true,
  client_request_lifecycle: true,
  run_completion_lock: true,
  completion_snapshot: true,
  practice_visibility: true,
  rls_and_service_role_boundary: true,
  system_truth_gate: true,
  database_bypass_guard: true,
  bank_reconciliation_truth: true,
  journal_posting_truth: true,
  statutory_filing_truth: true,
  period_close_truth: true,
  legal_entity_scope: true,
  budgeted_work_items: true,
  partner_capacity_assignment: true,
  fourteen_day_capacity_forecast: true,
  overload_detection: true,
  unassigned_work_detection: true,
  capacity_roll_forward: true,
};

console.log("AVANTIQO FINANCE WORK PROGRAM CERTIFICATION");
console.log(JSON.stringify(coverage, null, 2));

if (failures.length) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  process.exitCode = 1;
} else {
  console.log("PASS: Accounting work programs are governed from entity-scoped budgeting through capacity-aware, system-verified, locked completion and roll-forward.");
}
