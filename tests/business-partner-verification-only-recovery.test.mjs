import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const core = fs.readFileSync("lib/operator/runtime/OperatorTurnRuntimeCore.js", "utf8");
const synthetic = fs.readFileSync("lib/operator/runtime/SyntheticIntelligenceTurnRuntime.js", "utf8");
const proof = fs.readFileSync("lib/operator/runtime/OperatorDeterministicBusinessEffectRuntime.js", "utf8");

test("verification-only failures auto retry only the exact stored verification read", () => {
  assert.match(synthetic, /recovery_classification === "VERIFICATION_ONLY"/);
  assert.match(synthetic, /resume_kind, 80\) === "verification"/);
  assert.match(synthetic, /message: "continue"/);
  assert.match(synthetic, /source: "event"/);
  assert.match(synthetic, /runOperatorTurn\(/);
});

test("verification recovery requires stable action identity evidence", () => {
  assert.match(synthetic, /action_identity_evidence\.length > 0/);
  assert.match(core, /actionIdentityEvidence: pending\.action_identity_evidence/);
  assert.match(proof, /verificationIdentities\.has\(identity\)/);
});

test("verification retry is single attempt and grants no mutation authority", () => {
  assert.match(synthetic, /verification_auto_retry_single_attempt: true/);
  assert.match(synthetic, /mutation_replay_allowed: false/);
  assert.match(synthetic, /authorization_effect: "NONE"/);
  assert.doesNotMatch(synthetic, /verification_recovery[\s\S]{0,800}executeUbteCapability/);
});

test("verification primitive receives conversation and identity parameters explicitly", () => {
  assert.match(core, /conversationId = null,[\s\S]*actionIdentityEvidence = \[\]/);
  assert.match(core, /conversationId,[\s\S]*actionIdentityEvidence: pending\.action_identity_evidence/);
  assert.match(core, /actionIdentityEvidence: Array\.from\(collectStableBusinessIdentities\(result\)\)/);
});

test("read success without deterministic business effect proof remains blocked", () => {
  assert.match(core, /retryResult\?\.business_effect_verified === true/);
  assert.match(core, /status: retryCompleted \? "completed" : "blocked"/);
  assert.match(proof, /POST_ACTION_VERIFICATION_ASSERTION_FAILED/);
});
