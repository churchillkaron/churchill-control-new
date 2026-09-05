import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");

const wrapper = read("components/workspace/finance/FinanceTaxWorkCenter.jsx");
const rail = read("components/workspace/finance/FinanceTaxClientRequestBridgeRail.jsx");
const route = read("app/api/finance/vat-returns/dependency-client-request/route.js");
const guidance = read("lib/finance/tax/FinanceTaxCloseGuidancePolicy.js");

test("Tax client request bridge only serves live client-evidence dependencies", () => {
  assert.match(route, /liveClientDependency/);
  assert.match(route, /buildFinanceVatReturnPreflight/);
  assert.match(route, /applyFinanceTaxCalendarToPreflight/);
  assert.match(route, /applyFinanceVatCalculationMethodToPreflight/);
  assert.match(route, /deriveFinanceTaxCloseGuidance/);
  assert.match(route, /dependency\.client_request_recommended !== true/);
  assert.match(route, /dependency\.responsibility !== "CLIENT_EVIDENCE_ACCOUNTANT_VALIDATION"/);
  assert.match(guidance, /CLIENT_EVIDENCE_ACCOUNTANT_VALIDATION/);
});

test("Tax client request bridge accepts only authentic same-entity engagement requests", () => {
  assert.match(route, /from\("accounting_client_requests"\)/);
  assert.match(route, /\.eq\("organization_id", organizationId\)/);
  assert.match(route, /\.eq\("entity_id", entityId\)/);
  assert.match(route, /!data\.run_id \|\| !data\.work_item_id \|\| !data\.accounting_firm_id/);
  assert.match(route, /Client request is not backed by a complete governed engagement context/);
  assert.match(route, /Client request not found in the same organization and legal entity scope/);
});

test("Tax request linkage cannot create, send or resolve the Tax dependency", () => {
  assert.match(route, /request_creation_supported_here: false/);
  assert.match(route, /auto_send_supported_here: false/);
  assert.match(route, /resolution_authority: "LIVE_TAX_PREFLIGHT_ONLY"/);
  assert.doesNotMatch(route, /\.insert\([^\n]*accounting_client_requests/);
  assert.doesNotMatch(route, /send.*client.*request/i);
  assert.match(rail, /Tax cannot create or send a request from this rail/);
  assert.match(rail, /request acceptance never clears the VAT blocker by itself/);
  assert.match(rail, /Resolution authority/);
  assert.match(rail, /Live Tax preflight only/);
});

test("Tax request bridge is bound to the exact shared filing", () => {
  assert.match(wrapper, /FinanceTaxClientRequestBridgeRail/);
  assert.match(wrapper, /selectedVatReturnId=\{selectedVatReturnId\}/);
  assert.match(rail, /workUrl\.searchParams\.set\("vatReturnId", selectedVatReturnId\)/);
  assert.match(rail, /url\.searchParams\.set\("vatReturnId", selectedVatReturnId\)/);
  assert.match(rail, /body\.return_id !== selectedVatReturnId/);
  assert.match(rail, /body\.dependency\?\.code !== dependency\.code/);
});

test("Tax request linkage persists only the relationship to a governed request", () => {
  assert.match(route, /client_request_id: clientRequestId/);
  assert.match(route, /run_id: linkedRequest\.run_id/);
  assert.match(route, /work_item_id: linkedRequest\.work_item_id/);
  assert.match(route, /accounting_firm_id: linkedRequest\.accounting_firm_id/);
  assert.match(route, /\["LINK", "UNLINK"\]/);
  assert.doesNotMatch(route, /status:\s*"(RESOLVED|COMPLETE|DONE)"/i);
});
