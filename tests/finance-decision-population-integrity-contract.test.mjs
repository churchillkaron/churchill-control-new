import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const health = read("lib/finance/ui/loadFinanceAccountHealthRuntime.js");
const rates = read("lib/finance/currencies/FinanceExchangeRateResolver.js");
const intercompany = read("lib/finance/intercompany/IntercompanyPolicy.js");
const sequences = read("lib/finance/number-sequences/FinanceNumberSequencePolicy.js");
const fxRoute = read("app/api/finance/fx-revaluation/runtime/route.js");

test("Account Health reads complete bank and reconciliation populations", () => {
  assert.match(health, /fetchCompleteFinancePopulation/);
  assert.match(health, /Account Health bank accounts/);
  assert.match(health, /Account Health bank reconciliation runs/);
  assert.match(health, /\.range\(from, to\)/);
  const block = health.slice(health.indexOf("const [closingResult"), health.indexOf("const health = buildFinanceAccountHealth"));
  assert.doesNotMatch(block, /limit\(500\)/);
});

test("Finance exchange-rate resolution filters exact direct and inverse pair before completeness paging", () => {
  assert.match(rates, /loadPairRates/);
  assert.match(rates, /base_currency\.eq\.\$\{leftCurrency\}/);
  assert.match(rates, /quote_currency\.eq\.\$\{rightCurrency\}/);
  assert.match(rates, /base_currency\.eq\.\$\{rightCurrency\}/);
  assert.match(rates, /quote_currency\.eq\.\$\{leftCurrency\}/);
  assert.match(rates, /fetchCompleteFinancePopulation/);
  const block = rates.slice(rates.indexOf("export async function resolveFinanceExchangeRate"), rates.indexOf("export const FinanceExchangeRateResolver"));
  assert.doesNotMatch(block, /limit\(250\)/);
});

test("intercompany exchange-rate resolution uses exact pair evidence rather than newest 250 unrelated rates", () => {
  const block = intercompany.slice(intercompany.indexOf("async function resolveConfiguredRate"), intercompany.indexOf("async function assertAccounts"));
  assert.match(block, /pairFilter/);
  assert.match(block, /fetchCompleteFinancePopulation/);
  assert.match(block, /\.or\(pairFilter\)/);
  assert.doesNotMatch(block, /limit\(250\)/);
});

test("number-sequence scope cannot change after any matching allocated alias regardless of row count", () => {
  const block = sequences.slice(sequences.indexOf("async function assertNoScopeChangeAfterUse"), sequences.indexOf("export async function validateNumberSequenceWrite"));
  assert.match(block, /Promise\.all\(aliases\.map/);
  assert.match(block, /\.ilike\("document_type", literal\)/);
  assert.match(block, /matches\.some\(Boolean\)/);
  assert.doesNotMatch(block, /limit\(250\)/);
});

test("FX revaluation currency and account inputs use complete populations while run history stays presentation-bounded", () => {
  const block = fxRoute.slice(fxRoute.indexOf("async function loadWorkspaceData"), fxRoute.indexOf("async function loadExistingRun"));
  assert.match(block, /FX revaluation chart of accounts/);
  assert.match(block, /FX revaluation exchange rates/);
  assert.match(block, /accountResult\.rows/);
  assert.match(block, /rateResult\.rows/);
  const beforeRuns = block.slice(0, block.indexOf('from("finance_fx_revaluation_runs")'));
  assert.doesNotMatch(beforeRuns, /limit\(500\)|limit\(1000\)/);
  assert.match(block, /finance_fx_revaluation_runs[\s\S]*limit\(250\)/);
});
