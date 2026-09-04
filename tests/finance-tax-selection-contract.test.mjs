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
const vatPreflight = read("lib/finance/tax/FinanceVatReturnPreflight.js");
const amendments = read("components/workspace/finance/FinanceTaxAmendmentRail.jsx");
const settlement = read("components/workspace/finance/FinanceTaxSettlementRail.jsx");
const settlementRoute = read("app/api/finance/vat-returns/settlement/route.js");
const journalPosting = read("lib/finance/general-ledger/capabilities/postJournalEntrySafe.js");

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

test("Reversed sales postings contribute zero to VAT preflight totals and preview amounts", () => {
  assert.match(vatPreflight, /const validPostedJournals = postedJournals\.filter\(row => row\.reversed !== true\)/);
  assert.match(vatPreflight, /const enginePosted = validPostedJournals\.length > 0/);
  assert.match(vatPreflight, /if \(eligibleVatLines\.length && enginePosted\)/);
  assert.match(vatPreflight, /functional_tax_amount: enginePosted \? roundMoney/);
  assert.doesNotMatch(vatPreflight, /const enginePosted = postedJournals\.length > 0/);
});

test("VAT liability posting defaults to period end and controlled alternate dates", () => {
  assert.match(settlementRoute, /defaultPostingDate = required\(vatReturn\.period_end, "VAT period end"\)/);
  assert.match(settlementRoute, /const alternatePostingDate = postingDate !== defaultPostingDate/);
  assert.match(settlementRoute, /Alternate VAT liability posting date requires a reason/);
  assert.match(settlementRoute, /posting_date_reason: alternatePostingDate \? postingDateReason : null/);
  assert.match(settlementRoute, /loadLiabilityPostingControl/);
  assert.match(settlementRoute, /default_period_open: status === "open" \|\| status === "active"/);
  assert.match(settlement, /setPostingDate\(body\.liability_posting_control\?\.default_posting_date \|\| row\.period_end \|\| ""\)/);
  assert.match(settlement, /Period-end is open/);
  assert.match(settlement, /Period-end is closed \/ unavailable/);
  assert.match(settlement, /postingDateReason: alternatePostingDate \? postingDateReason : null/);
  assert.match(journalPosting, /await validateAccountingPeriod\(/);
});

test("VAT cash settlement continues to post on the real payment or refund date", () => {
  assert.match(settlementRoute, /const paymentDate = required\(body\.paymentDate \|\| body\.payment_date, "payment_date"\)/);
  assert.match(settlementRoute, /postingDate: paymentDate, documentDate: paymentDate/);
  assert.match(settlement, /paymentDate: cashForm\.date/);
});

test("VAT cash settlement is retry-stable across browser, Tax metadata and journal posting", () => {
  assert.match(settlement, /useRef/);
  assert.match(settlement, /cashOperationIdRef = useRef\(""\)/);
  assert.match(settlement, /cashOperationIdRef\.current = crypto\.randomUUID\(\)/);
  assert.match(settlement, /operationId: cashOperationIdRef\.current/);
  assert.match(settlement, /if \(success\) \{\s*cashOperationIdRef\.current = ""/);
  assert.match(settlement, /return false;/);
  assert.match(settlement, /return true;/);
  assert.match(settlementRoute, /const operationId = required\(body\.operationId \|\| body\.operation_id, "operation_id"\)/);
  assert.match(settlementRoute, /settlement\.cash_events\.find\(row => clean\(row\.operation_id \|\| row\.id\) === operationId\)/);
  assert.match(settlementRoute, /idempotent_replay: true/);
  assert.match(settlementRoute, /idempotencyKey: `vat-settlement-cash:\$\{vatReturn\.id\}:\$\{operationId\}`/);
  assert.match(settlementRoute, /id: operationId,\s*operation_id: operationId/);
  assert.doesNotMatch(settlementRoute, /const eventId = randomUUID\(\)/);
  assert.match(journalPosting, /p_idempotency_key: resolvedIdempotencyKey/);
});
