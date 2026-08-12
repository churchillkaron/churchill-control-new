import {
  CreativeOutcomeLearningRuntime,
} from "./CreativeOutcomeLearningRuntime";
import {
  CreativeHumanLearningRuntime,
} from "./CreativeHumanLearningRuntime";

export const CREATIVE_STUDIO_LEARNING_CONTRACT =
  "CREATIVE_STUDIO_LEARNING_V1";

function explanation({ outcomes = {}, human = {} }) {
  const outcomeCount = Number(outcomes.direction_eligible_count || 0);
  const decisionCount = Number(human.decision_count || 0);
  const rejectionCount = Number(human.rejection_count || 0);

  if (!outcomeCount && !decisionCount) {
    return {
      status: "FRESH_JUDGMENT_REQUIRED",
      reason:
        "No verified published outcomes or human Creative decisions are available yet.",
    };
  }
  if (!outcomeCount) {
    return {
      status: "HUMAN_EVIDENCE_ONLY",
      reason:
        rejectionCount > 0
          ? "Future direction may consider owner approval and revision evidence, but has no verified market outcome evidence yet."
          : "Future direction may consider owner approval evidence, but has no verified market outcome evidence yet.",
    };
  }
  if (!decisionCount) {
    return {
      status: "OUTCOME_EVIDENCE_ONLY",
      reason:
        "Future direction may consider verified publication performance while relying on fresh judgment for owner preference.",
    };
  }
  return {
    status: "COMBINED_EVIDENCE_AVAILABLE",
    reason:
      "Future direction may consider both verified publication outcomes and authenticated human Creative decisions.",
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

    const [outcomeLearning, humanLearning] = await Promise.all([
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
    ]);

    const outcomes = outcomeLearning.summary || {};
    const humanDecisions = humanLearning.summary || {};
    const decisionExplanation = explanation({
      outcomes,
      human: humanDecisions,
    });

    const summary = {
      contract: CREATIVE_STUDIO_LEARNING_CONTRACT,
      evidence_scope: {
        outcomes: brand_id ? "ORGANIZATION_BRAND" : "PROJECT_ONLY",
        human_decisions: "PROJECT_ONLY",
      },
      status: decisionExplanation.status,
      decision_explanation: decisionExplanation,
      outcomes,
      human_decisions: humanDecisions,
      safeguards: {
        evidence_is_advisory: true,
        fresh_judgment_remains_required: true,
        quality_floor_immutable: true,
        quality_policy_override_allowed: false,
        rights_gate_override_allowed: false,
        approval_gate_override_allowed: false,
        provider_routing_override_allowed: false,
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
      read_only_learning: true,
      provider_execution: false,
    };
  },
});
