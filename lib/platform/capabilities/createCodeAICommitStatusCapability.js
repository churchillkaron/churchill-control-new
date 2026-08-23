import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { requireExecutionPermission } from "@/lib/ubte/runtime/security/CapabilityPermissionPolicy";
import {
  loadCodeAICommitExecutionState,
} from "@/lib/code/runtime/CodeAICommitExecutionStateRuntime";

const REQUIRED_PERMISSION = "platform.code.ai.commit";
const EXECUTION_KEY_PATTERN = "^[A-Za-z0-9][A-Za-z0-9._:-]{11,159}$";

export function createCodeAICommitStatusCapability() {
  const manifest = defineCapability({
    domain: "platform",
    capability: "code_ai_commit_status",
    action: "verify",
    name: "Verify Code AI Commit",
    document: "code_ai_commit_verification",
    description:
      "Read the server-owned verification record for a governed Code AI GitHub commit and fail unless the commit completed on main with post-write branch/parent/tree verification. This read never commits, deploys, edits source, or changes authorization.",
    permissions: [REQUIRED_PERMISSION],
    events: [],
    tags: [
      "platform",
      "code-ai",
      "github",
      "commit",
      "verification",
      "server-owned-evidence",
      "read",
    ],
    operatorAliases: [
      "verify code ai commit",
      "check code ai commit",
      "verify engineering commit",
      "check whether code ai committed",
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
            "Exact opaque execution key used by the Code AI autonomous run and governed commit action.",
        },
      },
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: {
        status: { type: "string" },
        verified: { type: "boolean" },
        execution_key: { type: "string" },
        commit: { type: "object" },
        updated_at: { type: ["string", "null"] },
      },
      additionalProperties: true,
    },
  });

  function authorize({ context }) {
    return requireExecutionPermission(context, REQUIRED_PERMISSION);
  }

  async function execute({ context, payload = {} }) {
    const loaded = await loadCodeAICommitExecutionState({
      context,
      executionKey: payload.execution_key,
    });
    if (!loaded.found || !loaded.commit) {
      throw new Error("CODE_AI_COMMIT_STATE_NOT_FOUND");
    }

    return {
      status: "VERIFIED_COMMITTED",
      verified: true,
      execution_key: payload.execution_key,
      commit: loaded.commit,
      updated_at: loaded.updated_at || null,
    };
  }

  return { manifest, authorize, execute };
}

export default createCodeAICommitStatusCapability;
