import {
  assessCodeAIFinalIndependentReviewGate,
} from "./CodeAIFinalIndependentReviewRuntime.js";
import {
  assessCodeAIBehavioralVerificationCoverage,
} from "./CodeAIBehavioralVerificationRuntime.js";

const CONTRACT = "AVANTIQO_CODE_AI_WORLDCLASS_COMMIT_GUARD_V3";
const QUALITY_CONTRACT = "AVANTIQO_CODE_AI_WORLDCLASS_QUALITY_V1";
const NEXT_QUALITY_CONTRACT = "AVANTIQO_CODE_AI_WORLDCLASS_QUALITY_V2";
const ACCEPTED_QUALITY_CONTRACTS = new Set([
  QUALITY_CONTRACT,
  NEXT_QUALITY_CONTRACT,
]);
const SUBSTANTIVE_VERIFICATION_FAMILIES = new Set([
  "tests",
  "typecheck",
  "build",
  "audit",
]);

function text(value) {
  return String(value ?? "").trim();
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function normalizedRisk(value) {
  const risk = text(value).toLowerCase();
  return ["critical", "high", "standard", "none"].includes(risk) ? risk : "none";
}

function substantiveVerificationFamilies(quality = {}) {
  return [...new Set(
    list(quality?.fresh_verification_families)
      .map((family) => text(family).toLowerCase())
      .filter((family) => SUBSTANTIVE_VERIFICATION_FAMILIES.has(family)),
  )];
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
      quality.adversarial_diff_review &&
      quality.adversarial_diff_review.verified !== true
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

    const risk = normalizedRisk(quality.risk);
    const substantiveFamilies = substantiveVerificationFamilies(quality);
    if (["high", "critical"].includes(risk) && substantiveFamilies.length < 1) {
      throw new Error(
        `CODE_AI_COMMIT_WORLDCLASS_SUBSTANTIVE_VERIFICATION_REQUIRED:risk=${risk}:accepted=${[...SUBSTANTIVE_VERIFICATION_FAMILIES].join(",")}`,
      );
    }
  }

  const behavioralVerification = assessCodeAIBehavioralVerificationCoverage({
    state,
    quality,
  });
  if (behavioralVerification.required === true && behavioralVerification.verified !== true) {
    throw new Error(
      `CODE_AI_COMMIT_BEHAVIORAL_VERIFICATION_REQUIRED:observed_tests=${behavioralVerification.observed_impacted_test_count}:fresh_test_operations=${behavioralVerification.fresh_test_operation_count}`,
    );
  }

  const independentReview = assessCodeAIFinalIndependentReviewGate(state, quality);
  if (independentReview.required === true && independentReview.verified !== true) {
    throw new Error(
      `CODE_AI_COMMIT_FINAL_INDEPENDENT_REVIEW_REQUIRED:${independentReview.blocker || "NOT_VERIFIED"}`,
    );
  }

  const substantiveFamilies = substantiveVerificationFamilies(quality);
  return {
    success: true,
    contract: CONTRACT,
    quality_contract: text(quality.contract),
    current_quality_contract: QUALITY_CONTRACT,
    next_quality_contract_accepted: text(quality.contract) === NEXT_QUALITY_CONTRACT,
    adversarial_diff_review_verified:
      quality.adversarial_diff_review
        ? quality.adversarial_diff_review.verified === true
        : null,
    risk: normalizedRisk(quality.risk),
    changed_file_count: Number(quality.changed_file_count || 0),
    verification_gate_count: Number(quality.fresh_verification_gate_count || 0),
    verification_family_count: Number(quality.fresh_verification_family_count || 0),
    verification_families: list(quality.fresh_verification_families).map(text).filter(Boolean),
    substantive_verification_required: ["high", "critical"].includes(normalizedRisk(quality.risk)),
    substantive_verification_family_count: substantiveFamilies.length,
    substantive_verification_families: substantiveFamilies,
    behavioral_verification_required: behavioralVerification.required === true,
    behavioral_verification_verified: behavioralVerification.verified === true,
    behavioral_verification_observed_test_count:
      Number(behavioralVerification.observed_impacted_test_count || 0),
    behavioral_verification_matched_test_count:
      Number(behavioralVerification.matched_impacted_test_count || 0),
    behavioral_verification_broad_test_operation_count:
      list(behavioralVerification.broad_test_operation_ids).length,
    final_independent_review_required: independentReview.required === true,
    final_independent_review_verified: independentReview.verified === true,
    final_independent_review_required_approvals:
      Number(independentReview.required_approvals || 0),
    final_independent_review_observed_approvals:
      Number(independentReview.observed_approvals || 0),
  };
}

export const CodeAIWorldClassCommitGuard = Object.freeze({
  contract: CONTRACT,
  quality_contract: QUALITY_CONTRACT,
  next_quality_contract: NEXT_QUALITY_CONTRACT,
  substantive_verification_families: Object.freeze([...SUBSTANTIVE_VERIFICATION_FAMILIES]),
  assertReady: assertCodeAIWorldClassCommitReady,
});
