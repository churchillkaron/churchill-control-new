import {
  loadCodeAICommitArtifact,
} from "@/lib/code/runtime/CodeAICommitArtifactRuntime";
import {
  loadCodeAICommitExecutionState,
} from "@/lib/code/runtime/CodeAICommitExecutionStateRuntime";

export const PLATFORM_SELF_HEALING_COMMIT_BINDING_CONTRACT =
  "AVANTIQO_PLATFORM_SELF_HEALING_COMMIT_BINDING_V1";

const COMMIT_PATTERN = /^[0-9a-f]{40}$/i;

function text(value, limit = 1000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function blocked(reason, details = {}) {
  return {
    success: false,
    contract: PLATFORM_SELF_HEALING_COMMIT_BINDING_CONTRACT,
    status: "SELF_HEALING_COMMIT_PROOF_REQUIRED",
    reason,
    repaired_commit: null,
    replay_allowed: false,
    ...details,
  };
}

function missionIdFromArtifact(artifact = {}) {
  const state = object(artifact.mission_state);
  return text(state.mission_id, 240) || null;
}

export async function resolvePlatformSelfHealingCommitBinding({
  context = {},
  execution = {},
  executionKey,
} = {}) {
  const expectedMissionId = text(execution.mission_id, 240);
  if (!expectedMissionId) {
    return blocked("SELF_HEALING_EXECUTION_MISSION_REQUIRED");
  }

  const key = text(executionKey, 160);
  if (!key) {
    return blocked("SELF_HEALING_COMMIT_EXECUTION_KEY_REQUIRED");
  }

  const artifact = await loadCodeAICommitArtifact({ context, executionKey: key });
  if (artifact.found !== true) {
    return blocked("SELF_HEALING_ATTESTED_CODE_ARTIFACT_REQUIRED");
  }

  const artifactMissionId = missionIdFromArtifact(artifact);
  if (!artifactMissionId || artifactMissionId !== expectedMissionId) {
    return blocked("SELF_HEALING_COMMIT_ARTIFACT_MISSION_MISMATCH", {
      execution_mission_id: expectedMissionId,
      artifact_mission_id: artifactMissionId,
    });
  }

  if (artifact.commit_attempted !== true || Number(artifact.commit_attempt_count || 0) < 1) {
    return blocked("SELF_HEALING_GOVERNED_COMMIT_ATTEMPT_REQUIRED");
  }

  const commitState = await loadCodeAICommitExecutionState({
    context,
    executionKey: key,
  });
  if (commitState.found !== true) {
    return blocked("SELF_HEALING_VERIFIED_COMMIT_STATE_REQUIRED");
  }

  const commit = object(commitState.commit);
  const repairedCommit = text(commit.commit_sha, 80).toLowerCase();
  if (
    commit.success !== true ||
    commit.verified !== true ||
    text(commit.branch, 160) !== "main" ||
    !COMMIT_PATTERN.test(repairedCommit)
  ) {
    return blocked("SELF_HEALING_VERIFIED_MAIN_COMMIT_REQUIRED");
  }

  if (commit.force === true) {
    return blocked("SELF_HEALING_FORCED_COMMIT_NOT_ACCEPTED", {
      repaired_commit: repairedCommit,
    });
  }

  return {
    success: true,
    contract: PLATFORM_SELF_HEALING_COMMIT_BINDING_CONTRACT,
    status: "SELF_HEALING_COMMIT_BOUND",
    replay_allowed: true,
    execution_key: key,
    mission_id: expectedMissionId,
    repaired_commit: repairedCommit,
    previous_commit: text(commit.previous_commit, 80) || null,
    tree_sha: text(commit.tree_sha, 80) || null,
    branch: "main",
    artifact_row_id: text(artifact.row_id, 200) || null,
    commit_state_row_id: text(commitState.row_id, 200) || null,
    commit_source: "SERVER_GOVERNED_CODE_COMMIT_STATE",
    caller_commit_sha_authoritative: false,
    browser_evidence_authoritative: false,
    authorization_effect: "NONE",
    deploy_authority: false,
    migration_authority: false,
    production_routing_authority: false,
  };
}

export const PlatformSelfHealingCommitBindingRuntime = Object.freeze({
  contract: PLATFORM_SELF_HEALING_COMMIT_BINDING_CONTRACT,
  resolve: resolvePlatformSelfHealingCommitBinding,
  exact_mission_binding_required: true,
  verified_main_commit_required: true,
  forced_commit_rejected: true,
  caller_commit_sha_authoritative: false,
  deploy_authority: false,
});

export default resolvePlatformSelfHealingCommitBinding;
