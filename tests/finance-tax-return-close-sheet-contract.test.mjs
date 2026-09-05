import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");
const wrapper = read("components/workspace/finance/FinanceTaxWorkCenter.jsx");
const closeSheet = read("components/workspace/finance/FinanceTaxReturnCloseSheet.jsx");

test("VAT Return stage presents one accountant close sheet bound to the selected filing", () => {
  assert.match(wrapper, /FinanceTaxReturnCloseSheet/);
  assert.match(wrapper, /selectedVatReturnId=\{selectedVatReturnId\}/);
  assert.match(wrapper, /onStageChange=\{setActiveStage\}/);
  assert.match(closeSheet, /VAT close sheet/);
  assert.match(closeSheet, /One filing, one current accounting truth, one next action\./);
  assert.match(closeSheet, /body\?\.preflight\?\.return\?\.id === selectedVatReturnId/);
  assert.match(closeSheet, /Output VAT/);
  assert.match(closeSheet, /Input VAT/);
  assert.match(closeSheet, /Net position/);
  assert.match(closeSheet, /Deadline/);
  assert.match(closeSheet, /Readiness/);
});

test("VAT Return stage keeps the old full filing workspace behind a deliberate drill-down", () => {
  assert.match(wrapper, /<details/);
  assert.match(wrapper, /Filing register & detailed source evidence/);
  assert.match(wrapper, /Open filing register/);
  assert.match(wrapper, /The VAT close sheet remains the primary filing control\./);
  assert.ok(wrapper.indexOf("<FinanceTaxReturnCloseSheet") < wrapper.indexOf("<details"));
  assert.ok(wrapper.indexOf("<details") < wrapper.lastIndexOf("<FinanceTaxLegacyWorkCenter"));
});

test("VAT close sheet derives its next action from live preflight rather than local status alone", () => {
  assert.match(closeSheet, /snapshot\.ready_to_calculate/);
  assert.match(closeSheet, /snapshot\.ready_to_submit === true/);
  assert.match(closeSheet, /upper\(item\.status\) === "BLOCK"/);
  assert.match(closeSheet, /onStageChange\?\.\("FIX"\)/);
  assert.match(closeSheet, /onStageChange\?\.\("EVIDENCE"\)/);
  assert.match(closeSheet, /onStageChange\?\.\("AFTER"\)/);
  assert.match(closeSheet, /Inspect evidence/);
  assert.match(closeSheet, /Recalculate from evidence/);
  assert.match(closeSheet, /Calculate from evidence/);
  assert.match(closeSheet, /Record authority submission/);
  assert.match(closeSheet, /Do not calculate around a blocker\./);
});

test("VAT close sheet counts deadlines from the governed legal date rather than the browser timezone", () => {
  assert.match(closeSheet, /daysBetweenIso/);
  assert.match(closeSheet, /snapshot\?\.due\?\.legal_date/);
  assert.match(closeSheet, /snapshot\?\.due\?\.legal_time_zone/);
  assert.match(closeSheet, /Governed legal date unavailable/);
  assert.doesNotMatch(closeSheet, /const now = new Date\(\)/);
});

test("VAT close sheet reuses governed calculation and filing boundaries without inventing government submission", () => {
  assert.match(closeSheet, /\/api\/finance\/vat-returns\/calculate/);
  assert.match(closeSheet, /\/api\/finance\/vat-returns\/mark-submitted/);
  assert.match(closeSheet, /vatReturnId: vatReturn\.id/);
  assert.match(closeSheet, /submissionReference: submissionReference\.trim\(\)/);
  assert.match(closeSheet, /Real authority filing evidence/);
  assert.match(closeSheet, /Avantiqo records the authority reference you actually received\./);
  assert.match(closeSheet, /It does not claim a government connector submitted this return\./);
  assert.doesNotMatch(closeSheet, /function Metric\s*\(/);
  assert.doesNotMatch(closeSheet, /<Metric\b/);
});
