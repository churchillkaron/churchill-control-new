import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20260918153000_finance_portal_delivery_native_esign.sql");
const delivery = read("lib/finance/practice/FinanceClientPortalDeliveryRuntime.js");
const signature = read("lib/finance/practice/FinancePortalSignatureRuntime.js");
const adminRoute = read("app/api/workspace/finance/practice-client-portal/route.js");
const onboarding = read("app/api/workspace/finance/practice-onboarding/route.js");
const publicRoute = read("app/api/public/finance/client-portal/[token]/signatures/[signatureRequestId]/route.js");
const staffSignatureRoute = read("app/api/documents/[documentId]/signatures/route.js");
const projection = read("lib/finance/practice/FinanceClientPortalProjection.js");
const clientPage = read("app/client/accounting/[token]/page.jsx");
const signPage = read("app/client/accounting/[token]/sign/[signatureRequestId]/page.jsx");

test("portal delivery receipts are durable and service-role isolated", () => {
  assert.match(migration, /finance_client_portal_deliveries/);
  assert.match(migration, /portal_grant_id uuid not null references public\.accounting_client_portal_grants/);
  assert.match(migration, /status in \('PENDING','CREDENTIAL_REQUIRED','SENDING','SENT','FAILED'\)/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all on table public\.finance_client_portal_deliveries from anon, authenticated/);
});

test("portal email delivery reuses Avantiqo provider execution and fails truthfully without mailbox credentials", () => {
  assert.match(delivery, /executeService/);
  assert.match(delivery, /WalletRepository/);
  assert.match(delivery, /communication\.email\.send/);
  assert.match(delivery, /email_google/);
  assert.match(delivery, /email_microsoft/);
  assert.match(delivery, /email_imap/);
  assert.match(delivery, /CREDENTIAL_REQUIRED/);
  assert.match(delivery, /EMAIL_PROVIDER_CREDENTIAL_REQUIRED/);
  assert.doesNotMatch(delivery, /process\.env\.(SMTP|SENDGRID|RESEND|POSTMARK)/);
});

test("portal issue attempts delivery while preserving the one-time manual fallback", () => {
  assert.match(adminRoute, /deliverFinanceClientPortalAccess/);
  assert.match(adminRoute, /token_returned_once: true/);
  assert.match(adminRoute, /delivery_readiness/);
  assert.match(adminRoute, /client_path: clientPath/);
});

test("native signer is bound to exact portal identity engagement contract and document checksum", () => {
  assert.match(signature, /resolveFinanceClientPortalGrant/);
  assert.match(signature, /signer_email/);
  assert.match(signature, /reference_type", "ACCOUNTING_ENGAGEMENT/);
  assert.match(signature, /reference_id", grant\.engagement_id/);
  assert.match(signature, /exactDocumentVersion/);
  assert.match(signature, /SIGNATURE_DOCUMENT_CHECKSUM_REQUIRED/);
  assert.match(signature, /expected_document_checksum_sha256/);
  assert.match(signature, /Signature document checksum no longer matches/);
});

test("native signer requires typed identity and explicit consent before SIGNED", () => {
  assert.match(signature, /Type your full name to sign/);
  assert.match(signature, /Typed signer name does not match this signature request/);
  assert.match(signature, /Electronic signature consent is required/);
  assert.match(signature, /AVANTIQO_NATIVE_ESIGN_CONSENT_V1/);
  assert.match(signature, /signature_authority_created: true/);
  assert.match(signature, /qualified_digital_signature: false/);
  assert.match(signature, /legal_effect_depends_on_applicable_law: true/);
  assert.match(signature, /signature_evidence_hash/);
  assert.match(signature, /document_signature_events/);
});

test("onboarding uses governed native signing instead of record-only signature rows", () => {
  assert.match(onboarding, /createFinanceEngagementSignatureRequest/);
  assert.doesNotMatch(onboarding, /createSignatureRequest\(/);
  assert.match(signature, /provider: "avantiqo_native_esign"/);
});

test("public signing surface exposes review/sign and signer-only execution endpoint", () => {
  assert.match(publicRoute, /getFinancePortalSignature/);
  assert.match(publicRoute, /executeFinancePortalSignature/);
  assert.match(signPage, /Open and review exact document/);
  assert.match(signPage, /Sign document/);
  assert.match(signPage, /simple electronic signature/);
  assert.match(signPage, /not represented as a qualified or certificate-based digital signature/);
  assert.match(projection, /sign_path/);
  assert.match(clientPage, /Review & sign/);
});

test("staff cannot manufacture SIGNED or DECLINED through the generic Documents PATCH API", () => {
  assert.match(staffSignatureRoute, /\["SIGNED", "DECLINED"\]/);
  assert.match(staffSignatureRoute, /DOCUMENT_SIGNATURE_TERMINAL_STATUS_REQUIRES_EXECUTION_EVIDENCE/);
  assert.match(staffSignatureRoute, /governed signer or provider execution runtime/);
});
