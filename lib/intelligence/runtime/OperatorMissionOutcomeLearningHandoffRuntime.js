import {
  AVANTIQO_MISSION_OUTCOME_LEARNING_CONTRACT,
  buildAvantiqoMissionOutcomeLearningObservation,
  ingestAvantiqoMissionOutcomeLearning,
} from "@/lib/intelligence/runtime/AvantiqoMissionOutcomeLearningRuntime";

export const AVANTIQO_OPERATOR_MISSION_OUTCOME_LEARNING_HANDOFF_CONTRACT =
  "AVANTIQO_OPERATOR_MISSION_OUTCOME_LEARNING_HANDOFF_V1";

const ALLOWED_FIELDS = new Set([
  "pattern",
  "outcome_contract",
  "outcome_assessment",
  "observation_token",
  "organization_id",
  "database",
  "now",
  "limits",
]);

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function rejectUnknownFields(input) {
  const unknown = Object.keys(object(input)).filter((key) => !ALLOWED_FIELDS.has(key));
  if (unknown.length) {
    throw new Error(
      `${AVANTIQO_OPERATOR_MISSION_OUTCOME_LEARNING_HANDOFF_CONTRACT}_FIELD_FORBIDDEN:${unknown.sort().join(",")}`,
    );
  }
}

export function prepareOperatorMissionOutcomeLearningHandoff(input = {}) {
  rejectUnknownFields(input);
  const prepared = buildAvantiqoMissionOutcomeLearningObservation({
    pattern: input.pattern,
    outcome_contract: input.outcome_contract,
    outcome_assessment: input.outcome_assessment,
    observation_token: input.observation_token,
    organization_id: input.organization_id,
    now: input.now,
  });

  return {
    success: true,
    contract: AVANTIQO_OPERATOR_MISSION_OUTCOME_LEARNING_HANDOFF_CONTRACT,
    source_learning_contract: AVANTIQO_MISSION_OUTCOME_LEARNING_CONTRACT,
    eligible: prepared.eligible === true,
    status: prepared.eligible === true
      ? "VERIFIED_OPERATOR_OUTCOME_READY_FOR_GOVERNED_LEARNING_INGRESS"
      : "OPERATOR_OUTCOME_NOT_ELIGIBLE_FOR_LEARNING_INGRESS",
    blockers: Array.isArray(prepared.blockers) ? prepared.blockers : [],
    pattern_fingerprint: prepared.pattern_fingerprint || null,
    observation_fingerprint: prepared.observation_fingerprint || null,
    observation_row: prepared.row || null,
    governance: {
      post_verified_outcome_handoff_only: true,
      full_operator_outcome_persisted: false,
      source_observation_token_persisted: false,
      customer_private_content_allowed: false,
      customer_identifiers_allowed: false,
      raw_mission_text_allowed: false,
      raw_payload_allowed: false,
      raw_output_allowed: false,
      raw_reasoning_persisted: false,
      causal_attribution_established: false,
      reusable_platform_knowledge_written: false,
      knowledge_router_reuse_allowed: false,
      automatic_knowledge_promotion: false,
      direct_platform_knowledge_write_allowed: false,
      automatic_business_action_execution: false,
      automatic_message_send: false,
      automatic_training_effect: "NONE",
      automatic_model_weight_mutation: false,
      automatic_model_promotion: false,
      provider_call_performed: false,
      gpu_execution_performed: false,
      runpod_job_submitted: false,
      authorization_effect: "NONE",
    },
  };
}

export async function handoffOperatorMissionOutcomeLearning(input = {}) {
  const prepared = prepareOperatorMissionOutcomeLearningHandoff(input);
  if (!prepared.eligible) {
    return {
      ...prepared,
      observation_written: false,
      evidence_candidate_written: false,
      reusable_platform_knowledge_written: false,
    };
  }

  const result = await ingestAvantiqoMissionOutcomeLearning({
    pattern: input.pattern,
    outcome_contract: input.outcome_contract,
    outcome_assessment: input.outcome_assessment,
    observation_token: input.observation_token,
    organization_id: input.organization_id,
    database: input.database,
    now: input.now,
    limits: input.limits,
  });

  return {
    ...result,
    handoff_contract: AVANTIQO_OPERATOR_MISSION_OUTCOME_LEARNING_HANDOFF_CONTRACT,
    source_learning_contract: AVANTIQO_MISSION_OUTCOME_LEARNING_CONTRACT,
    governance: {
      ...(result.governance || {}),
      post_verified_outcome_handoff_only: true,
      full_operator_outcome_persisted: false,
      source_observation_token_persisted: false,
      customer_private_content_allowed: false,
      customer_identifiers_allowed: false,
      raw_reasoning_persisted: false,
      automatic_business_action_execution: false,
      automatic_message_send: false,
      automatic_knowledge_promotion: false,
      direct_platform_knowledge_write_allowed: false,
      authorization_effect: "NONE",
    },
  };
}

export const OperatorMissionOutcomeLearningHandoffRuntime = Object.freeze({
  contract: AVANTIQO_OPERATOR_MISSION_OUTCOME_LEARNING_HANDOFF_CONTRACT,
  prepare: prepareOperatorMissionOutcomeLearningHandoff,
  handoff: handoffOperatorMissionOutcomeLearning,
});

export default OperatorMissionOutcomeLearningHandoffRuntime;
