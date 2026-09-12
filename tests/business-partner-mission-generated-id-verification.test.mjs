import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const mission = fs.readFileSync("lib/platform/capabilities/createOperatorMissionCapability.js", "utf8");

test("mission preflight requires server-owned verification and ignores planner verify_after", () => {
  assert.match(mission, /listOperatorCapabilities/);
  assert.match(mission, /catalogAction\?\.operator_verification/);
  assert.match(mission, /OPERATOR_MISSION_SERVER_VERIFICATION_REQUIRED/);
  assert.doesNotMatch(mission, /:\s*step\.verify_after/);
});

test("only exact Code AI commit retains a server-owned special-governed verifier", () => {
  assert.match(mission, /SPECIAL_GOVERNED_MISSION_VERIFIERS/);
  assert.match(mission, /"platform\.code_ai_commit\.execute"/);
  assert.match(mission, /"platform\.code_ai_commit_status\.verify"/);
  assert.match(mission, /payload_from_input:[\s\S]*execution_key/);
  assert.doesNotMatch(mission, /product_production_release[^\n]*SPECIAL_GOVERNED_MISSION_VERIFIERS/);
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


test("mission emits canonical authoritative business-effect outcome", () => {
  assert.match(mission, /normalizeAuthoritativeBusinessEffectOutcome/);
  assert.match(mission, /business_effect_outcome: businessEffectOutcome/);
  assert.match(mission, /AVANTIQO_AUTHORITATIVE_BUSINESS_EFFECT_OUTCOME_V1/);
  assert.match(mission, /businessEffectOutcome\.state !== "COMPLETED"/);
  assert.match(mission, /safe_to_retry: false/);
});

test("verification pending preserves canonical uncertain outcome without replay authority", () => {
  assert.match(mission, /derivation: "MISSION_VERIFICATION_PENDING"/);
  assert.match(mission, /state: "UNCERTAIN"/);
  assert.match(mission, /business_effect_observed: false/);
  assert.match(mission, /business_effect_absent: false/);
  assert.match(mission, /safe_to_retry: false/);
});
