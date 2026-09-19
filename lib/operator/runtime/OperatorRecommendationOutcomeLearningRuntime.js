import { randomBytes } from "node:crypto";
import {
  resolveOperatorMissionOutcomeLearningProjection,
  restoreOperatorMissionOutcomeLearningProjection,
} from "./OperatorMissionOutcomeLearningManifestRuntime.js";
import {
  settleOperatorMissionOutcomeLearning,
} from "./OperatorMissionOutcomeLearningSettlementRuntime.js";

export const OPERATOR_RECOMMENDATION_OUTCOME_LEARNING_CONTRACT =
  "AVANTIQO_OPERATOR_RECOMMENDATION_OUTCOME_LEARNING_V1";

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}
function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function singleStep(recommendation = {}) {
  const verify = object(recommendation.verify_after);
  const capabilityKey = text(recommendation.capability_key, 300);
  if (!capabilityKey || !text(verify.capability_key, 300)) return null;
  return {
    id: "requested_action",
    capability_key: capabilityKey,
    payload: object(recommendation.payload),
    verify_after: {
      capability_key: text(verify.capability_key, 300),
      payload: object(verify.payload),
    },
  };
}

export async function resolveOperatorRecommendationOutcomeLearning(recommendation = {}) {
  const step = singleStep(recommendation);
  if (!step) return null;
  const projection = await resolveOperatorMissionOutcomeLearningProjection({ steps: [step] });
  if (!projection) return null;
  return {
    contract: OPERATOR_RECOMMENDATION_OUTCOME_LEARNING_CONTRACT,
    status: "READY_FOR_VERIFIED_RECOMMENDATION_COMPLETION",
    spec: projection.spec,
    observation_token: randomBytes(32).toString("hex"),
    authorization_effect: "NONE",
    execution_authority: false,
    automatic_knowledge_promotion: false,
  };
}

export async function settleOperatorRecommendationOutcomeLearning({
  learning = null,
  recommendation = null,
  execution = null,
} = {}) {
  const binding = object(learning);
  const action = object(recommendation);
  const outcome = object(execution);
  if (
    binding.contract !== OPERATOR_RECOMMENDATION_OUTCOME_LEARNING_CONTRACT ||
    binding.status !== "READY_FOR_VERIFIED_RECOMMENDATION_COMPLETION" ||
    outcome.business_effect_verified !== true
  ) {
    return null;
  }
  const step = singleStep(action);
  if (!step) return null;
  const projection = restoreOperatorMissionOutcomeLearningProjection({
    specification: object(binding.spec),
    steps: [step],
  });
  if (!projection) return null;
  const verificationReceipt = object(outcome.post_action_verification);
  const verification = object(
    verificationReceipt.result ||
    verificationReceipt.verification_result ||
    verificationReceipt.output ||
    verificationReceipt,
  );
  const missionResult = {
    status: "completed",
    mission_mode: "durable_registered_sequence",
    all_steps_preflighted: true,
    remaining_steps: 0,
    current_step_id: null,
    steps: [{
      id: "requested_action",
      status: "verification_completed",
      verification,
    }],
  };
  return settleOperatorMissionOutcomeLearning({
    projection,
    mission_result: missionResult,
    observation_token: text(binding.observation_token, 128),
  });
}

export default {
  contract: OPERATOR_RECOMMENDATION_OUTCOME_LEARNING_CONTRACT,
  resolve: resolveOperatorRecommendationOutcomeLearning,
  settle: settleOperatorRecommendationOutcomeLearning,
};
