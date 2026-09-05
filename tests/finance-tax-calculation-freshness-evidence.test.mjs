import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");
const route = read("app/api/finance/vat-returns/evidence-drilldown/route.js");
const rail = read("components/workspace/finance/FinanceTaxEvidenceDrilldownRail.jsx");
const preflight = read("lib/finance/tax/FinanceVatReturnPreflight.js");
const methodPolicy = read("lib/finance/tax/FinanceVatCalculationMethodPolicy.js");

test("Calculation freshness evidence comes from the same live preflight comparison that blocks filing", () => {
  assert.match(preflight, /const freshnessReasons = \[\]/);
  assert.match(preflight, /output document count/);
  assert.match(preflight, /credit note count/);
  assert.match(preflight, /input document count/);
  assert.match(preflight, /output VAT/);
  assert.match(preflight, /input VAT/);
  assert.match(preflight, /tax payable/);
  assert.match(preflight, /tax refund/);
  assert.match(preflight, /source evidence changed after calculation/);
  assert.match(preflight, /calculation timestamp is missing/);
  assert.match(preflight, /calculation_stale: calculationStale/);
  assert.match(methodPolicy, /calculation method changed from/);
  assert.match(methodPolicy, /calculation method is missing; current method is/);
  assert.match(methodPolicy, /freshness_reasons: \[\.\.\.new Set\(\[\.\.\.existingReasons, freshnessReason\]\)\]/);
});

test("Evidence API exposes stored and live calculation proof without creating a second freshness authority", () => {
  assert.match(route, /function buildCalculationEvidence\(current\)/);
  assert.match(route, /const calculated = current\?\.calculated \|\| \{\}/);
  assert.match(route, /const storedValues = calculated\?\.values/);
  assert.match(route, /const liveValues = current\?\.current/);
  assert.match(route, /freshness_reasons: freshnessReasons/);
  assert.match(route, /stale: current\?\.calculation_stale === true/);
  assert.match(route, /stored: calculationSnapshot\(storedValues\)/);
  assert.match(route, /live: calculationSnapshot\(liveValues\)/);
  assert.match(route, /calculation_evidence: upper\(item\?\.source_type\) === "VAT_CALCULATION_CONTEXT" \? governedCalculationEvidence : null/);
  assert.match(route, /resolution_authority: FINANCE_TAX_EVIDENCE_RESOLUTION_AUTHORITY/);
  assert.doesNotMatch(route, /mark.*fresh|acknowledge.*fresh/i);
});

test("Calculation freshness blocker is accountant-readable and only hands back to the selected VAT calculation", () => {
  assert.match(rail, /function CalculationReview\(\{ evidence, issue, onOpenReturn \}\)/);
  assert.match(rail, /VAT calculation freshness proof/);
  assert.match(rail, /Stored calculation vs live governed evidence/);
  assert.match(rail, /Recalculation required/);
  assert.match(rail, /Stored calculation/);
  assert.match(rail, /Stored method/);
  assert.match(rail, /Current governed method/);
  assert.match(rail, /Sales documents/);
  assert.match(rail, /Credit notes/);
  assert.match(rail, /Purchase documents/);
  assert.match(rail, /Output VAT/);
  assert.match(rail, /Input VAT/);
  assert.match(rail, /Tax payable/);
  assert.match(rail, /Tax refund/);
  assert.match(rail, /Why the calculation is stale/);
  assert.match(rail, /These reasons come from live Tax preflight/);
  assert.match(rail, /only a new governed calculation from live evidence can clear freshness/);
  assert.match(rail, /Return to VAT calculation/);
  assert.match(rail, /<CalculationReview evidence=\{calculationEvidence\} issue=\{issue\} onOpenReturn=\{onOpenCalendar\}\/>/);
  assert.match(rail, /!calendarEvidence && !calculationEvidence/);
  assert.match(rail, /onStageChange\("RETURN"\)/);
  assert.doesNotMatch(rail, /Mark fresh|Acknowledge freshness|Resolve freshness/);
});

test("Freshness Evidence remains read-only and cannot recalculate VAT itself", () => {
  assert.match(rail, /Evidence is read-only and cannot mark a calculation fresh/);
  assert.match(rail, /cannot post, recode, alter FX, update a VAT rule, recalculate VAT, complete work, or mutate Business Context/);
  assert.doesNotMatch(route, /calculate_finance_vat_return/);
  assert.doesNotMatch(route, /\.insert\(|\.update\(|\.delete\(/);
});
