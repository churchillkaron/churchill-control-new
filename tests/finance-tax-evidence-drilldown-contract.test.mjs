import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");
const policy = read("lib/finance/tax/FinanceTaxEvidenceDrilldownPolicy.js");
const runtime = read("lib/finance/tax/FinanceTaxEvidenceDrilldownRuntime.js");
const route = read("app/api/finance/vat-returns/evidence-drilldown/route.js");
const rail = read("components/workspace/finance/FinanceTaxEvidenceDrilldownRail.jsx");
const wrapper = read("components/workspace/finance/FinanceTaxWorkCenter.jsx");
const preflight = read("lib/finance/tax/FinanceVatReturnPreflight.js");

test("Tax evidence drilldown rebuilds exact live filing truth before exposing detail", () => {
  assert.match(route, /buildFinanceVatReturnPreflight\(\{ organizationId: access\.organizationId, entityId, vatReturnId \}\)/);
  assert.match(route, /applyFinanceTaxCalendarToPreflight\(raw\)/);
  assert.match(route, /applyFinanceVatCalculationMethodToPreflight\(calendar\)/);
  assert.match(route, /deriveFinanceTaxCloseGuidance\(current\)/);
  assert.match(route, /current\?\.return\?\.id !== vatReturnId \|\| current\?\.return\?\.entity_id !== entityId/);
  assert.match(route, /Tax dependency is no longer active in live accounting truth/);
  assert.match(route, /resolution_authority: FINANCE_TAX_EVIDENCE_RESOLUTION_AUTHORITY/);
});

test("Transaction blocker evidence is re-evaluated across the full filing population, not the 250-row preview", () => {
  assert.match(preflight, /const EVIDENCE_PREVIEW_LIMIT = 250/);
  assert.match(preflight, /exceptions: exceptions\.slice\(0, EVIDENCE_PREVIEW_LIMIT\)/);
  assert.match(runtime, /const PAGE_SIZE = 1000/);
  assert.match(runtime, /const MAX_ROWS = 250000/);
  assert.match(runtime, /loadFinanceTaxEvidencePopulation/);
  assert.match(runtime, /customer_invoices/);
  assert.match(runtime, /vendor_invoices/);
  assert.match(runtime, /\.gte\("invoice_date", vatReturn\.period_start\)\.lte\("invoice_date", vatReturn\.period_end\)/);
  assert.match(runtime, /issues: filtered\.slice\(safeOffset, safeOffset \+ safeLimit\)/);
  assert.match(runtime, /has_more: safeOffset \+ safeLimit < filtered\.length/);
  assert.match(runtime, /complete: true/);
  assert.match(route, /source = "FULL_LIVE_FILING_POPULATION"/);
  assert.doesNotMatch(route, /evidence_preview/);
});

test("Tax evidence runtime mirrors governed sales, purchase, FX and duplicate predicates", () => {
  for (const marker of [
    "OUTPUT_TAX_CODE_MISSING",
    "OUTPUT_TAX_CODE_UNRESOLVED",
    "OUTPUT_VAT_RULE_NOT_EFFECTIVE",
    "OUTPUT_NOT_POSTED",
    "OUTPUT_POSTING_REVERSED",
    "INPUT_TAX_CODE_MISSING",
    "INPUT_TAX_CODE_UNRESOLVED",
    "INPUT_VAT_RULE_NOT_EFFECTIVE",
    "INPUT_NOT_APPROVED_POSTED",
    "INPUT_POSTING_REVERSED",
    "OUTPUT_EXCHANGE_RATE_MISSING",
    "INPUT_EXCHANGE_RATE_MISSING",
    "POTENTIAL_DUPLICATE_VENDOR_INVOICE",
  ]) {
    assert.match(preflight, new RegExp(marker));
    assert.match(runtime, new RegExp(marker));
  }
  assert.match(runtime, /upper\(invoice\.status\) === "POSTED" && upper\(invoice\.approval_status\) === "APPROVED"/);
  assert.match(runtime, /linkedJournal\.reversed !== true/);
  assert.match(runtime, /row\.reversed !== true/);
  assert.match(runtime, /vendor_party_id \|\| invoice\.vendor_id/);
});

test("Each transaction issue carries a compact accounting evidence chain and exact workspace target", () => {
  assert.match(runtime, /source_record: source/);
  assert.match(runtime, /tax_line: line/);
  assert.match(runtime, /tax_rule: rule/);
  assert.match(runtime, /posting_journal: journal/);
  assert.match(runtime, /workspace_target: workspaceTarget\(sourceType, sourceId\)/);
  assert.match(runtime, /workspace: "customer_invoices"/);
  assert.match(runtime, /workspace: "vendor_invoices"/);
  assert.match(runtime, /workspace: "journal_entries"/);
  assert.match(runtime, /workspace: "tax_rules"/);
  assert.match(runtime, /context_mutation_allowed: false/);
});

test("Duplicate warning evidence exposes every grouped vendor invoice with exact read-only source navigation", () => {
  assert.match(runtime, /eligibleVatSummaryByInvoice/);
  assert.match(runtime, /duplicate_records: duplicateRecords/);
  assert.match(runtime, /tax_amount: summary\.tax_amount/);
  assert.match(runtime, /vat_line_count: summary\.vat_line_count/);
  assert.match(runtime, /posting_journal: journalRecord\(postingJournal\)/);
  assert.match(route, /attachDuplicateCandidateNavigation/);
  assert.match(route, /workspace: "vendor_invoices", record_id: record\.id, context_mutation_allowed: false/);
  assert.match(route, /source_navigation: duplicateCandidateNavigation/);
  assert.match(rail, /Potential duplicate group/);
  assert.match(rail, /Compare all \{records\.length\} VAT-bearing purchase documents before filing\./);
  assert.match(rail, /Review only · live accounting truth clears the warning/);
  assert.match(rail, /Open this invoice/);
  assert.doesNotMatch(rail, /Mark reviewed|Resolve duplicate|Dismiss warning/);
});

test("Filing deadline warning exposes governed statutory authority lineage without fabricating a transaction", () => {
  assert.match(route, /function buildCalendarEvidence\(current\)/);
  assert.match(route, /taxCalendar\?\.resolution/);
  assert.match(route, /recorded_due_date: taxCalendar\?\.recorded_due_date/);
  assert.match(route, /statutory_due_date: resolution\?\.statutory_due_date/);
  assert.match(route, /legal_time_zone: legalClock\?\.time_zone/);
  assert.match(route, /authority: resolution\?\.authority/);
  assert.match(route, /calendar_evidence: upper\(item\?\.source_type\) === "TAX_CALENDAR_CONTEXT" \? governedCalendarEvidence : null/);
  assert.match(rail, /Statutory deadline evidence/);
  assert.match(rail, /Why this deadline/);
  assert.match(rail, /This is the same governed calendar resolution used by live Tax preflight/);
  assert.match(rail, /Recorded filing date/);
  assert.match(rail, /Governed statutory date/);
  assert.match(rail, /Legal clock/);
  assert.match(rail, /Authority lineage/);
  assert.match(rail, /Revenue Department source/);
  assert.match(rail, /Review filing method & deadline/);
  assert.doesNotMatch(rail, /Mark deadline reviewed|Acknowledge deadline|Resolve deadline/);
});

test("Evidence deadline handoff returns to the selected filing calendar rather than constructing a raw transaction route", () => {
  assert.match(wrapper, /onStageChange=\{changeStage\}/);
  assert.match(rail, /onStageChange = null/);
  assert.match(rail, /onStageChange\("RETURN"\)/);
  assert.match(rail, /Review only · live Tax truth decides whether this warning remains\./);
  assert.doesNotMatch(route, /calendar_evidence.*source_record/);
});

test("Evidence controls separate filing blockers from review-only work without weakening focused warning handoffs", () => {
  assert.match(rail, /function EvidenceControlSelector/);
  assert.match(rail, /dependencies\.filter\(item => item\.blocking === true\)/);
  assert.match(rail, /dependencies\.filter\(item => item\.blocking !== true\)/);
  assert.match(rail, /Blocking · \{blocking\.length\}/);
  assert.match(rail, /Review only · \{reviewOnly\.length\}/);
  assert.match(rail, /Must clear before filing/);
  assert.match(rail, /Does not block filing/);
  assert.match(rail, /Next required · /);
  assert.match(rail, /dependencies\.find\(item => item\.blocking === true\)\?\.code \|\| dependencies\[0\]\?\.code \|\| null/);
  assert.match(rail, /if \(requestedFocus && dependencies\.some\(item => item\.code === requestedFocus\)\) return requestedFocus/);
  assert.match(rail, /selected\.blocking \? "Blocking" : "Review only"/);
  assert.match(rail, /selected\.blocking \? "Next required action" : "Review action"/);
  assert.doesNotMatch(rail, /Mark reviewed|Resolve warning|Dismiss warning/);
});

test("Tax calendar authority evidence cannot present a live filing blocker as review-only or accepted override evidence", () => {
  assert.match(rail, /function DeadlineReview\(\{ evidence, issue, onOpenCalendar \}\)/);
  assert.match(rail, /const blocking = issue\?\.severity === "BLOCK"/);
  assert.match(rail, /const authorityControl = issue\?\.code === "TAX_CALENDAR_AUTHORITY"/);
  assert.match(rail, /MANUAL_JURISDICTION_REQUIRED/);
  assert.match(rail, /Recorded date conflicts with policy/);
  assert.match(rail, /Official confirmation required/);
  assert.match(rail, /Statutory authority control/);
  assert.match(rail, /Filing blocked:/);
  assert.match(rail, /This control cannot be cleared in Evidence; filing stays blocked until live Tax preflight accepts the deadline authority\./);
  assert.match(rail, /Authority date required/);
  assert.match(rail, /Manual authority evidence required/);
  assert.match(rail, /Recorded override evidence · not accepted by live preflight:/);
  assert.match(rail, /Recorded authority evidence · not accepted by live preflight:/);
  assert.match(rail, /Required proof:/);
  assert.match(rail, /Blocking · filing remains unavailable until live Tax preflight accepts the authority evidence\./);
  assert.match(rail, /blocking \? "Fix deadline authority" : "Review filing method & deadline"/);
  assert.match(rail, /<DeadlineReview evidence=\{calendarEvidence\} issue=\{issue\} onOpenCalendar=\{onOpenCalendar\}\/>/);
  assert.doesNotMatch(rail, /Mark authority reviewed|Acknowledge authority|Resolve authority/);
});

test("Evidence drilldown is organization-scoped, read-only and cannot mutate Business Context", () => {
  assert.match(route, /requireOrganizationAccess/);
  assert.match(route, /requireFinanceWorkspacePermission\(\{ capabilityId: "vat_returns", operation: "read", access \}\)/);
  assert.match(route, /mutation_authority: false/);
  assert.match(route, /context_mutation_authority: false/);
  assert.doesNotMatch(route, /financeGateway/);
  assert.doesNotMatch(route, /\.insert\(|\.update\(|\.delete\(/);
  assert.doesNotMatch(runtime, /\.insert\(|\.update\(|\.delete\(/);
  assert.match(rail, /never switches Business Context/);
  assert.match(rail, /cannot post, recode, alter FX, update a VAT rule, complete work, or mutate Business Context/);
});

test("Configuration and authority blockers remain inspectable without fabricating transaction records", () => {
  assert.match(policy, /REGISTRATION_CONTEXT/);
  assert.match(policy, /VAT_RULE_CONTEXT/);
  assert.match(policy, /TAX_CALENDAR_CONTEXT/);
  assert.match(policy, /VAT_CALCULATION_CONTEXT/);
  assert.match(route, /source = "LIVE_PREFLIGHT_CONTEXT"/);
  assert.match(route, /configWorkspaceTarget/);
  assert.match(policy, /manual_complete_allowed: false/);
});

test("Tax evidence inspector is filing-bound, paginated and isolated from coordination work", () => {
  assert.match(wrapper, /FinanceTaxEvidenceDrilldownRail/);
  assert.match(wrapper, /selectedVatReturnId=\{selectedVatReturnId\}/);
  assert.match(wrapper, /activeStage === "EVIDENCE" \? <FinanceTaxEvidenceDrilldownRail/);
  assert.match(wrapper, /activeStage === "FIX" \? <>/);
  assert.match(wrapper, /<FinanceTaxDependencyWorkRail/);
  assert.match(rail, /Read only · full population/);
  assert.match(rail, /Complete live population/);
  assert.match(rail, /Source document/);
  assert.match(rail, /Tax line/);
  assert.match(rail, /Governed VAT rule/);
  assert.match(rail, /Posting proof/);
  assert.match(rail, /> Previous</);
  assert.match(rail, /Next <ChevronRight/);
  assert.match(rail, /body\.return_id !== selectedVatReturnId \|\| body\.entity_id !== entityId/);
  assert.match(rail, /body\.resolution_authority !== "LIVE_TAX_PREFLIGHT_ONLY" \|\| body\.mutation_authority !== false \|\| body\.context_mutation_authority !== false/);
});
