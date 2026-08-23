import { commitVerifiedCodeMission } from "@/lib/code/runtime/CodeGitHubCommitRuntime";
import {
  loadCodeAICommitArtifact,
  retireCodeAICommitArtifact,
} from "@/lib/code/runtime/CodeAICommitArtifactRuntime";
import {
  persistCodeAICommitExecutionState,
} from "@/lib/code/runtime/CodeAICommitExecutionStateRuntime";
import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { requireExecutionPermission } from "@/lib/ubte/runtime/security/CapabilityPermissionPolicy";

const REQUIRED_PERMISSION = "platform.code.ai.commit";
const EXECUTION_KEY_PATTERN = "^[A-Za-z0-9][A-Za-z0-9._:-]{11,159}$";

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function actorId(context = {}) {
  return text(context?.actor?.id || context?.actor?.user_id) || null;
}

function assertMissionScope(state, context) {
  const missionState = object(state);
  const organizationId = text(context?.organizationId);
  const currentActorId = actorId(context);
  if (!organizationId) throw new Error("CODE_AI_COMMIT_ORGANIZATION_REQUIRED");
  if (text(missionState.organization_id) !== organizationId) {
    throw new Error("CODE_AI_COMMIT_ORGANIZATION_MISMATCH");
  }
  if (text(missionState.actor_id) && text(missionState.actor_id) !== currentActorId) {
    throw new Error("CODE_AI_COMMIT_ACTOR_MISMATCH");
  }
}

async function resolveMissionState(payload, context) {
  if (payload.execution_key) {
    const artifact = await loadCodeAICommitArtifact({
      context,
      executionKey: payload.execution_key,
    });
    if (!artifact.found || !artifact.mission_state) {
      throw new Error("CODE_AI_COMMIT_ARTIFACT_NOT_FOUND");
    }
    return artifact.mission_state;
  }

  const legacyState = object(payload.mission_state);
  if (Object.keys(legacyState).length) return legacyState;
  throw new Error("CODE_AI_COMMIT_EXECUTION_KEY_OR_MISSION_STATE_REQUIRED");
}

export function createCodeAICommitCapability() {
  const manifest = defineCapability({
    domain: "platform",
    capability: "code_ai_commit",
    action: "execute",
    description:
      "Atomically commit a completed and verified Avantiqo Code AI mission to the allowed GitHub repository main branch. Preferred execution uses the opaque Code AI execution_key to load the full attested source artifact server-side, so patches never need to travel through Intelligence or mission bindings. The action still requires the dedicated commit permission plus explicit confirmation, exact base commit, scoped Vercel Connect GitHub credentials, no force-push, and post-commit branch/parent/tree verification.",
    permissions: [REQUIRED_PERMISSION],
    events: [],
    tags: [
      "platform",
      "code-ai",
      "github",
      "commit",
      "verified",
      "source-control",
      "server-owned-artifact",
      "opaque-execution-key",
    ],
    transactional: true,
    aiEnabled: true,
    operatorEnabled: true,
    operatorMode: "write",
    operatorAutoExecute: false,
    operatorRequiresConfirmation: true,
    contextScope: "organization",
    risk: "medium",
    reversible: true,
    inputSchema: {
      type: "object",
      required: ["commit_message"],
      properties: {
        execution_key: {
          type: "string",
          minLength: 12,
          maxLength: 160,
          pattern: EXECUTION_KEY_PATTERN,
          description:
            "Preferred opaque execution key from platform.code_ai_autonomous.execute. The full attested patch is loaded server-side after governance succeeds.",
        },
        mission_state: {
          type: "object",
          description:
            "Legacy direct handoff retained for compatibility. New autonomous flows should use execution_key instead.",
        },
        commit_message: { type: "string", minLength: 1, maxLength: 200 },
      },
      additionalProperties: false,
    },
  });

  function authorize({ context }) {
    return requireExecutionPermission(context, REQUIRED_PERMISSION);
  }

  async function execute({ context, payload = {} }) {
    const missionState = await resolveMissionState(payload, context);
    assertMissionScope(missionState, context);
    const result = await commitVerifiedCodeMission({
      mission_state: missionState,
      commit_message: payload.commit_message,
    });

    if (payload.execution_key) {
      await persistCodeAICommitExecutionState({
        context,
        executionKey: payload.execution_key,
        result,
      });
      await retireCodeAICommitArtifact({
        context,
        executionKey: payload.execution_key,
      });
    }

    return {
      ...result,
      ...(payload.execution_key
        ? {
            execution_key: payload.execution_key,
            commit_verification_state_persisted: true,
            source_artifact_retired: true,
          }
        : {}),
    };
  }

  return { manifest, authorize, execute };
}

export default createCodeAICommitCapability;
