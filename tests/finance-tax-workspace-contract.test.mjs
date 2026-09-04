import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");

const manifest = JSON.parse(read("lib/finance/runtime/financeCapabilityRuntimeManifest.json"));
const registry = read("lib/platform/erp-engine/renderers/RendererRegistry.js");
const policy = read("lib/finance/ui/FinancePrimaryActionPolicy.js");
const workspace = read("components/workspace/finance/FinanceTaxWorkCenter.jsx");
const runtime = read("app/api/finance/tax/runtime/route.js");
const calculate = read("app/api/finance/vat-returns/calculate/route.js");
const submit = read("app/api/finance/vat-returns/mark-submitted/route.js");
const preflight = read("lib/finance/tax/FinanceVatReturnPreflight.js");

test("Tax and VAT Returns share one governed filing cockpit", () => {
  for (const capability of ["tax", "vat_returns"]) {
    assert.deepEqual(manifest[capability], {
      kind: "records",
      scope: "entity",
      owner: "finance",
      api: "/api/finance/tax/runtime",
      rowsKey: "returns",
      renderer: "FinanceTaxWorkCenter",
    });
  }
  assert.match(registry, /FinanceTaxWorkCenter/);
  assert.match(registry, /registerRenderer\("FinanceTaxWorkCenter"/);
  assert.match(policy, /tax:\s*\{ mode: "none" \}/);
  assert.match(policy, /vat_returns:\s*\{ mode: "none" \}/);
});

test("Tax workcenter is workflow-first and human controlled", () => {
  assert.match(workspace, /New VAT filing/);
  assert.match(workspace, /Create filing obligation/);
  assert.match(workspace, /Pre-file checks/);
  assert.match(workspace, /Calculate from evidence/);
  assert.match(workspace, /Recalculate from evidence/);
  assert.match(workspace, /Record submission/);
  assert.match(workspace, /Source evidence/);
  assert.match(workspace, /Needs attention/);
  assert.match(workspace, /does not silently repair source transactions/);
  assert.match(workspace, /does not pretend a government connection submitted the return/);
  assert.doesNotMatch(workspace, /function Metric\s*\(/);
  assert.doesNotMatch(workspace, /<Metric\b/);
});

test("Tax runtime is permissioned, entity scoped and creates real filing obligations", () => {
  assert.match(runtime, /requireFinanceWorkspacePermission/);
  assert.match(runtime, /capabilityId: "vat_returns"/);
  assert.match(runtime, /\.from\("finance_vat_returns"\)/);
  assert.match(runtime, /\.eq\("organization_id", access\.organizationId\)/);
  assert.match(runtime, /\.eq\("entity_id", entityId\)/);
  assert.match(runtime, /loadFinanceTaxWorkspaceSetup/);
  assert.match(runtime, /buildFinanceVatReturnPreflight/);
  assert.match(runtime, /A VAT return already exists for this jurisdiction and period/);
  assert.doesNotMatch(runtime, /finance_tax_reports/);
});

test("Calculation and submission are both gated by live governed evidence", () => {
  assert.match(calculate, /buildFinanceVatReturnPreflight/);
  assert.match(calculate, /if \(!preflight\.ready_to_calculate\)/);
  assert.match(calculate, /VAT preflight failed/);
  assert.match(submit, /buildFinanceVatReturnPreflight/);
  assert.match(submit, /if \(!preflight\.ready_to_submit\)/);
  assert.match(submit, /VAT filing preflight failed/);
});

test("VAT preflight detects material evidence defects and stale calculations", () => {
  assert.match(preflight, /MAX_PREFLIGHT_ROWS/);
  assert.match(preflight, /\.range\(from, from \+ PAGE_SIZE - 1\)/);
  assert.match(preflight, /row\.reversed !== true/);
  assert.match(preflight, /OUTPUT_EXCHANGE_RATE_MISSING/);
  assert.match(preflight, /INPUT_EXCHANGE_RATE_MISSING/);
  assert.match(preflight, /INPUT_TAX_CODE_MISSING/);
  assert.match(preflight, /INPUT_NOT_APPROVED_POSTED/);
  assert.match(preflight, /POTENTIAL_DUPLICATE_VENDOR_INVOICE/);
  assert.match(preflight, /CALCULATION_FRESHNESS/);
  assert.match(preflight, /source evidence changed after calculation/);
  assert.match(preflight, /ready_to_submit/);
});
