const CONTRACT = "AVANTIQO_CODE_AI_WORLDCLASS_COMMIT_GUARD_V1";
const QUALITY_CONTRACT = "AVANTIQO_CODE_AI_WORLDCLASS_QUALITY_V1";

function text(value) {
  return String(value ?? "").trim();
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

export function assertCodeAIWorldClassCommitReady(state = {}) {
  const quality = state?.worldclass_quality;
  if (!quality || typeof quality !== "object" || Array.isArray(quality)) {
    throw new Error("CODE_AI_COMMIT_WORLDCLASS_QUALITY_EVIDENCE_REQUIRED");
  }
  if (text(quality.contract) !== QUALITY_CONTRACT) {
    throw new Error("CODE_AI_COMMIT_WORLDCLASS_QUALITY_CONTRACT_INVALID");
  }
  if (quality.verified !== true) {
    throw new Error("CODE_AI_COMMIT_WORLDCLASS_QUALITY_NOT_VERIFIED");
  }
  if (list(quality.blockers).length > 0) {
    throw new Error("CODE_AI_COMMIT_WORLDCLASS_QUALITY_HAS_BLOCKERS");
  }
  if (Number(quality.changed_file_count || 0) > 0) {
    if (quality.explicit_final_diff_review !== true) {
      throw new Error("CODE_AI_COMMIT_WORLDCLASS_FINAL_DIFF_REVIEW_REQUIRED");
    }
    if (quality.source_manifest_matches_workspace !== true) {
      throw new Error("CODE_AI_COMMIT_WORLDCLASS_SOURCE_MANIFEST_MISMATCH");
    }
    const required = Number(quality.required_verification_gates || 0);
    const observed = Number(quality.fresh_verification_gate_count || 0);
    if (!Number.isFinite(required) || !Number.isFinite(observed) || observed < required) {
      throw new Error(
        `CODE_AI_COMMIT_WORLDCLASS_FRESH_VERIFICATION_REQUIRED:${observed}/${required}`,
      );
    }
  }
  return {
    success: true,
    contract: CONTRACT,
    quality_contract: QUALITY_CONTRACT,
    risk: text(quality.risk) || null,
    changed_file_count: Number(quality.changed_file_count || 0),
    verification_gate_count: Number(quality.fresh_verification_gate_count || 0),
  };
}

export const CodeAIWorldClassCommitGuard = Object.freeze({
  contract: CONTRACT,
  assertReady: assertCodeAIWorldClassCommitReady,
});
