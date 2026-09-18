import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const readiness = fs.readFileSync("lib/finance/practice/FinancePracticeStaffingReadiness.js", "utf8");
const planner = fs.readFileSync("lib/finance/practice/recurringCyclePlanner.js", "utf8");
const assignmentRoute = fs.readFileSync("app/api/workspace/finance/practice-assignments/route.js", "utf8");
const assignmentUi = fs.readFileSync("components/workspace/finance/FinancePracticeAssignments.jsx", "utf8");
const migration = fs.readFileSync("supabase/migrations/20260918160132_accounting_practice_portal_access_integrity.sql", "utf8");
const recurringRoute = fs.readFileSync("app/api/workspace/finance/recurring-materialize/route.js", "utf8");
const manualRoute = fs.readFileSync("app/api/workspace/finance/work-programs/route.js", "utf8");
const rollForwardRoute = fs.readFileSync("app/api/workspace/finance/work-programs/roll-forward/route.js", "utf8");

test("practice staffing readiness requires linked portal access as well as active membership", () => {
  assert.match(readiness, /linked portal access/);
  assert.match(planner, /auth_user_id/);
  assert.match(planner, /portalReadyStaffIds/);
  assert.match(planner, /validStaffIds/);
});

test("staffing picker exposes access readiness and blocks non-login owners", () => {
  assert.match(assignmentRoute, /portal_access_ready: Boolean\(row\.auth_user_id\)/);
  assert.match(assignmentUi, /access setup required/);
  assert.match(assignmentUi, /selectedWithoutAccess/);
  assert.match(assignmentUi, /portalReadyCount < 3/);
  assert.match(assignmentUi, /Three portal-ready active firm members are required/);
  assert.match(assignmentUi, /people\/directory/);
});

test("database client-profile assignments require portal-ready active firm members", () => {
  assert.match(migration, /accounting_staff_portal_ready/);
  assert.match(migration, /s\.auth_user_id is not null/);
  assert.match(migration, /accounting_client_profile_portal_access_guard/);
  assert.match(migration, /PREPARER_PORTAL_ACCESS_REQUIRED/);
  assert.match(migration, /REVIEWER_PORTAL_ACCESS_REQUIRED/);
  assert.match(migration, /PARTNER_PORTAL_ACCESS_REQUIRED/);
  assert.match(migration, /PREPARER_REVIEWER_SEGREGATION_REQUIRED/);
});

test("run creation rechecks portal readiness independently of planner state", () => {
  assert.match(migration, /validate_accounting_engagement_run_portal_access/);
  assert.match(migration, /accounting_engagement_run_portal_access_guard/);
  assert.match(migration, /accounting_staff_portal_ready\(new\.accounting_firm_id/);
});

test("portal staffing functions are invoker-safe and service-role isolated", () => {
  assert.match(migration, /security invoker/gi);
  assert.match(migration, /revoke all on function public\.accounting_staff_portal_ready/);
  assert.match(migration, /revoke all on function public\.validate_accounting_client_profile_portal_access/);
  assert.match(migration, /revoke all on function public\.validate_accounting_engagement_run_portal_access/);
  assert.match(migration, /to service_role/);
});

test("all run creation APIs expose portal-access failures as configuration conflicts", () => {
  for (const route of [recurringRoute, manualRoute, rollForwardRoute]) {
    assert.match(route, /PORTAL_ACCESS_REQUIRED/);
    assert.match(route, /409/);
  }
});
