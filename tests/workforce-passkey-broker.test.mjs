import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const runtime = readFileSync("lib/people/workforce/StaffPasskeyBrokerRuntime.js", "utf8");
const client = readFileSync("lib/people/workforce/StaffPasskeyBrokerClient.js", "utf8");
const login = readFileSync("app/login/page.js", "utf8");
const profile = readFileSync("app/(workforce)/workforce/profile/page.jsx", "utf8");
const authPage = readFileSync("app/auth/staff/passkey/page.jsx", "utf8");
const enrollPage = readFileSync("app/auth/staff/passkey/enroll/page.jsx", "utf8");

test("workforce passkeys use the central Avantiqo identity origin", () => {
  assert.match(runtime, /STAFF_PASSKEY_AUTH_ORIGIN = "https:\/\/auth\.avantiqo\.ai"/);
  assert.match(login, /\/api\/auth\/staff\/passkey\/start/);
  assert.match(login, /Continue with Face ID \/ passkey/);
  assert.match(authPage, /signInWithPasskey/);
});

test("workforce profile never runs WebAuthn directly on customer domains", () => {
  assert.match(profile, /beginCentralPasskeyEnrollment/);
  assert.match(profile, /beginCentralPasskeySignIn/);
  assert.doesNotMatch(profile, /auth\.registerPasskey/);
  assert.doesNotMatch(profile, /verifyClockInPasskey/);
  assert.match(enrollPage, /auth\.registerPasskey/);
  assert.match(enrollPage, /verifyClockInPasskey/);
});

test("broker handoff is one-time, organization-bound and returned by POST", () => {
  assert.match(runtime, /createOAuthAuthorization/);
  assert.match(runtime, /consumeOAuthAuthorization/);
  assert.match(runtime, /return domain is not registered to this organization/);
  assert.match(runtime, /authorization was returned to the wrong origin/);
  assert.match(runtime, /Authenticated user is not active staff in this organization/);
  assert.match(client, /form\.method = "POST"/);
  assert.match(authPage, /form\.method = "POST"/);
});

test("customer return paths stay under workforce", () => {
  assert.match(runtime, /path\.startsWith\("\/workforce"\)/);
  assert.match(client, /returnPath = "\/workforce"/);
  assert.match(client, /returnPath = "\/workforce\/profile"/);
});
