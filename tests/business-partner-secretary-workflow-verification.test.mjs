import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const runtime = fs.readFileSync("lib/platform/runtime/PlatformDomainRuntime.js", "utf8");
const verifier = fs.readFileSync("lib/platform/capabilities/createSecretaryCoreVerificationCapability.js", "utf8");
const cert = fs.readFileSync("scripts/certify-business-partner-write-verification-coverage-local.mjs", "utf8");

test("Secretary workflow families bind persisted task and job identities", () => {
  assert.match(runtime, /secretary_workflow_record_result/);
  assert.match(runtime, /platform\.secretary_task\.read/);
  assert.match(runtime, /platform\.secretary_job_record\.read/);
  assert.match(runtime, /platform\.secretary_meeting_coordination_record\.read/);
  assert.match(runtime, /platform\.secretary_outbound_call_request\.read/);
  assert.match(runtime, /platform\.secretary_working_preference_record\.read/);
});

test("Secretary exact verifiers use authoritative organization scoped persistence", () => {
  assert.match(verifier, /secretary_meeting_coordinations/);
  assert.match(verifier, /secretary_outbound_call_requests/);
  assert.match(verifier, /executive_working_preferences_v1/);
  assert.match(verifier, /AVANTIQO_AUTHORITATIVE_BUSINESS_EFFECT_OUTCOME_V1/);
  assert.match(verifier, /entry_id/);
});

test("write coverage cert fails full runtime if any Secretary write is unverified", () => {
  assert.match(cert, /full_runtime_has_no_unverified_secretary_writes/);
  assert.match(cert, /secretary_workflow_verification_registration_contract_present/);
  assert.match(cert, /staticSecretaryVerificationBindings>=79/);
});
