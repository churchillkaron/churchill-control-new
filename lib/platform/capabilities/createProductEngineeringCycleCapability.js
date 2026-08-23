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

function executionKey() {
  return `product-cycle:${crypto.randomUUID()}`;
}

function missionSteps({ focus, repositoryUrl, ref, key, maxIterations, timeoutMs }) {
  return [
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
          "Verify the server-owned attested Code AI engineering outcome before declaring this product cycle complete",
        payload: {
          execution_key: key,
        },
      },
    },
  ];
}

export function createProductEngineeringCycleCapability() {
  const manifest = defineCapability({
    domain: "platform",
    capability: "product_engineering_cycle",
    action: "execute",
    name: "Run Avantiqo Product Engineering Cycle",
    document: "product_engineering_cycle",
    description:
      "Run one bounded Avantiqo-owned product-owner-to-engineering cycle through the durable Operator mission engine: assess the highest-impact autonomy gap against the Product Constitution, bind only the resulting bounded engineering objective into Code AI, let Code AI work and verify locally, then independently verify the attested engineering outcome from server-owned execution evidence. This cycle never commits to GitHub, deploys production, applies database migrations, publishes, or bypasses governance.",
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
      "local-first",
      "no-commit",
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
      "Continue Avantiqo autonomously and fix the next highest-impact gap.",
      "Run one Product Owner to Code AI engineering cycle.",
      "Find what Avantiqo needs next and let Code AI implement and verify it locally.",
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
          persistentSourceChangesAllowed: false,
          productionDeploymentAllowed: false,
          databaseMigrationExecutionAllowed: false,
        },
      },
    });

    const missionResult = mission?.result ?? mission;
    return {
      status: text(missionResult?.status, 100) || "unknown",
      execution_key: key,
      repository_url: repositoryUrl,
      ref,
      mission: missionResult,
      persistent_source_changed: false,
      production_deployed: false,
      database_migrations_applied: false,
      governance: {
        durable_operator_mission_used: true,
        code_ai_commit_capability_invoked: false,
        production_deployment_capability_invoked: false,
      },
    };
  }

  return { manifest, authorize, execute };
}

export default createProductEngineeringCycleCapability;
