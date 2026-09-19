import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const executive = read("lib/finance/reporting/reports/getExecutiveKPIs.js");
const kpis = read("app/api/finance/kpis/route.js");
const insights = read("app/api/finance/insights/route.js");

test("executive KPI report reads complete general-ledger population", () => {
  assert.match(executive, /Executive KPI general ledger population/);
  assert.match(executive, /fetchCompleteFinancePopulation/);
  assert.match(executive, /\.range\(from, to\)/);
  assert.doesNotMatch(executive, /limit\(10000\)/);
});

test("Finance KPI API cannot silently truncate management metrics at 10000 ledger rows", () => {
  assert.match(kpis, /Finance KPI general ledger population/);
  assert.match(kpis, /fetchCompleteFinancePopulation/);
  assert.match(kpis, /population\.rows/);
  assert.doesNotMatch(kpis, /limit\(10000\)/);
});

test("Finance insights derive margin and cash signals from complete ledger truth", () => {
  assert.match(insights, /Finance insights general ledger population/);
  assert.match(insights, /fetchCompleteFinancePopulation/);
  assert.match(insights, /population\.rows/);
  assert.doesNotMatch(insights, /limit\(10000\)/);
});
