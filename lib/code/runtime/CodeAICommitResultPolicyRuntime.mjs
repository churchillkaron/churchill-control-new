export const CODE_AI_COMMIT_RESULT_POLICY_CONTRACT =
  "AVANTIQO_CODE_AI_COMMIT_RESULT_POLICY_V1";

const COMMIT_PATTERN = /^[0-9a-f]{40}$/i;

function text(value, limit = 1000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function validateCodeAICommitResultBinding({
  artifact = {},
  commitSha,
  existingCommitSha,
} = {}) {
  const loaded = object(artifact);
  const commit = text(commitSha, 80).toLowerCase();
  const existing = text(existingCommitSha, 80).toLowerCase();

  if (loaded.found !== true || !text(loaded.row_id, 200)) {
    throw new Error("CODE_AI_COMMIT_RESULT_ARTIFACT_REQUIRED");
  }
  if (loaded.commit_attempted !== true || Number(loaded.commit_attempt_count || 0) < 1) {
    throw new Error("CODE_AI_COMMIT_RESULT_ATTEMPT_REQUIRED");
  }
  if (!text(loaded.execution_key, 160)) {
    throw new Error("CODE_AI_COMMIT_RESULT_EXECUTION_KEY_REQUIRED");
  }
  if (!COMMIT_PATTERN.test(commit)) {
    throw new Error("CODE_AI_COMMIT_RESULT_SHA_INVALID");
  }
  if (existing && !COMMIT_PATTERN.test(existing)) {
    throw new Error("CODE_AI_COMMIT_RESULT_EXISTING_SHA_INVALID");
  }
  if (existing && existing !== commit) {
    throw new Error("CODE_AI_COMMIT_RESULT_IMMUTABLE");
  }

  return {
    contract: CODE_AI_COMMIT_RESULT_POLICY_CONTRACT,
    valid: true,
    execution_key: text(loaded.execution_key, 160),
    row_id: text(loaded.row_id, 200),
    committed_sha: commit,
    idempotent: existing === commit,
    authorization_effect: "NONE",
    deploy_authority: false,
    production_routing_authority: false,
  };
}

export const CodeAICommitResultPolicyRuntime = Object.freeze({
  contract: CODE_AI_COMMIT_RESULT_POLICY_CONTRACT,
  validate: validateCodeAICommitResultBinding,
  exact_commit_identity_required: true,
  conflicting_result_rejected: true,
  authorization_effect: "NONE",
});

export default validateCodeAICommitResultBinding;
