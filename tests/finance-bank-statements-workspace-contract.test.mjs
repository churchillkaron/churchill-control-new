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
  "components/workspace/finance/FinanceBankStatementsWorkCenter.jsx",
  "utf8"
);
const runtimeRoute = fs.readFileSync(
  "app/api/finance/bank-statements/runtime/route.js",
  "utf8"
);
const importRoute = fs.readFileSync(
  "app/api/finance/bank-statements/import/route.js",
  "utf8"
);
const permissionPolicy = fs.readFileSync(
  "lib/finance/workspaces/FinanceWorkspacePermissionPolicy.js",
  "utf8"
);

assert.deepEqual(manifest.bank_statements, {
  kind: "records",
  scope: "entity",
  owner: "finance",
  api: "/api/finance/bank-statements/runtime",
  rowsKey: "rows",
  renderer: "FinanceBankStatementsWorkCenter",
});

assert.match(
  registry,
  /import FinanceBankStatementsWorkCenter from "@\/components\/workspace\/finance\/FinanceBankStatementsWorkCenter";/
);
assert.match(
  registry,
  /registerRenderer\("FinanceBankStatementsWorkCenter", RegisteredFinanceBankStatementsWorkCenter\);/
);

for (const marker of [
  "/api/finance/bank-statements/runtime",
  "/api/finance/bank-statements/import",
  "Statement evidence",
  "statement_line_number",
  "matched_count",
  "unmatched_count",
  "Open Reconciliation",
  "lineOffset",
  "lineLimit",
]) {
  assert.ok(workspace.includes(marker), `Bank Statements workspace missing contract marker: ${marker}`);
}

assert.ok(
  !workspace.includes("function Metric(") && !workspace.includes("<Metric"),
  "Bank Statements must remain workflow-first instead of adding KPI cards"
);

for (const marker of [
  "requireFinanceWorkspacePermission",
  'capabilityId: "bank_statements"',
  'operation: "read"',
  'from("finance_bank_statement_imports")',
  'from("bank_statements")',
  'statementImportId',
  'count: "exact"',
  'eq("matched", true)',
  'eq("entity_id", entity.id)',
  'range(offset, to)',
]) {
  assert.ok(runtimeRoute.includes(marker), `Bank Statements runtime missing contract marker: ${marker}`);
}

assert.match(importRoute, /create_finance_bank_statement_import/);
assert.match(importRoute, /capabilityId: "bank_statements"/);
assert.match(importRoute, /operation: "write"/);
assert.match(importRoute, /statement_start_date/);
assert.match(importRoute, /statement_end_date/);
assert.match(importRoute, /opening_balance/);
assert.match(importRoute, /closing_balance/);

assert.match(
  permissionPolicy,
  /bank_statements: \{ read: "finance\.banking\.view", write: "finance\.banking\.manage" \}/
);

console.log("Finance Bank Statements workspace contract OK");
