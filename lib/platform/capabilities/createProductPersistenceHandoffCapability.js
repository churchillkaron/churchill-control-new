import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { execute as executeUbteCapability } from "@/lib/ubte/runtime/ExecutionEngine";
import { requireExecutionPermission } from "@/lib/ubte/runtime/security/CapabilityPermissionPolicy";
import {
  decideAvantiqoProductPersistence,
} from "@/lib/intelligence/runtime/AvantiqoProductPersistenceDecisionRuntime";

const REQUIRED_EXECUTE_PERMISSION = "platform.code.ai.execute";
const EXECUTION_KEY_PATTERN = "^[A-Za-z0-9][A-Za-z0-9._:-]{11,159}$";

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
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
      "Convert Avantiqo Product Intelligence's read-only persistence decision into a durable governed handoff. The capability itself requires only Code AI execute authority because STAY_LOCAL and ALREADY_PERSISTED are read-only outcomes. If persistence is already verified, a bounded two-read durable mission independently verifies that persisted commit again and binds only registered verifier scalars into one repository-grounded Product Intelligence reassessment, surfacing exactly one next bounded engineering objective without another commit or automatic engineering execution. Only REQUEST_COMMIT_CONFIRMATION constructs the separately permissioned platform.code_ai_commit.execute step; Operator mission preflight independently requires platform.code.ai.commit before any side effect and the commit step still requires explicit confirmation. After a verified commit, only scalar verifier evidence may feed the same one-shot continuation. Read-only recovery is allowed only through the existing commit-attempt evidence boundary and never replays the write. No production deployment, migration, publication, force push, hidden approval, or unbounded recursion is allowed.",
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
      "verified-scalar-binding",
      "already-persisted-continuation",
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
            "Optional focus supplied only to the one fresh post-commit Product Intelligence reassessment.",
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
    const decision = await decideAvantiqoProductPersistence({
      context,
      executionKey,
    });

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
    const commitMessage = text(decision?.persistence?.commit_message, 200);
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
      production_deployed: false,
      database_migrations_applied: false,
      governance: {
        decision_rechecked_from_server_owned_evidence: true,
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
