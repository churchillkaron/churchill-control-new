import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

const practiceTimeRoute = read("app/api/workspace/finance/practice-time/route.js");
const practiceTimeUi = read("components/workspace/finance/FinancePracticeTimeWip.jsx");

test("practice billing tax rules are jurisdiction-aware sales taxes and semantically deduplicated", () => {
  assert.match(practiceTimeRoute, /regimeMatchesCountry/);
  assert.match(practiceTimeRoute, /salesTaxRule/);
  assert.match(practiceTimeRoute, /effectiveToday/);
  assert.match(practiceTimeRoute, /dedupeBillingTaxRules/);
  assert.match(practiceTimeRoute, /taxRules\.filter\(\(rule\) => salesTaxRule\(rule\) && effectiveToday\(rule\)/);
  assert.match(practiceTimeRoute, /applicable_countries/);
});

test("practice billing rejects stale or cross-jurisdiction tax rule ids on save", () => {
  assert.match(practiceTimeRoute, /Choose the billing entity before selecting a tax rule/);
  assert.match(practiceTimeRoute, /!salesTaxRule\(taxRule\)/);
  assert.match(practiceTimeRoute, /!effectiveToday\(taxRule\)/);
  assert.match(practiceTimeRoute, /!regimeMatchesCountry\(taxRule\.tax_regime, billingEntity\.country\)/);
  assert.match(practiceTimeRoute, /does not apply to the billing entity jurisdiction and current effective date/);
});

test("Time and WIP tax dropdown follows the selected billing entity jurisdiction", () => {
  assert.match(practiceTimeUi, /selectedBillingEntity/);
  assert.match(practiceTimeUi, /applicableTaxRules/);
  assert.match(practiceTimeUi, /rule\.applicable_countries/);
  assert.match(practiceTimeUi, /Choose billing entity first/);
  assert.match(practiceTimeUi, /No active sales tax rule for this jurisdiction/);
  assert.match(practiceTimeUi, /taxRuleId: "", taxTreatmentConfirmed: false/);
});

test("Time and WIP billing references hand off to canonical governed creators", () => {
  assert.match(practiceTimeUi, /finance\/customers\?create=1/);
  assert.match(practiceTimeUi, /finance\/chart-of-accounts\?create=1/);
  assert.match(practiceTimeUi, /finance\/tax-codes\?create=1/);
  assert.match(practiceTimeUi, /Create customer/);
  assert.match(practiceTimeUi, /Create account/);
  assert.match(practiceTimeUi, /Create tax rule/);
  assert.match(practiceTimeUi, /target="_blank"/);
});
