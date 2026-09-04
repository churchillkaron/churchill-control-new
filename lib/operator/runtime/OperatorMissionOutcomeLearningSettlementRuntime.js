import {
  handoffOperatorMissionOutcomeLearningBridge,
} from "./OperatorMissionOutcomeLearningBridgeRuntime.js";
import {
  OPERATOR_MISSION_OUTCOME_LEARNING_PROJECTION_CONTRACT,
  buildOperatorMissionOutcomeLearningObservations,
} from "./OperatorMissionOutcomeLearningProjectionRuntime.js";

export const OPERATOR_MISSION_OUTCOME_LEARNING_SETTLEMENT_CONTRACT =
  "AVANTIQO_OPERATOR_MISSION_OUTCOME_LEARNING_SETTLEMENT_V1";

const TOKEN_RE = /^[A-Fa-f0-9]{64}$/;

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function safeFailure(error) {
  return text(error?.message || error, 400)
    .replace(/[\r\n\t]+/g, " ")
    .slice(0, 400);
}

function baseGovernance() {
  return {
    post_verified_mission_completion_only: true,
    explicit_server_projection_required: true,
    learning_organization_from_server_configuration_only: true,
    customer_organization_forwarded_to_learning: false,
    raw_mission_text_forwarded_to_learning: false,
    raw_step_payload_forwarded_to_learning: false,
    raw_write_result_forwarded_to_learning: false,
    raw_verification_result_forwarded_to_learning: false,
    extracted_safe_scalar_observations_only: true,
    source_evidence_ids_persisted: false,
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
    modal_job_submitted: false,
    authorization_effect: "NONE",
  };
}

export async function settleOperatorMissionOutcomeLearning({
  projection = null,
  mission_result = null,
  observation_token = null,
  database = null,
  now = new Date(),
} = {}) {
  const prepared = object(projection);
  if (!Object.keys(prepared).length) {
    return {
      success: true,
      contract: OPERATOR_MISSION_OUTCOME_LEARNING_SETTLEMENT_CONTRACT,
      status: "NOT_REQUESTED",
      observation_written: false,
      evidence_candidate_written: false,
      reusable_platform_knowledge_written: false,
      governance: baseGovernance(),
    };
  }

  if (
    prepared.contract !== OPERATOR_MISSION_OUTCOME_LEARNING_PROJECTION_CONTRACT
  ) {
    return {
      success: true,
      contract: OPERATOR_MISSION_OUTCOME_LEARNING_SETTLEMENT_CONTRACT,
      status: "FAILED_CLOSED_INVALID_SERVER_PROJECTION",
      observation_written: false,
      evidence_candidate_written: false,
      reusable_platform_knowledge_written: false,
      reason: "SERVER_PROJECTION_CONTRACT_INVALID",
      governance: baseGovernance(),
    };
  }

  const token = text(observation_token, 128);
  if (!TOKEN_RE.test(token)) {
    return {
      success: true,
      contract: OPERATOR_MISSION_OUTCOME_LEARNING_SETTLEMENT_CONTRACT,
      status: "FAILED_CLOSED_INVALID_OBSERVATION_TOKEN",
      observation_written: false,
      evidence_candidate_written: false,
      reusable_platform_knowledge_written: false,
      reason: "DEIDENTIFIED_OBSERVATION_TOKEN_REQUIRED",
      governance: baseGovernance(),
    };
  }

  try {
    const observations = buildOperatorMissionOutcomeLearningObservations({
      projection: prepared,
      mission_result,
      run_id: token,
      now,
    });
    const result = await handoffOperatorMissionOutcomeLearningBridge({
      pattern: prepared.pattern,
      outcome_contract: prepared.outcome_contract,
      observations,
      observation_token: token,
      database,
      now,
    });

    return {
      success: true,
      contract: OPERATOR_MISSION_OUTCOME_LEARNING_SETTLEMENT_CONTRACT,
      status: result.status,
      eligible: result.eligible === true,
      source_outcome_assessment_status:
        result.source_outcome_assessment_status || null,
      source_outcome: result.source_outcome || null,
      observation_written: result.observation_written === true,
      evidence_candidate_written: result.evidence_candidate_written === true,
      reusable_platform_knowledge_written:
        result.reusable_platform_knowledge_written === true,
      pattern_evaluation: result.pattern_evaluation || null,
      governance: {
        ...baseGovernance(),
        ...(object(result.governance)),
        customer_organization_forwarded_to_learning: false,
        raw_mission_text_forwarded_to_learning: false,
        raw_step_payload_forwarded_to_learning: false,
        raw_write_result_forwarded_to_learning: false,
        raw_verification_result_forwarded_to_learning: false,
        reusable_platform_knowledge_written: false,
        knowledge_router_reuse_allowed: false,
        automatic_knowledge_promotion: false,
        direct_platform_knowledge_write_allowed: false,
        authorization_effect: "NONE",
      },
    };
  } catch (error) {
    return {
      success: true,
      contract: OPERATOR_MISSION_OUTCOME_LEARNING_SETTLEMENT_CONTRACT,
      status: "FAILED_CLOSED_NO_LEARNING_WRITE",
      observation_written: false,
      evidence_candidate_written: false,
      reusable_platform_knowledge_written: false,
      reason: safeFailure(error),
      governance: baseGovernance(),
    };
  }
}

export const OperatorMissionOutcomeLearningSettlementRuntime = Object.freeze({
  contract: OPERATOR_MISSION_OUTCOME_LEARNING_SETTLEMENT_CONTRACT,
  settle: settleOperatorMissionOutcomeLearning,
});

export default OperatorMissionOutcomeLearningSettlementRuntime;
