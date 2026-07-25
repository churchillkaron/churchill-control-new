import * as Repository from "../repositories/ProductionRepository";

import {
  ExecutionRuntime,
} from "@/lib/creative/execution/runtime/ExecutionRuntime";
import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import {
  buildProductionTaskIdentityMap,
  resolveProductionTaskDependencies,
} from "@/lib/operations/tasks/identity/ProductionTaskIdentity";
import {
  CreativeOrchestrationWorker,
} from "@/lib/creative/worker/CreativeOrchestrationWorker";
import {
  resolveOrganizationCurrency,
} from "@/lib/platform/context/resolveOrganizationCurrency";
import {
  CreativeProductionLifecycleRuntime,
} from "./CreativeProductionLifecycleRuntime";

function resolveTaskType(step = {}) {
  const deliverable = String(step.metadata?.deliverable || "").toUpperCase();
  const service = step.service_code || step.service;

  if (deliverable === "MASTER_STILL") return "GENERATE_IMAGE";
  if (deliverable === "VIDEO_SHOT") return "IMAGE_TO_VIDEO";
  if (deliverable.endsWith("_QA")) return "QUALITY_REVIEW";

  switch (service) {
    case "ai.text.generate":
      return "GENERATE_TEXT";
    case "ai.reasoning.execute":
      return deliverable.includes("OUTPUT")
        ? "GENERATE_STRUCTURED_OUTPUT"
        : "QUALITY_REVIEW";
    case "ai.image.generate":
      return "GENERATE_IMAGE";
    case "ai.image.analyze":
      return "QUALITY_REVIEW";
    case "ai.image.upscale":
      return "UPSCALE";
    case "ai.video.generate":
      return "GENERATE_VIDEO";
    case "ai.video.image_to_video":
      return "IMAGE_TO_VIDEO";
    case "ai.video.lipsync":
      return "LIPSYNC";
    case "ai.voice.generate":
      return "GENERATE_VOICE";
    case "ai.music.generate":
      return "GENERATE_MUSIC";
    case "ai.sfx.generate":
      return "GENERATE_SFX";
    case "ai.translate":
      return "TRANSLATE";
    default:
      return "EXECUTE_CAPABILITY";
  }
}

async function materializeExecutionPlan({
  organization_id,
  creative_project_id,
}) {
  const [plans, currency] = await Promise.all([
    ExecutionRuntime.list({ organization_id, creative_project_id }),
    resolveOrganizationCurrency({ organization_id }),
  ]);
  const plan = plans[0] || null;

  if (!plan) {
    throw new Error("Creative execution plan required before production");
  }

  const identityMap = buildProductionTaskIdentityMap({
    organization_id,
    creative_project_id,
    execution_plan_id: plan.id,
    steps: plan.steps || [],
  });
  const tasks = [];

  for (const step of plan.steps || []) {
    const task = await ProductionTaskRuntime.create({
      id: identityMap.get(step.id),
      organization_id,
      creative_project_id,
      production_graph_id: plan.production_graph_id,
      scene_id: step.metadata?.scene_id || null,
      shot_id: step.metadata?.shot_id || null,
      type: resolveTaskType(step),
      status: step.status === "COMPLETED" ? "COMPLETED" : "WAITING",
      title:
        step.metadata?.node_title ||
        step.input?.title ||
        "Creative Production Task",
      description: step.input?.description || "",
      service_id: step.service_code || step.service || null,
      service_code: step.service_code || step.service || null,
      capability: step.capability || null,
      priority: Number(step.priority || 100),
      depends_on: resolveProductionTaskDependencies(
        step.depends_on || [],
        identityMap,
      ),
      input: step.input || {},
      cost: {
        currency,
        estimated: Number(step.estimated_cost || 0),
        actual: 0,
        approved: true,
      },
      timing: {
        estimated_seconds: Number(step.estimated_seconds || 0),
      },
      review: {
        required: step.metadata?.requires_quality_approval !== false,
        approved: false,
      },
      metadata: {
        ...(step.metadata || {}),
        execution_plan_id: plan.id,
        execution_step_id: step.id,
        node_id: step.node_id,
        idempotency_key: step.id,
        production_contract:
          plan.metadata?.production_contract ||
          step.metadata?.production_contract ||
          "universal_deliverable_v1",
      },
    });

    tasks.push(task);
  }

  return { plan, tasks };
}

export const ProductionRuntime = {
  async list(input = {}) {
    return Repository.list(input);
  },

  async get(id) {
    return Repository.get(id);
  },

  async create(document = {}) {
    return Repository.create(document);
  },

  async update(id, values = {}) {
    return Repository.update(id, values);
  },

  async archive(id) {
    return Repository.update(id, {
      archived_at: new Date().toISOString(),
    });
  },

  async resolve(input = {}, permissions = []) {
    const items = await this.list(input);
    const current = items[0] || null;

    return {
      current,
      items,
      commands: ["create", "update", "archive", "runProduction"],
      status: current?.status || "ready",
      permissions,
    };
  },

  async runProduction({
    organization_id,
    creative_project_id,
    max_cycles = 1,
  }) {
    if (!organization_id) throw new Error("organization_id required");
    if (!creative_project_id) throw new Error("creative_project_id required");

    const materialized = await materializeExecutionPlan({
      organization_id,
      creative_project_id,
    });
    const queuedLifecycle =
      await CreativeProductionLifecycleRuntime.markQueued({
        organization_id,
        creative_project_id,
      });

    let production;
    try {
      production = await CreativeOrchestrationWorker.runProject({
        organization_id,
        creative_project_id,
        max_cycles: Math.max(1, Math.min(5, Number(max_cycles || 1))),
      });
    } catch (error) {
      if (
        error?.message !== "CREATIVE_PROJECT_BUDGET_APPROVAL_REQUIRED" &&
        error?.message !== "CREATIVE_PROJECT_BUDGET_EXCEEDED"
      ) {
        throw error;
      }

      const lifecycle = await CreativeProductionLifecycleRuntime.persist({
        organization_id,
        creative_project_id,
        explicit_status: "APPROVAL_REQUIRED",
      });

      production = {
        success: true,
        complete: false,
        approval_required: true,
        execution_started: false,
        failed: 0,
        blocked: 0,
        submissions: 0,
        polls: 0,
        cycles: 0,
        lifecycle,
      };
    }

    return {
      success: production.failed === 0 && production.blocked === 0,
      execution_plan_id: materialized.plan.id,
      tasks_materialized: materialized.tasks.length,
      queued_lifecycle: queuedLifecycle,
      ...production,
    };
  },
};
