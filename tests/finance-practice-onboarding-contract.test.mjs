import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const route = fs.readFileSync(new URL("../app/api/workspace/finance/practice-onboarding/route.js", import.meta.url), "utf8");
const readiness = fs.readFileSync(new URL("../lib/finance/practice/FinancePracticeOnboardingReadiness.js", import.meta.url), "utf8");
const ui = fs.readFileSync(new URL("../components/workspace/finance/FinancePracticeOnboarding.jsx", import.meta.url), "utf8");
const tower = fs.readFileSync(new URL("../components/workspace/finance/FinancePracticeControlTower.jsx", import.meta.url), "utf8");

test("practice onboarding reuses governed document and signature authority", () => {
  assert.match(route, /linkControlledDocument/);
  assert.match(route, /createFinanceEngagementSignatureRequest/);
  assert.doesNotMatch(route, /createSignatureRequest\(/);
  assert.match(route, /referenceType: "ACCOUNTING_ENGAGEMENT"/);
  assert.match(route, /relationType: "CONTRACT"/);
  assert.match(route, /enterprise_document_links/);
  assert.match(route, /document_signature_requests/);
});

test("practice onboarding fails closed through human setup stages", () => {
  assert.match(route, /evaluatePracticeEngagementReadiness/);
  for (const state of ["NEEDS_ENTITY", "NEEDS_ENGAGEMENT_LETTER", "NEEDS_DOCUMENT_APPROVAL", "NEEDS_SIGNATURE_REQUEST", "AWAITING_SIGNATURE", "SIGNATURE_DECLINED", "NEEDS_BILLING_POLICY", "READY"]) assert.match(readiness, new RegExp(state));
  assert.match(route, /Avantiqo will not guess the client signer/);
  assert.match(ui, /No guessed signer/);
});

test("practice onboarding is first class in the accountant practice workspace", () => {
  assert.match(tower, /id: "onboarding", label: "Onboarding"/);
  assert.match(tower, /FinancePracticeOnboarding/);
  assert.match(ui, /Client onboarding/);
  assert.match(ui, /Governed engagement setup complete/);
});

test("onboarding resolves legal entity inside the governed engagement scope", () => {
  assert.match(route, /action === "set_entity"/);
  assert.match(route, /\.eq\("organization_id", engagement\.organization_id\)/);
  assert.match(route, /\.eq\("is_active", true\)/);
  assert.match(route, /\.update\(\{ entity_id: entity\.id/);
  assert.match(ui, /Client legal entity/);
  assert.match(ui, /Set entity/);
});

test("contract and signature cannot run before exact client entity scope exists", () => {
  assert.match(route, /Set the client legal entity before linking the engagement document/);
  assert.match(route, /Set the client legal entity before requesting signature/);
  assert.match(ui, /engagement\.entity_id && !engagement\.engagement_document/);
});

test("billing handoff preserves exact onboarding engagement and reuses Time & WIP authority", () => {
  const timeWip = fs.readFileSync(new URL("../components/workspace/finance/FinancePracticeTimeWip.jsx", import.meta.url), "utf8");
  assert.match(ui, /onOpenBilling\?\.\(engagement\.id\)/);
  assert.match(tower, /setBillingFocusEngagementId\(engagementId/);
  assert.match(tower, /initialEngagementId=\{billingFocusEngagementId\}/);
  assert.match(timeWip, /initialEngagementId/);
  assert.match(timeWip, /engagementId: initialEngagementId/);
  assert.match(timeWip, /action: "upsert_billing_profile"/);
});
