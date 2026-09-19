import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const planner = fs.readFileSync("lib/finance/practice/recurringCyclePlanner.js", "utf8");
const readiness = fs.readFileSync("lib/finance/practice/FinancePracticeOnboardingReadiness.js", "utf8");
const onboarding = fs.readFileSync("app/api/workspace/finance/practice-onboarding/route.js", "utf8");
const tower = fs.readFileSync("components/workspace/finance/FinancePracticeControlTower.jsx", "utf8");

test("onboarding and recurring planner share one readiness authority", () => {
  assert.match(onboarding, /evaluatePracticeEngagementReadiness/);
  assert.match(planner, /evaluatePracticeEngagementReadiness/);
  for (const state of ["NEEDS_ENTITY", "NEEDS_ENGAGEMENT_LETTER", "NEEDS_DOCUMENT_APPROVAL", "NEEDS_SIGNATURE_REQUEST", "SIGNATURE_DECLINED", "AWAITING_SIGNATURE", "NEEDS_BILLING_POLICY", "READY"]) {
    assert.match(readiness, new RegExp(state));
  }
});

test("recurring cycles fail closed until governed onboarding is READY", () => {
  assert.match(planner, /onboarding\.state !== "READY"/);
  assert.match(planner, /status: "BLOCKED_ONBOARDING"/);
  assert.match(planner, /enterprise_document_links/);
  assert.match(planner, /document_signature_requests/);
  assert.match(planner, /accounting_practice_billing_profiles/);
  assert.match(planner, /onboarding_state: onboarding\.state/);
});

test("cycle workspace makes onboarding blockers visible and cannot materialize them", () => {
  assert.match(tower, /blocked_onboarding/);
  assert.match(tower, /Authority setup incomplete/);
  assert.match(tower, /candidate\.status === "READY_TO_CREATE"/);
});
