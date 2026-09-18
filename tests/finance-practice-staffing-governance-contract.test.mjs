import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { evaluatePracticeStaffingReadiness } from "../lib/finance/practice/FinancePracticeStaffingReadiness.js";

const planner = fs.readFileSync("lib/finance/practice/recurringCyclePlanner.js", "utf8");
const materialize = fs.readFileSync("app/api/workspace/finance/recurring-materialize/route.js", "utf8");
const assignmentRoute = fs.readFileSync("app/api/workspace/finance/practice-assignments/route.js", "utf8");
const assignmentUi = fs.readFileSync("components/workspace/finance/FinancePracticeAssignments.jsx", "utf8");
const engagementFile = fs.readFileSync("components/workspace/finance/FinanceEngagementFile.jsx", "utf8");
const tower = fs.readFileSync("components/workspace/finance/FinancePracticeControlTower.jsx", "utf8");
const migration = fs.readFileSync("supabase/migrations/20260918151350_accounting_practice_staff_assignments.sql", "utf8");

const STEPS = [
  { required_role: "CLIENT" },
  { required_role: "PREPARER" },
  { required_role: "REVIEWER" },
  { required_role: "PARTNER" },
];

test("staffing readiness requires every internal role used by the template", () => {
  const result = evaluatePracticeStaffingReadiness({
    steps: STEPS,
    profile: { assigned_accountant_id: "preparer", assigned_reviewer_id: "reviewer" },
    validStaffIds: new Set(["preparer", "reviewer"]),
  });
  assert.equal(result.state, "BLOCKED_STAFF_ASSIGNMENT");
  assert.deepEqual(result.missing_roles, ["PARTNER"]);
  assert.match(result.blockers.join(" "), /partner/i);
});
test("staffing readiness enforces sign-off segregation before work is created", () => {
  const result = evaluatePracticeStaffingReadiness({
    steps: STEPS,
    profile: {
      assigned_accountant_id: "same",
      assigned_reviewer_id: "same",
      assigned_partner_id: "partner",
    },
    validStaffIds: new Set(["same", "partner"]),
  });
  assert.equal(result.state, "BLOCKED_STAFF_ASSIGNMENT");
  assert.ok(result.conflicts.some((row) => row.left === "PREPARER" && row.right === "REVIEWER"));
  assert.match(result.blockers.join(" "), /segregation of duties/i);
});

test("staffing readiness rejects inactive or stale firm assignments", () => {
  const result = evaluatePracticeStaffingReadiness({
    steps: STEPS,
    profile: {
      assigned_accountant_id: "preparer",
      assigned_reviewer_id: "reviewer",
      assigned_partner_id: "partner",
    },
    validStaffIds: new Set(["preparer", "reviewer"]),
  });
  assert.deepEqual(result.invalid_roles, ["PARTNER"]);
  assert.equal(result.state, "BLOCKED_STAFF_ASSIGNMENT");
});

test("staffing readiness passes only three valid distinct internal owners", () => {
  const result = evaluatePracticeStaffingReadiness({
    steps: STEPS,
    profile: {
      assigned_accountant_id: "preparer",
      assigned_reviewer_id: "reviewer",
      assigned_partner_id: "partner",
    },
    validStaffIds: new Set(["preparer", "reviewer", "partner"]),
  });
  assert.equal(result.state, "READY");
  assert.deepEqual(result.blockers, []);
});
test("recurring planner makes staffing a creation preflight, not post-creation cleanup", () => {
  assert.match(planner, /evaluatePracticeStaffingReadiness/);
  assert.match(planner, /status: "BLOCKED_STAFF_ASSIGNMENT"/);
  assert.match(planner, /active firm memberships/i);
  assert.match(planner, /staff_accounts/);
  assert.match(planner, /organization_users/);
  assert.match(materialize, /planRecurringAccountingCycles/);
  assert.match(materialize, /candidate\.status !== "READY_TO_CREATE"/);
});

test("staff assignment endpoint exposes only active firm members and uses atomic RPC", () => {
  assert.match(assignmentRoute, /organization_users/);
  assert.match(assignmentRoute, /\.eq\("status", "active"\)/);
  assert.match(assignmentRoute, /staff_accounts/);
  assert.match(assignmentRoute, /\.eq\("active", true\)/);
  assert.match(assignmentRoute, /accounting_update_client_staff_assignments/);
  assert.doesNotMatch(assignmentRoute, /\.from\("accounting_client_profiles"\)\s*\.update/);
});

test("staff assignment RPC atomically enforces membership segregation and audit proof", () => {
  assert.match(migration, /security invoker/i);
  assert.match(migration, /SEGREGATION_OF_DUTIES_ASSIGNMENTS_REQUIRED/);
  assert.match(migration, /organization_users/);
  assert.match(migration, /staff_accounts/);
  assert.match(migration, /ACCOUNTING_CLIENT_STAFF_ASSIGNMENTS_UPDATED/);
  assert.match(migration, /before_data/);
  assert.match(migration, /after_data/);
  assert.match(migration, /revoke all on function .* from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function .* to service_role/i);
});
test("staffing blockers have a direct human repair handoff into the client review file", () => {
  assert.match(assignmentUi, /Preparer/);
  assert.match(assignmentUi, /Reviewer/);
  assert.match(assignmentUi, /Partner/);
  assert.match(assignmentUi, /new Set\(\[form\.preparer, form\.reviewer, form\.partner\]\)\.size !== 3/);
  assert.match(assignmentUi, /Three active firm members are required/);
  assert.match(assignmentUi, /people\/directory/);
  assert.match(engagementFile, /FinancePracticeAssignments/);
  assert.match(engagementFile, /initialTab = "work"/);
  assert.match(tower, /blocked_staff_assignment/);
  assert.match(tower, /Fix staffing/);
  assert.match(tower, /openEngagement\(candidate\.engagement_id, "review"\)/);
  assert.match(tower, /onStaffingSaved/);
});
