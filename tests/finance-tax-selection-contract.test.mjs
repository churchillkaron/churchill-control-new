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
const closeGuidancePolicy = read("lib/finance/tax/FinanceTaxCloseGuidancePolicy.js");
const closeGuidanceRail = read("components/workspace/finance/FinanceTaxCloseGuidanceRail.jsx");
const dependencyWorkRail = read("components/workspace/finance/FinanceTaxDependencyWorkRail.jsx");
const dependencyWorkRoute = read("app/api/finance/vat-returns/dependency-work/route.js");
const dependencyWorkMigration = read("supabase/migrations/20260905010500_finance_tax_dependency_work_envelopes.sql");
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

test("Tax close guidance derives dependencies from live accounting truth rather than manual completion", () => {
  assert.match(closeGuidancePolicy, /deriveFinanceTaxCloseGuidance/);
  assert.match(closeGuidancePolicy, /manual_complete_allowed: false/);
  assert.match(closeGuidancePolicy, /Dependencies are derived from live Tax evidence/);
  assert.match(closeGuidancePolicy, /A human cannot mark them complete while the underlying accounting or authority condition still fails/);
  assert.match(closeGuidancePolicy, /INPUT_POSTING/);
  assert.match(closeGuidancePolicy, /OUTPUT_POSTING/);
  assert.match(closeGuidancePolicy, /CALCULATION_FRESHNESS/);
  assert.match(closeGuidancePolicy, /TAX_CALENDAR_AUTHORITY/);
});

test("Tax close guidance separates client evidence from accountant work and protects communication control", () => {
  assert.match(closeGuidancePolicy, /CLIENT_EVIDENCE_ACCOUNTANT_VALIDATION/);
  assert.match(closeGuidancePolicy, /client_request_recommended: clientEvidence/);
  assert.match(closeGuidancePolicy, /DRAFT_OR_GOVERNED_REQUEST_ONLY/);
  assert.match(closeGuidancePolicy, /never sends client communication automatically/i);
  assert.match(closeGuidanceRail, /Client evidence · accountant validates/);
  assert.match(closeGuidanceRail, /Accounting team/);
  assert.match(closeGuidanceRail, /this panel never sends a message automatically/i);
  assert.doesNotMatch(closeGuidanceRail, /fetch\([^\n]*(send|remind|message)/i);
});

test("Tax close guidance is bound to the exact shared filing and surfaces resolution proof", () => {
  assert.match(wrapper, /FinanceTaxCloseGuidanceRail/);
  assert.match(wrapper, /selectedVatReturnId=\{selectedVatReturnId\}/);
  assert.match(closeGuidanceRail, /url\.searchParams\.set\("vatReturnId", selectedVatReturnId\)/);
  assert.match(closeGuidanceRail, /preflight\.return\.id !== selectedVatReturnId/);
  assert.match(closeGuidanceRail, /Resolution proof/);
  assert.match(closeGuidanceRail, /Next safe action/);
  assert.match(closeGuidanceRail, /Statutory deadline/);
});

test("Tax dependency work envelope stores coordination but has no manual resolution state", () => {
  assert.match(dependencyWorkMigration, /finance_tax_dependency_work_envelopes/);
  assert.match(dependencyWorkMigration, /assigned_to uuid/);
  assert.match(dependencyWorkMigration, /target_at timestamptz/);
  assert.match(dependencyWorkMigration, /acknowledged_at timestamptz/);
  assert.match(dependencyWorkMigration, /client_request_id uuid null references public\.accounting_client_requests/);
  assert.match(dependencyWorkMigration, /Resolution is never stored here/);
  assert.doesNotMatch(dependencyWorkMigration, /\bresolved\s+(boolean|text|timestamptz)/i);
  assert.doesNotMatch(dependencyWorkMigration, /\bstatus\s+text/i);
});

test("Tax dependency work writes revalidate live accounting truth and reject manual completion", () => {
  assert.match(dependencyWorkRoute, /loadLiveGuidance/);
  assert.match(dependencyWorkRoute, /buildFinanceVatReturnPreflight/);
  assert.match(dependencyWorkRoute, /applyFinanceTaxCalendarToPreflight/);
  assert.match(dependencyWorkRoute, /applyFinanceVatCalculationMethodToPreflight/);
  assert.match(dependencyWorkRoute, /deriveFinanceTaxCloseGuidance/);
  assert.match(dependencyWorkRoute, /\["RESOLVE", "COMPLETE", "CLOSE", "DONE"\]/);
  assert.match(dependencyWorkRoute, /Tax dependencies cannot be completed manually/);
  assert.match(dependencyWorkRoute, /Tax dependency is no longer active in live accounting truth/);
  assert.match(dependencyWorkRoute, /resolution_authority: "LIVE_TAX_PREFLIGHT_ONLY"/);
});

test("Tax dependency ownership is durable, scoped and cannot be released by another user", () => {
  assert.match(dependencyWorkMigration, /unique \(organization_id, entity_id, vat_return_id, dependency_code\)/);
  assert.match(dependencyWorkRoute, /current_user_id: access\.user\?\.id \|\| null/);
  assert.match(dependencyWorkRoute, /if \(action === "TAKE_OWNERSHIP"\) next\.assigned_to = actorId/);
  assert.match(dependencyWorkRoute, /existing\?\.assigned_to && existing\.assigned_to !== actorId/);
  assert.match(dependencyWorkRoute, /Only the current Tax dependency owner can release ownership/);
});

test("Tax dependency coordination uses the exact shared filing and cannot complete evidence", () => {
  assert.match(wrapper, /FinanceTaxDependencyWorkRail/);
  assert.match(wrapper, /selectedVatReturnId=\{selectedVatReturnId\}/);
  assert.match(dependencyWorkRail, /url\.searchParams\.set\("vatReturnId", selectedVatReturnId\)/);
  assert.match(dependencyWorkRail, /body\.return_id !== selectedVatReturnId/);
  assert.match(dependencyWorkRail, /Take ownership/);
  assert.match(dependencyWorkRail, /Acknowledge/);
  assert.match(dependencyWorkRail, /Internal target/);
  assert.match(dependencyWorkRail, /Coordination note/);
  assert.match(dependencyWorkRail, /Resolution authority: live Tax preflight only/);
  assert.doesNotMatch(dependencyWorkRail, />\s*(Complete|Resolve|Close)\s*</i);
});
