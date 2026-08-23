import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { requireExecutionPermission } from "@/lib/ubte/runtime/security/CapabilityPermissionPolicy";
import {
  loadCodeAIAutonomousExecutionState,
  verifyCompletedCodeAIAutonomousExecution,
} from "@/lib/code/runtime/CodeAIAutonomousExecutionStateRuntime";

const REQUIRED_PERMISSION = "platform.code.ai.execute";
const EXECUTION_KEY_PATTERN = "^[A-Za-z0-9][A-Za-z0-9._:-]{11,159}$";

export function createCodeAIAutonomousStatusCapability() {
  const manifest = defineCapability({
    domain: "platform",
    capability: "code_ai_autonomous_status",
    action: "verify",
    name: "Verify Code AI Autonomous Execution",
    document: "code_ai_autonomous_verification",
    description:
      "Read the server-owned, organization-and-actor-scoped verification record for an autonomous Code AI execution key and fail unless the attested engineering run genuinely completed. Source-changing runs must contain successful verification evidence. This read does not execute Code AI, commit, deploy, or mutate repository state.",
    permissions: [REQUIRED_PERMISSION],
    events: [],
    tags: [
      "platform",
      "code-ai",
      "verification",
      "status",
      "attested",
      "server-owned-evidence",
      "read",
    ],
    operatorAliases: [
      "verify code ai execution",
      "check code ai mission result",
      "verify the engineering run",
      "check whether code ai completed",
    ],
    transactional: false,
    aiEnabled: true,
    operatorEnabled: true,
    operatorMode: "read",
    operatorAutoExecute: true,
    operatorRequiresConfirmation: false,
    contextScope: "organization",
    risk: "low",
    reversible: true,
    inputSchema: {
      type: "object",
      required: ["execution_key"],
      properties: {
        execution_key: {
          type: "string",
          minLength: 12,
          maxLength: 160,
          pattern: EXECUTION_KEY_PATTERN,
          description:
            "Exact opaque correlation key supplied to platform.code_ai_autonomous.execute.",
        },
      },
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: {
        status: { type: "string" },
        execution_key: { type: "string" },
        verified: { type: "boolean" },
        execution_state: { type: "object" },
        updated_at: { type: ["string", "null"] },
      },
      additionalProperties: true,
    },
  });

  function authorize({ context }) {
    return requireExecutionPermission(context, REQUIRED_PERMISSION);
  }

  async function execute({ context, payload = {} }) {
    const loaded = await loadCodeAIAutonomousExecutionState({
      context,
      executionKey: payload.execution_key,
    });
    if (!loaded.found || !loaded.execution_state) {
      throw new Error("CODE_AI_AUTONOMOUS_EXECUTION_STATE_NOT_FOUND");
    }
    verifyCompletedCodeAIAutonomousExecution(loaded.execution_state);

    return {
      status: "VERIFIED_COMPLETED",
      execution_key: payload.execution_key,
      verified: true,
      execution_state: loaded.execution_state,
      updated_at: loaded.updated_at || null,
    };
  }

  return { manifest, authorize, execute };
}

export default createCodeAIAutonomousStatusCapability;
