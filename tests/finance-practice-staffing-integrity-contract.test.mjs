import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const migration = fs.readFileSync("supabase/migrations/20260918154528_accounting_work_program_staffing_integrity.sql", "utf8");
const recurringRoute = fs.readFileSync("app/api/workspace/finance/recurring-materialize/route.js", "utf8");
const workProgramsRoute = fs.readFileSync("app/api/workspace/finance/work-programs/route.js", "utf8");
const rollForwardRoute = fs.readFileSync("app/api/workspace/finance/work-programs/roll-forward/route.js", "utf8");
const assignmentUi = fs.readFileSync("components/workspace/finance/FinancePracticeAssignments.jsx", "utf8");
const periodMigration = fs.readFileSync("supabase/migrations/20260918145743_accounting_practice_period_convergence.sql", "utf8");

test("database run creation independently enforces template-required staffing", () => {
  assert.match(migration, /validate_accounting_engagement_run_staffing/);
  assert.match(migration, /ENGAGEMENT_SCOPE_MISMATCH/);
  assert.match(migration, /before insert or update of accounting_firm_id, organization_id, engagement_id, template_id/i);
  assert.match(migration, /PREPARER_ASSIGNMENT_REQUIRED/);
  assert.match(migration, /REVIEWER_ASSIGNMENT_REQUIRED/);
  assert.match(migration, /PARTNER_ASSIGNMENT_REQUIRED/);
  assert.match(migration, /PREPARER_REVIEWER_SEGREGATION_REQUIRED/);
  assert.match(migration, /PREPARER_PARTNER_SEGREGATION_REQUIRED/);
  assert.match(migration, /REVIEWER_PARTNER_SEGREGATION_REQUIRED/);
  assert.match(migration, /PREPARER_NOT_ACTIVE_FIRM_MEMBER/);
  assert.match(migration, /REVIEWER_NOT_ACTIVE_FIRM_MEMBER/);
  assert.match(migration, /PARTNER_NOT_ACTIVE_FIRM_MEMBER/);
});
test("materialized role-owned work receives the exact configured owners", () => {
  assert.match(periodMigration, /when 'PREPARER' then v_profile\.assigned_accountant_id/);
  assert.match(periodMigration, /when 'REVIEWER' then v_profile\.assigned_reviewer_id/);
  assert.match(periodMigration, /when 'PARTNER' then v_profile\.assigned_partner_id/);
});

test("staffing changes synchronize only unfinished unsigned role-owned work", () => {
  assert.match(migration, /update public\.accounting_engagement_work_items i/);
  assert.match(migration, /r\.engagement_id = p_engagement_id/);
  assert.match(migration, /i\.completed_at is null/);
  assert.match(migration, /i\.status not in \('COMPLETE','SKIPPED'\)/);
  assert.match(migration, /finance_review_signoffs/);
  assert.match(migration, /s\.revoked_at is null/);
  assert.match(migration, /open_work_items_reassigned/);
  assert.match(migration, /historical_or_signed_work_items_preserved/);
});

test("recurring materialization exposes database staffing failures as configuration conflicts", () => {
  assert.match(recurringRoute, /ASSIGNMENT_REQUIRED/);
  assert.match(recurringRoute, /SEGREGATION_REQUIRED/);
  assert.match(recurringRoute, /NOT_ACTIVE_FIRM_MEMBER/);
  assert.match(recurringRoute, /409/);
});

test("shadow manual and roll-forward mutation authorities are retired", () => {
  assert.match(workProgramsRoute, /DIRECT_WORK_PROGRAM_CREATION_RETIRED/);
  assert.match(workProgramsRoute, /recurring-materialize/);
  assert.doesNotMatch(workProgramsRoute, /accounting_engagement_runs"\)\.insert/);
  assert.match(rollForwardRoute, /DIRECT_WORK_PROGRAM_ROLL_FORWARD_RETIRED/);
  assert.match(rollForwardRoute, /recurring-plan/);
  assert.match(rollForwardRoute, /recurring-materialize/);
  assert.doesNotMatch(rollForwardRoute, /accounting_engagement_runs"\)\.insert/);
});
test("staffing UI reports synchronized ownership without claiming history was rewritten", () => {
  assert.match(assignmentUi, /open_work_items_reassigned/);
  assert.match(assignmentUi, /historical_or_signed_work_items_preserved/);
  assert.match(assignmentUi, /signed or completed item/);
});

test("staffing integrity functions remain service-role isolated and invoker safe", () => {
  assert.match(migration, /security invoker/gi);
  assert.match(migration, /revoke all on function public\.validate_accounting_engagement_run_staffing\(\)/);
  assert.match(migration, /grant execute on function public\.validate_accounting_engagement_run_staffing\(\)[\s\S]*to service_role/);
  assert.match(migration, /revoke all on function public\.accounting_update_client_staff_assignments/);
  assert.match(migration, /grant execute on function public\.accounting_update_client_staff_assignments[\s\S]*to service_role/);
});
