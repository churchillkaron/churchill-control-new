import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { pathToFileURL } from "node:url";

const helperPath = new URL("../lib/finance/practice/FinancePracticeBillingPolicyReadiness.js", import.meta.url);
const { practiceBillingPolicyBlockers, practiceBillingPolicyReady } = await import(pathToFileURL(helperPath.pathname).href);
const onboarding = fs.readFileSync(new URL("../lib/finance/practice/FinancePracticeOnboardingReadiness.js", import.meta.url), "utf8");
const timeRoute = fs.readFileSync(new URL("../app/api/workspace/finance/practice-time/route.js", import.meta.url), "utf8");
const timeUi = fs.readFileSync(new URL("../components/workspace/finance/FinancePracticeTimeWip.jsx", import.meta.url), "utf8");
const planner = fs.readFileSync(new URL("../lib/finance/practice/recurringCyclePlanner.js", import.meta.url), "utf8");
const onboardingRoute = fs.readFileSync(new URL("../app/api/workspace/finance/practice-onboarding/route.js", import.meta.url), "utf8");
const billingRoute = fs.readFileSync(new URL("../app/api/workspace/finance/practice-billing/route.js", import.meta.url), "utf8");
const referenceRuntime = fs.readFileSync(new URL("../lib/finance/practice/FinancePracticeBillingReferenceReadiness.js", import.meta.url), "utf8");

const complete = {
  billing_method: "TIME_AND_MATERIALS",
  billing_entity_id: "entity",
  customer_party_id: "customer",
  revenue_account_id: "revenue",
  tax_rule_id: "tax",
  tax_treatment_confirmed: true,
  default_hourly_rate: 2500,
  billing_cadence: "ON_DEMAND",
};

test("billable practice policy fails closed until commercial setup is complete", () => {
  assert.deepEqual(practiceBillingPolicyBlockers(null), ["Billing policy missing"]);
  const blockers = practiceBillingPolicyBlockers({ billing_method: "TIME_AND_MATERIALS" });
  for (const expected of [
    "Billing entity missing",
    "Finance customer missing",
    "Revenue account missing",
    "Tax rule missing",
    "Tax treatment not confirmed",
    "Default hourly rate missing",
  ]) assert.ok(blockers.includes(expected));
  assert.equal(practiceBillingPolicyReady({ ...complete, default_hourly_rate: 0 }), false);
  assert.equal(practiceBillingPolicyReady(complete), true);
});

test("fixed and hybrid billing require their governed fee terms", () => {
  assert.ok(practiceBillingPolicyBlockers({ ...complete, billing_method: "FIXED_FEE", default_hourly_rate: null, fixed_fee_amount: 0 }).includes("Fixed fee missing"));
  assert.ok(practiceBillingPolicyBlockers({ ...complete, billing_method: "HYBRID", fixed_fee_amount: null }).includes("Fixed fee missing"));
  assert.equal(practiceBillingPolicyReady({ ...complete, billing_method: "HYBRID", fixed_fee_amount: 10000 }), true);
});

test("recurring billing requires the first governed billing date", () => {
  assert.ok(practiceBillingPolicyBlockers({ ...complete, billing_cadence: "MONTHLY", next_billing_date: null }).includes("Next billing date missing"));
  assert.equal(practiceBillingPolicyReady({ ...complete, billing_cadence: "MONTHLY", next_billing_date: "2026-10-01" }), true);
});

test("explicit non-billable engagement is commercially complete without invoice references", () => {
  assert.deepEqual(practiceBillingPolicyBlockers({ billing_method: "NON_BILLABLE" }), []);
  assert.equal(practiceBillingPolicyReady({ billing_method: "NON_BILLABLE" }), true);
});

test("onboarding and Time WIP consume one shared billing policy authority", () => {
  assert.match(onboarding, /practiceBillingPolicyBlockers/);
  assert.match(onboarding, /state: "NEEDS_BILLING_POLICY"/);
  assert.match(onboarding, /blockers: billingBlockers/);
  assert.match(timeRoute, /practiceBillingPolicyBlockers/);
  assert.match(timeRoute, /billing_policy_blockers: practiceBillingPolicyBlockers\(data\)/);
  assert.match(timeUi, /Billing policy saved, but setup is not complete/);
  assert.match(timeUi, /Billing policy complete/);
});

test("recurring planner loads the full billing policy consumed by onboarding readiness", () => {
  for (const field of [
    "default_hourly_rate",
    "fixed_fee_amount",
    "billing_entity_id",
    "customer_party_id",
    "revenue_account_id",
    "tax_rule_id",
    "tax_treatment_confirmed",
    "billing_cadence",
    "next_billing_date",
  ]) assert.match(planner, new RegExp(field));
});

test("live billing reference freshness validates operational evidence, not saved UUID presence", () => {
  assert.match(referenceRuntime, /legal_entities/);
  assert.match(referenceRuntime, /\.eq\("is_active", true\)/);
  assert.match(referenceRuntime, /parties/);
  assert.match(referenceRuntime, /upper\(row\.status\) === "ACTIVE"/);
  assert.match(referenceRuntime, /chart_of_accounts/);
  assert.match(referenceRuntime, /type\.includes\("REVENUE"\) \|\| type\.includes\("INCOME"\)/);
  assert.match(referenceRuntime, /tax_rules/);
  assert.match(referenceRuntime, /effectiveToday/);
  assert.match(referenceRuntime, /regimeMatchesCountry/);
});

test("onboarding recurring planning and invoice creation all fail closed on stale billing references", () => {
  assert.match(onboarding, /billingReferenceBlockers/);
  assert.match(onboardingRoute, /loadPracticeBillingReferenceBlockers/);
  assert.match(onboardingRoute, /billingReferenceBlockers\.get\(billingProfile\.id\)/);
  assert.match(planner, /loadPracticeBillingReferenceBlockers/);
  assert.match(planner, /billingReferenceBlockers\.get\(billingProfile\.id\)/);
  assert.match(billingRoute, /loadPracticeBillingReferenceBlockers/);
  assert.match(billingRoute, /Billing policy references are no longer valid/);
  assert.match(billingRoute, /409/);
});
