import crypto from "node:crypto";

import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { execute as executeUbteCapability } from "@/lib/ubte/runtime/ExecutionEngine";
import { requireExecutionPermission } from "@/lib/ubte/runtime/security/CapabilityPermissionPolicy";

const REQUIRED_PERMISSION = "platform.code.ai.execute";
const DEFAULT_REPOSITORY =
  "https://github.com/churchillkaron/churchill-control-new.git";
const DEFAULT_REF = "main";

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function executionKey() {
  return `product-cycle:${crypto.randomUUID()}`;
}

function missionSteps({
  focus,
  repositoryUrl,
  ref,
  key,
  maxIterations,
  timeoutMs,
  commitMessage,
}) {
  const steps = [
    {
      id: "assess_product",
      label: "Assess the next Avantiqo autonomy gap",
      capability_key: "platform.product_autonomy.assess",
      payload: {
        ...(focus ? { focus } : {}),
      },
    },
    {
      id: "engineer_next_gap",
      label: "Let Code AI implement and verify the next bounded product objective locally",
      capability_key: "platform.code_ai_autonomous.execute",
      payload: {
        repository_url: repositoryUrl,
        ref,
        execution_key: key,
        ...(maxIterations ? { max_iterations: maxIterations } : {}),
        ...(timeoutMs ? { timeout_ms: timeoutMs } : {}),
      },
      bindings: [
        {
          source_step_id: "assess_product",
          source: "result",
          source_path: "recommended_code_ai_handoff.objective",
          target_path: "objective",
          required: true,
        },
      ],
      verify_after: {
        capability_key: "platform.code_ai_autonomous_status.verify",
        description:
          "Verify the server-owned attested Code AI engineering outcome before any persistence decision",
        payload: {
          execution_key: key,
        },
      },
    },
    {
      id: "decide_persistence",
      label: "Let Product Intelligence decide whether the verified result stays local or should request governed commit confirmation",
      capability_key: "platform.product_persistence_decision.assess",
      payload: {
        execution_key: key,
      },
    },
  ];

  if (commitMessage) {
    steps.push({
      id: "commit_verified_changes",
      label: "Commit the verified Code AI artifact to main after explicit governance",
      capability_key: "platform.code_ai_commit.execute",
      payload: {
        execution_key: key,
        commit_message: commitMessage,
      },
      verify_after: {
        capability_key: "platform.code_ai_commit_status.verify",
        description:
          "Verify the server-owned post-commit main-branch evidence before declaring persistence complete",
        payload: {
          execution_key: key,
        },
      },
    });
  }

  return steps;
}

function missionStep(missionResult, id) {
  return list(missionResult?.steps).find((step) => step?.id === id) || null;
}

function persistenceDecision(missionResult) {
  const step = missionStep(missionResult, "decide_persistence");
  return object(step?.result);
}

function commitCompleted(missionResult) {
  return missionStep(missionResult, "commit_verified_changes")?.status === "completed";
}

async function preparePersistenceHandoff({ context, executionKey: key, focus }) {
  try {
    const execution = await executeUbteCapability({
      organizationId: context.organizationId,
      domain: "platform",
      capability: "product_persistence_handoff",
      action: "execute",
      payload: {
        execution_key: key,
        ...(focus ? { focus } : {}),
      },
      actor: context.actor,
      runtime: {
        entityId: context.entityId,
        periodId: context.periodId,
        permissions: context.permissions,
        callerRequest: context.callerRequest,
        metadata: {
          ...object(context.metadata),
          source: "AVANTIQO_PRODUCT_ENGINEERING_CYCLE_PERSISTENCE_HANDOFF",
          productEngineeringCyclePersistenceHandoff: true,
          productionDeploymentAllowed: false,
          databaseMigrationExecutionAllowed: false,
          automaticRecursionAllowed: false,
        },
      },
    });
    return {
      available: true,
      result: execution?.result ?? execution,
      reason: null,
    };
  } catch (error) {
    return {
      available: false,
      result: null,
      reason: text(error?.message, 500) || "PRODUCT_PERSISTENCE_HANDOFF_UNAVAILABLE",
    };
  }
}

export function createProductEngineeringCycleCapability() {
  const manifest = defineCapability({
    domain: "platform",
    capability: "product_engineering_cycle",
    action: "execute",
    name: "Run Avantiqo Product Engineering Cycle",
    document: "product_engineering_cycle",
    description:
      "Run one bounded Avantiqo-owned product-owner-to-engineering cycle through the durable Operator mission engine: assess the highest-impact autonomy gap against the Product Constitution, bind only the resulting bounded engineering objective into Code AI, let Code AI work and verify locally, independently verify the attested engineering outcome, then let Product Intelligence decide whether the verified result should remain local or request separately governed commit confirmation. By default no commit occurs. If Product Intelligence recommends persistence and the actor has commit permission, the cycle automatically invokes only the safe platform.product_persistence_handoff.execute preparatory composite, which can prepare and pause a durable mission at the existing explicit commit confirmation gate; it cannot silently commit. When commit_message is explicitly supplied by the caller, the original durable mission may append the separately governed Code AI commit action directly, which still requires its own confirmation/approval gates, exact-base protection and registered post-write verification. Production deployment, database migrations, publication and governance bypass remain outside this cycle.",
    permissions: [REQUIRED_PERMISSION],
    events: [],
    tags: [
      "platform",
      "intelligence",
      "product-owner",
      "code-ai",
      "autonomous",
      "engineering-cycle",
      "durable-mission",
      "verified-handoff",
      "persistence-decision",
      "persistence-handoff",
      "local-first",
      "commit-optional",
      "governed-persistence",
      "no-deploy",
    ],
    operatorAliases: [
      "continue building avantiqo",
      "continue avantiqo",
      "finish avantiqo",
      "find and fix the next avantiqo gap",
      "run the next product engineering cycle",
      "let intelligence and code ai continue",
      "have avantiqo improve itself",
      "continue autonomously on avantiqo",
    ],
    operatorExamples: [
      "Continue Avantiqo autonomously and fix the next highest-impact gap locally.",
      "Run one Product Owner to Code AI engineering cycle and decide whether the verified result belongs on main.",
      "Find what Avantiqo needs next, let Code AI implement and verify it locally, then prepare the single governed persistence confirmation automatically if Product Intelligence recommends it.",
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
      properties: {
        focus: {
          type: "string",
          maxLength: 2000,
          description: "Optional product area or autonomy concern to prioritize.",
        },
        repository_url: {
          type: "string",
          maxLength: 500,
          default: DEFAULT_REPOSITORY,
          description: "Repository Code AI should inspect locally. Defaults to Avantiqo main repository.",
        },
        ref: {
          type: "string",
          maxLength: 160,
          default: DEFAULT_REF,
        },
        max_iterations: {
          type: "integer",
          minimum: 1,
          maximum: 24,
          default: 16,
        },
        timeout_ms: {
          type: "integer",
          minimum: 30000,
          maximum: 1200000,
        },
        commit_message: {
          type: "string",
          minLength: 1,
          maxLength: 200,
          description:
            "Optional explicit caller request to append the separately governed Code AI commit step after local engineering verification. Supplying this does not bypass Product Intelligence assessment, commit permission, confirmation, approval, exact-base or post-write verification gates.",
        },
      },
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: {
        status: { type: "string" },
        execution_key: { type: "string" },
        repository_url: { type: "string" },
        ref: { type: "string" },
        mission: { type: "object" },
        persistence_decision: { type: "object" },
        persistence_handoff: { type: ["object", "null"] },
        persistence_handoff_available: { type: "boolean" },
        persistence_handoff_reason: { type: ["string", "null"] },
        commit_requested: { type: "boolean" },
        commit_completed: { type: "boolean" },
        persistent_source_changed: { type: "boolean" },
        production_deployed: { type: "boolean" },
      },
      additionalProperties: true,
    },
  });

  function authorize({ context }) {
    return requireExecutionPermission(context, REQUIRED_PERMISSION);
  }

  async function execute({ context, payload = {} }) {
    const key = executionKey();
    const repositoryUrl = text(payload.repository_url, 500) || DEFAULT_REPOSITORY;
    const ref = text(payload.ref, 160) || DEFAULT_REF;
    const focus = text(payload.focus, 2000) || null;
    const commitMessage = text(payload.commit_message, 200) || null;
    const maxIterations = Number.isInteger(Number(payload.max_iterations))
      ? Math.max(1, Math.min(24, Number(payload.max_iterations)))
      : 16;
    const timeoutMs = Number.isInteger(Number(payload.timeout_ms))
      ? Math.max(30000, Math.min(1200000, Number(payload.timeout_ms)))
      : null;

    const mission = await executeUbteCapability({
      organizationId: context.organizationId,
      domain: "platform",
      capability: "operator_mission",
      action: "execute",
      payload: {
        steps: missionSteps({
          focus,
          repositoryUrl,
          ref,
          key,
          maxIterations,
          timeoutMs,
          commitMessage,
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
          source: "AVANTIQO_PRODUCT_ENGINEERING_CYCLE",
          productEngineeringCycle: true,
          persistentSourceChangesAllowed: false,
          productionDeploymentAllowed: false,
          databaseMigrationExecutionAllowed: false,
          governedCommitRequested: Boolean(commitMessage),
        },
      },
    });

    const missionResult = mission?.result ?? mission;
    const persisted = commitCompleted(missionResult);
    const decision = persistenceDecision(missionResult);
    let handoff = {
      available: false,
      result: null,
      reason: null,
    };

    if (
      !commitMessage &&
      text(missionResult?.status, 100) === "completed" &&
      decision?.decision === "REQUEST_COMMIT_CONFIRMATION"
    ) {
      handoff = await preparePersistenceHandoff({
        context,
        executionKey: key,
        focus,
      });
    }

    return {
      status: text(missionResult?.status, 100) || "unknown",
      execution_key: key,
      repository_url: repositoryUrl,
      ref,
      mission: missionResult,
      persistence_decision: decision,
      persistence_handoff: handoff.result,
      persistence_handoff_available: handoff.available,
      persistence_handoff_reason: handoff.reason,
      commit_requested: Boolean(commitMessage),
      commit_completed: persisted,
      persistent_source_changed: persisted,
      production_deployed: false,
      database_migrations_applied: false,
      continuation: {
        persistence_confirmation_recommended:
          decision?.decision === "REQUEST_COMMIT_CONFIRMATION",
        persistence_confirmation_prepared:
          handoff.result?.confirmation_required === true,
        suggested_commit_message:
          decision?.decision === "REQUEST_COMMIT_CONFIRMATION"
            ? text(decision?.persistence?.commit_message, 200) || null
            : null,
        after_verified_commit:
          decision?.continuation?.after_verified_commit === true,
        next_strategy:
          text(decision?.continuation?.strategy, 120) || "STOP_AFTER_CURRENT_CYCLE",
      },
      governance: {
        durable_operator_mission_used: true,
        product_persistence_decision_required: true,
        product_persistence_decision_completed: Boolean(decision?.decision),
        product_persistence_handoff_prepared: Boolean(handoff.result),
        product_persistence_handoff_may_only_prepare_confirmation: true,
        code_ai_commit_capability_requested: Boolean(commitMessage),
        code_ai_commit_capability_completed: persisted,
        code_ai_commit_confirmation_required:
          Boolean(commitMessage) || handoff.result?.confirmation_required === true,
        code_ai_commit_verification_required:
          Boolean(commitMessage) || handoff.result?.confirmation_required === true,
        production_deployment_capability_invoked: false,
      },
    };
  }

  return { manifest, authorize, execute };
}

export default createProductEngineeringCycleCapability;
