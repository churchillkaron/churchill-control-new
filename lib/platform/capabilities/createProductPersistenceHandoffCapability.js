import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { execute as executeUbteCapability } from "@/lib/ubte/runtime/ExecutionEngine";
import { requireExecutionPermission } from "@/lib/ubte/runtime/security/CapabilityPermissionPolicy";
import {
  decideAvantiqoProductPersistence,
} from "@/lib/intelligence/runtime/AvantiqoProductPersistenceDecisionRuntime";

const REQUIRED_EXECUTE_PERMISSION = "platform.code.ai.execute";
const REQUIRED_COMMIT_PERMISSION = "platform.code.ai.commit";
const EXECUTION_KEY_PATTERN = "^[A-Za-z0-9][A-Za-z0-9._:-]{11,159}$";

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
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

export function createProductPersistenceHandoffCapability() {
  const manifest = defineCapability({
    domain: "platform",
    capability: "product_persistence_handoff",
    action: "execute",
    name: "Prepare Governed Product Persistence Handoff",
    document: "product_persistence_handoff",
    description:
      "Convert Avantiqo Product Intelligence's read-only persistence decision into a durable governed handoff. The capability first re-evaluates the server-owned verified engineering evidence. If Product Intelligence says STAY_LOCAL, it returns without creating a write mission. If the result is already verified as persisted, it returns the verified state. Only when Product Intelligence returns REQUEST_COMMIT_CONFIRMATION does it create a bounded Operator mission whose first step is the existing separately permissioned Code AI commit action. That mission pauses before the commit because the commit capability requires explicit confirmation; after confirmation it independently verifies the main commit. Only scalar evidence from that registered verifier is bound into the continuation step, allowing read-only recovery when server commit-state bookkeeping failed without ever replaying the write. The mission then performs exactly one repository-grounded Product Intelligence reassessment. No production deployment, migration, publication, force push, hidden approval, or unbounded recursion is allowed.",
    permissions: [REQUIRED_EXECUTE_PERMISSION, REQUIRED_COMMIT_PERMISSION],
    events: [],
    tags: [
      "platform",
      "intelligence",
      "product-owner",
      "persistence",
      "durable-mission",
      "confirmation",
      "verification",
      "verified-scalar-binding",
      "bounded-continuation",
      "no-write-replay",
      "no-deploy",
    ],
    operatorAliases: [
      "prepare the verified avantiqo changes for commit",
      "ask me before committing the verified code ai result",
      "persist the verified product change if product intelligence recommends it",
      "continue after I confirm the code ai commit",
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
        confirmation_required: { type: "boolean" },
        commit_executed: { type: "boolean" },
        production_deployed: { type: "boolean" },
      },
      additionalProperties: true,
    },
  });

  function authorize({ context }) {
    requireExecutionPermission(context, REQUIRED_EXECUTE_PERMISSION);
    return requireExecutionPermission(context, REQUIRED_COMMIT_PERMISSION);
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
        confirmation_required: false,
        commit_executed: false,
        production_deployed: false,
        database_migrations_applied: false,
      };
    }

    if (decision.decision === "ALREADY_PERSISTED") {
      return {
        status: "ALREADY_PERSISTED",
        execution_key: executionKey,
        persistence_decision: decision,
        mission: null,
        confirmation_required: false,
        commit_executed: false,
        production_deployed: false,
        database_migrations_applied: false,
        continuation_capability_key: "platform.product_autonomy_continuation.assess",
      };
    }

    if (decision.decision !== "REQUEST_COMMIT_CONFIRMATION") {
      throw new Error("PRODUCT_PERSISTENCE_HANDOFF_DECISION_INVALID");
    }
    const commitMessage = text(decision?.persistence?.commit_message, 200);
    if (!commitMessage) {
      throw new Error("PRODUCT_PERSISTENCE_HANDOFF_COMMIT_MESSAGE_REQUIRED");
    }

    const mission = await executeUbteCapability({
      organizationId: context.organizationId,
      domain: "platform",
      capability: "operator_mission",
      action: "execute",
      payload: {
        steps: persistenceMission({
          executionKey,
          commitMessage,
          focus,
        }),
      },
      actor: context.actor,
      runtime: {
        entityId: context.entityId,
        periodId: context.periodId,
        permissions: context.permissions,
        callerRequest: context.callerRequest,
        metadata: {
          ...object(context.metadata),
          source: "AVANTIQO_PRODUCT_PERSISTENCE_HANDOFF",
          productPersistenceHandoff: true,
          productionDeploymentAllowed: false,
          databaseMigrationExecutionAllowed: false,
          automaticRecursionAllowed: false,
        },
      },
    });
    const missionResult = mission?.result ?? mission;

    return {
      status: text(missionResult?.status, 100) || "unknown",
      execution_key: executionKey,
      persistence_decision: decision,
      mission: missionResult,
      confirmation_required:
        missionResult?.status === "paused" && missionResult?.pause_reason === "confirmation",
      commit_executed: false,
      production_deployed: false,
      database_migrations_applied: false,
      governance: {
        decision_rechecked_from_server_owned_evidence: true,
        explicit_commit_confirmation_preserved: true,
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
