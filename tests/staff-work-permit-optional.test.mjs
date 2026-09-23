import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const activation = fs.readFileSync(new URL("../lib/people/workforce/StaffActivationRuntime.js", import.meta.url), "utf8");
const runtime = fs.readFileSync(new URL("../lib/people/workforce/StaffWorkPermitRuntime.js", import.meta.url), "utf8");
const route = fs.readFileSync(new URL("../app/api/staff/work-permit/route.js", import.meta.url), "utf8");
const setup = fs.readFileSync(new URL("../components/staff/StaffActivationSetup.jsx", import.meta.url), "utf8");

test("work permit is optional and excluded from staff activation completion", () => {
  assert.match(activation, /emailVerified && phoneVerified && identityVerified && passkeyVerified/);
  assert.doesNotMatch(activation, /workPermit/);
  assert.match(runtime, /optional: true/);
  assert.match(setup, />Optional</);
  assert.match(setup, /work permit if it applies to your employment/);
  assert.match(setup, /does not block Staff Portal access|does not block login|Optional/);
});

test("optional work permit is still stored privately with expiry tracking", () => {
  assert.match(runtime, /documentType: WORK_PERMIT_DOCUMENT_TYPE/);
  assert.match(runtime, /classification: "RESTRICTED"/);
  assert.match(runtime, /expiryDate: normalizedExpiry/);
  assert.match(runtime, /WORK_PERMIT_EXPIRY_REQUIRED/);
  assert.match(runtime, /entityId: employment\.entity\.id/);
  assert.match(runtime, /status: "pending_approval"/);
  assert.match(route, /allowIncompleteActivation: true/);
});
