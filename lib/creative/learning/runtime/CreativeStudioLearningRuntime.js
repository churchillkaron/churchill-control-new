import {
  CreativeOutcomeLearningRuntime,
} from "./CreativeOutcomeLearningRuntime";
import {
  CreativeHumanLearningRuntime,
} from "./CreativeHumanLearningRuntime";
import {
  CreativeProductionLearningRuntime,
} from "./CreativeProductionLearningRuntime";
import {
  CreativePreferenceLearningRuntime,
} from "./CreativePreferenceLearningRuntime";

export const CREATIVE_STUDIO_LEARNING_CONTRACT =
  "CREATIVE_STUDIO_LEARNING_V2";

function explanation({ outcomes = {}, human = {}, production = {} }) {
  const outcomeCount = Number(outcomes.direction_eligible_count || 0);
  const decisionCount = Number(human.decision_count || 0);
  const rejectionCount = Number(human.rejection_count || 0);
  const productionEvidence = Number(production.evidence?.task_count || 0);

  if (!outcomeCount && !decisionCount && !productionEvidence) {
    return {
      status: "FRESH_JUDGMENT_REQUIRED",
      reason:
        "No verified published outcomes, human Creative decisions, or governed production evidence are available yet.",
    };
  }
  if (!outcomeCount && !decisionCount && productionEvidence) {
    return {
      status: "PRODUCTION_EVIDENCE_ONLY",
      reason:
        "Future direction may consider governed production reliability, repair effectiveness, quality and cost evidence while fresh creative judgment remains mandatory.",
    };
  }
  if (!outcomeCount) {
    return {
      status: productionEvidence ? "HUMAN_AND_PRODUCTION_EVIDENCE" : "HUMAN_EVIDENCE_ONLY",
      reason:
        rejectionCount > 0
          ? "Future direction may consider owner approval and revision evidence plus governed production evidence, but has no verified market outcome evidence yet."
          : "Future direction may consider owner approval evidence plus governed production evidence, but has no verified market outcome evidence yet.",
    };
  }
  if (!decisionCount) {
    return {
      status: productionEvidence ? "OUTCOME_AND_PRODUCTION_EVIDENCE" : "OUTCOME_EVIDENCE_ONLY",
      reason:
        "Future direction may consider verified publication performance and governed production evidence while relying on fresh judgment for owner preference.",
    };
  }
  return {
    status: productionEvidence ? "FULL_GOVERNED_EVIDENCE_AVAILABLE" : "COMBINED_EVIDENCE_AVAILABLE",
    reason:
      productionEvidence
        ? "Future direction may consider verified publication outcomes, authenticated human Creative decisions, and governed production evidence without changing quality, governance, approval or provider authority."
        : "Future direction may consider both verified publication outcomes and authenticated human Creative decisions.",
  };
}

export const CreativeStudioLearningRuntime = Object.freeze({
  async resolve({
    organization_id,
    creative_project_id,
    brand_id = null,
    campaign_id = null,
    limit = 100,
  } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!creative_project_id) throw new Error("creative_project_id required");

    const [outcomeLearning, humanLearning, productionLearning, preferenceLearning] = await Promise.all([
      CreativeOutcomeLearningRuntime.resolve({
        organization_id,
        creative_project_id: brand_id ? null : creative_project_id,
        brand_id: brand_id || null,
        campaign_id: campaign_id || null,
        limit,
      }),
      CreativeHumanLearningRuntime.resolve({
        organization_id,
        creative_project_id,
        limit,
      }),
      CreativeProductionLearningRuntime.resolve({
        organization_id,
        creative_project_id,
      }),
      CreativePreferenceLearningRuntime.resolve({ limit: 200 }),
    ]);

    const outcomes = outcomeLearning.summary || {};
    const humanDecisions = humanLearning.summary || {};
    const decisionExplanation = explanation({
      outcomes,
      human: humanDecisions,
      production: productionLearning,
    });

    const summary = {
      contract: CREATIVE_STUDIO_LEARNING_CONTRACT,
      evidence_scope: {
        outcomes: brand_id ? "ORGANIZATION_BRAND" : "PROJECT_ONLY",
        human_decisions: "PROJECT_ONLY",
        production_evidence: "PROJECT_ONLY",
      },
      status: decisionExplanation.status,
      decision_explanation: decisionExplanation,
      outcomes,
      human_decisions: humanDecisions,
      production_learning: productionLearning,
      structural_preference_learning: preferenceLearning.summary || {},
      safeguards: {
        evidence_is_advisory: true,
        fresh_judgment_remains_required: true,
        quality_floor_immutable: true,
        quality_policy_override_allowed: false,
        rights_gate_override_allowed: false,
        approval_gate_override_allowed: false,
        provider_routing_override_allowed: false,
        governance_override_allowed: false,
        imitation_of_prior_work_allowed: false,
        external_text_instruction_execution_allowed: false,
        human_feedback_instruction_execution_allowed: false,
        provider_prompts_persisted: false,
      },
    };

    return {
      current: summary,
      summary,
      status: summary.status,
      outcomes: outcomeLearning.items || [],
      human_decisions: humanLearning.items || [],
      production_learning: productionLearning,
      structural_preference_learning: preferenceLearning.summary || {},
      read_only_learning: true,
      provider_execution: false,
    };
  },
});
