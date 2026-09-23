import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync(new URL("../supabase/migrations/20260920062536_staff_phone_verification.sql", import.meta.url), "utf8");
const phoneRuntime = fs.readFileSync(new URL("../lib/people/workforce/StaffPhoneVerificationRuntime.js", import.meta.url), "utf8");
const serviceExecutionRuntime = fs.readFileSync(new URL("../lib/platform/service-runtime/execution/ServiceExecutionRuntime.js", import.meta.url), "utf8");
const activationRuntime = fs.readFileSync(new URL("../lib/people/workforce/StaffActivationRuntime.js", import.meta.url), "utf8");
const contextRuntime = fs.readFileSync(new URL("../lib/people/runtime/resolveAuthenticatedStaffContext.js", import.meta.url), "utf8");
const layout = fs.readFileSync(new URL("../app/(system)/staff/layout.jsx", import.meta.url), "utf8");
const setup = fs.readFileSync(new URL("../components/staff/StaffActivationSetup.jsx", import.meta.url), "utf8");
const activationRoute = fs.readFileSync(new URL("../app/api/staff/activation/route.js", import.meta.url), "utf8");
const activationProjection = fs.readFileSync(new URL("../lib/people/portal/StaffActivationProjection.js", import.meta.url), "utf8");
const phoneRoute = fs.readFileSync(new URL("../app/api/staff/phone-verification/route.js", import.meta.url), "utf8");

test("owned phone OTP ledger stores only HMAC proof and is server-only", () => {
  assert.match(migration, /code_hmac text not null/);
  assert.doesNotMatch(migration, /\bcode\s+text\b/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all on table public\.staff_phone_verifications from anon, authenticated/);
  assert.match(phoneRuntime, /createHmac\("sha256"/);
  assert.match(phoneRuntime, /randomInt\(100000, 1000000\)/);
  assert.match(phoneRuntime, /MAX_ATTEMPTS = 5/);
  assert.match(phoneRuntime, /RESEND_COOLDOWN_MS = 60 \* 1000/);
});

test("phone verification uses WhatsApp first and SMS only as fallback", () => {
  const whatsapp = phoneRuntime.indexOf('service_id: "whatsapp"');
  const sms = phoneRuntime.indexOf('service_id: "sms"');
  assert.ok(whatsapp >= 0 && sms > whatsapp);
  assert.match(phoneRuntime, /verification_channel: "WHATSAPP"/);
  assert.match(phoneRuntime, /fallback_from: "WHATSAPP"/);
  assert.match(setup, /WhatsApp is used first; SMS is only a fallback/);
});

test("staff WhatsApp verification preserves the designated credential through governed execution", () => {
  assert.match(phoneRuntime, /credential_id: transport\.credentialId/);
  assert.match(serviceExecutionRuntime, /credential_id = null/);
  assert.match(serviceExecutionRuntime, /credential_id: credential_id \|\| selectedProvider\.credential_id \|\| null/);
});

test("staff WhatsApp verification distinguishes Meta acceptance from delivery and accepts webhook delivery truth", () => {
  assert.match(phoneRuntime, /status: "ACCEPTED"/);
  assert.match(phoneRuntime, /applyStaffPhoneVerificationDeliveryStatus/);
  assert.match(phoneRuntime, /\["SENT", "DELIVERED", "READ", "FAILED"\]/);
  assert.match(phoneRuntime, /\.eq\("external_message_id", providerMessageId\)/);
  assert.match(phoneRuntime, /\.eq\("status", "PENDING"\)/);
  assert.match(phoneRuntime, /status: delivery\.status/);
});

test("staff setup follows asynchronous WhatsApp delivery status without exposing provider payloads", () => {
  assert.match(phoneRuntime, /staff_phone_verification_challenges/);
  assert.match(phoneRuntime, /deliveryFailure: publicDeliveryFailure/);
  assert.match(phoneRuntime, /WhatsApp delivery is temporarily unavailable for this employer/);
  assert.match(setup, /fetch\("\/api\/staff\/phone-verification", \{ cache: "no-store" \}\)/);
  assert.match(setup, /deliveryStatus === "FAILED"/);
  assert.match(setup, /\["SENT", "DELIVERED", "READ"\]/);
  assert.match(setup, /Last delivery:/);
  assert.doesNotMatch(setup, /deliveryErrorMessage/);
});

test("phone proof is bound to the current canonical Party phone", () => {
  assert.match(phoneRuntime, /from\("parties"\)/);
  assert.match(phoneRuntime, /phoneHash\(canonical\.phone\)/);
  assert.match(phoneRuntime, /PHONE_VERIFICATION_PHONE_CHANGED/);
  assert.match(phoneRuntime, /international format, for example \+66812345678/);
});

test("staff activation requires email, phone, identity and used passkey", () => {
  assert.match(activationRuntime, /emailVerified && phoneVerified && identityVerified && passkeyVerified/);
  assert.match(activationRuntime, /user\.email_confirmed_at/);
  assert.match(activationRuntime, /loadStaffPhoneVerification/);
  assert.match(activationRuntime, /loadStaffIdentityVerification/);
  assert.match(activationRuntime, /loadStaffPasskeyStatus/);
  assert.match(activationRuntime, /Boolean\(passkey\.lastUsedAt\)/);
});

test("super admin bypasses staff phone identity and passkey activation gates", () => {
  assert.match(activationRuntime, /ACTIVATION_BYPASS_ROLES = new Set\(\["SUPER_ADMIN"\]\)/);
  assert.match(activationRuntime, /ACTIVATION_BYPASS_ROLES\.has\(role\)/);
  assert.match(activationRuntime, /reason: "SUPER_ADMIN"/);
  assert.match(activationRuntime, /status: "ADMIN_BYPASS"/);
  const bypassIndex = activationRuntime.indexOf("ACTIVATION_BYPASS_ROLES.has(role)");
  const phoneLoadIndex = activationRuntime.indexOf("loadStaffPhoneVerification({ organizationId, staff })");
  assert.ok(bypassIndex >= 0 && phoneLoadIndex > bypassIndex);
});

test("normal authenticated staff context rejects incomplete activation", () => {
  assert.match(contextRuntime, /allowIncompleteActivation = false/);
  assert.match(contextRuntime, /requireStaffActivation/);
  assert.match(contextRuntime, /STAFF_ACTIVATION_REQUIRED/);
  assert.match(activationRoute, /allowIncompleteActivation: true/);
  assert.match(phoneRoute, /allowIncompleteActivation: true/);
});

test("pre-activation browser payload exposes only setup gate state", () => {
  assert.match(activationRoute, /projectStaffActivation\(activation\)/);
  assert.match(activationProjection, /phoneMasked/);
  assert.match(activationProjection, /enrolled: steps\.passkey\?\.enrolled === true/);
  assert.doesNotMatch(activationProjection, /verifiedAt/);
  assert.doesNotMatch(activationProjection, /lastUsedAt/);
  assert.doesNotMatch(activationProjection, /documentId/);
  assert.doesNotMatch(activationProjection, /documentNumberMasked/);
  assert.doesNotMatch(activationProjection, /count:/);
});

test("pre-activation organization selector exposes only id and name", () => {
  assert.match(activationRoute, /\.select\("id,name"\)/);
  assert.doesNotMatch(activationRoute, /organization_type/);
  assert.doesNotMatch(activationRoute, /\.select\("id,name,industry/);
  assert.doesNotMatch(setup, /organization\.industry/);
});

test("staff layout renders setup instead of role menu until activation is complete", () => {
  assert.match(layout, /\/api\/staff\/activation/);
  assert.match(layout, /activationState\.activation\?\.complete !== true/);
  assert.match(layout, /<StaffActivationSetup/);
  const setupGate = layout.indexOf("activationState.activation?.complete !== true");
  const mobileNav = layout.indexOf('aria-label="Staff mobile navigation"');
  assert.ok(setupGate >= 0 && mobileNav > setupGate);
  assert.match(setup, /Secure staff setup/);
  assert.match(setup, /Email login/);
  assert.match(setup, /Phone number/);
  assert.match(setup, /Passport \/ government ID/);
  assert.match(setup, /Face ID \/ Touch ID passkey/);
});
