import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");
const rail = read("components/workspace/finance/FinanceTaxEvidenceDrilldownRail.jsx");
const route = read("app/api/finance/vat-returns/evidence-drilldown/route.js");
const navigation = read("lib/finance/tax/FinanceTaxSourceNavigationPolicy.js");

test("Tax evidence follows accountant VAT control to population to exact source", () => {
  assert.match(rail, /1 · VAT control/);
  assert.match(rail, /2 · Source population/);
  assert.match(rail, /3 · Exact source/);
  assert.match(rail, /Start with the VAT control, then trace it to exact governed evidence\./);
  assert.match(rail, /Complete live population/);
  assert.match(rail, /Open exact source/);
  assert.match(rail, /Business Context stays fixed/);
});

test("Evidence source navigation is server-derived only from exact governed source identity", () => {
  assert.match(route, /buildFinanceTaxSourceNavigation/);
  assert.match(route, /function exactSourceNavigation/);
  assert.match(route, /target\?\.context_mutation_allowed !== false/);
  assert.match(route, /String\(exactEvidenceId\) !== String\(target\.record_id\)/);
  assert.match(route, /source_navigation: exactSourceNavigation/);
  assert.match(navigation, /focusRecordId/);
  assert.match(navigation, /focusEntityId/);
  assert.match(navigation, /source", "tax-evidence"/);
  assert.match(navigation, /returnVatReturnId/);
  assert.match(navigation, /returnTo/);
  assert.match(navigation, /context_mutation_allowed: false/);
  assert.match(navigation, /exact_record_focus: true/);
});

test("Evidence remains read-only and filing scoped while navigating to source", () => {
  assert.match(route, /requireFinanceWorkspacePermission\(\{ capabilityId: "vat_returns", operation: "read", access \}\)/);
  assert.match(route, /current\?\.return\?\.id !== vatReturnId \|\| current\?\.return\?\.entity_id !== entityId/);
  assert.match(route, /resolution_authority: FINANCE_TAX_EVIDENCE_RESOLUTION_AUTHORITY/);
  assert.match(route, /mutation_authority: false/);
  assert.match(route, /context_mutation_authority: false/);
  assert.doesNotMatch(route, /\.insert\(|\.update\(|\.delete\(/);
  assert.match(rail, /body\.return_id !== selectedVatReturnId \|\| body\.entity_id !== entityId/);
  assert.match(rail, /cannot post, recode, alter FX, update a VAT rule, complete work, or mutate Business Context/);
});
