import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");
const rail = read("components/workspace/finance/FinanceTaxCalendarRail.jsx");
const portfolio = read("components/workspace/finance/FinanceTaxPortfolioRail.jsx");
const policy = read("lib/finance/tax/FinanceTaxCalendarPolicy.js");

test("Selected VAT filing shows one human deadline first with authority proof behind it", () => {
  assert.match(rail, /Statutory filing calendar/);
  assert.match(rail, /File by/);
  assert.match(rail, /Review filing method/);
  assert.match(rail, /Why this deadline/);
  assert.match(rail, /Base filing date/);
  assert.match(rail, /Authority-adjusted date/);
  assert.match(rail, /Recorded deadline/);
  assert.match(rail, /Revenue Department source/);
  assert.match(rail, /Changing the legal date never happens silently and requires authority evidence/);
  assert.match(rail, /Controlled human override/);
  assert.match(rail, /Apply governed deadline/);
});

test("Tax portfolio exposes a statutory deadline runway instead of KPI-only horizon tiles", () => {
  assert.match(portfolio, /const deadlineRunway = useMemo/);
  assert.match(portfolio, /row\.status !== "SUBMITTED" && row\.filing_due_date/);
  assert.match(portfolio, /localeCompare\(String\(right\.filing_due_date/);
  assert.match(portfolio, /\.slice\(0, 5\)/);
  assert.match(portfolio, /Statutory deadline runway/);
  assert.match(portfolio, /Next unfiled VAT obligations across the authorized practice/);
  assert.match(portfolio, /Ordered by governed filing date, not client chasing/);
  assert.match(portfolio, /Switch entity/);
  assert.match(portfolio, /Business Context stays fixed until the legal entity is deliberately switched/);
});

test("Calendar authority remains governed policy with evidence-required overrides", () => {
  assert.match(policy, /TH_PP30_CALENDAR_V1/);
  assert.match(policy, /OFFICIAL_CALENDAR_VERIFIED/);
  assert.match(policy, /Thailand Revenue Department/);
  assert.match(policy, /Deadline override requires a reason and authority evidence reference/);
  assert.match(policy, /blocks_submission: true/);
});
