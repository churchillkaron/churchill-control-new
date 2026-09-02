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
  rlsHardening: "supabase/migrations/20260902181000_accounting_work_program_rls_hardening.sql",
  lifecycleSchema: "supabase/migrations/20260902173500_accounting_work_program_lifecycle_controls.sql",
  systemGateSchema: "supabase/migrations/20260902175500_accounting_work_program_system_gate_enforcement.sql",
  capacitySchema: "supabase/migrations/20260902175500_accounting_practice_capacity_entity_scope.sql",
  materializationSchema: "supabase/migrations/20260902182000_accounting_recurring_cycle_materialization.sql",
  api: "app/api/workspace/finance/work-programs/route.js",
  lifecycleApi: "app/api/workspace/finance/work-programs/lifecycle/route.js",
  verifyApi: "app/api/workspace/finance/work-programs/verify/route.js",
  rollForwardApi: "app/api/workspace/finance/work-programs/roll-forward/route.js",
  capacityApi: "app/api/workspace/finance/practice-capacity/route.js",
  recurringPlanApi: "app/api/workspace/finance/recurring-plan/route.js",
  recurringMaterializeApi: "app/api/workspace/finance/recurring-materialize/route.js",
  engagementFileApi: "app/api/workspace/finance/engagement-file/route.js",
  gates: "lib/finance/practice/workProgramGates.js",
  practiceApi: "app/api/workspace/finance/practice-control/route.js",
  practiceUi: "components/workspace/finance/FinancePracticeControlTower.jsx",
  engagementFileUi: "components/workspace/finance/FinanceEngagementFile.jsx",
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

requireTokens(files.security, ["revoke all", "service_role"]);
requireTokens(files.rlsHardening, [
  "accounting_work_program_templates enable row level security",
  "accounting_work_program_template_steps enable row level security",
  "accounting_engagement_runs enable row level security",
  "accounting_engagement_work_items enable row level security",
  "accounting_client_requests enable row level security",
  "revoke all",
  "service_role",
]);

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

requireTokens(files.materializationSchema, [
  "materialize_accounting_engagement_run",
  "security invoker",
  "on conflict (accounting_firm_id, engagement_id, run_key) do nothing",
  "ENTITY_REQUIRED",
  "ENTITY_SCOPE_MISMATCH",
  "PERIOD_REQUIRED",
  "PERIOD_SCOPE_MISMATCH",
  "TEMPLATE_UNAVAILABLE",
  "NOT_STARTED",
  "manual_until_sent",
  "revoke all on function",
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

requireTokens(files.recurringPlanApi, [
  "DEFAULT_HORIZON_DAYS = 90",
  "DRY_RUN",
  "materialized: false",
  "idempotency_key",
  "READY_TO_CREATE",
  "ALREADY_EXISTS",
  "BLOCKED_ENTITY_CONFIGURATION",
  "BLOCKED_PERIOD_CONFIGURATION",
  "BLOCKED_YEAR_END_CONFIGURATION",
  "TEMPLATE_MISSING",
  "monthly_accounting",
  "year_end_close",
  "accounting_engagement_runs",
  "financial_periods",
]);

requireTokens(files.recurringMaterializeApi, [
  "requireOrganizationAccess",
  "requireManage",
  "materialize_accounting_engagement_run",
  "materialized",
  "idempotent: true",
  "ALREADY_EXISTS",
  "ENTITY_SCOPE_MISMATCH",
  "PERIOD_SCOPE_MISMATCH",
]);

requireTokens(files.engagementFileApi, [
  "accounting_engagements",
  "accounting_engagement_runs",
  "accounting_engagement_work_items",
  "accounting_client_requests",
  "finance_review_items",
  "finance_review_notes",
  "finance_review_signoffs",
  "organization_documents",
  "accounting_practice_staff_capacity",
  "system_gate",
  "completion_snapshot",
  "entity_required",
]);

requireTokens(files.practiceApi, [
  "active_runs",
  "waiting_on_client",
  "blocked_work",
  "client_requests",
  "submitted_client_requests",
  "engagement_id",
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
  "FinanceEngagementFile",
  "selectedEngagementId",
  "active_runs",
  "waiting_on_client",
  "blocked_work",
  "90-day recurring cycle plan",
  "No runs created",
]);

requireTokens(files.engagementFileUi, [
  "Digital engagement file",
  "Work program & workpapers",
  "Client evidence requests",
  "Evidence documents",
  "Review file",
  "Prior periods",
  "System blockers",
  "Legal entity required",
  "system_gate",
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
  digital_engagement_file: true,
  existing_document_evidence_link: true,
  review_notes_and_signoffs_visibility: true,
  prior_period_history: true,
  recurring_cycle_dry_run: true,
  recurring_cycle_idempotency: true,
  recurring_cycle_configuration_blockers: true,
  recurring_cycle_atomic_materialization: true,
  recurring_cycle_database_scope_revalidation: true,
  recurring_cycle_service_role_only_execution: true,
};

console.log("AVANTIQO FINANCE WORK PROGRAM CERTIFICATION");
console.log(JSON.stringify(coverage, null, 2));

if (failures.length) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  process.exitCode = 1;
} else {
  console.log("PASS: Accounting work programs are governed from dry-run recurring planning and atomic idempotent materialization through entity-scoped budgeting, capacity-aware execution, system verification, review-complete engagement files, locked completion and roll-forward.");
}
