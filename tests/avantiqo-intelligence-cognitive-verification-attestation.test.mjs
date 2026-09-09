import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { deterministicBusinessEffectProof } from "../lib/operator/runtime/OperatorDeterministicBusinessEffectRuntime.js";

const core = fs.readFileSync("lib/operator/runtime/OperatorTurnRuntimeCore.js", "utf8");
const governance = fs.readFileSync("lib/operator/governance/operatorExecutionGovernance.js", "utf8");

test("deterministic business-effect proof requires read-back identity evidence", () => {
  const passed = deterministicBusinessEffectProof({
    result: { invoice_id: "inv-123" },
    post_action_verification: {
      status: "completed",
      result: { invoice: { invoice_id: "inv-123", status: "posted" } },
    },
  });
  assert.equal(passed.passed, true);
  assert.equal(passed.method, "stable_business_identity_match");
  assert.equal(passed.matched_identity, "invoice_id:inv-123");

  const failed = deterministicBusinessEffectProof({
    result: { invoice_id: "inv-123" },
    post_action_verification: {
      status: "completed",
      result: { invoice: { invoice_id: "inv-999" } },
    },
  });
  assert.equal(failed.passed, false);
  assert.equal(failed.reason, "POST_ACTION_VERIFICATION_ASSERTION_FAILED");
});

test("cognitive mutation verification audit is sealed to the execution binding", () => {
  assert.match(core, /AVANTIQO_COGNITIVE_MUTATION_VERIFICATION_ATTESTATION_V1/);
  assert.match(core, /operatorIntelligenceMutationBindingProof/);
  assert.match(core, /plan_id: cognitiveExecutionBinding\.plan_id/);
  assert.match(core, /step_id: cognitiveExecutionBinding\.step_id/);
  assert.match(core, /payload_fingerprint: cognitiveExecutionBinding\.payload_fingerprint/);
  assert.match(core, /verification_capability_key: verificationCapability\.key/);
  assert.match(core, /business_effect_verified: deterministicProof\.passed === true/);
  assert.match(core, /authorization_effect: "NONE"/);
  assert.match(governance, /cognitive_verification_attestation: verificationAttestation \|\| null/);
});
