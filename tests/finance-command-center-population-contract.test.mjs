import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const route = read("app/api/workspace/finance/command-center/route.js");
const helper = read("lib/finance/data/fetchCompleteFinancePopulation.js");

test("Finance population pagination detects overflow without rejecting an exact boundary", () => {
  assert.match(helper, /safeMaxRows \+ 1 - from/);
  assert.match(helper, /buildQuery\(from, to\)/);
  assert.match(helper, /rows\.length > safeMaxRows/);
  assert.match(helper, /silently truncated accounting population/);
});

test("Finance command-center metrics use complete populations instead of UI caps", () => {
  const populationSources = [
    "accounts_receivable",
    "vendor_invoices",
    "finance_approval_requests",
    "finance_bank_reconciliation_runs",
    "finance_period_close_steps",
    "finance_statutory_filings",
    "accounting_engagements",
    "finance_review_items",
  ];
  for (const source of populationSources) {
    assert.match(route, new RegExp(`safePopulation\\(\\"${source}\\"`));
  }
  assert.doesNotMatch(route, /\.limit\(5000\)/);
  assert.match(route, /population_complete:/);
  assert.match(route, /population: source\.population/);
});

test("current-period control metrics are scoped before pagination", () => {
  assert.match(route, /reconciliation_date\", periodStart/);
  assert.match(route, /reconciliation_date\", periodEnd/);
  assert.match(route, /entity_id\.is\.null,entity_id\.eq\.\$\{resolvedEntityId\}/);
  assert.match(route, /period_id\.is\.null,period_id\.eq\.\$\{resolvedPeriodId\}/);
});

test("display samples stay bounded after complete accounting truth is loaded", () => {
  assert.match(route, /recentWorkRows\.slice\(0, 8\)/);
  assert.match(route, /reviewItems\.slice\(0, 12\)/);
  assert.match(route, /openReconciliations\.slice\(0, 5\)/);
  assert.match(route, /approvals\.slice\(0, 5\)/);
  assert.match(route, /active_clients: engagements\.length/);
});
