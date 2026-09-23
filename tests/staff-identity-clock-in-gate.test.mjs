import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const runtime = fs.readFileSync(new URL("../lib/people/workforce/StaffIdentityVerificationRuntime.js", import.meta.url), "utf8");
const staffRoute = fs.readFileSync(new URL("../app/api/staff/route.js", import.meta.url), "utf8");
const staffRuntime = fs.readFileSync(new URL("../app/api/staff/runtime/route.js", import.meta.url), "utf8");
const uploadRoute = fs.readFileSync(new URL("../app/api/staff/identity-verification/route.js", import.meta.url), "utf8");
const reviewRoute = fs.readFileSync(new URL("../app/api/people/workforce/identity-verification/route.js", import.meta.url), "utf8");
const profile = fs.readFileSync(new URL("../app/(system)/staff/profile/page.jsx", import.meta.url), "utf8");
const home = fs.readFileSync(new URL("../app/(system)/staff/page.jsx", import.meta.url), "utf8");
const login = fs.readFileSync(new URL("../app/login/page.js", import.meta.url), "utf8");

test("ordinary staff require verified identity before passkey or GPS while SUPER_ADMIN bypasses identity only", () => {
  assert.match(staffRoute, /superAdminBypass/);
  assert.match(staffRoute, /toUpperCase\(\) === "SUPER_ADMIN"/);
  assert.match(staffRoute, /if \(!superAdminBypass\) \{[\s\S]*await requireVerifiedStaffIdentity/);
  const identityGate = staffRoute.indexOf("await requireVerifiedStaffIdentity");
  const passkeyGate = staffRoute.indexOf("await requireRecentPasskeyVerification");
  assert.ok(identityGate >= 0 && passkeyGate > identityGate);
  assert.match(runtime, /CLOCK_IN_IDENTITY_/);
  assert.doesNotMatch(staffRoute, /grantForTarget\(approvedGrants, "identity"\)/);
  assert.match(staffRuntime, /identityRequired: !superAdminBypass/);
  assert.match(staffRuntime, /identityVerified: superAdminBypass \? true : identityVerification\.verified/);
  assert.match(staffRuntime, /identityStatus: superAdminBypass \? "BYPASSED" : identityVerification\.status/);
});

test("staff identity upload uses private controlled documents and pending manager approval", () => {
  assert.match(runtime, /createControlledDocument/);
  assert.match(runtime, /classification: "RESTRICTED"/);
  assert.match(runtime, /documentType: IDENTITY_DOCUMENT_TYPE/);
  assert.match(runtime, /status: "PENDING"/);
  assert.match(runtime, /status: "pending_approval"/);
  assert.match(uploadRoute, /resolveAuthenticatedStaffContext/);
});

test("manager review requires the actual document number but only stores a masked suffix", () => {
  assert.match(reviewRoute, /STAFF_IDENTITY_REVIEW_DENIED/);
  assert.match(runtime, /Verified document number is required when approving identity/);
  assert.match(runtime, /document_number_masked: maskedNumber\(number\)/);
  assert.doesNotMatch(runtime, /documentNumber:\s*number/);
  assert.doesNotMatch(runtime, /document_number:\s*number/);
});

test("identity review accepts only the latest pending submission and uses optimistic concurrency", () => {
  assert.match(runtime, /STAFF_IDENTITY_REVIEW_STATE_CONFLICT/);
  assert.match(runtime, /STAFF_IDENTITY_REVIEW_SUPERSEDED/);
  assert.match(runtime, /latestIdentityDocument\(\{ organizationId, staffId: rowResult\.data\.owner_staff_id \}\)/);
  assert.match(runtime, /expectedStatus: "pending_approval"/);
  assert.match(runtime, /expectedUpdatedAt: rowResult\.data\.updated_at/);
  assert.match(runtime, /STAFF_IDENTITY_EXPIRY_INVALID/);
});

test("staff runtime and phone UI expose verification state without raw identity number", () => {
  assert.match(staffRuntime, /identityVerified: superAdminBypass \? true : identityVerification\.verified/);
  assert.doesNotMatch(staffRuntime, /identityDocumentNumberMasked/);
  assert.doesNotMatch(staffRuntime, /identityDocumentType/);
  assert.doesNotMatch(staffRuntime, /documentId|enterprise_document_id/);
  assert.match(home, /Passport \/ ID verification required/);
  assert.match(home, /requirements\.identityVerified !== true/);
  assert.match(profile, /Upload identity document/);
  assert.match(profile, /Face ID \/ passkey/);
  assert.match(profile, /capture="environment"/);
  assert.doesNotMatch(profile, /documentNumber:\s*|document_number:\s*/);
});

test("ordinary staff require verified identity for passkeys while super admin may add one optionally", () => {
  assert.match(profile, /activationBypass = String\(staff\.role \|\| ""\)\.toUpperCase\(\) === "SUPER_ADMIN"/);
  assert.match(profile, /disabled=\{securityBusy \|\| Boolean\(passkeyNotice\) \|\| \(!activationBypass && identity\?\.status !== "VERIFIED"\)\}/);
  assert.match(profile, /Identity document optional/);
  assert.match(profile, /Add optional passkey/);
  assert.match(profile, /registerPasskey/);
  assert.match(profile, /beginCentralPasskeyEnrollment/);
  assert.match(profile, /beginCentralPasskeySignIn/);
  assert.match(profile, /biometric template stays on your device/);
  assert.match(profile, /passkey\.list\(\)\.catch/);
  assert.match(profile, /setPasskeyNotice/);
  assert.match(profile, /Boolean\(passkeyNotice\)/);
  assert.match(profile, /Passkey unavailable/);
  assert.match(profile, /aria-label="Identity document type"/);
});


test("verified staff start Face ID or passkey through the central broker from the real login page", () => {
  assert.match(login, /\/api\/auth\/staff\/passkey\/start/);
  assert.match(login, /window\.location\.assign\(payload\.authorizationUrl\)/);
  assert.match(login, /Continue with Face ID \/ passkey/);
  assert.doesNotMatch(login, /signInWithPasskey/);
});
