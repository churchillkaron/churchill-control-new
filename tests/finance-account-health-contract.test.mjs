import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const financePage = read("app/(system)/workspace/[organizationId]/finance/page.jsx");
const panel = read("components/workspace/finance/FinanceAccountHealthPanel.jsx");
const closeRail = read("components/workspace/finance/FinanceContinuousCloseRail.jsx");
const route = read("app/api/workspace/finance/account-health/route.js");
const engine = read("lib/finance/ui/FinanceAccountHealth.js");
const runtime = read("lib/finance/ui/loadFinanceAccountHealthRuntime.js");

test("Finance landing places account health inside the close-to-work hierarchy", () => {
  assert.match(financePage, /FinanceAccountHealthPanel/);
  const closeIndex = financePage.indexOf("<FinanceContinuousCloseRail");
  const healthIndex = financePage.indexOf("<FinanceAccountHealthPanel");
  const overviewIndex = financePage.indexOf("<FinanceAccountantOverview");
  assert.ok(healthIndex > closeIndex);
  assert.ok(overviewIndex > healthIndex);
});

test("account health is deterministic and prioritizes structural accounting truth", () => {
  assert.match(engine, /opposite the configured/);
  assert.match(engine, /no bank-account mapping/);
  assert.match(engine, /unresolved difference/);
  assert.match(engine, /No linked bank reconciliation is dated inside the selected accounting period/);
  assert.match(engine, /no reliable statement classification/);
  assert.match(engine, /state = raiseState\(state, "BLOCKED"\)/);
  assert.match(engine, /state = raiseState\(state, "ACTION_REQUIRED"\)/);
  assert.match(engine, /state = "WATCH"/);
});

test("movement signals are watches, not invented audit materiality", () => {
  assert.match(engine, /Period movement is at least as large as the opening balance/);
  assert.match(engine, /largest_line_share/);
  assert.doesNotMatch(engine, /materiality threshold/i);
  assert.match(panel, /No audit materiality claim is inferred/);
  assert.match(panel, /Structural accounting exceptions outrank statistical movement watches/);
});

test("account health uses the existing ledger, bank mapping and reconciliation truth", () => {
  assert.match(route, /loadFinanceAccountHealthRuntime/);
  assert.match(runtime, /loadLedgerAccountBalances/);
  assert.match(runtime, /from\("bank_accounts"\)/);
  assert.match(runtime, /finance_account_id/);
  assert.match(runtime, /from\("finance_bank_reconciliation_runs"\)/);
  assert.match(runtime, /periodStart/);
  assert.match(runtime, /asOfDate/);
  assert.match(route, /finance\.accounting\.view/);
});

test("continuous close consumes account integrity instead of creating an isolated dashboard", () => {
  assert.match(closeRail, /useFinanceLandingRuntime/);
  assert.match(closeRail, /accountHealth/);
  assert.match(closeRail, /Account integrity/);
  assert.match(closeRail, /account-level blocker/);
  assert.match(closeRail, /not a manually maintained progress score/);
  assert.doesNotMatch(panel, /MetricCard/);
  assert.doesNotMatch(panel, /recharts|chart\.js|react-chartjs/i);
});
