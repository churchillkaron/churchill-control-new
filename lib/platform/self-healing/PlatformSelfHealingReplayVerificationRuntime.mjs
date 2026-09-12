export const PLATFORM_SELF_HEALING_REPLAY_VERIFICATION_CONTRACT =
  "AVANTIQO_PLATFORM_SELF_HEALING_REPLAY_VERIFICATION_V1";

const EXECUTION_CONTRACT = "AVANTIQO_PLATFORM_SELF_HEALING_CODE_EXECUTION_V1";
const REPLAY_CONTRACT = "AVANTIQO_PLATFORM_SELF_HEALING_REPLAY_V1";
const COMMIT_PATTERN = /^[0-9a-f]{40}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/i;

function text(value, limit = 1000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function blocked(reason, details = {}) {
  return {
    success: false,
    contract: PLATFORM_SELF_HEALING_REPLAY_VERIFICATION_CONTRACT,
    status: "REPLAY_VERIFICATION_REQUIRED",
    fixed: false,
    continue_building_allowed: false,
    reason,
    ...details,
  };
}

export function verifyPlatformSelfHealingReplay({
  execution = {},
  evidence = {},
} = {}) {
  const result = object(execution);
  const replay = object(result.replay);
  const proof = object(evidence);

  if (text(result.contract, 180) !== EXECUTION_CONTRACT) {
    return blocked("SELF_HEALING_EXECUTION_CONTRACT_REQUIRED");
  }
  if (text(result.status, 180) !== "ENGINEERING_ARTIFACT_READY_FOR_REPLAY") {
    return blocked("SELF_HEALING_ENGINEERING_ARTIFACT_NOT_READY");
  }
  if (result.engineering_verified !== true || result.fixed === true) {
    return blocked("SELF_HEALING_ENGINEERING_VERIFICATION_REQUIRED");
  }
  if (
    text(replay.contract, 180) !== REPLAY_CONTRACT ||
    replay.required !== true ||
    replay.fixed_requires_original_failure_absent !== true ||
    replay.fixed_requires_expected_outcome_observed !== true
  ) {
    return blocked("SELF_HEALING_REPLAY_CONTRACT_REQUIRED");
  }

  const missionId = text(result.mission_id, 240);
  if (!missionId || text(proof.mission_id, 240) !== missionId) {
    return blocked("SELF_HEALING_REPLAY_MISSION_MISMATCH");
  }

  const signalKey = text(result.signalKey || result.signal_key, 240);
  if (signalKey && text(proof.signal_key || proof.signalKey, 240) !== signalKey) {
    return blocked("SELF_HEALING_REPLAY_SIGNAL_MISMATCH");
  }

  const repairedCommit = text(proof.repaired_commit, 80);
  const observedCommit = text(proof.observed_commit, 80);
  if (!COMMIT_PATTERN.test(repairedCommit) || !COMMIT_PATTERN.test(observedCommit)) {
    return blocked("SELF_HEALING_REPLAY_COMMIT_PROOF_REQUIRED");
  }
  if (repairedCommit.toLowerCase() !== observedCommit.toLowerCase()) {
    return blocked("SELF_HEALING_REPLAY_COMMIT_MISMATCH", {
      repaired_commit: repairedCommit,
      observed_commit: observedCommit,
    });
  }

  const replayBindingVerified = proof.replay_binding_verified === true;
  const exactReplay = proof.original_action_replayed === true && replayBindingVerified;
  if (proof.original_action_replayed === true && !replayBindingVerified) {
    return blocked("SELF_HEALING_REPLAY_ACTION_BINDING_REQUIRED");
  }
  const safeEquivalent = proof.safe_deterministic_equivalent === true &&
    text(proof.verification_status, 120) === text(replay.unsafe_replay_requires_verification_status, 120);
  if (!exactReplay && !safeEquivalent) {
    return blocked("SELF_HEALING_ORIGINAL_ACTION_REPLAY_REQUIRED");
  }

  let originalActionBinding = null;
  let replayedActionBinding = null;
  if (exactReplay) {
    originalActionBinding = text(proof.original_action_binding_sha256, 80).toLowerCase();
    replayedActionBinding = text(proof.replayed_action_binding_sha256, 80).toLowerCase();
    if (!SHA256_PATTERN.test(originalActionBinding) || !SHA256_PATTERN.test(replayedActionBinding)) {
      return blocked("SELF_HEALING_ORIGINAL_ACTION_BINDING_REQUIRED");
    }
    if (originalActionBinding !== replayedActionBinding) {
      return blocked("SELF_HEALING_ORIGINAL_ACTION_BINDING_MISMATCH", {
        original_action_binding_sha256: originalActionBinding,
        replayed_action_binding_sha256: replayedActionBinding,
      });
    }
  }
  if (proof.original_failure_absent !== true) {
    return blocked("SELF_HEALING_ORIGINAL_FAILURE_STILL_PRESENT");
  }
  if (proof.expected_outcome_observed !== true) {
    return blocked("SELF_HEALING_EXPECTED_OUTCOME_NOT_OBSERVED");
  }
  if (proof.authoritative_server_evidence !== true) {
    return blocked("SELF_HEALING_AUTHORITATIVE_REPLAY_EVIDENCE_REQUIRED");
  }

  return {
    success: true,
    contract: PLATFORM_SELF_HEALING_REPLAY_VERIFICATION_CONTRACT,
    status: "SELF_HEALING_FIXED_VERIFIED",
    fixed: true,
    continue_building_allowed: true,
    mission_id: missionId,
    signal_key: signalKey || null,
    repaired_commit: repairedCommit,
    observed_commit: observedCommit,
    replay_mode: exactReplay ? "EXACT_ORIGINAL_ACTION" : "SAFE_DETERMINISTIC_EQUIVALENT",
    replay_binding_verified: exactReplay ? true : false,
    original_action_binding_sha256: exactReplay ? originalActionBinding : null,
    replayed_action_binding_sha256: exactReplay ? replayedActionBinding : null,
    original_failure_absent: true,
    expected_outcome_observed: true,
    authoritative_server_evidence: true,
    promotion_authority: "NONE",
    deploy_authority: false,
    migration_authority: false,
    production_routing_authority: false,
  };
}

export const PlatformSelfHealingReplayVerificationRuntime = Object.freeze({
  contract: PLATFORM_SELF_HEALING_REPLAY_VERIFICATION_CONTRACT,
  verify: verifyPlatformSelfHealingReplay,
  fixed_requires_exact_commit_identity: true,
  fixed_requires_authoritative_server_evidence: true,
  continue_building_requires_verified_replay: true,
});

export default verifyPlatformSelfHealingReplay;
