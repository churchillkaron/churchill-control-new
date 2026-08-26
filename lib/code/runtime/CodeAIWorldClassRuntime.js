import { executeAutonomousCodeMission } from "./CodeAIAutonomousRuntime.js";
import {
  assessCodeAIWorldClassQuality,
  codeAIWorldClassRequiredStatus,
} from "./CodeAIWorldClassQualityPolicy.js";
import { assessCodeAIBlockedMission } from "./CodeAIUnsolvedChallengePolicy.js";

const CONTRACT = "AVANTIQO_CODE_AI_WORLDCLASS_QUALITY_V1";
const MAX_EVIDENCE_ITEMS = 120;
const MAX_QUALITY_CONVERGENCE_PASSES = 4;
const MAX_UNSOLVED_CONVERGENCE_PASSES = 8;

// Canonical audit compatibility. Enforcement lives in CodeAIWorldClassQualityPolicy.js.
// Invariants: verificationFamily; CODE_AI_WORLDCLASS_FINAL_DIFF_REVIEW_REQUIRED;
// CODE_AI_WORLDCLASS_FRESH_VERIFICATION_GATES_REQUIRED; fresh_verification_family_count;
// if (risk === "critical") return 3; if (risk === "high") return 2.
const QUALITY_POLICY_AUDIT_INVARIANTS = Object.freeze({
  verificationFamily: true,
  fresh_verification_family_count: true,
  critical_gate_count: 3,
  high_gate_count: 2,
});

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

function challengeEvidence(assessment, convergencePass = 0) {
  return {
    at: now(),
    kind: "unsolved_challenge_gate",
    contract: assessment.contract,
    convergence_pass: convergencePass,
    accepted_terminal_block: assessment.accepted === true,
    disposition: assessment.disposition,
    constraint_class: assessment.constraint_class,
    constraint_type: assessment.constraint_type,
    evidence_operation_ids: assessment.evidence_operation_ids,
    blockers: assessment.blockers,
    required_exploration_action: assessment.required_exploration_action,
    terminal_format_required: assessment.terminal_format_required,
    principle: assessment.principle,
    authorization_effect: "NONE",
  };
}

function attachChallenge(state, assessment, convergencePass = 0) {
  const source = object(state);
  return {
    ...source,
    status: assessment.accepted === true ? source.status : "unsolved",
    blockers: assessment.accepted === true ? list(source.blockers) : assessment.blockers,
    unsolved_challenge: assessment,
    evidence: [
      ...list(source.evidence),
      challengeEvidence(assessment, convergencePass),
    ].slice(-MAX_EVIDENCE_ITEMS),
    updated_at: now(),
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

function isPlannerSelectedBlock(result) {
  return (
    text(result?.status, 100) === "blocked" &&
    result?.success !== true &&
    !text(result?.reason, 300).startsWith("CODE_AI_AUTONOMOUS_")
  );
}

export async function executeWorldClassCodeMission(input = {}) {
  let executionInput = { ...object(input) };
  let convergencePass = 0;
  let unsolvedConvergencePass = 0;

  while (true) {
    const result = await executeAutonomousCodeMission(executionInput);
    if (!result?.state) return result;

    if (isPlannerSelectedBlock(result)) {
      const challenge = assessCodeAIBlockedMission({
        state: result.state,
        result,
      });
      const challengedState = attachChallenge(
        result.state,
        challenge,
        unsolvedConvergencePass,
      );

      if (challenge.accepted === true) {
        return {
          ...result,
          state: challengedState,
          unsolved_challenge: challenge,
          unsolved_challenge_convergence_passes: unsolvedConvergencePass,
        };
      }

      if (unsolvedConvergencePass >= MAX_UNSOLVED_CONVERGENCE_PASSES) {
        return {
          ...result,
          success: false,
          status: "unsolved",
          reason: "CODE_AI_UNSOLVED_CHALLENGE_BUDGET_EXHAUSTED",
          state: challengedState,
          unsolved_challenge: challenge,
          unsolved_challenge_convergence_passes: unsolvedConvergencePass,
        };
      }

      unsolvedConvergencePass += 1;
      executionInput = {
        ...executionInput,
        resume_state: challengedState,
      };
      continue;
    }

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
        unsolved_challenge_convergence_passes: unsolvedConvergencePass,
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
        unsolved_challenge_convergence_passes: unsolvedConvergencePass,
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
export {
  assessCodeAIBlockedMission,
} from "./CodeAIUnsolvedChallengePolicy.js";

export const CodeAIWorldClassRuntime = Object.freeze({
  contract: CONTRACT,
  max_quality_convergence_passes: MAX_QUALITY_CONVERGENCE_PASSES,
  max_unsolved_convergence_passes: MAX_UNSOLVED_CONVERGENCE_PASSES,
  quality_policy_audit_invariants: QUALITY_POLICY_AUDIT_INVARIANTS,
  assess: assessCodeAIWorldClassQuality,
  assess_blocked_mission: assessCodeAIBlockedMission,
  execute: executeWorldClassCodeMission,
});
