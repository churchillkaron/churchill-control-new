import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { execute as executeUbteCapability } from "@/lib/ubte/runtime/ExecutionEngine";
import { requireExecutionPermission } from "@/lib/ubte/runtime/security/CapabilityPermissionPolicy";
import {
  decideAvantiqoProductPersistence,
} from "@/lib/intelligence/runtime/AvantiqoProductPersistenceDecisionRuntime";

const REQUIRED_EXECUTE_PERMISSION = "platform.code.ai.execute";
const EXECUTION_KEY_PATTERN = "^[A-Za-z0-9][A-Za-z0-9._:-]{11,159}$";
const DEPLOY_MARKER = "[deploy-production-final]";
const STALE_BASE_REPLAN_REASON = "STALE_BASE_REPLAN_REQUIRED";

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function governedCommitMessage(override, recommended) {
  const requested = text(override, 200)
    .replaceAll(DEPLOY_MARKER, "")
    .replace(/\s+/g, " ")
    .trim();
  if (requested) return requested.slice(0, 200);
  return text(recommended, 200)
    .replaceAll(DEPLOY_MARKER, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

function persistenceMission({ executionKey, commitMessage, focus = null }) {
  return [
    {
      id: "commit_verified_changes",
      label: "Commit the Product-Owner-approved verified Code AI artifact to main after explicit confirmation",
      capability_key: "platform.code_ai_commit.execute",
      payload: {
        execution_key: executionKey,
        commit_message: commitMessage,
      },
      verify_after: {
        capability_key: "platform.code_ai_commit_status.verify",
        description:
          "Independently verify the resulting GitHub main commit before any continuation is allowed, recovering read-only from the retained attested artifact when commit-state bookkeeping was unavailable",
        payload: { execution_key: executionKey },
      },
    },
    {
      id: "reassess_verified_main",
      label: "After verified persistence, select exactly one fresh bounded Avantiqo objective from current main",
      capability_key: "platform.product_autonomy_continuation.assess",
      payload: {
        execution_key: executionKey,
        ...(focus ? { focus } : {}),
      },
      bindings: [
        {
          source_step_id: "commit_verified_changes",
          source: "verification",
          source_path: "commit.commit_sha",
          target_path: "verified_commit_sha",
          required: true,
        },
        {
          source_step_id: "commit_verified_changes",
          source: "verification",
          source_path: "verification_source",
          target_path: "verified_commit_verification_source",
          required: true,
        },
        {
          source_step_id: "commit_verified_changes",
          source: "verification",
          source_path: "server_state_found",
          target_path: "verified_commit_server_state_found",
          required: true,
        },
      ],
    },
  ];
}

function staleBaseReplanMission({ repositoryUrl = null, focus = null }) {
  return [
    {
      id: "reassess_current_main_after_stale_base",
      label:
        "Reject the stale persistence artifact and select exactly one fresh bounded Avantiqo objective from actual current main",
      capability_key: "platform.product_repository_assessment.read",
      payload: {
        ...(repositoryUrl ? { repository_url: repositoryUrl } : {}),
        ...(focus ? { focus } : {}),
      },
    },
  ];
}

function alreadyPersistedContinuationMission({ executionKey, focus = null }) {
  return [
    {
      id: "verify_existing_persistence",
      label: "Independently verify the already-persisted Code AI commit before Product continuation",
      capability_key: "platform.code_ai_commit_status.verify",
      payload: { execution_key: executionKey },
    },
    {
      id: "reassess_verified_main",
      label: "Select exactly one fresh bounded Avantiqo objective from actual current main",
      capability_key: "platform.product_autonomy_continuation.assess",
      payload: {
        execution_key: executionKey,
        ...(focus ? { focus } : {}),
      },
      bindings: [
        {
          source_step_id: "verify_existing_persistence",
          source: "result",
          source_path: "commit.commit_sha",
          target_path: "verified_commit_sha",
          required: true,
        },
        {
          source_step_id: "verify_existing_persistence",
          source: "result",
          source_path: "verification_source",
          target_path: "verified_commit_verification_source",
          required: true,
        },
        {
          source_step_id: "verify_existing_persistence",
          source: "result",
          source_path: "server_state_found",
          target_path: "verified_commit_server_state_found",
          required: true,
        },
      ],
    },
  ];
}

function missionStepCapabilityResult(missionResult, stepId) {
  const step = list(missionResult?.steps).find((entry) => text(entry?.id, 160) === stepId);
  const wrapped = object(step?.result);
  const capabilityResult = object(wrapped.result);
  return Object.keys(capabilityResult).length ? capabilityResult : wrapped;
}

async function executeProductMission({
  context,
  steps,
  source,
  metadata = {},
}) {
  const mission = await executeUbteCapability({
    organizationId: context.organizationId,
    domain: "platform",
    capability: "operator_mission",
    action: "execute",
    payload: { steps },
    actor: context.actor,
    runtime: {
      entityId: context.entityId,
      periodId: context.periodId,
      permissions: context.permissions,
      callerRequest: context.callerRequest,
      metadata: {
        ...object(context.metadata),
        ...object(metadata),
        source,
        productPersistenceHandoff: true,
        productionDeploymentAllowed: false,
        databaseMigrationExecutionAllowed: false,
        automaticRecursionAllowed: false,
      },
    },
  });
  return mission?.result ?? mission;
}

export function createProductPersistenceHandoffCapability() {
  const manifest = defineCapability({
    domain: "platform",
    capability: "product_persistence_handoff",
    action: "execute",
    name: "Prepare Governed Product Persistence Handoff",
    document: "product_persistence_handoff",
    description:
      "Convert Avantiqo Product Intelligence's read-only persistence decision into a durable governed handoff. The capability itself requires only Code AI execute authority because ordinary STAY_LOCAL is a true stop while ALREADY_PERSISTED and STALE_BASE_REPLAN_REQUIRED can use bounded read-only recovery. An optional caller commit_message is not authority and is ignored unless Product Intelligence independently returns REQUEST_COMMIT_CONFIRMATION; even then the privileged production marker is stripped and the message only labels the separately permissioned commit step. If persistence is already verified, a bounded two-read durable mission independently verifies that persisted commit again and binds only registered verifier scalars into one repository-grounded Product Intelligence reassessment. If a prior persistence attempt is stale because main moved, the stale artifact is rejected as authority and exactly one registered platform.product_repository_assessment.read mission reassesses actual current main, surfaces one fresh next_engineering_handoff with automatic_execution_started=false, and stops. Only REQUEST_COMMIT_CONFIRMATION constructs platform.code_ai_commit.execute. No stale patch replay, automatic engineering execution, production deployment, migration, publication, force push, hidden approval, or unbounded recursion is allowed.",
    permissions: [REQUIRED_EXECUTE_PERMISSION],
    events: [],
    tags: [
      "platform",
      "intelligence",
      "product-owner",
      "persistence",
      "durable-mission",
      "confirmation",
      "verification",
      "conditional-write-authority",
      "caller-commit-request-not-authority",
      "verified-scalar-binding",
      "already-persisted-continuation",
      "stale-base-replan",
      "current-main-reassessment",
      "bounded-continuation",
      "no-write-replay",
      "no-deploy",
    ],
    operatorAliases: [
      "prepare the verified avantiqo changes for commit",
      "ask me before committing the verified code ai result",
      "persist the verified product change if product intelligence recommends it",
      "continue after I confirm the code ai commit",
      "continue from the already persisted avantiqo result",
      "reassess current main after a stale persistence attempt",
    ],
    transactional: false,
    aiEnabled: true,
    operatorEnabled: true,
    operatorMode: "write",
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
        },
        focus: {
          type: "string",
          maxLength: 2000,
          description:
            "Optional explicit broader-area context supplied only to the single fresh repository reassessment after verified persistence or stale-base rejection. It never makes the prior engineering patch authoritative.",
        },
        commit_message: {
          type: "string",
          minLength: 1,
          maxLength: 200,
          description:
            "Optional caller-requested commit label. It is ignored unless Product Intelligence independently returns REQUEST_COMMIT_CONFIRMATION, never authorizes persistence, and cannot carry the privileged production deployment marker.",
        },
      },
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: {
        status: { type: "string" },
        execution_key: { type: "string" },
        persistence_decision: { type: "object" },
        mission: { type: ["object", "null"] },
        continuation: { type: ["object", "null"] },
        next_engineering_handoff: { type: ["object", "null"] },
        bounded_next_cycle_count: { type: "integer" },
        confirmation_required: { type: "boolean" },
        commit_executed: { type: "boolean" },
        stale_base_replan_required: { type: "boolean" },
        stale_persistence_rejected: { type: "boolean" },
        stale_patch_reused: { type: "boolean" },
        production_deployed: { type: "boolean" },
      },
      additionalProperties: true,
    },
  });

  function authorize({ context }) {
    return requireExecutionPermission(context, REQUIRED_EXECUTE_PERMISSION);
  }

  async function execute({ context, payload = {} }) {
    const executionKey = text(payload.execution_key, 160);
    const focus = text(payload.focus, 2000) || null;
    const requestedCommitMessage = text(payload.commit_message, 200) || null;
    const decision = await decideAvantiqoProductPersistence({
      context,
      executionKey,
    });
    const staleBaseReplanRequired =
      decision?.decision === "STAY_LOCAL" &&
      decision?.reason_code === STALE_BASE_REPLAN_REASON &&
      decision?.persistence?.stale_base_replan_required === true;

    if (staleBaseReplanRequired) {
      const staleRepositoryUrl =
        text(decision?.engineering_evidence?.repository_url, 500) || null;
      const missionResult = await executeProductMission({
        context,
        steps: staleBaseReplanMission({
          repositoryUrl: staleRepositoryUrl,
          focus,
        }),
        source: "AVANTIQO_PRODUCT_PERSISTENCE_STALE_BASE_REPLAN",
        metadata: {
          productPersistenceStaleBaseReplan: true,
          stalePersistenceRejected: true,
          stalePatchAuthoritative: false,
          stalePatchReuseAllowed: false,
          staleBaseExpectedCommit:
            text(decision?.persistence?.expected_base_commit, 160) || null,
          staleBaseCurrentMainHead:
            text(decision?.persistence?.current_main_head, 160) || null,
        },
      });

      if (missionResult?.status !== "completed") {
        return {
          status: "STALE_BASE_REASSESSMENT_BLOCKED",
          execution_key: executionKey,
          persistence_decision: decision,
          mission: missionResult,
          continuation: null,
          next_engineering_handoff: null,
          bounded_next_cycle_count: 0,
          confirmation_required: false,
          commit_executed: false,
          stale_base_replan_required: true,
          stale_persistence_rejected: true,
          stale_patch_reused: false,
          caller_commit_message_ignored: Boolean(requestedCommitMessage),
          production_deployed: false,
          database_migrations_applied: false,
          governance: {
            stale_engineering_state_became_non_authoritative: true,
            stale_persistence_attempt_rejected: true,
            stale_patch_authoritative: false,
            stale_patch_reuse_allowed: false,
            current_main_reassessment_count: 1,
            current_main_reassessment_read_only: true,
            fresh_next_engineering_handoff_count: 0,
            next_engineering_cycle_started: false,
            automatic_execution_started: false,
            automatic_recursion_allowed: false,
          },
        };
      }

      const continuation = missionStepCapabilityResult(
        missionResult,
        "reassess_current_main_after_stale_base",
      );
      const nextEngineeringHandoff = object(continuation.next_engineering_handoff);
      const nextFocus = text(nextEngineeringHandoff.focus, 4000);
      if (!nextFocus) {
        throw new Error(
          "PRODUCT_PERSISTENCE_HANDOFF_STALE_BASE_NEXT_OBJECTIVE_REQUIRED",
        );
      }

      return {
        status: "STALE_BASE_REPLAN_READY",
        execution_key: executionKey,
        persistence_decision: decision,
        mission: missionResult,
        continuation,
        next_engineering_handoff: {
          ...nextEngineeringHandoff,
          focus: nextFocus,
          automatic_execution_started: false,
          authorization_effect: "NONE",
        },
        bounded_next_cycle_count: 1,
        confirmation_required: false,
        commit_executed: false,
        stale_base_replan_required: true,
        stale_persistence_rejected: true,
        stale_patch_reused: false,
        caller_commit_message_ignored: Boolean(requestedCommitMessage),
        production_deployed: false,
        database_migrations_applied: false,
        governance: {
          decision_rechecked_from_server_owned_evidence: true,
          stale_engineering_state_became_non_authoritative: true,
          stale_persistence_attempt_rejected: true,
          stale_patch_authoritative: false,
          stale_patch_reuse_allowed: false,
          current_main_reassessment_count: 1,
          current_main_reassessment_read_only: true,
          fresh_repository_assessment_completed: true,
          fresh_next_engineering_handoff_count: 1,
          next_engineering_cycle_started: false,
          automatic_execution_started: false,
          commit_allowed: false,
          second_commit_allowed: false,
          production_deployment_allowed: false,
          database_migration_execution_allowed: false,
          automatic_recursion_allowed: false,
        },
      };
    }

    if (decision.decision === "STAY_LOCAL") {
      return {
        status: "STAY_LOCAL",
        execution_key: executionKey,
        persistence_decision: decision,
        mission: null,
        continuation: null,
        next_engineering_handoff: null,
        bounded_next_cycle_count: 0,
        confirmation_required: false,
        commit_executed: false,
        stale_base_replan_required: false,
        stale_persistence_rejected: false,
        stale_patch_reused: false,
        caller_commit_message_ignored: Boolean(requestedCommitMessage),
        production_deployed: false,
        database_migrations_applied: false,
      };
    }

    if (decision.decision === "ALREADY_PERSISTED") {
      const missionResult = await executeProductMission({
        context,
        steps: alreadyPersistedContinuationMission({ executionKey, focus }),
        source: "AVANTIQO_PRODUCT_PERSISTENCE_ALREADY_PERSISTED_CONTINUATION",
        metadata: {
          productPersistenceAlreadyPersistedContinuation: true,
        },
      });

      if (missionResult?.status !== "completed") {
        return {
          status: "ALREADY_PERSISTED_CONTINUATION_BLOCKED",
          execution_key: executionKey,
          persistence_decision: decision,
          mission: missionResult,
          continuation: null,
          next_engineering_handoff: null,
          bounded_next_cycle_count: 0,
          confirmation_required: false,
          commit_executed: false,
          stale_base_replan_required: false,
          stale_persistence_rejected: false,
          stale_patch_reused: false,
          caller_commit_message_ignored: Boolean(requestedCommitMessage),
          production_deployed: false,
          database_migrations_applied: false,
          governance: {
            already_persisted_commit_reverification_required: true,
            verified_commit_evidence_bound_to_continuation: true,
            second_commit_allowed: false,
            next_engineering_cycle_started: false,
            automatic_recursion_allowed: false,
          },
        };
      }

      const continuation = missionStepCapabilityResult(
        missionResult,
        "reassess_verified_main",
      );
      const nextEngineeringHandoff = object(continuation.next_engineering_handoff);
      const nextFocus = text(nextEngineeringHandoff.focus, 300);
      if (!nextFocus) {
        throw new Error(
          "PRODUCT_PERSISTENCE_HANDOFF_ALREADY_PERSISTED_NEXT_OBJECTIVE_REQUIRED",
        );
      }

      return {
        status: "READY_FOR_ONE_NEXT_BOUNDED_CYCLE",
        execution_key: executionKey,
        persistence_decision: decision,
        mission: missionResult,
        continuation,
        next_engineering_handoff: {
          ...nextEngineeringHandoff,
          focus: nextFocus,
          automatic_execution_started: false,
          authorization_effect: "NONE",
        },
        bounded_next_cycle_count: 1,
        confirmation_required: false,
        commit_executed: false,
        stale_base_replan_required: false,
        stale_persistence_rejected: false,
        stale_patch_reused: false,
        caller_commit_message_ignored: Boolean(requestedCommitMessage),
        production_deployed: false,
        database_migrations_applied: false,
        governance: {
          decision_rechecked_from_server_owned_evidence: true,
          already_persisted_commit_reverification_required: true,
          registered_commit_verification_required: true,
          verified_commit_evidence_bound_to_continuation: true,
          fresh_repository_assessment_completed: true,
          second_commit_allowed: false,
          next_engineering_cycle_started: false,
          post_commit_continuation_count: 1,
          automatic_recursion_allowed: false,
        },
      };
    }

    if (decision.decision !== "REQUEST_COMMIT_CONFIRMATION") {
      throw new Error("PRODUCT_PERSISTENCE_HANDOFF_DECISION_INVALID");
    }
    const commitMessage = governedCommitMessage(
      requestedCommitMessage,
      decision?.persistence?.commit_message,
    );
    if (!commitMessage) {
      throw new Error("PRODUCT_PERSISTENCE_HANDOFF_COMMIT_MESSAGE_REQUIRED");
    }

    const missionResult = await executeProductMission({
      context,
      steps: persistenceMission({
        executionKey,
        commitMessage,
        focus,
      }),
      source: "AVANTIQO_PRODUCT_PERSISTENCE_HANDOFF",
      metadata: {
        callerCommitMessageRequested: Boolean(requestedCommitMessage),
        callerCommitMessageAuthorizationEffect: "NONE",
      },
    });

    return {
      status: text(missionResult?.status, 100) || "unknown",
      execution_key: executionKey,
      persistence_decision: decision,
      mission: missionResult,
      continuation: null,
      next_engineering_handoff: null,
      bounded_next_cycle_count: 0,
      confirmation_required:
        missionResult?.status === "paused" && missionResult?.pause_reason === "confirmation",
      commit_executed: false,
      stale_base_replan_required: false,
      stale_persistence_rejected: false,
      stale_patch_reused: false,
      caller_commit_message_used: Boolean(requestedCommitMessage),
      production_deployed: false,
      database_migrations_applied: false,
      governance: {
        decision_rechecked_from_server_owned_evidence: true,
        caller_commit_request_authorization_effect: "NONE",
        product_intelligence_request_commit_confirmation_required: true,
        privileged_production_marker_removed_from_commit_message: true,
        explicit_commit_confirmation_preserved: true,
        commit_permission_enforced_by_registered_commit_step_preflight: true,
        registered_commit_verification_required: true,
        verified_commit_evidence_bound_to_continuation: true,
        write_replay_for_verification_recovery_allowed: false,
        post_commit_continuation_count: 1,
        automatic_recursion_allowed: false,
      },
    };
  }

  return { manifest, authorize, execute };
}

export default createProductPersistenceHandoffCapability;
