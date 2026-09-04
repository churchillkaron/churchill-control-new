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
  "components/workspace/finance/FinanceCashFlowWorkCenter.jsx",
  "utf8"
);
const route = fs.readFileSync(
  "app/api/finance/cash-flow/run/route.js",
  "utf8"
);
const projection = fs.readFileSync(
  "lib/finance/treasury/buildCashFlowProjection.js",
  "utf8"
);
const permissionPolicy = fs.readFileSync(
  "lib/finance/workspaces/FinanceWorkspacePermissionPolicy.js",
  "utf8"
);
const primaryActionPolicy = fs.readFileSync(
  "lib/finance/ui/FinancePrimaryActionPolicy.js",
  "utf8"
);
const reportingService = fs.readFileSync(
  "lib/finance/reporting/runtime/ReportingApplicationService.js",
  "utf8"
);
const legacyEngine = fs.readFileSync(
  "lib/finance/reporting/workflows/runCashFlowEngine.js",
  "utf8"
);

assert.deepEqual(manifest.cash_flow, {
  kind: "report",
  scope: "entity",
  owner: "finance",
  api: "/api/finance/cash-flow/run",
  rowsKey: "rows",
  renderer: "FinanceCashFlowWorkCenter",
});

assert.match(
  registry,
  /import FinanceCashFlowWorkCenter from "@\/components\/workspace\/finance\/FinanceCashFlowWorkCenter";/
);
assert.match(
  registry,
  /registerRenderer\("FinanceCashFlowWorkCenter", RegisteredFinanceCashFlowWorkCenter\);/
);

for (const marker of [
  "Actual In",
  "Actual Out",
  "Scheduled In",
  "Scheduled Out",
  "Actual bank evidence",
  "Scheduled receipts",
  "Scheduled payments",
  "Open Cash Management",
  "currencies are never blended",
]) {
  assert.ok(workspace.includes(marker), `Cash Flow workspace missing contract marker: ${marker}`);
}

assert.ok(
  !workspace.includes("function Metric(") && !workspace.includes("<Metric"),
  "Cash Flow must remain workflow-first instead of adding KPI cards"
);

for (const marker of [
  "buildCashFlowProjection",
  'capabilityId: "cash_flow"',
  'operation: "read"',
  "resolveEntity",
  "export async function GET",
  "export async function POST",
]) {
  assert.ok(route.includes(marker), `Cash Flow route missing contract marker: ${marker}`);
}

for (const marker of [
  'from("bank_statements")',
  'from("bank_ledger")',
  'from("customer_invoices")',
  'from("accounts_payable")',
  'source: "BANK_STATEMENT"',
  'source: "BANK_LEDGER"',
  "inCoverage(rowDate, coverageByAccount.get(row.bank_account_id))",
  "payment_hold === true",
  "No FX conversion is applied",
  "unscheduled_receivables",
  "unscheduled_payables",
]) {
  assert.ok(projection.includes(marker), `Cash Flow projection missing contract marker: ${marker}`);
}

assert.match(
  permissionPolicy,
  /cash_flow: \{ read: "finance\.banking\.view", write: "finance\.banking\.manage" \}/
);
assert.match(primaryActionPolicy, /cash_flow: \{ mode: "none" \}/);
assert.match(reportingService, /buildCashFlowProjection/);
assert.ok(
  !reportingService.includes('import runCashFlowEngine from "../workflows/runCashFlowEngine"'),
  "ReportingApplicationService must not route Cash Flow to the legacy snapshot writer"
);
assert.match(legacyEngine, /cash_flow_snapshots/);
assert.ok(
  !route.includes("cash_flow_snapshots") && !projection.includes("cash_flow_snapshots"),
  "Canonical Cash Flow must not write legacy cash_flow_snapshots"
);

console.log("Finance Cash Flow workspace contract OK");
