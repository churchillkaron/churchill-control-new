const CONTRACT = "AVANTIQO_CODE_AI_WORLDCLASS_COMMIT_GUARD_V1";
const QUALITY_CONTRACT = "AVANTIQO_CODE_AI_WORLDCLASS_QUALITY_V2";
const LEGACY_QUALITY_CONTRACT = "AVANTIQO_CODE_AI_WORLDCLASS_QUALITY_V1";
const ACCEPTED_QUALITY_CONTRACTS = new Set([
  QUALITY_CONTRACT,
  LEGACY_QUALITY_CONTRACT,
]);

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
  if (!ACCEPTED_QUALITY_CONTRACTS.has(text(quality.contract))) {
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
    if (
      text(quality.contract) === QUALITY_CONTRACT &&
      quality.adversarial_diff_review?.verified !== true
    ) {
      throw new Error("CODE_AI_COMMIT_WORLDCLASS_ADVERSARIAL_DIFF_REVIEW_REQUIRED");
    }
    const required = Number(quality.required_verification_gates || 0);
    const observedCommands = Number(quality.fresh_verification_gate_count || 0);
    const observedFamilies = Number(quality.fresh_verification_family_count || 0);
    if (
      !Number.isFinite(required) ||
      !Number.isFinite(observedCommands) ||
      !Number.isFinite(observedFamilies) ||
      observedCommands < required ||
      observedFamilies < required
    ) {
      throw new Error(
        `CODE_AI_COMMIT_WORLDCLASS_FRESH_VERIFICATION_REQUIRED:commands=${observedCommands}/${required}:families=${observedFamilies}/${required}`,
      );
    }
  }
  return {
    success: true,
    contract: CONTRACT,
    quality_contract: text(quality.contract),
    current_quality_contract: QUALITY_CONTRACT,
    legacy_quality_contract_accepted: text(quality.contract) === LEGACY_QUALITY_CONTRACT,
    adversarial_diff_review_verified:
      text(quality.contract) === QUALITY_CONTRACT
        ? quality.adversarial_diff_review?.verified === true
        : null,
    risk: text(quality.risk) || null,
    changed_file_count: Number(quality.changed_file_count || 0),
    verification_gate_count: Number(quality.fresh_verification_gate_count || 0),
    verification_family_count: Number(quality.fresh_verification_family_count || 0),
    verification_families: list(quality.fresh_verification_families).map(text).filter(Boolean),
  };
}

export const CodeAIWorldClassCommitGuard = Object.freeze({
  contract: CONTRACT,
  quality_contract: QUALITY_CONTRACT,
  legacy_quality_contract: LEGACY_QUALITY_CONTRACT,
  assertReady: assertCodeAIWorldClassCommitReady,
});