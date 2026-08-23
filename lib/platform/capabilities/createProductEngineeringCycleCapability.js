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
}) {
  return [
    {
      id: "assess_repository",
      label: "Assess actual current Avantiqo main and select one bounded engineering objective",
      capability_key: "platform.product_repository_assessment.read",
      payload: {
        repository_url: repositoryUrl,
        ...(focus ? { focus } : {}),
        ...(timeoutMs ? { timeout_ms: timeoutMs } : {}),
      },
    },
    {
      id: "engineer_next_gap",
      label: "Let Code AI implement and verify the repository-grounded objective locally",
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
          source_step_id: "assess_repository",
          source: "result",
          source_path: "next_engineering_handoff.focus",
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
}

function missionStep(missionResult, id) {
  return list(missionResult?.steps).find((step) => step?.id === id) || null;
}

function missionStepCapabilityResult(missionResult, id) {
  const step = missionStep(missionResult, id);
  const wrapped = object(step?.result);
  const nested = object(wrapped.result);
  return Object.keys(nested).length ? nested : wrapped;
}

function repositoryAssessment(missionResult) {
  return missionStepCapabilityResult(missionResult, "assess_repository");
}

function persistenceDecision(missionResult) {
  return missionStepCapabilityResult(missionResult, "decide_persistence");
}

async function preparePersistenceHandoff({
  context,
  executionKey: key,
  focus,
  commitMessage,
}) {
  try {
    const execution = await executeUbteCapability({
      organizationId: context.organizationId,
      domain: "platform",
      capability: "product_persistence_handoff",
      action: "execute",
      payload: {
        execution_key: key,
        ...(focus ? { focus } : {}),
        ...(commitMessage ? { commit_message: commitMessage } : {}),
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
          callerCommitRequested: Boolean(commitMessage),
          callerCommitAuthorizationEffect: "NONE",
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
      "Run one bounded Avantiqo-owned product-owner-to-engineering cycle through the durable Operator mission engine. Every cycle begins with platform.product_repository_assessment.read against actual current GitHub main, so the engineering objective is selected from a fresh read-only repository checkout under the Product Constitution rather than from a stale running-process catalog. Any incoming focus is prioritization context only; current main evidence may refine or replace it. The exact repository-grounded next_engineering_handoff.focus is bound into Code AI, which must inspect newest main again before editing, preserve concurrent changes, work locally, repair failures and produce registered verification evidence. Product Intelligence then decides persistence separately. The engineering mission never contains a GitHub commit step. Even when the caller supplies commit_message, that value is only a non-authorizing persistence request/label: it is passed to platform.product_persistence_handoff.execute only after Product Intelligence independently returns REQUEST_COMMIT_CONFIRMATION. The handoff then preserves the separate commit permission, explicit confirmation, exact-base and post-write verification gates. STAY_LOCAL can never be overridden by the caller commit request. Production deployment, database migrations, publication, governance bypass and automatic recursive cycles remain outside this capability.",
    permissions: [REQUIRED_PERMISSION],
    events: [],
    tags: [
      "platform",
      "intelligence",
      "product-owner",
      "repository-grounded",
      "current-main",
      "code-ai",
      "autonomous",
      "engineering-cycle",
      "durable-mission",
      "verified-handoff",
      "persistence-decision",
      "persistence-handoff",
      "local-first",
      "no-direct-commit",
      "caller-commit-request-not-authority",
      "governed-persistence",
      "no-recursion",
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
      "Continue Avantiqo autonomously and fix the next highest-impact gap locally from current main.",
      "Reassess actual current main, run one Product Owner to Code AI engineering cycle, and decide whether the verified result belongs on main.",
      "Find what current Avantiqo source needs next, let Code AI implement and verify it locally, then prepare the single governed persistence confirmation automatically if Product Intelligence recommends it.",
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
          description:
            "Optional product area or prior repository-grounded objective to prioritize. A fresh current-main assessment still selects the actual engineering objective.",
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
          description: "Product Engineering Cycles are main-only; non-main refs are rejected.",
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
            "Optional caller persistence request/commit label. It has no authorization effect, never inserts a commit step into this engineering mission, is ignored if Product Intelligence says STAY_LOCAL or ALREADY_PERSISTED, and is forwarded to the separately governed persistence handoff only when Product Intelligence returns REQUEST_COMMIT_CONFIRMATION.",
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
        repository_assessment: { type: "object" },
        repository_head_observed: { type: ["string", "null"] },
        mission: { type: "object" },
        persistence_decision: { type: "object" },
        persistence_handoff: { type: ["object", "null"] },
        persistence_handoff_available: { type: "boolean" },
        persistence_handoff_reason: { type: ["string", "null"] },
        caller_commit_requested: { type: "boolean" },
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
    const requestedRef = text(payload.ref, 160) || DEFAULT_REF;
    if (requestedRef !== DEFAULT_REF) {
      throw new Error("PRODUCT_ENGINEERING_CYCLE_MAIN_ONLY");
    }
    const ref = DEFAULT_REF;
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
          repositoryGroundedAssessmentRequired: true,
          currentMainRecheckBeforeEngineeringRequired: true,
          persistentSourceChangesAllowed: false,
          callerCommitRequested: Boolean(commitMessage),
          callerCommitAuthorizationEffect: "NONE",
          productionDeploymentAllowed: false,
          databaseMigrationExecutionAllowed: false,
          automaticRecursionAllowed: false,
        },
      },
    });

    const missionResult = mission?.result ?? mission;
    const assessment = repositoryAssessment(missionResult);
    const repositoryHeadObserved =
      text(assessment?.repository_snapshot?.current_main_head, 160) || null;
    const decision = persistenceDecision(missionResult);
    let handoff = {
      available: false,
      result: null,
      reason: null,
    };

    if (
      text(missionResult?.status, 100) === "completed" &&
      decision?.decision === "REQUEST_COMMIT_CONFIRMATION"
    ) {
      handoff = await preparePersistenceHandoff({
        context,
        executionKey: key,
        focus,
        commitMessage,
      });
    }

    const commitConfirmationPrepared =
      handoff.result?.confirmation_required === true;

    return {
      status: text(missionResult?.status, 100) || "unknown",
      execution_key: key,
      repository_url: repositoryUrl,
      ref,
      repository_assessment: assessment,
      repository_head_observed: repositoryHeadObserved,
      mission: missionResult,
      persistence_decision: decision,
      persistence_handoff: handoff.result,
      persistence_handoff_available: handoff.available,
      persistence_handoff_reason: handoff.reason,
      caller_commit_requested: Boolean(commitMessage),
      commit_requested: commitConfirmationPrepared,
      commit_completed: false,
      persistent_source_changed: false,
      production_deployed: false,
      database_migrations_applied: false,
      continuation: {
        persistence_confirmation_recommended:
          decision?.decision === "REQUEST_COMMIT_CONFIRMATION",
        persistence_confirmation_prepared: commitConfirmationPrepared,
        caller_commit_request_honored_only_after_product_decision:
          Boolean(commitMessage) &&
          decision?.decision === "REQUEST_COMMIT_CONFIRMATION",
        caller_commit_request_ignored:
          Boolean(commitMessage) &&
          decision?.decision !== "REQUEST_COMMIT_CONFIRMATION",
        suggested_commit_message:
          decision?.decision === "REQUEST_COMMIT_CONFIRMATION"
            ? commitMessage || text(decision?.persistence?.commit_message, 200) || null
            : null,
        after_verified_commit:
          decision?.continuation?.after_verified_commit === true,
        next_strategy:
          text(decision?.continuation?.strategy, 120) || "STOP_AFTER_CURRENT_CYCLE",
      },
      governance: {
        durable_operator_mission_used: true,
        repository_grounded_assessment_required: true,
        repository_grounded_assessment_completed: Boolean(repositoryHeadObserved),
        current_main_rechecked_before_engineering: Boolean(repositoryHeadObserved),
        repository_source_evidence_is_certification: false,
        incoming_focus_is_authority: false,
        product_persistence_decision_required: true,
        product_persistence_decision_completed: Boolean(decision?.decision),
        caller_commit_request_authorization_effect: "NONE",
        caller_commit_request_cannot_override_stay_local: true,
        direct_commit_step_allowed_in_engineering_mission: false,
        product_persistence_handoff_prepared: Boolean(handoff.result),
        product_persistence_handoff_requires_request_commit_decision: true,
        product_persistence_handoff_may_only_prepare_confirmation: true,
        code_ai_commit_capability_invoked_by_engineering_mission: false,
        code_ai_commit_capability_completed: false,
        code_ai_commit_confirmation_required: commitConfirmationPrepared,
        code_ai_commit_verification_required: commitConfirmationPrepared,
        automatic_recursion_allowed: false,
        production_deployment_capability_invoked: false,
      },
    };
  }

  return { manifest, authorize, execute };
}

export default createProductEngineeringCycleCapability;
