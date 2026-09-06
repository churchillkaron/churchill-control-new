import assert from "node:assert/strict";
import test from "node:test";

import {
  PLATFORM_SELF_HEALING_REPLAY_VERIFICATION_CONTRACT,
  verifyPlatformSelfHealingReplay,
} from "../lib/platform/self-healing/PlatformSelfHealingReplayVerificationRuntime.mjs";

function execution(overrides = {}) {
  return {
    contract: "AVANTIQO_PLATFORM_SELF_HEALING_CODE_EXECUTION_V1",
    status: "ENGINEERING_ARTIFACT_READY_FOR_REPLAY",
    engineering_verified: true,
    fixed: false,
    mission_id: "mission-123",
    signalKey: "signal-456",
    replay: {
      contract: "AVANTIQO_PLATFORM_SELF_HEALING_REPLAY_V1",
      required: true,
      fixed_requires_original_failure_absent: true,
      fixed_requires_expected_outcome_observed: true,
      unsafe_replay_requires_verification_status: "SAFE_DETERMINISTIC_EQUIVALENT_VERIFIED",
    },
    ...overrides,
  };
}

function evidence(overrides = {}) {
  return {
    mission_id: "mission-123",
    signal_key: "signal-456",
    repaired_commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    observed_commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    original_action_replayed: true,
    safe_deterministic_equivalent: false,
    original_failure_absent: true,
    expected_outcome_observed: true,
    authoritative_server_evidence: true,
    ...overrides,
  };
}

test("verified replay is the only state allowed to mark fixed and continue building", () => {
  const result = verifyPlatformSelfHealingReplay({
    execution: execution(),
    evidence: evidence(),
  });

  assert.equal(result.success, true);
  assert.equal(result.contract, PLATFORM_SELF_HEALING_REPLAY_VERIFICATION_CONTRACT);
  assert.equal(result.status, "SELF_HEALING_FIXED_VERIFIED");
  assert.equal(result.fixed, true);
  assert.equal(result.continue_building_allowed, true);
  assert.equal(result.replay_mode, "EXACT_ORIGINAL_ACTION");
  assert.equal(result.deploy_authority, false);
  assert.equal(result.promotion_authority, "NONE");
});

test("different observed commit fails closed", () => {
  const result = verifyPlatformSelfHealingReplay({
    execution: execution(),
    evidence: evidence({
      observed_commit: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    }),
  });

  assert.equal(result.success, false);
  assert.equal(result.fixed, false);
  assert.equal(result.continue_building_allowed, false);
  assert.equal(result.reason, "SELF_HEALING_REPLAY_COMMIT_MISMATCH");
});

test("mission identity mismatch fails closed", () => {
  const result = verifyPlatformSelfHealingReplay({
    execution: execution(),
    evidence: evidence({ mission_id: "another-mission" }),
  });

  assert.equal(result.success, false);
  assert.equal(result.reason, "SELF_HEALING_REPLAY_MISSION_MISMATCH");
});

test("old error absence is insufficient without expected business outcome", () => {
  const result = verifyPlatformSelfHealingReplay({
    execution: execution(),
    evidence: evidence({ expected_outcome_observed: false }),
  });

  assert.equal(result.success, false);
  assert.equal(result.reason, "SELF_HEALING_EXPECTED_OUTCOME_NOT_OBSERVED");
});

test("browser or caller assertions cannot certify replay", () => {
  const result = verifyPlatformSelfHealingReplay({
    execution: execution(),
    evidence: evidence({ authoritative_server_evidence: false }),
  });

  assert.equal(result.success, false);
  assert.equal(result.reason, "SELF_HEALING_AUTHORITATIVE_REPLAY_EVIDENCE_REQUIRED");
});

test("unsafe actions may use deterministic equivalent only with required verification status", () => {
  const accepted = verifyPlatformSelfHealingReplay({
    execution: execution(),
    evidence: evidence({
      original_action_replayed: false,
      safe_deterministic_equivalent: true,
      verification_status: "SAFE_DETERMINISTIC_EQUIVALENT_VERIFIED",
    }),
  });
  assert.equal(accepted.success, true);
  assert.equal(accepted.replay_mode, "SAFE_DETERMINISTIC_EQUIVALENT");

  const rejected = verifyPlatformSelfHealingReplay({
    execution: execution(),
    evidence: evidence({
      original_action_replayed: false,
      safe_deterministic_equivalent: true,
      verification_status: "UNVERIFIED",
    }),
  });
  assert.equal(rejected.success, false);
  assert.equal(rejected.reason, "SELF_HEALING_ORIGINAL_ACTION_REPLAY_REQUIRED");
});
