import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");
const policy = read("lib/finance/tax/FinanceTaxPortfolioPolicy.js");
const clientDependencyPolicy = read("lib/finance/ui/FinanceClientDependencyPolicy.js");
const route = read("app/api/finance/tax/portfolio/route.js");
const workRoute = read("app/api/finance/vat-returns/dependency-work/route.js");
const rail = read("components/workspace/finance/FinanceTaxPortfolioRail.jsx");
const wrapper = read("components/workspace/finance/FinanceTaxWorkCenter.jsx");

test("Tax portfolio rebuilds live filing dependencies with bounded concurrency and legal-day ranking", () => {
  assert.match(route, /const PREFLIGHT_CONCURRENCY = 3/);
  assert.match(route, /mapWithConcurrency\(openReturns, PREFLIGHT_CONCURRENCY/);
  assert.match(route, /buildFinanceVatReturnPreflight/);
  assert.match(route, /applyFinanceTaxCalendarToPreflight\(raw, \{ now \}\)/);
  assert.match(route, /applyFinanceVatCalculationMethodToPreflight/);
  assert.match(route, /deriveFinanceTaxCloseGuidance/);
  assert.match(route, /getFinanceTaxLegalClock\(\{ jurisdictionCode: vatReturn\.jurisdiction_code, now \}\)/);
  assert.match(route, /today: legalClock\.legal_date/);
});

test("Tax portfolio fails closed per filing when live preflight cannot be rebuilt", () => {
  assert.match(route, /LIVE_PREFLIGHT_UNAVAILABLE/);
  assert.match(route, /Restore live Tax evidence check/);
  assert.match(route, /truth_state: "OPEN_BLOCKER"/);
  assert.match(route, /manual_complete_allowed: false/);
  assert.match(route, /Portfolio readiness failed closed because live Tax evidence could not be rebuilt/);
});

test("Tax portfolio merges coordination and governed client request context without changing truth", () => {
  assert.match(route, /finance_tax_dependency_work_envelopes/);
  assert.match(route, /accounting_client_requests/);
  assert.match(route, /buildFinanceTaxDependencyPortfolioRows/);
  assert.match(route, /resolution_authority: "LIVE_TAX_PREFLIGHT_ONLY"/);
  assert.match(route, /scope: "AUTHORIZED_ORGANIZATION_LEGAL_ENTITIES"/);
  assert.match(policy, /owned_by_me: ownedByMe/);
  assert.match(policy, /unowned: !envelope\?\.assigned_to/);
  assert.match(policy, /client_request_state: requestStatus/);
  assert.match(policy, /manual_complete_allowed: false/);
});

test("Tax portfolio reuses governed Finance client dependency policy on each filing legal date", () => {
  assert.match(policy, /import \{ resolveFinanceClientDependency \} from "@\/lib\/finance\/ui\/FinanceClientDependencyPolicy"/);
  assert.match(policy, /resolveFinanceClientDependency\(request, \{/);
  assert.match(policy, /workItem: \{ title: dependency\.title \}/);
  assert.match(policy, /today: guidance\.legal_date/);
  assert.match(policy, /legal_date: guidance\.legal_date \|\| null/);
  assert.match(clientDependencyPolicy, /state: "CLIENT_RESPONDED"/);
  assert.match(clientDependencyPolicy, /safeToFollowUp: false/);
  assert.match(clientDependencyPolicy, /state: "WAITING_NO_CHASE"/);
  assert.match(clientDependencyPolicy, /nextEligibleFollowUpAt/);
  assert.match(clientDependencyPolicy, /state: "ACCESS_EXPIRED"/);
  assert.match(clientDependencyPolicy, /state: "FOLLOW_UP_DUE"/);
});

test("Tax portfolio keeps statutory risk dominant while client coordination only refines queue order", () => {
  assert.match(policy, /Number\(filing\.priority \|\| 0\) \* 100/);
  assert.match(policy, /dependencyUrgency \* 5/);
  assert.match(policy, /coordinationBoost/);
  assert.match(policy, /clientDependencyBoost/);
  assert.match(policy, /target_overdue: targetOverdue/);
  assert.match(policy, /client_dependency_state: clientDependency\?\.state \|\| null/);
});

test("Tax control tower exposes accountant work views and opens only the exact current-entity filing", () => {
  assert.match(rail, /\["MINE", "Mine"\]/);
  assert.match(rail, /\["UNOWNED", "Unowned"\]/);
  assert.match(rail, /\["CLIENT", "Client evidence"\]/);
  assert.match(rail, /\["CLIENT_RESPONDED", "Client responded"\]/);
  assert.match(rail, /\["FOLLOW_UP", "Follow-up due"\]/);
  assert.match(rail, /\["DEADLINE", "Deadline ≤7d"\]/);
  assert.match(rail, /\["ACCOUNTANT", "Accountant blockers"\]/);
  assert.match(rail, /body\.scope !== "AUTHORIZED_ORGANIZATION_LEGAL_ENTITIES"/);
  assert.match(rail, /body\.resolution_authority !== "LIVE_TAX_PREFLIGHT_ONLY"/);
  assert.match(rail, /if \(row\.entity_id !== entityId\) return/);
  assert.match(rail, /onSelectedVatReturnIdChange\?\.\(row\.vat_return_id \|\| row\.id\)/);
  assert.match(rail, /Switch entity first/);
  assert.match(wrapper, /onSelectedVatReturnIdChange=\{setSelectedVatReturnId\}/);
  assert.doesNotMatch(rail, />\s*(Complete|Resolve|Close dependency)\s*</i);
});

test("Tax control tower explains safe client follow-up without sending reminders itself", () => {
  assert.match(rail, /client_dependency_title/);
  assert.match(rail, /client_dependency_detail/);
  assert.match(rail, /client_next_eligible_follow_up_at/);
  assert.match(rail, /client_should_wait/);
  assert.match(rail, /Do not chase/);
  assert.match(rail, /Human follow-up is eligible/);
  assert.match(rail, /no reminder is sent here/i);
  assert.doesNotMatch(rail, /fetch\([^\n]*(send|remind|message)/i);
  assert.doesNotMatch(rail, /requestJson\([^\n]*(send|remind|message)/i);
});

test("Tax portfolio can claim unowned coordination across authorized entities without bypassing filing scope", () => {
  assert.match(rail, /async function takeOwnership\(row\)/);
  assert.match(rail, /if \(!row\?\.unowned \|\| busyKey\) return/);
  assert.match(rail, /\/api\/finance\/vat-returns\/dependency-work/);
  assert.match(rail, /entityId: row\.entity_id/);
  assert.match(rail, /vatReturnId: row\.vat_return_id/);
  assert.match(rail, /dependencyCode: row\.code/);
  assert.match(rail, /action: "TAKE_OWNERSHIP"/);
  assert.match(rail, /Take ownership/);
  assert.match(workRoute, /loadLiveGuidance/);
  assert.match(workRoute, /This Tax dependency already has a current owner; refresh before changing ownership/);
  assert.match(workRoute, /Tax dependency is no longer active in live accounting truth; refresh before updating coordination work/);
  assert.match(rail, /if \(row\.entity_id !== entityId\) return/);
  assert.match(rail, /Switch entity first/);
});
