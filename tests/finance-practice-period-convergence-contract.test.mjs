import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const lifecycle = fs.readFileSync("lib/finance/period-close/capabilities/PeriodLifecycle.js", "utf8");
const fiscalForm = fs.readFileSync("lib/platform/forms/FinanceFiscalPeriodFormContract.js", "utf8");
const route = fs.readFileSync("app/api/workspace/finance/practice-periods/route.js", "utf8");
const planner = fs.readFileSync("lib/finance/practice/recurringCyclePlanner.js", "utf8");
const gates = fs.readFileSync("lib/finance/practice/workProgramGates.js", "utf8");
const engagementFile = fs.readFileSync("app/api/workspace/finance/engagement-file/route.js", "utf8");
const reviewer = fs.readFileSync("lib/finance/practice/FinanceReviewerEvidenceRuntime.js", "utf8");
const tower = fs.readFileSync("components/workspace/finance/FinancePracticeControlTower.jsx", "utf8");

test("canonical fiscal-period creator writes the live accounting_periods schema", () => {
  assert.match(lifecycle, /\.from\("accounting_periods"\)/);
  assert.match(lifecycle, /fiscal_year: fiscalYear/);
  assert.match(lifecycle, /fiscal_month: fiscalMonth/);
  assert.match(lifecycle, /period_number: fiscalMonth/);
  assert.match(lifecycle, /period_name: String\(name\)\.trim\(\)/);
  assert.match(lifecycle, /legal_entity_id: entityId/);
  assert.doesNotMatch(lifecycle, /\bname: String\(name\)\.trim\(\)/);
  assert.doesNotMatch(lifecycle, /created_by: createdBy/);
});

test("normal Fiscal Period form requires exact legal-entity scope", () => {
  assert.match(fiscalForm, /name: "entity_id"/);
  assert.match(fiscalForm, /lookup: "legal_entities"/);
  assert.match(fiscalForm, /required: true/);
});

test("practice period creation is candidate-bound and server recomputed", () => {
  assert.match(route, /planRecurringAccountingCycles/);
  assert.match(route, /candidate\.status !== "BLOCKED_PERIOD_CONFIGURATION"/);
  assert.match(route, /organizationId: candidate\.organization_id/);
  assert.match(route, /entityId: candidate\.entity_id/);
  assert.match(route, /startDate: clean\(candidate\.start_at\)/);
  assert.match(route, /endDate: clean\(candidate\.due_at\)/);
  assert.match(route, /no_external_message: true/);
});
test("practice runtime reads canonical accounting periods end to end", () => {
  assert.match(planner, /\.from\("accounting_periods"\)/);
  assert.doesNotMatch(planner, /financial_periods/);
  assert.match(gates, /\.from\("accounting_periods"\)/);
  assert.doesNotMatch(gates, /financial_periods/);
  assert.match(engagementFile, /\.from\("accounting_periods"\)/);
  assert.doesNotMatch(engagementFile, /financial_periods/);
  assert.match(reviewer, /source: "accounting_periods"/);
  assert.doesNotMatch(reviewer, /financial_periods/);
});

test("cycle blocker has a deliberate exact client-period action", () => {
  assert.match(tower, /createClientPeriod/);
  assert.match(tower, /\/api\/workspace\/finance\/practice-periods/);
  assert.match(tower, /Create client period/);
  assert.match(tower, /candidate\.status === "BLOCKED_PERIOD_CONFIGURATION"/);
});
