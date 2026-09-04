import assert from "node:assert/strict";
import fs from "node:fs";

const manifest = JSON.parse(
  fs.readFileSync("lib/finance/runtime/financeCapabilityRuntimeManifest.json", "utf8")
);
const registry = fs.readFileSync(
  "lib/platform/erp-engine/renderers/RendererRegistry.js",
  "utf8"
);
const workspace = fs.readFileSync(
  "components/workspace/finance/FinanceCashManagementWorkCenter.jsx",
  "utf8"
);
const runtimeRoute = fs.readFileSync(
  "app/api/finance/cash-management/runtime/route.js",
  "utf8"
);
const actionPolicy = fs.readFileSync(
  "lib/finance/ui/FinancePrimaryActionPolicy.js",
  "utf8"
);
const permissionPolicy = fs.readFileSync(
  "lib/finance/workspaces/FinanceWorkspacePermissionPolicy.js",
  "utf8"
);

assert.deepEqual(manifest.cash_management, {
  kind: "records",
  scope: "entity",
  owner: "finance",
  api: "/api/finance/cash-management/runtime",
  rowsKey: "accounts",
  renderer: "FinanceCashManagementWorkCenter",
});

assert.match(
  registry,
  /import FinanceCashManagementWorkCenter from "@\/components\/workspace\/finance\/FinanceCashManagementWorkCenter";/
);
assert.match(
  registry,
  /registerRenderer\("FinanceCashManagementWorkCenter", RegisteredFinanceCashManagementWorkCenter\);/
);

for (const marker of [
  "/api/finance/cash-management/runtime",
  "Working balance",
  "Statement + posted activity",
  "Scheduled position · 7d",
  "Scheduled position · 30d",
  "Incomplete bank evidence",
  "Recent bank activity",
  "Expected cash & exceptions",
  "Bank Statements",
  "Reconciliation",
  "Currency separated",
]) {
  assert.ok(workspace.includes(marker), `Cash Management workspace missing contract marker: ${marker}`);
}

assert.ok(
  !workspace.includes("function Metric(") && !workspace.includes("<Metric"),
  "Cash Management must remain a workflow worksheet instead of regressing to KPI-card UI"
);

for (const marker of [
  "requireFinanceWorkspacePermission",
  'capabilityId: "cash_management"',
  'operation: "read"',
  'from("bank_accounts")',
  'from("finance_bank_statement_imports")',
  'from("bank_ledger")',
  'from("customer_invoices")',
  'from("accounts_payable")',
  "STATEMENT_PLUS_POSTED_ACTIVITY",
  "LEDGER_ONLY",
  "NO_EVIDENCE",
  "held_payments",
  "scheduled_position_7d",
  "scheduled_position_30d",
  "No FX conversion is applied; currencies remain separate.",
]) {
  assert.ok(runtimeRoute.includes(marker), `Cash Management runtime missing contract marker: ${marker}`);
}

assert.match(actionPolicy, /cash_management: \{ mode: "none" \}/);
assert.doesNotMatch(actionPolicy, /cash_management:[\s\S]{0,300}refresh_liquidity/);
assert.match(
  permissionPolicy,
  /cash_management: \{ read: "finance\.banking\.view", write: "finance\.banking\.manage" \}/
);

console.log("Finance Cash Management workspace contract OK");
