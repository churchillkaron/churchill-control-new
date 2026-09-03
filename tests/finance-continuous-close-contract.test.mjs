import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const financePage = read("app/(system)/workspace/[organizationId]/finance/page.jsx");
const rail = read("components/workspace/finance/FinanceContinuousCloseRail.jsx");
const actionObject = read("lib/finance/ui/FinanceActionObject.js");

test("Finance landing surfaces continuous close before the accountant overview", () => {
  assert.match(financePage, /FinanceContinuousCloseRail/);
  const portfolioIndex = financePage.indexOf("<FinancePracticePortfolioFocus");
  const closeIndex = financePage.indexOf("<FinanceContinuousCloseRail");
  const overviewIndex = financePage.indexOf("<FinanceAccountantOverview");
  assert.ok(closeIndex > portfolioIndex);
  assert.ok(overviewIndex > closeIndex);
});

test("continuous close uses live accounting controls instead of a manually maintained score", () => {
  assert.match(rail, /Continuous close/);
  assert.match(rail, /Close readiness is derived from live accounting controls/);
  assert.match(rail, /buildFinanceContinuousCloseState/);
  assert.match(rail, /not a manually maintained progress score/i);
  assert.doesNotMatch(rail, /close readiness.*\d+%/i);
  assert.match(actionObject, /Bank reconciliation/);
  assert.match(actionObject, /Accounting review/);
  assert.match(actionObject, /Finance approvals/);
  assert.match(actionObject, /Statutory filings/);
  assert.match(actionObject, /Close procedures/);
  assert.match(actionObject, /Control-source integrity/);
});

test("Finance Action Object preserves human safety and ranks blocked work ahead of waiting", () => {
  assert.match(actionObject, /WAITING_ON_CLIENT/);
  assert.match(actionObject, /CHANGES_REQUESTED/);
  assert.match(actionObject, /BLOCKED/);
  assert.match(actionObject, /function actionRank/);
  assert.match(actionObject, /if \(state === "BLOCKED"\) return 0/);
  assert.match(actionObject, /if \(state === "WAITING"\) return 80/);
  assert.match(actionObject, /evidence_required/);
  assert.match(actionObject, /evidence_present/);
});

test("continuous close cannot claim ready while close procedures are absent or control sources are broken", () => {
  assert.match(actionObject, /sourceErrors > 0/);
  assert.match(actionObject, /number\(close.total\) === 0/);
  assert.match(actionObject, /number\(close.total\) > 0 && openCloseSteps === 0/);
  assert.match(actionObject, /periodClosed/);
});
