import {
  commitVerifiedCodeMission,
  recoverVerifiedCodeMissionCommit,
} from "@/lib/code/runtime/CodeGitHubCommitRuntime";
import {
  loadCodeAICommitArtifact,
  markCodeAICommitArtifactAttempt,
  retireCodeAICommitArtifact,
} from "@/lib/code/runtime/CodeAICommitArtifactRuntime";
import {
  persistCodeAICommitExecutionState,
} from "@/lib/code/runtime/CodeAICommitExecutionStateRuntime";
import {
  assertCodeAIWorldClassCommitReady,
} from "@/lib/code/runtime/CodeAIWorldClassCommitGuard";
import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { requireExecutionPermission } from "@/lib/ubte/runtime/security/CapabilityPermissionPolicy";

const REQUIRED_PERMISSION = "platform.code.ai.commit";
const EXECUTION_KEY_PATTERN = "^[A-Za-z0-9][A-Za-z0-9._:-]{11,159}$";
const RECOVERY_NOT_FOUND = "CODE_AI_GITHUB_RECOVERY_VERIFIED_COMMIT_NOT_FOUND";
const STALE_ATTEMPT_REPLAN_REQUIRED =
  "CODE_AI_COMMIT_PRIOR_ATTEMPT_STALE_BASE_REPLAN_REQUIRED";

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
    return { missionState: artifact.mission_state, artifact };
  }

  const legacyState = object(payload.mission_state);
  if (Object.keys(legacyState).length) {
    return { missionState: legacyState, artifact: null };
  }
  throw new Error("CODE_AI_COMMIT_EXECUTION_KEY_OR_MISSION_STATE_REQUIRED");
}

async function recoverPriorAttempt(artifact) {
  if (artifact?.commit_attempted !== true) return null;
  try {
    const recovered = await recoverVerifiedCodeMissionCommit({
      mission_state: artifact.mission_state,
    });
    return recovered?.verified === true ? recovered : null;
  } catch (error) {
    if (text(error?.message) !== RECOVERY_NOT_FOUND) throw error;
    if (error?.main_advanced_from_expected_base === true) {
      const stale = new Error(STALE_ATTEMPT_REPLAN_REQUIRED);
      stale.expected_base_commit =
        text(error?.expected_base_commit) ||
        text(artifact?.mission_state?.base_commit) ||
        null;
      stale.current_main_head = text(error?.current_main_head) || null;
      stale.commit_attempted = true;
      stale.safe_to_retry_commit = false;
      stale.replan_required = true;
      stale.write_replayed = false;
      throw stale;
    }
    return null;
  }
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
      "Atomically commit a completed, attested and world-class-quality-verified Avantiqo Code AI mission to the allowed GitHub repository main branch. The mission must carry a verified world-class quality proof showing current-source verification, final diff review, source-manifest convergence and the required risk-sensitive verification gates. Preferred execution uses the opaque Code AI execution_key to load the full attested source artifact server-side, so patches never need to travel through Intelligence or mission bindings. Before the first GitHub side effect, the artifact records a server-owned commit-attempt marker. If a later invocation sees a prior attempt, it performs bounded read-only recovery first and heals server verification state when the exact commit already exists instead of replaying the write. If exact recovery finds no verified commit and current main has advanced beyond the attested base, the capability fails closed with a stale-base replan error before another attempt marker or GitHub write; the old artifact must be replanned from current main rather than retried or rebased automatically. Only a genuinely absent prior commit on the unchanged attested base may proceed after recovery. Exact-base/no-force protection still applies. The action requires the dedicated commit permission plus explicit confirmation and post-commit branch/parent/tree verification. Once GitHub persistence is independently verified, later server-state housekeeping cannot turn that external write into a generic retryable failure.",
    permissions: [REQUIRED_PERMISSION],
    events: [],
    tags: [
      "platform",
      "code-ai",
      "github",
      "commit",
      "verified",
      "world-class-quality-required",
      "fresh-verification-required",
      "final-diff-review-required",
      "source-control",
      "server-owned-artifact",
      "opaque-execution-key",
      "pre-write-attempt-marker",
      "recovery-before-retry",
      "stale-base-replan-before-write",
      "post-write-non-ambiguous",
      "governed-outcome-learning",
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
    operatorOutcomeLearning: {
      verification_capability_key: "platform.code_ai_commit_status.verify",
      pattern: {
        mission_family: "engineering.code-commit",
        intervention_code: "verified-main-commit",
        intervention_class: "verified-source-control",
        knowledge_domain: "engineering",
        condition_codes: ["main-branch", "server-owned-evidence"],
        boundary_condition_codes: [
          "exact-parent-tree-verification",
          "no-write-replay",
        ],
        failure_mode_codes: ["commit-unverified"],
        stability: "mutable",
      },
      criteria: [
        {
          id: "commit-verified",
          kind: "success",
          comparator: "eq",
          expected_value: true,
          source_path: "verified",
        },
        {
          id: "commit-unverified",
          kind: "failure",
          comparator: "eq",
          expected_value: false,
          source_path: "verified",
        },
      ],
    },
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
            "Legacy direct handoff retained for compatibility, but it is still required to carry a verified world-class quality proof. New autonomous flows should use execution_key instead.",
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
    const resolved = await resolveMissionState(payload, context);
    const missionState = resolved.missionState;
    assertMissionScope(missionState, context);
    assertCodeAIWorldClassCommitReady(missionState);

    let recoveredExistingCommit = false;
    let commitExecutedThisInvocation = false;
    let result = payload.execution_key
      ? await recoverPriorAttempt(resolved.artifact)
      : null;

    if (result?.verified === true) {
      recoveredExistingCommit = true;
    } else {
      if (payload.execution_key) {
        await markCodeAICommitArtifactAttempt({
          context,
          executionKey: payload.execution_key,
        });
      }
      result = await commitVerifiedCodeMission({
        mission_state: missionState,
        commit_message: payload.commit_message,
      });
      commitExecutedThisInvocation = true;
    }

    if (!payload.execution_key) return result;

    // From this point forward GitHub persistence has already been independently
    // verified, either by the write runtime or by bounded read-only recovery.
    // Never throw a generic bookkeeping error that could make the caller replay
    // a verified external write.
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
      recovered_existing_verified_commit: recoveredExistingCommit,
      commit_executed_this_invocation: commitExecutedThisInvocation,
      safe_to_retry_commit: false,
      verification_read_required: true,
      worldclass_quality_verified: true,
    };
  }

  return { manifest, authorize, execute };
}

export default createCodeAICommitCapability;