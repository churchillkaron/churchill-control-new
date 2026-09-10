import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const core = fs.readFileSync("lib/operator/runtime/OperatorTurnRuntimeCore.js", "utf8");
const proof = fs.readFileSync("lib/operator/runtime/OperatorDeterministicBusinessEffectRuntime.js", "utf8");

test("post-action verification completion requires deterministic business effect proof", () => {
  assert.match(core, /postActionVerification\?\.business_effect_verified === true/);
  assert.match(core, /status: businessEffectVerified \? "completed" : "blocked"/);
  assert.match(core, /POST_ACTION_VERIFICATION_INCOMPLETE/);
});

test("verification-only continuation preserves stable action identity without replay authority", () => {
  assert.match(core, /action_identity_evidence: Array\.from\(collectStableBusinessIdentities\(actionResult\)\)/);
  assert.match(core, /resume_kind: "verification"/);
  assert.match(core, /will not replay the write/);
});

test("verification retry requires business effect verification rather than read success alone", () => {
  assert.match(core, /retryResult\?\.business_effect_verified === true/);
  assert.match(core, /actionIdentityEvidence: pending\.action_identity_evidence/);
  assert.match(proof, /current\.action_identity_evidence/);
});
