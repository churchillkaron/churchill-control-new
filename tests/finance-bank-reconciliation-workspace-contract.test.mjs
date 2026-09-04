import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const manifest = JSON.parse(
  fs.readFileSync("lib/finance/runtime/financeCapabilityRuntimeManifest.json", "utf8")
);
const rendererRegistry = fs.readFileSync(
  "lib/platform/erp-engine/renderers/RendererRegistry.js",
  "utf8"
);
const workspace = fs.readFileSync(
  "components/workspace/finance/FinanceBankReconciliationWorkCenter.jsx",
  "utf8"
);
const actionPolicy = fs.readFileSync(
  "lib/finance/ui/FinancePrimaryActionPolicy.js",
  "utf8"
);
const operationalForms = fs.readFileSync(
  "lib/platform/forms/FinanceOperationalFormContract.js",
  "utf8"
);

test("bank reconciliation resolves to the dedicated accountant cockpit", () => {
  assert.deepEqual(manifest.bank_reconciliation, {
    kind: "records",
    scope: "entity",
    owner: "finance",
    api: "/api/finance/reconciliation/runtime",
    rowsKey: "data",
    renderer: "FinanceBankReconciliationWorkCenter",
  });

  assert.match(
    rendererRegistry,
    /registerRenderer\("FinanceBankReconciliationWorkCenter", RegisteredFinanceBankReconciliationWorkCenter\)/
  );
  assert.match(
    rendererRegistry,
    /FinanceBankReconciliationWorkCenter from "@\/components\/workspace\/finance\/FinanceBankReconciliationWorkCenter"/
  );
});

test("bank reconciliation cockpit is evidence-first and uses governed runtime data", () => {
  assert.match(workspace, /\/api\/finance\/reconciliation\/runtime/);
  assert.match(workspace, /\/api\/finance\/bank-accounts/);
  assert.match(workspace, /Needs attention/);
  assert.match(workspace, /Statement balance/);
  assert.match(workspace, /Book balance/);
  assert.match(workspace, /Difference/);
  assert.match(workspace, /FinanceRecordReviewPanel/);
  assert.match(workspace, /RowActionEngine/);
});

test("Start Reconciliation keeps the governed action and accountant form", () => {
  assert.match(actionPolicy, /id: "run_reconciliation"/);
  assert.match(actionPolicy, /endpoint: "\/api\/finance\/reconciliation\/run"/);
  assert.match(operationalForms, /"bank-reconciliation-run"/);
  assert.match(operationalForms, /name: "bank_account_id"/);
  assert.match(operationalForms, /name: "reconciliation_date"/);
  assert.match(operationalForms, /name: "statement_closing_balance"/);
});
