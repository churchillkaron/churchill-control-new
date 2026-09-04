import {
  OPERATOR_INTELLIGENCE_DECISION_OUTCOME_ASSESSMENT_CONTRACT,
  assessOperatorIntelligenceDecisionOutcome,
} from "./OperatorIntelligenceDecisionOutcomeAssessmentRuntime.js";
import {
  AVANTIQO_OPERATOR_MISSION_OUTCOME_LEARNING_HANDOFF_CONTRACT,
  prepareOperatorMissionOutcomeLearningHandoff,
  handoffOperatorMissionOutcomeLearning,
} from "../../intelligence/runtime/OperatorMissionOutcomeLearningHandoffRuntime.js";

export const OPERATOR_MISSION_OUTCOME_LEARNING_BRIDGE_CONTRACT =
  "AVANTIQO_OPERATOR_MISSION_OUTCOME_LEARNING_BRIDGE_V1";

const ALLOWED_FIELDS = new Set([
  "pattern",
  "outcome_contract",
  "observations",
  "observation_token",
  "organization_id",
  "database",
  "now",
  "limits",
]);

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function rejectUnknownFields(input) {
  const unknown = Object.keys(object(input)).filter((key) => !ALLOWED_FIELDS.has(key));
  if (unknown.length) {
    throw new Error(
      `${OPERATOR_MISSION_OUTCOME_LEARNING_BRIDGE_CONTRACT}_FIELD_FORBIDDEN:${unknown.sort().join(",")}`,
    );
  }
}

function bridgeGovernance(handoffGovernance = {}) {
  return {
    ...object(handoffGovernance),
    actual_operator_outcome_assessment_required: true,
    outcome_assessment_generated_by_operator_runtime: true,
    outcome_assessment_contract:
      OPERATOR_INTELLIGENCE_DECISION_OUTCOME_ASSESSMENT_CONTRACT,
    learning_handoff_contract:
      AVANTIQO_OPERATOR_MISSION_OUTCOME_LEARNING_HANDOFF_CONTRACT,
    assessment_and_learning_are_separate_governed_steps: true,
    raw_outcome_observations_forwarded_to_learning: false,
    raw_outcome_observations_persisted: false,
    observed_values_forwarded_to_learning: false,
    source_evidence_ids_persisted: false,
    raw_mission_text_allowed: false,
    raw_payload_allowed: false,
    raw_output_allowed: false,
    raw_reasoning_persisted: false,
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
  };
}

function assessAndBuildHandoffInput(input = {}) {
  rejectUnknownFields(input);
  const source = object(input);
  const assessment = assessOperatorIntelligenceDecisionOutcome({
    outcome_contract: object(source.outcome_contract),
    observations: list(source.observations),
  });

  return {
    assessment,
    handoffInput: {
      pattern: source.pattern,
      outcome_contract: source.outcome_contract,
      outcome_assessment: assessment,
      observation_token: source.observation_token,
      organization_id: source.organization_id,
      database: source.database,
      now: source.now,
      limits: source.limits,
    },
  };
}

function bridgeResult({ assessment, handoff, preparation = false }) {
  return {
    success: true,
    contract: OPERATOR_MISSION_OUTCOME_LEARNING_BRIDGE_CONTRACT,
    source_outcome_assessment_contract: assessment.contract || null,
    source_outcome_assessment_status: assessment.status || null,
    source_outcome: assessment.outcome || null,
    source_decision_success_proven: assessment.decision_success_proven === true,
    source_review_required: assessment.review_required === true,
    handoff_contract:
      handoff.handoff_contract ||
      handoff.contract ||
      AVANTIQO_OPERATOR_MISSION_OUTCOME_LEARNING_HANDOFF_CONTRACT,
    eligible: handoff.eligible === true,
    status: handoff.status,
    blockers: Array.isArray(handoff.blockers) ? handoff.blockers : [],
    pattern_fingerprint: handoff.pattern_fingerprint || null,
    observation_fingerprint: handoff.observation_fingerprint || null,
    ...(preparation
      ? { observation_row: handoff.observation_row || null }
      : {
          observation_written: handoff.observation_written === true,
          evidence_candidate_written: handoff.evidence_candidate_written === true,
          reusable_platform_knowledge_written:
            handoff.reusable_platform_knowledge_written === true,
          pattern_evaluation: handoff.pattern_evaluation || null,
        }),
    governance: bridgeGovernance(handoff.governance),
  };
}

export function prepareOperatorMissionOutcomeLearningBridge(input = {}) {
  const { assessment, handoffInput } = assessAndBuildHandoffInput(input);
  const handoff = prepareOperatorMissionOutcomeLearningHandoff(handoffInput);
  return bridgeResult({ assessment, handoff, preparation: true });
}

export async function handoffOperatorMissionOutcomeLearningBridge(input = {}) {
  const { assessment, handoffInput } = assessAndBuildHandoffInput(input);
  const handoff = await handoffOperatorMissionOutcomeLearning(handoffInput);
  return bridgeResult({ assessment, handoff, preparation: false });
}

export const OperatorMissionOutcomeLearningBridgeRuntime = Object.freeze({
  contract: OPERATOR_MISSION_OUTCOME_LEARNING_BRIDGE_CONTRACT,
  prepare: prepareOperatorMissionOutcomeLearningBridge,
  handoff: handoffOperatorMissionOutcomeLearningBridge,
});

export default OperatorMissionOutcomeLearningBridgeRuntime;
