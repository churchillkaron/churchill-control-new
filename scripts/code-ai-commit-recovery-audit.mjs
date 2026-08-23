import { readFile } from "node:fs/promises";

const files = {
  github: "lib/code/runtime/CodeGitHubCommitRuntime.js",
  artifact: "lib/code/runtime/CodeAICommitArtifactRuntime.js",
  commit: "lib/platform/capabilities/createCodeAICommitCapability.js",
  status: "lib/platform/capabilities/createCodeAICommitStatusCapability.js",
  decision: "lib/intelligence/runtime/AvantiqoProductPersistenceDecisionRuntime.js",
  handoff: "lib/platform/capabilities/createProductPersistenceHandoffCapability.js",
  continuation: "lib/platform/capabilities/createProductAutonomyContinuationCapability.js",
};

const sources = Object.fromEntries(
  await Promise.all(
    Object.entries(files).map(async ([key, path]) => [key, await readFile(path, "utf8")]),
  ),
);

function requireFragments(label, fragments) {
  for (const fragment of fragments) {
    if (!sources[label].includes(fragment)) {
      throw new Error(`CODE_AI_COMMIT_RECOVERY_AUDIT:${label} missing ${fragment}`);
    }
  }
}

requireFragments("github", [
  "recoverVerifiedCodeMissionCommit",
  "RECOVERY_HISTORY_LIMIT = 50",
  "candidateMatchesAttestedChanges",
  "samePathSet",
  'github("/git/ref/heads/main")',
  "currentMainHead === expectedBase",
  "CODE_AI_GITHUB_RECOVERY_VERIFIED_COMMIT_NOT_FOUND",
  "/commits?sha=main&per_page=${RECOVERY_HISTORY_LIMIT}",
  "/compare/${encodeURIComponent(baseCommit)}...${encodeURIComponent(candidateSha)}",
  "/contents/${encodedRepositoryPath(change.path)}?ref=${encodeURIComponent(candidateSha)}",
  "actual !== change.content",
  "parents.length !== 1",
  "text(parents[0]?.sha) !== baseCommit",
  "recovered_from_attested_artifact: true",
  "main_advanced_after_commit",
]);

const recoveryFunction = sources.github.slice(
  sources.github.indexOf("export async function recoverVerifiedCodeMissionCommit"),
  sources.github.indexOf("export async function commitVerifiedCodeMission"),
);
if (/method:\s*"(?:POST|PATCH|PUT|DELETE)"/.test(recoveryFunction)) {
  throw new Error(
    "CODE_AI_COMMIT_RECOVERY_AUDIT: recovery runtime must not issue GitHub writes",
  );
}

requireFragments("artifact", [
  "commit_attempted: false",
  "commit_attempted_at: null",
  "commit_attempt_count: 0",
  "markCodeAICommitArtifactAttempt",
  "commit_attempted: true",
  "commit_attempt_last_at",
  "CODE_AI_COMMIT_ARTIFACT_ATTEMPTED_IMMUTABLE",
  "CODE_AI_COMMIT_ARTIFACT_ATTEMPT_MARK_FAILED",
  "markAttempt: markCodeAICommitArtifactAttempt",
]);

requireFragments("commit", [
  "recoverPriorAttempt",
  "artifact?.commit_attempted !== true",
  "recoverVerifiedCodeMissionCommit",
  "markCodeAICommitArtifactAttempt",
  "recovered_existing_verified_commit",
  "commit_executed_this_invocation",
  "safe_to_retry_commit: false",
]);
const recoverAttemptIndex = sources.commit.indexOf("await recoverPriorAttempt");
const markAttemptIndex = sources.commit.indexOf("await markCodeAICommitArtifactAttempt");
const writeIndex = sources.commit.indexOf("result = await commitVerifiedCodeMission");
if (
  recoverAttemptIndex < 0 ||
  markAttemptIndex <= recoverAttemptIndex ||
  writeIndex <= markAttemptIndex
) {
  throw new Error(
    "CODE_AI_COMMIT_RECOVERY_AUDIT: prior-attempt recovery must precede the attempt marker and every replayed GitHub write",
  );
}

requireFragments("status", [
  "loadCodeAICommitExecutionState",
  "loadCodeAICommitArtifact",
  "recoverVerifiedCodeMissionCommit",
  "artifact.commit_attempted !== true",
  "CODE_AI_COMMIT_RECOVERY_ATTEMPT_EVIDENCE_REQUIRED",
  'verification_source: "SERVER_OWNED_COMMIT_EXECUTION_STATE"',
  'verification_source: "GITHUB_RECOVERY_FROM_ATTESTED_ARTIFACT"',
  "server_state_found: false",
  "commit_attempt_evidence_found: true",
  "recovered_without_write_replay: true",
  "recovery_persisted_server_state: false",
  'operatorMode: "read"',
  'operatorAutoExecute: true',
  'operatorRequiresConfirmation: false',
]);

requireFragments("decision", [
  "loadCodeAICommitArtifact",
  "recoverVerifiedCodeMissionCommit",
  "recoveredPersistenceEvidence",
  "artifact.commit_attempted !== true",
  "VERIFIED_COMMIT_RECOVERED_FROM_ATTESTED_ARTIFACT",
  'verification_source: "GITHUB_RECOVERY_FROM_ATTESTED_ARTIFACT"',
  "The same source persistence must not be proposed again.",
  "GitHub recovery is attempted only after a server-owned commit-attempt marker exists.",
  "deterministic registered commit verification evidence",
]);

requireFragments("handoff", [
  'source: "verification"',
  'source_path: "commit.commit_sha"',
  'target_path: "verified_commit_sha"',
  'source_path: "verification_source"',
  'target_path: "verified_commit_verification_source"',
  'source_path: "server_state_found"',
  'target_path: "verified_commit_server_state_found"',
  "verified_commit_evidence_bound_to_continuation: true",
  "write_replay_for_verification_recovery_allowed: false",
]);

requireFragments("continuation", [
  "loadCodeAICommitArtifact",
  'RECOVERY_VERIFICATION_SOURCE = "GITHUB_RECOVERY_FROM_ATTESTED_ARTIFACT"',
  "trustedRecoveryBindingContext",
  'missionStepId, 240) === "reassess_verified_main"',
  'missionCapabilityKey, 240) ===',
  "verified_commit_server_state_found !== false",
  "PRODUCT_AUTONOMY_CONTINUATION_RECOVERY_ARTIFACT_REQUIRED",
  "artifact.commit_attempted !== true",
  "PRODUCT_AUTONOMY_CONTINUATION_RECOVERY_ATTEMPT_EVIDENCE_REQUIRED",
  "PRODUCT_AUTONOMY_CONTINUATION_BOUND_COMMIT_MISMATCH",
  "server_state_or_registered_verifier_binding_required: true",
  "recovery_binding_trusted_only_inside_exact_mission_step: true",
  "recovery_artifact_commit_attempt_marker_required: true",
  "write_replay_for_recovery_allowed: false",
]);

console.log("CODE_AI_COMMIT_RECOVERY_AUDIT=PASS");
console.log("CODE_AI_COMMIT_ATTEMPT_MARKER=REQUIRED_BEFORE_GITHUB_WRITE");
console.log("CODE_AI_COMMIT_ATTEMPT_ARTIFACT=IMMUTABLE_AFTER_ATTEMPT");
console.log("CODE_AI_COMMIT_RECOVERY_BEFORE_RETRY=REQUIRED");
console.log("CODE_AI_COMMIT_RECOVERY_WITHOUT_ATTEMPT=DISABLED");
console.log("CODE_AI_COMMIT_RECOVERY_WRITE_REPLAY=DISABLED_FOR_VERIFICATION");
console.log("CODE_AI_COMMIT_RECOVERY_MATCH=BASE_PARENT_PATH_SET_AND_FILE_BYTES");
console.log("CODE_AI_PRODUCT_PERSISTENCE_RECOVERY=IDEMPOTENT_ALREADY_PERSISTED");
console.log("CODE_AI_PRODUCT_CONTINUATION_RECOVERY=VERIFIER_BOUND_SCALARS_ONLY");
