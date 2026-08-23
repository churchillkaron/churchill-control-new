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

export function createOperatorBindingAwareMissionCapability() {
  const base = createOperatorMissionCapability();
  const inputSchema = structuredClone(base.manifest?.inputSchema || {});
  const stepProperties = inputSchema?.properties?.steps?.items?.properties;
  if (!stepProperties || typeof stepProperties !== "object") {
    throw new Error("OPERATOR_MISSION_BINDING_MANIFEST_STEP_SCHEMA_REQUIRED");
  }
  stepProperties.bindings = bindingSchema();

  const manifest = defineCapability({
    ...base.manifest,
    description:
      "Run a bounded 2 to 6 step Operator mission. All registered capabilities and static payload fields are preflighted before the first side effect. Reads may run automatically. Writes require their registered verification and obey confirmation plus durable approval gates. Later steps may declare explicit scalar bindings from earlier reads or from successful post-write verification; raw write results never become binding authority. Bound values cannot override business scope, capability identity, permissions, authorization or approval. Verification resume still happens before any write replay.",
    tags: [...new Set([
      ...list(base.manifest?.tags),
      "result-binding",
      "verified-handoff",
      "server-authoritative-resume",
    ])],
    inputSchema,
    missionBindingContract: OPERATOR_MISSION_BINDING_CONTRACT,
    missionBindingExecutionContract: OPERATOR_MISSION_BINDING_EXECUTION_CONTRACT,
  });

  return {
    ...base,
    manifest,
  };
}

export default createOperatorBindingAwareMissionCapability;
