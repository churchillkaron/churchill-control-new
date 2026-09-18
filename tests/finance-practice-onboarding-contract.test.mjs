import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const route = fs.readFileSync(new URL("../app/api/workspace/finance/practice-onboarding/route.js", import.meta.url), "utf8");
const ui = fs.readFileSync(new URL("../components/workspace/finance/FinancePracticeOnboarding.jsx", import.meta.url), "utf8");
const tower = fs.readFileSync(new URL("../components/workspace/finance/FinancePracticeControlTower.jsx", import.meta.url), "utf8");

test("practice onboarding reuses governed document and signature authority", () => {
  assert.match(route, /linkControlledDocument/);
  assert.match(route, /createSignatureRequest/);
  assert.match(route, /referenceType: "ACCOUNTING_ENGAGEMENT"/);
  assert.match(route, /relationType: "CONTRACT"/);
  assert.match(route, /enterprise_document_links/);
  assert.match(route, /document_signature_requests/);
});

test("practice onboarding fails closed through human setup stages", () => {
  for (const state of ["NEEDS_ENTITY", "NEEDS_ENGAGEMENT_LETTER", "NEEDS_DOCUMENT_APPROVAL", "NEEDS_SIGNATURE_REQUEST", "AWAITING_SIGNATURE", "SIGNATURE_DECLINED", "NEEDS_BILLING_POLICY", "READY"]) assert.match(route, new RegExp(state));
  assert.match(route, /Avantiqo will not guess the client signer/);
  assert.match(ui, /No guessed signer/);
});

test("practice onboarding is first class in the accountant practice workspace", () => {
  assert.match(tower, /id: "onboarding", label: "Onboarding"/);
  assert.match(tower, /FinancePracticeOnboarding/);
  assert.match(ui, /Client onboarding/);
  assert.match(ui, /Governed engagement setup complete/);
});
