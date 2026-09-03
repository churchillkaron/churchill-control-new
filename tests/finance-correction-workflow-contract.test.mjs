import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(path, "utf8");

const runtime = read("lib/finance/corrections/FinanceCorrectionRuntime.js");
const route = read("app/api/workspace/finance/corrections/route.js");
const healthRoute = read("app/api/workspace/finance/account-health/route.js");
const healthRuntime = read("lib/finance/ui/loadFinanceAccountHealthRuntime.js");
const workspace = read("components/workspace/finance/FinanceCorrectionWorkspace.jsx");
const page = read("app/(system)/workspace/[organizationId]/finance/page.jsx");

test("Finance corrections reuse governed approval and atomic journal runtimes", () => {
  assert.match(runtime, /finance_approval_requests/);
  assert.match(runtime, /ACCOUNTING_CORRECTION/);
  assert.match(runtime, /validateJournalIntegrity/);
  assert.match(runtime, /postJournalEntrySafe/);
  assert.match(runtime, /finance-correction:\$\{current\.id\}/);
});

test("correction lifecycle separates preparation, approval and posting permissions", () => {
  assert.match(route, /finance\.journals\.create/);
  assert.match(route, /finance\.accounting\.manage/);
  assert.match(route, /finance\.journals\.post/);
  assert.match(runtime, /Segregation of duties blocks the preparer from approving their own correction/);
  assert.match(route, /assertClientScope/);
  assert.match(route, /accounting_engagements/);
});

test("journal treatment is evidence-led and never auto-invents a balancing entry", () => {
  assert.match(runtime, /Do not reverse solely because the sign is unusual/);
  assert.match(runtime, /post only the correcting entry supported by the reconciliation evidence/i);
  assert.doesNotMatch(runtime, /auto.?balance|guess.?account|suggested.?amount/i);
  assert.match(workspace, /never the balancing amount/i);
  assert.match(workspace, /Evidence basis \/ source documents/);
});

test("posting closes the loop through the same deterministic account health evaluator", () => {
  assert.match(runtime, /loadFinanceAccountHealthRuntime/);
  assert.match(runtime, /recheckFinanceCorrection/);
  assert.match(runtime, /resulting_state/);
  assert.match(healthRoute, /loadFinanceAccountHealthRuntime/);
  assert.match(healthRuntime, /buildFinanceAccountHealth/);
});

test("control exceptions are not forced into journals", () => {
  assert.match(runtime, /resolution_mode: "CONTROL"/);
  assert.match(runtime, /Control corrections are re-checked after the control is fixed; they are not journal-posted/);
  assert.match(workspace, /Control \/ configuration/);
  assert.match(workspace, /Journal correction/);
});

test("Finance landing exposes the closed-loop correction workspace after account health", () => {
  const healthIndex = page.indexOf("<FinanceAccountHealthPanel");
  const correctionIndex = page.indexOf("<FinanceCorrectionWorkspace");
  const overviewIndex = page.indexOf("<FinanceAccountantOverview");
  assert.ok(healthIndex >= 0 && correctionIndex > healthIndex && overviewIndex > correctionIndex);
});
