import { randomBytes } from "node:crypto";
import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import {
  createOperatorMissionCapability,
} from "@/lib/platform/capabilities/createOperatorMissionCapability";
import {
  OPERATOR_MISSION_BINDING_CONTRACT,
} from "@/lib/operator/runtime/OperatorMissionBindingRuntime";
import {
  OPERATOR_MISSION_BINDING_EXECUTION_CONTRACT,
} from "@/lib/operator/runtime/OperatorMissionBindingExecutionRuntime";
import {
  OPERATOR_MISSION_OUTCOME_LEARNING_PROJECTION_CONTRACT,
  prepareOperatorMissionOutcomeLearningProjection,
} from "@/lib/operator/runtime/OperatorMissionOutcomeLearningProjectionRuntime.js";
import {
  OPERATOR_MISSION_OUTCOME_LEARNING_SETTLEMENT_CONTRACT,
  settleOperatorMissionOutcomeLearning,
} from "@/lib/operator/runtime/OperatorMissionOutcomeLearningSettlementRuntime.js";

const TOKEN_RE = /^[A-Fa-f0-9]{64}$/;

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function bindingSchema() {
  return {
    type: "array",
    maxItems: 12,
    description:
      "Explicit scalar handoffs from an earlier completed step. Read sources use result. Mutating sources must use verification and become available only after the registered verification succeeds.",
    items: {
      type: "object",
      required: ["source_step_id", "source_path", "target_path"],
      properties: {
        source_step_id: {
          type: "string",
          description: "ID of an earlier mission step.",
        },
        source: {
          type: "string",
          enum: ["result", "verification"],
          description:
            "Use result for read source steps and verification for mutating source steps.",
        },
        source_path: {
          type: "string",
          description:
            "Dot path to one bounded scalar in the successful read or successful verification result. Secret/credential/token paths are blocked.",
        },
        target_path: {
          type: "string",
          description:
            "Dot path inside this step payload. Organization/entity/period/party/actor/permission/authorization/approval/capability fields are blocked.",
        },
        required: {
          type: "boolean",
          description: "Whether the source scalar must exist before this step may proceed.",
        },
      },
      additionalProperties: false,
    },
  };
}

function learningPatternSchema() {
  return {
    type: "object",
    required: [
      "mission_family",
      "intervention_code",
      "knowledge_domain",
    ],
    properties: {
      mission_family: { type: "string" },
      intervention_code: { type: "string" },
      intervention_class: { type: "string" },
      knowledge_domain: { type: "string" },
      condition_codes: { type: "array", items: { type: "string" } },
      boundary_condition_codes: {
        type: "array",
        items: { type: "string" },
      },
      failure_mode_codes: { type: "array", items: { type: "string" } },
      stability: { type: "string", enum: ["stable", "mutable"] },
    },
    additionalProperties: false,
  };
}

function learningSchema() {
  return {
    type: "object",
    description:
      "Optional de-identified structural outcome-learning projection. This never grants execution authority or reusable knowledge. Criteria may read only safe scalar fields from the final registered verification result. Freeform mission text, customer identifiers, raw payloads, raw write results, secrets and reasoning are forbidden.",
    required: ["pattern", "criteria"],
    properties: {
      pattern: learningPatternSchema(),
      criteria: {
        type: "array",
        minItems: 2,
        maxItems: 12,
        items: {
          type: "object",
          required: [
            "id",
            "kind",
            "comparator",
            "source_step_id",
            "source_path",
          ],
          properties: {
            id: { type: "string" },
            kind: {
              type: "string",
              enum: ["success", "warning", "failure"],
            },
            comparator: {
              type: "string",
              enum: [
                "eq",
                "neq",
                "gt",
                "gte",
                "lt",
                "lte",
                "contains",
                "exists",
                "truthy",
                "falsy",
              ],
            },
            expected_value: {},
            source_step_id: { type: "string" },
            source_path: { type: "string" },
          },
          additionalProperties: false,
        },
      },
    },
    additionalProperties: false,
  };
}

function trustedResumeObservationToken(context, payload) {
  if (context?.metadata?.operatorMissionResume !== true) return null;
  const candidate = text(object(payload?.resume).learning_observation_token, 128);
  return TOKEN_RE.test(candidate) ? candidate.toLowerCase() : null;
}

function observationToken(context, payload, projection) {
  if (!projection) return null;
  return (
    trustedResumeObservationToken(context, payload) ||
    randomBytes(32).toString("hex")
  );
}

function projectionFailure(error, stepCount) {
  return {
    status: "blocked",
    mission_mode: "durable_registered_sequence",
    all_steps_preflighted: false,
    reason: "OPERATOR_MISSION_OUTCOME_LEARNING_PROJECTION_INVALID",
    detail: text(error?.message || error, 500),
    total_steps: Number(stepCount || 0),
    completed_steps: 0,
    remaining_steps: Number(stepCount || 0),
    current_step_id: null,
    steps: [],
    learning_settlement: {
      contract: OPERATOR_MISSION_OUTCOME_LEARNING_SETTLEMENT_CONTRACT,
      status: "FAILED_CLOSED_BEFORE_MISSION_EXECUTION",
      observation_written: false,
      evidence_candidate_written: false,
      reusable_platform_knowledge_written: false,
    },
  };
}

export function createOperatorBindingAwareMissionCapability() {
  const base = createOperatorMissionCapability();
  const inputSchema = structuredClone(base.manifest?.inputSchema || {});
  const stepProperties = inputSchema?.properties?.steps?.items?.properties;
  if (!stepProperties || typeof stepProperties !== "object") {
    throw new Error("OPERATOR_MISSION_BINDING_MANIFEST_STEP_SCHEMA_REQUIRED");
  }
  stepProperties.bindings = bindingSchema();
  inputSchema.properties.learning = learningSchema();

  const manifest = defineCapability({
    ...base.manifest,
    description:
      "Run a bounded 2 to 6 step Operator mission. All registered capabilities and static payload fields are preflighted before the first side effect. Reads may run automatically. Writes require their registered verification and obey confirmation plus durable approval gates. Later steps may declare explicit scalar bindings from earlier reads or from successful post-write verification; raw write results never become binding authority. An optional de-identified learning projection may settle only after the whole mission completes and the final write passes its registered verification; it can accumulate structural evidence but never creates reusable knowledge automatically. Bound values and learning metadata cannot override business scope, capability identity, permissions, authorization or approval. Verification resume still happens before any write replay.",
    tags: [...new Set([
      ...list(base.manifest?.tags),
      "result-binding",
      "verified-handoff",
      "server-authoritative-resume",
      "governed-outcome-learning",
      "evidence-candidate-only",
    ])],
    inputSchema,
    missionBindingContract: OPERATOR_MISSION_BINDING_CONTRACT,
    missionBindingExecutionContract: OPERATOR_MISSION_BINDING_EXECUTION_CONTRACT,
    missionOutcomeLearningProjectionContract:
      OPERATOR_MISSION_OUTCOME_LEARNING_PROJECTION_CONTRACT,
    missionOutcomeLearningSettlementContract:
      OPERATOR_MISSION_OUTCOME_LEARNING_SETTLEMENT_CONTRACT,
  });

  async function execute({ context, payload = {} }) {
    let projection = null;
    try {
      projection = prepareOperatorMissionOutcomeLearningProjection({
        specification: payload.learning,
        steps: payload.steps,
      });
    } catch (error) {
      return projectionFailure(error, list(payload.steps).length);
    }

    const token = observationToken(context, payload, projection);
    const result = await base.execute({ context, payload });

    if (
      projection &&
      text(result?.status, 40) === "paused" &&
      result?.resume_payload &&
      typeof result.resume_payload === "object"
    ) {
      result.resume_payload = {
        ...result.resume_payload,
        learning: projection.spec,
        resume: {
          ...object(result.resume_payload.resume),
          learning_observation_token: token,
        },
      };
    }

    if (projection && text(result?.status, 40) === "completed") {
      result.learning_settlement = await settleOperatorMissionOutcomeLearning({
        projection,
        mission_result: result,
        observation_token: token,
      });
    } else if (!projection) {
      result.learning_settlement = {
        contract: OPERATOR_MISSION_OUTCOME_LEARNING_SETTLEMENT_CONTRACT,
        status: "NOT_REQUESTED",
        observation_written: false,
        evidence_candidate_written: false,
        reusable_platform_knowledge_written: false,
      };
    }

    return result;
  }

  return {
    ...base,
    manifest,
    execute,
  };
}

export default createOperatorBindingAwareMissionCapability;