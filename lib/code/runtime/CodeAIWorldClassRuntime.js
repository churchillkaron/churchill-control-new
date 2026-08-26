import { executeAutonomousCodeMission } from "./CodeAIAutonomousRuntime.js";
import {
  assessCodeAIWorldClassQuality,
  codeAIWorldClassRequiredStatus,
} from "./CodeAIWorldClassQualityPolicy.js";

const CONTRACT = "AVANTIQO_CODE_AI_WORLDCLASS_QUALITY_V1";
const MAX_EVIDENCE_ITEMS = 120;
const MAX_QUALITY_CONVERGENCE_PASSES = 4;

function text(value, maximum = 4000) {
  return String(value ?? "").trim().slice(0, maximum);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function now() {
  return new Date().toISOString();
}

function qualityEvidence(assessment, convergencePass = 0) {
  return {
    at: now(),
    kind: "worldclass_quality_gate",
    contract: CONTRACT,
    convergence_pass: convergencePass,
    verified: assessment.verified === true,
    risk: assessment.risk,
    changed_file_count: assessment.changed_file_count,
    required_verification_gates: assessment.required_verification_gates,
    fresh_verification_gate_count: assessment.fresh_verification_gate_count,
    fresh_verification_family_count: assessment.fresh_verification_family_count,
    fresh_verification_families: assessment.fresh_verification_families,
    explicit_final_diff_review: assessment.explicit_final_diff_review,
    source_manifest_matches_workspace: assessment.source_manifest_matches_workspace,
    blockers: assessment.blockers,
    required_next_actions: assessment.required_next_actions,
    authorization_effect: "NONE",
  };
}

function attachQuality(
  state,
  assessment,
  { enforceCompletion = false, convergencePass = 0 } = {},
) {
  const source = object(state);
  const evidence = [
    ...list(source.evidence),
    qualityEvidence(assessment, convergencePass),
  ].slice(-MAX_EVIDENCE_ITEMS);
  if (enforceCompletion && assessment.verified !== true) {
    return {
      ...source,
      status: codeAIWorldClassRequiredStatus(assessment.blockers),
      blockers: assessment.blockers,
      worldclass_quality: assessment,
      evidence,
      updated_at: now(),
    };
  }
  return {
    ...source,
    worldclass_quality: assessment,
    evidence,
    updated_at: now(),
  };
}

function canAutoConverge(assessment) {
  return (
    assessment?.verified !== true &&
    list(assessment?.required_next_actions).length > 0 &&
    list(assessment?.blockers).every((blocker) =>
      blocker.includes("FINAL_DIFF_REVIEW") ||
      blocker.includes("FRESH_VERIFICATION_GATES")
    )
  );
}

export async function executeWorldClassCodeMission(input = {}) {
  let executionInput = { ...object(input) };
  let convergencePass = 0;

  while (true) {
    const result = await executeAutonomousCodeMission(executionInput);
    if (!result?.state) return result;

    const assessment = assessCodeAIWorldClassQuality(result.state);
    const completed = text(result?.status, 100) === "completed" && result?.success === true;
    const state = attachQuality(result.state, assessment, {
      enforceCompletion: completed,
      convergencePass,
    });

    if (!completed || assessment.verified === true) {
      return {
        ...result,
        state,
        worldclass_quality: assessment,
        worldclass_quality_convergence_passes: convergencePass,
      };
    }

    if (
      !canAutoConverge(assessment) ||
      convergencePass >= MAX_QUALITY_CONVERGENCE_PASSES
    ) {
      return {
        ...result,
        success: false,
        status: state.status,
        reason: assessment.blockers[0] || "CODE_AI_WORLDCLASS_QUALITY_REQUIRED",
        state,
        worldclass_quality: assessment,
        worldclass_quality_convergence_passes: convergencePass,
      };
    }

    convergencePass += 1;
    executionInput = {
      ...executionInput,
      resume_state: state,
    };
  }
}

export {
  assessCodeAIWorldClassQuality,
} from "./CodeAIWorldClassQualityPolicy.js";

export const CodeAIWorldClassRuntime = Object.freeze({
  contract: CONTRACT,
  max_quality_convergence_passes: MAX_QUALITY_CONVERGENCE_PASSES,
  assess: assessCodeAIWorldClassQuality,
  execute: executeWorldClassCodeMission,
});
