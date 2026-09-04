import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");

const wrapper = read("components/workspace/finance/FinanceTaxWorkCenter.jsx");
const cockpit = read("components/workspace/finance/FinanceTaxLegacyWorkCenter.jsx");
const calendar = read("components/workspace/finance/FinanceTaxCalendarRail.jsx");
const calendarPolicy = read("lib/finance/tax/FinanceTaxCalendarPolicy.js");
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
  assert.match(amendments, /selectedVatReturnId && submitted\.some\(row => row\.id === selectedVatReturnId\)/);
  assert.match(amendments, /\? selectedVatReturnId : submitted\.some/);
});

test("New VAT filing derives the statutory deadline from form and filing channel", () => {
  assert.match(cockpit, /getFinanceTaxCalendarOptions/);
  assert.match(cockpit, /resolveFinanceTaxDeadline/);
  assert.match(cockpit, /filing_form_code/);
  assert.match(cockpit, /filing_channel/);
  assert.match(cockpit, /Governed statutory deadline/);
  assert.match(cockpit, /Official calendar verified/);
  assert.match(cockpit, /Revenue Department source/);
  assert.match(cockpit, /filingFormCode: form\.filing_form_code/);
  assert.match(cockpit, /filingChannel: form\.filing_channel/);
  assert.match(cockpit, /filingDueDate: deadlineNeedsEvidence \? evidenceDueDate : null/);
  assert.match(cockpit, /deadlineOverrideReason: deadlineNeedsEvidence \? form\.deadline_override_reason : null/);
  assert.match(cockpit, /deadlineOverrideEvidenceReference: deadlineNeedsEvidence \? form\.deadline_override_evidence_reference : null/);
  assert.doesNotMatch(cockpit, />Filing due date<input/);
});

test("Thailand filing deadlines are evaluated on the legal Asia/Bangkok day", () => {
  assert.match(calendarPolicy, /THAILAND: "Asia\/Bangkok"/);
  assert.match(calendarPolicy, /getFinanceTaxLegalClock/);
  assert.match(calendarPolicy, /dateInTimeZone\(now, timeZone\)/);
  assert.match(calendarPolicy, /item\?\.code !== "FILING_DEADLINE"/);
  assert.match(calendarPolicy, /dueDate < legalClock\.legal_date/);
  assert.match(calendarPolicy, /legal_time_zone: legalClock\.time_zone/);
  assert.match(calendarPolicy, /legal_clock: legalClock/);
});
