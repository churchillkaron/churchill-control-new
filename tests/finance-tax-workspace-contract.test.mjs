import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");

const manifest = JSON.parse(read("lib/finance/runtime/financeCapabilityRuntimeManifest.json"));
const registry = read("lib/platform/erp-engine/renderers/RendererRegistry.js");
const primaryPolicy = read("lib/finance/ui/FinancePrimaryActionPolicy.js");
const workspace = read("components/workspace/finance/FinanceTaxWorkCenter.jsx");
const legacyWorkspace = read("components/workspace/finance/FinanceTaxLegacyWorkCenter.jsx");
const calendarRail = read("components/workspace/finance/FinanceTaxCalendarRail.jsx");
const amendmentRail = read("components/workspace/finance/FinanceTaxAmendmentRail.jsx");
const taxSurface = [workspace, legacyWorkspace, calendarRail, amendmentRail].join("\n");
const runtime = read("app/api/finance/tax/runtime/route.js");
const calculate = read("app/api/finance/vat-returns/calculate/route.js");
const submit = read("app/api/finance/vat-returns/mark-submitted/route.js");
const amendments = read("app/api/finance/vat-returns/amendments/route.js");
const preflight = read("lib/finance/tax/FinanceVatReturnPreflight.js");
const calendarPolicy = read("lib/finance/tax/FinanceTaxCalendarPolicy.js");
const amendmentPolicy = read("lib/finance/tax/FinanceVatAmendmentPolicy.js");

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
  assert.match(primaryPolicy, /tax:\s*\{ mode: "none" \}/);
  assert.match(primaryPolicy, /vat_returns:\s*\{ mode: "none" \}/);
  assert.match(workspace, /FinanceTaxCalendarRail/);
  assert.match(workspace, /FinanceTaxAmendmentRail/);
  assert.match(workspace, /FinanceTaxLegacyWorkCenter/);
});

test("Tax workcenter is workflow-first and human controlled", () => {
  assert.match(taxSurface, /New VAT filing/);
  assert.match(taxSurface, /Create filing obligation/);
  assert.match(taxSurface, /Pre-file checks/);
  assert.match(taxSurface, /Calculate from evidence/);
  assert.match(taxSurface, /Recalculate from evidence/);
  assert.match(taxSurface, /Record submission/);
  assert.match(taxSurface, /Source evidence/);
  assert.match(taxSurface, /Needs attention/);
  assert.match(taxSurface, /does not silently repair source transactions/);
  assert.match(taxSurface, /does not pretend a government connection submitted the return/);
  assert.match(taxSurface, /Statutory filing calendar/);
  assert.match(taxSurface, /Original filed return stays immutable/);
  assert.match(taxSurface, /Only the latest filed version can be amended/);
  assert.doesNotMatch(taxSurface, /function Metric\s*\(/);
  assert.doesNotMatch(taxSurface, /<Metric\b/);
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
  assert.match(submit, /applyFinanceTaxCalendarToPreflight/);
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

test("Tax calendar is authority-backed and controlled overrides require evidence", () => {
  assert.match(calendarPolicy, /TH_PP30_CALENDAR_V1/);
  assert.match(calendarPolicy, /OFFICIAL_CALENDAR_VERIFIED/);
  assert.match(calendarPolicy, /Thailand Revenue Department/);
  assert.match(calendarPolicy, /Deadline override requires a reason and authority evidence reference/);
  assert.match(calendarPolicy, /blocks_submission: true/);
  assert.match(calendarRail, /Filing channel/);
  assert.match(calendarRail, /Authority evidence/);
});

test("Filed VAT corrections use an immutable amendment chain", () => {
  assert.match(amendments, /VAT return must be submitted before an amendment can be opened/);
  assert.match(amendments, /An amendment is already active for this filed return/);
  assert.match(amendments, /PP30_ADDITIONAL_RETURN/);
  assert.match(amendments, /buildFinanceVatReturnPreflight/);
  assert.match(amendments, /buildFinanceVatAmendmentEvidenceSignature/);
  assert.match(amendments, /VAT amendment evidence changed after calculation; recalculate before submission/);
  assert.match(amendments, /chain\.history = \[\.\.\.chain\.history, filed\]/);
  assert.match(amendments, /chain\.active = null/);
  assert.match(amendments, /\.eq\("status", "SUBMITTED"\)/);
  assert.match(amendments, /\.eq\("updated_at", vatReturn\.updated_at\)/);
  assert.doesNotMatch(amendments, /set\s+output_tax|update\s+public\.finance_vat_returns/i);
});

test("Amendment evidence fingerprint covers the full governed source population", () => {
  assert.match(amendmentPolicy, /MAX_EVIDENCE_ROWS/);
  assert.match(amendmentPolicy, /\.range\(from, from \+ PAGE_SIZE - 1\)/);
  assert.match(amendmentPolicy, /customer_invoices/);
  assert.match(amendmentPolicy, /customer_invoice_lines/);
  assert.match(amendmentPolicy, /journal_entries/);
  assert.match(amendmentPolicy, /vendor_invoices/);
  assert.match(amendmentPolicy, /vendor_invoice_lines/);
  assert.match(amendmentPolicy, /tax_rules/);
  assert.match(amendmentPolicy, /createHash\("sha256"\)/);
  assert.match(amendmentPolicy, /latestFinanceVatFiledSnapshot/);
  assert.match(amendmentPolicy, /financeVatSnapshotDelta/);
});
