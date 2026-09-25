import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const semantic = fs.readFileSync(
  "lib/operator/runtime/OperatorSemanticActionPreparationRuntime.js",
  "utf8",
);
const finance = fs.readFileSync(
  "lib/finance/accounts-receivable/CorrectCustomerInvoice/execute.js",
  "utf8",
);
const runtime = fs.readFileSync("lib/finance/FinanceRuntime.js", "utf8");
const actions = fs.readFileSync(
  "lib/operator/runtime/OperatorFastActionIndex.js",
  "utf8",
);

test("generic correction turns receive compact identity from the last verified execution", () => {
  assert.match(semantic, /function compactLastExecutionTarget\(/);
  assert.match(semantic, /last_verified_execution:/);
  assert.match(semantic, /correction_or_revision === true/);
  assert.match(semantic, /goal_relation[\s\S]*revise/);
  assert.match(
    semantic,
    /Use its identities only to bind a fresh registered read/,
  );
  assert.doesNotMatch(
    semantic,
    /Moonshine|previous Thursday|previous Sunday/,
  );
});

test("Finance exposes a governed customer invoice correction capability", () => {
  assert.match(runtime, /CorrectCustomerInvoice/);
  assert.match(
    actions,
    /finance\.accounts_receivable\.CorrectCustomerInvoice/,
  );
  assert.match(finance, /action: "CorrectCustomerInvoice"/);
  assert.match(finance, /operatorRequiresConfirmation: true/);
  assert.match(finance, /transactional: false/);
});

test("invoice correction preflights replacement before compensating source invoice", () => {
  const preflight = finance.indexOf("await prepareCustomerInvoice({");
  const credit = finance.indexOf(
    "await issueCustomerCreditNoteCommand({",
  );
  const replacement = finance.indexOf(
    "await createCustomerInvoiceCommand({",
  );

  assert.ok(preflight >= 0);
  assert.ok(credit > preflight);
  assert.ok(replacement > credit);
  assert.match(finance, /automatic replace-by-credit is blocked/);
  assert.match(
    finance,
    /Source invoice has payment or settlement activity/,
  );
});

test("invoice correction verifies both source compensation and replacement", () => {
  assert.match(
    finance,
    /Source invoice correction could not be independently verified/,
  );
  assert.match(
    finance,
    /Replacement invoice dates could not be independently verified/,
  );
  assert.match(finance, /source_invoice_credited: true/);
  assert.match(finance, /replacement_invoice_verified: true/);
});


test("registered invoice date correction compiles from fresh evidence without owned-model availability", async () => {
  const { materializeRegisteredRevisionDeterministically } = await import(
    "../lib/operator/runtime/OperatorRegisteredRevisionMaterializer.mjs"
  );
  const result = materializeRegisteredRevisionDeterministically({
    message: "change the last invoice 7 days back on all 3 dates, it should be the week before",
    priorPayload: { party_id: "party-1" },
    actionKey: "finance.accounts_receivable.CorrectCustomerInvoice",
    correctionDate: "2026-09-25",
    evidence: [{
      capability_key: "finance.customer_invoices.read",
      result: {
        success: true,
        invoices: [{
          id: "invoice-1",
          party_id: "party-1",
          invoice_number: "INV-1",
          invoice_date: "2026-09-28",
          due_date: "2026-09-28",
          created_at: "2026-09-25T06:34:09Z",
          lines: [
            { description: "Trio band — 2026-09-24", quantity: 1, unit_price: 10000, line_total: 10000 },
            { description: "Full band — 2026-09-27", quantity: 1, unit_price: 15000, line_total: 15000 },
          ],
        }],
      },
    }],
  });
  assert.equal(result?.payload?.source_invoice_id, "invoice-1");
  assert.equal(result?.payload?.replacement?.invoice_date, "2026-09-21");
  assert.equal(result?.payload?.replacement?.due_date, "2026-09-21");
  assert.equal(result?.payload?.replacement?.lines?.[0]?.description, "Trio band — 2026-09-17");
  assert.equal(result?.payload?.replacement?.lines?.[1]?.description, "Full band — 2026-09-20");
  assert.equal(result?.clarification_required, false);
});

test("registered revision plan binds fresh reads to the prior action party without customer hardcoding", () => {
  assert.match(semantic, /function deterministicRegisteredRevisionPlan\(/);
  assert.match(semantic, /bindDeclaredReadsToPriorAction/);
  assert.match(semantic, /priorPartyId/);
  assert.doesNotMatch(semantic, /Moonshine/);
});
