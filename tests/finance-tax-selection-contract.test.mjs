import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");

const wrapper = read("components/workspace/finance/FinanceTaxWorkCenter.jsx");
const cockpit = read("components/workspace/finance/FinanceTaxLegacyWorkCenter.jsx");
const calendar = read("components/workspace/finance/FinanceTaxCalendarRail.jsx");
const amendments = read("components/workspace/finance/FinanceTaxAmendmentRail.jsx");
const settlement = read("components/workspace/finance/FinanceTaxSettlementRail.jsx");

test("Tax workspace owns one shared selected VAT filing", () => {
  assert.match(wrapper, /useState\(null\)/);
  assert.match(wrapper, /selectedVatReturnId=\{selectedVatReturnId\}/);
  assert.match(wrapper, /onSelectedVatReturnIdChange=\{setSelectedVatReturnId\}/);
  assert.match(cockpit, /onSelectedVatReturnIdChange\?\.\(row\.id\)/);
  assert.match(cockpit, /onSelectedVatReturnIdChange\?\.\(resolvedId\)/);
});

test("Calendar is bound to the exact selected filing and fails closed on mismatch", () => {
  assert.match(calendar, /selectedVatReturnId/);
  assert.match(calendar, /url\.searchParams\.set\("vatReturnId", selectedVatReturnId\)/);
  assert.match(calendar, /row\?\.id !== selectedVatReturnId/);
  assert.match(calendar, /could not resolve the selected VAT filing/);
});

test("Settlement never falls back to another VAT period", () => {
  assert.match(settlement, /selectedVatReturnId/);
  assert.match(settlement, /taxUrl\.searchParams\.set\("vatReturnId", selectedVatReturnId\)/);
  assert.match(settlement, /row\.id !== selectedVatReturnId/);
  assert.match(settlement, /body\.return\?\.id && body\.return\.id !== row\.id/);
  assert.match(settlement, /state\.returnId !== selectedVatReturnId/);
});

test("Amendment history defaults to the shared filing when it is submitted", () => {
  assert.match(amendments, /selectedVatReturnId/);
  assert.match(amendments, /submitted\.some\(row => row\.id === selectedVatReturnId\)/);
  assert.match(amendments, /selectedVatReturnId \? selectedVatReturnId/);
});
