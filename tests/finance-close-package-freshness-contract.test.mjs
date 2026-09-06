import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const freshnessRuntime = read("lib/finance/period-close/runtime/FinanceClosePackageFreshness.js");
const monthEndRoute = read("app/api/finance/month-end/close-period/route.js");
const yearEndRoute = read("app/api/finance/year-end/close-fiscal-year/route.js");
const freshnessRoute = read("app/api/workspace/finance/close-package-freshness/route.js");
const freshnessRail = read("components/workspace/finance/FinanceClosePackageFreshnessRail.jsx");
const closePage = read("app/(system)/workspace/[organizationId]/finance/close/page.jsx");
const reportingPage = read("app/(system)/workspace/[organizationId]/finance/reporting/page.jsx");

const expectedPopulations = [
  "general_ledger",
  "journal_entries",
  "finance_period_close_steps",
  "finance_bank_reconciliation_runs",
  "finance_vat_returns",
  "finance_statutory_filings",
  "finance_fx_revaluation_runs",
  "finance_depreciation_runs",
  "finance_review_items",
  "finance_review_signoffs",
  "finance_approval_requests",
];

test("Close-package freshness covers the accounting populations that can invalidate final close", () => {
  assert.match(freshnessRuntime, /FINANCE_CLOSE_PACKAGE_FINGERPRINT_VERSION = 1/);
  assert.match(freshnessRuntime, /fetchCompleteFinancePopulation/);
  for (const table of expectedPopulations) {
    assert.match(freshnessRuntime, new RegExp(`\\.from\\(\"${table}\"\\)`), `Missing close-package population ${table}`);
  }
  assert.match(freshnessRuntime, /General ledger changed after close/);
  assert.match(freshnessRuntime, /Bank reconciliation evidence changed/);
  assert.match(freshnessRuntime, /VAT or statutory filing evidence changed/);
  assert.match(freshnessRuntime, /FX or depreciation close evidence changed/);
  assert.match(freshnessRuntime, /Review or approval evidence changed/);
});

test("Close-package fingerprint is deterministic and ignores only explicitly volatile timestamps", () => {
  assert.match(freshnessRuntime, /createHash\(\"sha256\"\)/);
  assert.match(freshnessRuntime, /\.sort\(\(left, right\) => JSON\.stringify\(left\)\.localeCompare/);
  assert.match(freshnessRuntime, /\"created_at\"/);
  assert.match(freshnessRuntime, /\"updated_at\"/);
  assert.match(freshnessRuntime, /sectionDigests/);
  assert.match(freshnessRuntime, /scope: snapshot\.scope/);
  assert.match(freshnessRuntime, /state: comparison\.matches \? \"CURRENT\" : \"STALE\"/);
  assert.match(freshnessRuntime, /state: \"UNPROVEN\"/);
});

test("Month-end and year-end close record freshness only after the governed atomic close", () => {
  for (const [source, closeCommand, closeType] of [
    [monthEndRoute, "runMonthEndCloseCommand", "MONTH_END"],
    [yearEndRoute, "runYearEndCloseCommand", "YEAR_END"],
  ]) {
    const closeIndex = source.indexOf(`await ${closeCommand}`);
    const baselineIndex = source.indexOf("await recordFinanceClosePackageBaseline");
    assert.ok(closeIndex >= 0 && baselineIndex > closeIndex, `${closeType} baseline must be captured after atomic close`);
    assert.match(source, new RegExp(`closeType: \"${closeType}\"`));
    assert.match(source, /FINANCE_CLOSE_FRESHNESS_BASELINE_UNPROVEN/);
    assert.match(source, /closed: true/);
    assert.match(source, /status: 503/);
  }
});

test("A retry can never silently rebaseline a previously fingerprinted close", () => {
  const existingIndex = freshnessRuntime.indexOf("const existingFingerprint = closeRun.result?.package_fingerprint");
  const updateIndex = freshnessRuntime.indexOf(".update({ result: nextResult");
  assert.ok(existingIndex >= 0 && updateIndex > existingIndex, "Existing baseline must be checked before any close-run update");
  assert.match(freshnessRuntime, /if \(existingFingerprint\?\.digest\)/);
  assert.match(freshnessRuntime, /fingerprint: existingFingerprint/);
  assert.match(freshnessRuntime, /baseline_preserved: true/);
  assert.match(freshnessRuntime, /candidateFingerprint/);
});

test("Freshness read fails closed when the complete accounting population cannot be re-read", () => {
  assert.match(freshnessRoute, /buildFinanceClosePackageSnapshot/);
  assert.match(freshnessRoute, /evaluateFinanceClosePackageFreshness/);
  assert.match(freshnessRoute, /state: \"UNPROVEN\"/);
  assert.match(freshnessRoute, /trusted: false/);
  assert.match(freshnessRoute, /status = \/permission denied\|authentication\|membership\/i/);
  assert.match(freshnessRoute, /: 503/);
});

test("Close and reporting surfaces refuse to hide stale or unproven accounting packages", () => {
  assert.match(closePage, /FinanceClosePackageFreshnessRail/);
  assert.match(reportingPage, /FinanceClosePackageFreshnessRail/);
  assert.match(freshnessRail, /Freshness control unavailable — package not trusted/);
  assert.match(freshnessRail, /Re-open the affected work before relying on this close/);
  assert.match(freshnessRail, /Close package freshness is unproven/);
  assert.match(freshnessRail, /Live draft — period is not closed/);
  assert.match(freshnessRail, /changed_sections/);
  assert.match(freshnessRail, /changed_labels/);
  assert.match(freshnessRail, /bank-reconciliation/);
  assert.match(freshnessRail, /vat-returns/);
  assert.match(freshnessRail, /finance\/review/);
});

test("Close-package baseline stays inside the existing governed close run result", () => {
  assert.match(freshnessRuntime, /\.from\(\"finance_period_close_runs\"\)/);
  assert.match(freshnessRuntime, /package_fingerprint: fingerprint/);
  assert.match(freshnessRuntime, /\.update\(\{ result: nextResult/);
  assert.doesNotMatch(freshnessRuntime, /create table/i);
});
