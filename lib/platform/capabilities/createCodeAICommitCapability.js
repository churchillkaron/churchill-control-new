import { commitVerifiedCodeMission } from "@/lib/code/runtime/CodeGitHubCommitRuntime";
import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { requireExecutionPermission } from "@/lib/ubte/runtime/security/CapabilityPermissionPolicy";

const REQUIRED_PERMISSION = "platform.code.ai.commit";

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

export function createCodeAICommitCapability() {
  const manifest = defineCapability({
    domain: "platform",
    capability: "code_ai_commit",
    action: "execute",
    description:
      "Atomically commit a completed and verified Avantiqo Code AI mission to the allowed GitHub repository main branch. The action requires an exact base commit, uses scoped Vercel Connect GitHub credentials, never force-pushes, and verifies the resulting branch head and commit parent/tree before success.",
    permissions: [REQUIRED_PERMISSION],
    events: [],
    tags: ["platform", "code-ai", "github", "commit", "verified", "source-control"],
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
      required: ["mission_state", "commit_message"],
      properties: {
        mission_state: { type: "object" },
        commit_message: { type: "string", minLength: 1, maxLength: 200 },
      },
      additionalProperties: false,
    },
  });

  function authorize({ context }) {
    return requireExecutionPermission(context, REQUIRED_PERMISSION);
  }

  async function execute({ context, payload = {} }) {
    assertMissionScope(payload.mission_state, context);
    return commitVerifiedCodeMission({
      mission_state: payload.mission_state,
      commit_message: payload.commit_message,
    });
  }

  return { manifest, authorize, execute };
}

export default createCodeAICommitCapability;
