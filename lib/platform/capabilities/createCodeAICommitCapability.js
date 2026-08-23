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

async function persistVerifiedCommitState({ context, executionKey, result }) {
  try {
    await persistCodeAICommitExecutionState({
      context,
      executionKey,
      result,
    });
    return { persisted: true, status: "VERIFIED_COMMIT_STATE_PERSISTED" };
  } catch (error) {
    console.error("CODE_AI_COMMIT_POST_WRITE_STATE_PERSIST_FAILED", {
      execution_key: executionKey,
      commit_sha: result?.commit_sha || null,
      error_name: error?.name || "Error",
    });
    return {
      persisted: false,
      status: "VERIFIED_COMMIT_STATE_PERSIST_FAILED",
    };
  }
}

async function retireVerifiedCommitArtifact({ context, executionKey }) {
  try {
    await retireCodeAICommitArtifact({
      context,
      executionKey,
    });
    return { retired: true, status: "VERIFIED_COMMIT_ARTIFACT_RETIRED" };
  } catch (error) {
    console.error("CODE_AI_COMMIT_POST_WRITE_ARTIFACT_RETIRE_FAILED", {
      execution_key: executionKey,
      error_name: error?.name || "Error",
    });
    return {
      retired: false,
      status: "VERIFIED_COMMIT_ARTIFACT_RETIRE_FAILED",
    };
  }
}

export function createCodeAICommitCapability() {
  const manifest = defineCapability({
    domain: "platform",
    capability: "code_ai_commit",
    action: "execute",
    description:
      "Atomically commit a completed and verified Avantiqo Code AI mission to the allowed GitHub repository main branch. Preferred execution uses the opaque Code AI execution_key to load the full attested source artifact server-side, so patches never need to travel through Intelligence or mission bindings. The action still requires the dedicated commit permission plus explicit confirmation, exact base commit, scoped Vercel Connect GitHub credentials, no force-push, and post-commit branch/parent/tree verification. Once GitHub persistence is independently verified, later server-state housekeeping cannot turn that external write into a generic retryable failure; any state-recording problem is returned explicitly and the write is never replayed by the durable mission verifier.",
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
      "post-write-non-ambiguous",
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

    if (!payload.execution_key) return result;

    // From this point forward GitHub main has already been independently
    // verified by CodeGitHubCommitRuntime. Never throw a generic error from
    // bookkeeping that could make the caller believe the write did not occur.
    const commitState = await persistVerifiedCommitState({
      context,
      executionKey: payload.execution_key,
      result,
    });
    const artifact = commitState.persisted
      ? await retireVerifiedCommitArtifact({
          context,
          executionKey: payload.execution_key,
        })
      : {
          retired: false,
          status: "VERIFIED_COMMIT_ARTIFACT_RETAINED_FOR_RECOVERY",
        };

    return {
      ...result,
      execution_key: payload.execution_key,
      commit_verification_state_persisted: commitState.persisted,
      source_artifact_retired: artifact.retired,
      post_commit_housekeeping_status:
        commitState.persisted && artifact.retired
          ? "VERIFIED_COMMIT_HOUSEKEEPING_COMPLETE"
          : commitState.persisted
            ? "VERIFIED_COMMIT_ARTIFACT_RETIRE_INCOMPLETE"
            : "VERIFIED_COMMIT_STATE_PERSIST_INCOMPLETE",
      post_commit_state_status: commitState.status,
      post_commit_artifact_status: artifact.status,
      github_write_verified: result?.verified === true,
      safe_to_retry_commit: false,
      verification_read_required: true,
    };
  }

  return { manifest, authorize, execute };
}

export default createCodeAICommitCapability;
