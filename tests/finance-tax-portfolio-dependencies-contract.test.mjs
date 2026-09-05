import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");
const policy = read("lib/finance/tax/FinanceTaxPortfolioPolicy.js");
const route = read("app/api/finance/tax/portfolio/route.js");
const rail = read("components/workspace/finance/FinanceTaxPortfolioRail.jsx");
const wrapper = read("components/workspace/finance/FinanceTaxWorkCenter.jsx");

test("Tax portfolio rebuilds live filing dependencies with bounded concurrency and legal-day ranking", () => {
  assert.match(route, /const PREFLIGHT_CONCURRENCY = 3/);
  assert.match(route, /mapWithConcurrency\(openReturns, PREFLIGHT_CONCURRENCY/);
  assert.match(route, /buildFinanceVatReturnPreflight/);
  assert.match(route, /applyFinanceTaxCalendarToPreflight\(raw, \{ now \}\)/);
  assert.match(route, /applyFinanceVatCalculationMethodToPreflight/);
  assert.match(route, /deriveFinanceTaxCloseGuidance/);
  assert.match(route, /getFinanceTaxLegalClock\(\{ jurisdictionCode: vatReturn\.jurisdiction_code, now \}\)/);
  assert.match(route, /today: legalClock\.legal_date/);
});

test("Tax portfolio fails closed per filing when live preflight cannot be rebuilt", () => {
  assert.match(route, /LIVE_PREFLIGHT_UNAVAILABLE/);
  assert.match(route, /Restore live Tax evidence check/);
  assert.match(route, /truth_state: "OPEN_BLOCKER"/);
  assert.match(route, /manual_complete_allowed: false/);
  assert.match(route, /Portfolio readiness failed closed because live Tax evidence could not be rebuilt/);
});

test("Tax portfolio merges coordination and governed client request context without changing truth", () => {
  assert.match(route, /finance_tax_dependency_work_envelopes/);
  assert.match(route, /accounting_client_requests/);
  assert.match(route, /buildFinanceTaxDependencyPortfolioRows/);
  assert.match(route, /resolution_authority: "LIVE_TAX_PREFLIGHT_ONLY"/);
  assert.match(route, /scope: "AUTHORIZED_ORGANIZATION_LEGAL_ENTITIES"/);
  assert.match(policy, /owned_by_me: ownedByMe/);
  assert.match(policy, /unowned: !envelope\?\.assigned_to/);
  assert.match(policy, /client_request_state: requestStatus/);
  assert.match(policy, /manual_complete_allowed: false/);
});

test("Tax portfolio ranks statutory risk before dependency and coordination signals", () => {
  assert.match(policy, /Number\(filing\.priority \|\| 0\) \* 100/);
  assert.match(policy, /dependencyUrgency \* 5/);
  assert.match(policy, /coordinationBoost/);
  assert.match(policy, /target_overdue: targetOverdue/);
  assert.match(policy, /client_request_state === "CLIENT_RESPONDED"/);
});

test("Tax control tower exposes accountant work views and opens only the exact current-entity filing", () => {
  assert.match(rail, /\["MINE", "Mine"\]/);
  assert.match(rail, /\["UNOWNED", "Unowned"\]/);
  assert.match(rail, /\["CLIENT", "Client evidence"\]/);
  assert.match(rail, /\["DEADLINE", "Deadline ≤7d"\]/);
  assert.match(rail, /\["ACCOUNTANT", "Accountant blockers"\]/);
  assert.match(rail, /body\.scope !== "AUTHORIZED_ORGANIZATION_LEGAL_ENTITIES"/);
  assert.match(rail, /body\.resolution_authority !== "LIVE_TAX_PREFLIGHT_ONLY"/);
  assert.match(rail, /if \(row\.entity_id !== entityId\) return/);
  assert.match(rail, /onSelectedVatReturnIdChange\?\.\(row\.vat_return_id \|\| row\.id\)/);
  assert.match(rail, /Switch entity first/);
  assert.match(wrapper, /onSelectedVatReturnIdChange=\{setSelectedVatReturnId\}/);
  assert.doesNotMatch(rail, />\s*(Complete|Resolve|Close dependency)\s*</i);
});
