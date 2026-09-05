import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");

const wrapper = read("components/workspace/finance/FinanceTaxWorkCenter.jsx");
const postFiling = read("components/workspace/finance/FinanceTaxPostFilingWorkspace.jsx");
const amendments = read("components/workspace/finance/FinanceTaxAmendmentRail.jsx");
const settlement = read("components/workspace/finance/FinanceTaxSettlementRail.jsx");

test("AFTER stage is one post-filing workspace instead of stacked amendment and settlement rails", () => {
  assert.match(wrapper, /FinanceTaxPostFilingWorkspace/);
  assert.match(wrapper, /activeStage === "AFTER" \? <FinanceTaxPostFilingWorkspace/);
  assert.match(wrapper, /selectedVatReturnId=\{selectedVatReturnId\}/);
  assert.match(wrapper, /onStageChange=\{changeStage\}/);
  assert.match(postFiling, /One close path after filing: correct only if wrong, then clear the filed balance\./);
  assert.match(postFiling, /One work surface is shown at a time/);
  assert.match(postFiling, /mode === "SETTLEMENT" \? <FinanceTaxSettlementRail/);
  assert.match(postFiling, /mode === "AMENDMENT" \? <FinanceTaxAmendmentRail/);
});

test("post-filing workspace is exact-filing bound and fails closed on mismatched evidence", () => {
  assert.match(postFiling, /taxUrl\.searchParams\.set\("vatReturnId", selectedVatReturnId\)/);
  assert.match(postFiling, /row\.id !== selectedVatReturnId/);
  assert.match(postFiling, /Post-filing Tax work could not resolve the selected VAT filing/);
  assert.match(postFiling, /settlementUrl\.searchParams\.set\("vatReturnId", selectedVatReturnId\)/);
  assert.match(postFiling, /settlementBody\?\.return\?\.id !== selectedVatReturnId/);
  assert.match(postFiling, /Post-filing settlement evidence resolved a different VAT filing/);
});

test("open amendments become the recommended post-filing work before normal settlement", () => {
  assert.match(postFiling, /const activeAmendment = chain\.active/);
  assert.match(postFiling, /const recommendedMode = activeAmendment \? "AMENDMENT" : "SETTLEMENT"/);
  assert.match(postFiling, /setMode\(chain\.active \? "AMENDMENT" : "SETTLEMENT"\)/);
  assert.match(postFiling, /Finish \$\{activeAmendment\.label \|\| "the open amendment"\} before treating the revised filing as final/);
  assert.match(postFiling, /Amendment is the exception path\. Settlement is the normal close path\./);
});

test("normal post-filing work translates settlement truth into human next actions", () => {
  assert.match(postFiling, /SETTLEMENT_SETUP_REQUIRED/);
  assert.match(postFiling, /Map the governed VAT control accounts/);
  assert.match(postFiling, /LIABILITY_POSTING_REQUIRED/);
  assert.match(postFiling, /Post the filed VAT position into settlement control/);
  assert.match(postFiling, /PAYMENT_DUE/);
  assert.match(postFiling, /REFUND_DUE/);
  assert.match(postFiling, /PAID_AWAITING_BANK_MATCH/);
  assert.match(postFiling, /REFUNDED_AWAITING_BANK_MATCH/);
  assert.match(postFiling, /Match the cash event to reconciled bank evidence/);
  assert.match(postFiling, /Filed VAT is cleared through accounting and bank evidence/);
});

test("post-filing work cannot start before a real recorded authority submission", () => {
  assert.match(postFiling, /upper\(row\.status\) !== "SUBMITTED"/);
  assert.match(postFiling, /Post-filing work starts only after a real authority submission is recorded/);
  assert.match(postFiling, /onStageChange\?\.\("RETURN"\)/);
  assert.doesNotMatch(postFiling, /method:\s*"POST"/);
});

test("existing amendment and settlement controls keep their governed accounting guarantees", () => {
  assert.match(amendments, /Original filed return stays immutable/);
  assert.match(amendments, /Only the latest filed version can be amended/);
  assert.match(amendments, /blocks if any evidence changed/i);
  assert.match(settlement, /Paid is not cleared/);
  assert.match(settlement, /Settlement setup required/);
  assert.match(settlement, /Period-end is open/);
  assert.match(settlement, /operationId: cashOperationIdRef\.current/);
  assert.match(settlement, /Bank evidence/);
});
