import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const runtime = readFileSync("lib/people/workforce/StaffPasskeyBrokerRuntime.js", "utf8");
const client = readFileSync("lib/people/workforce/StaffPasskeyBrokerClient.js", "utf8");
const login = readFileSync("app/login/page.js", "utf8");
const setup = readFileSync("components/staff/StaffActivationSetup.jsx", "utf8");
const profile = readFileSync("app/(system)/staff/profile/page.jsx", "utf8");
const authPage = readFileSync("app/auth/staff/passkey/page.jsx", "utf8");
const enrollPage = readFileSync("app/auth/staff/passkey/enroll/page.jsx", "utf8");
const contextRoute = readFileSync("app/api/auth/staff/passkey/context/route.js", "utf8");

test("customer domains start passkey login through the central Avantiqo identity origin", () => {
  assert.match(runtime, /STAFF_PASSKEY_AUTH_ORIGIN = "https:\/\/auth\.avantiqo\.ai"/);
  assert.match(login, /\/api\/auth\/staff\/passkey\/start/);
  assert.match(login, /window\.location\.assign\(payload\.authorizationUrl\)/);
  assert.match(authPage, /signInWithPasskey/);
  assert.match(authPage, /context\.returnOrigin.*\/api\/auth\/staff\/passkey\/complete/s);
});

test("passkey enrollment and verification never run directly on customer domains", () => {
  assert.match(setup, /beginCentralPasskeyEnrollment/);
  assert.match(setup, /beginCentralPasskeySignIn/);
  assert.match(profile, /beginCentralPasskeyEnrollment/);
  assert.match(profile, /beginCentralPasskeySignIn/);
  assert.doesNotMatch(setup, /auth\.registerPasskey/);
  assert.doesNotMatch(profile, /auth\.registerPasskey/);
  assert.match(enrollPage, /auth\.registerPasskey/);
  assert.match(enrollPage, /verifyClockInPasskey/);
});

test("broker handoff is one-time organization-bound and destination-bound", () => {
  assert.match(runtime, /createOAuthAuthorization/);
  assert.match(runtime, /consumeOAuthAuthorization/);
  assert.match(runtime, /return domain is not registered to this organization/);
  assert.match(runtime, /authorization was returned to the wrong origin/);
  assert.match(runtime, /Authenticated user is not active staff in this organization/);
  assert.match(runtime, /auth_user_id/);
});

test("session handoff uses POST rather than URL tokens", () => {
  assert.match(client, /form\.method = "POST"/);
  assert.match(authPage, /form\.method = "POST"/);
  assert.doesNotMatch(client, /authorizationUrl.*access_token/);
  assert.doesNotMatch(authPage, /searchParams\.set\(["']access_token/);
});


test("broker-only context and enrollment session enforce the central identity hostname", () => {
  assert.match(runtime, /requireStaffPasskeyAuthOrigin/);
  assert.match(runtime, /brokerHostname = new URL\(STAFF_PASSKEY_AUTH_ORIGIN\)\.hostname/);
  assert.match(runtime, /hostname !== brokerHostname/);
  assert.match(runtime, /Staff passkey broker must run on the Avantiqo identity origin/);
  assert.match(contextRoute, /requireStaffPasskeyAuthOrigin\(request\)/);
  assert.match(runtime, /requireStaffPasskeyAuthOrigin\(request\);[\s\S]*STAFF_PASSKEY_ENROLLMENT_PURPOSE/);
});
