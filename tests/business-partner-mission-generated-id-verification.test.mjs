import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const mission = fs.readFileSync("lib/platform/capabilities/createOperatorMissionCapability.js", "utf8");

test("mission preflight prefers normalized catalog verifier over planner verify_after", () => {
  assert.match(mission, /listOperatorCapabilities/);
  assert.match(mission, /catalogAction\?\.operator_verification/);
  assert.match(mission, /registeredKey[\s\S]*step\.verify_after/);
});

test("mission resolves generated verifier payload only after write result exists", () => {
  assert.match(mission, /bindCatalogVerification\(entry\.catalog_verification, action\.result, step\.payload\)/);
  assert.match(mission, /payload_from_result/);
  assert.match(mission, /payload_array_from_result/);
  assert.match(mission, /payload_from_input/);
});

test("catalog-backed mission write advances only after deterministic business-effect proof", () => {
  assert.match(mission, /deterministicBusinessEffectProof/);
  assert.match(mission, /OPERATOR_MISSION_BUSINESS_EFFECT_UNVERIFIED/);
  assert.match(mission, /business_effect_verified: true/);
});

test("verification retry persists bounded identity evidence and runs before action replay", () => {
  assert.match(mission, /action_identity_evidence: actionIdentityEvidence/);
  assert.match(mission, /verificationPending\.proof_required/);
  const retry = mission.indexOf("if (verificationPending)");
  const action = mission.indexOf("action = await executeEntry(entry, context)");
  assert.ok(retry > 0 && action > retry);
});
