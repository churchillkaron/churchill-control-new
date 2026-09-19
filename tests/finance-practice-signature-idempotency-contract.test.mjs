import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const route = fs.readFileSync("app/api/workspace/finance/practice-onboarding/route.js", "utf8");
const ui = fs.readFileSync("components/workspace/finance/FinancePracticeOnboarding.jsx", "utf8");
const runtime = fs.readFileSync("lib/finance/practice/FinancePortalSignatureRuntime.js", "utf8");
const migration = fs.readFileSync("supabase/migrations/20260919082846_finance_native_signature_idempotency.sql", "utf8");
const documentRuntime = fs.readFileSync("lib/documents/runtime/DocumentControlRuntime.js", "utf8");

test("Finance onboarding requires exact signer name and valid signer email", () => {
  assert.match(route, /Signer name and signer email are required/);
  assert.match(route, /Signer email must be a valid email address/);
  assert.match(route, /signerEmail = clean\([\s\S]*\)\.toLowerCase\(\)/);
  assert.match(ui, /!form\.signerName\?\.trim\(\) \|\| !form\.signerEmail\?\.trim\(\)/);
});

test("document signature authority independently requires current approved document version", () => {
  assert.match(documentRuntime, /Approve the current document version before requesting signature/);
  assert.match(runtime, /exactDocumentVersion/);
  assert.match(runtime, /expected_document_checksum_sha256/);
  assert.match(runtime, /consent_version/);
});

test("Finance API rejects an already active native signature request", () => {
  assert.match(route, /\.from\("document_signature_requests"\)/);
  assert.match(route, /\.eq\("provider", "avantiqo_native_esign"\)/);
  assert.match(route, /\.in\("status", \["PENDING", "SENT", "VIEWED"\]\)/);
  assert.match(route, /An active signature request already exists for this engagement document/);
  assert.match(route, /signature_request_id/);
  assert.match(route, /signature_status/);
});

test("onboarding suppresses duplicate request form while signature is active", () => {
  assert.match(ui, /const activeSignature = engagement\.signatures\?\.find/);
  assert.match(ui, /"PENDING", "SENT", "VIEWED"/);
  assert.match(ui, /&& !activeSignature \? <div/);
  assert.match(ui, /A second request cannot be created while this one is active/);
  assert.match(ui, /documents\/library\/\$\{engagement\.engagement_document\?\.id\}/);
});

test("database prevents concurrent duplicate native e-sign slots", () => {
  assert.match(migration, /create unique index if not exists document_signature_requests_native_active_slot_unique/);
  assert.match(migration, /organization_id/);
  assert.match(migration, /enterprise_document_id/);
  assert.match(migration, /version_number/);
  assert.match(migration, /signing_order/);
  assert.match(migration, /provider = 'avantiqo_native_esign'/);
  assert.match(migration, /status in \('PENDING','SENT','VIEWED'\)/);
});

test("runtime converts database duplicate race into a 409 conflict", () => {
  assert.match(runtime, /23505/);
  assert.match(runtime, /document_signature_requests_native_active_slot_unique/);
  assert.match(runtime, /An active signature request already exists for this document version/);
  assert.match(runtime, /conflict\.status = 409/);
});
