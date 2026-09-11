import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const core = fs.readFileSync("lib/operator/runtime/OperatorTurnRuntimeCore.js", "utf8");
const synthetic = fs.readFileSync("lib/operator/runtime/SyntheticIntelligenceTurnRuntime.js", "utf8");

test("Business Partner preserves the canonical self-healing execution envelope through release", () => {
  assert.match(synthetic, /self_healing_execution:\s*object\(selfHealing\.engineering\)/);
  assert.match(core, /object\(recovery\.self_healing_execution\)/);
});

test("post-release replay is certified only by the canonical Platform self-healing verifier", () => {
  assert.match(core, /verifyPlatformSelfHealingReplay/);
  assert.match(core, /repaired_commit:\s*text\(commit\.commit_sha/);
  assert.match(core, /observed_commit:\s*text\(deployment\.observed_commit_sha/);
  assert.match(core, /original_action_replayed:\s*true/);
  assert.match(core, /authoritative_server_evidence:\s*authoritativeBusinessOutcome/);
});

test("repaired mutations require independent business-effect proof before fixed", () => {
  assert.match(core, /readOnlyReplay \|\| postActionVerification\?\.business_effect_verified === true/);
  assert.match(core, /POST_RELEASE_REPLAY_UNVERIFIED/);
  assert.match(core, /mutation_replay_allowed:\s*false/);
});

test("verified replay receipt survives recovery cleanup and permits larger mission continuation", () => {
  assert.match(core, /self_healing_replay_receipt:\s*selfHealingReplayVerification/);
  assert.match(core, /selfHealingReplayVerification\.fixed !== true/);
  assert.match(core, /clearBusinessPartnerRecovery\(nextAgreementState\)/);
  assert.match(core, /businessPartnerMissionContinuation/);
});
