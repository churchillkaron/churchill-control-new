import * as Repository from "../repositories/ProductionRepository";

import {
  ExecutionRuntime,
} from "@/lib/creative/execution/runtime/ExecutionRuntime";

import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";

import {
  CreativeOrchestrationWorker,
} from "@/lib/creative/worker/CreativeOrchestrationWorker";

function resolveTaskType(step = {}) {
  const deliverable = step.metadata?.deliverable;
  const service = step.service_code || step.service;

  if (deliverable === "MASTER_STILL") {
    return "GENERATE_IMAGE";
  }

  if (deliverable === "VIDEO_SHOT") {
    return "IMAGE_TO_VIDEO";
  }

  switch (service) {
    case "ai.image.generate":
      return "GENERATE_IMAGE";
    case "ai.image.upscale":
      return "UPSCALE";
    case "ai.video.generate":
      return "GENERATE_VIDEO";
    case "ai.voice.generate":
      return "GENERATE_VOICE";
    case "ai.music.generate":
      return "GENERATE_MUSIC";
    case "ai.sfx.generate":
      return "GENERATE_SFX";
    case "ai.reasoning.execute":
      return "QUALITY_REVIEW";
    default:
      return "GENERATE_IMAGE";
  }
}

async function materializeExecutionPlan({
  organization_id,
  creative_project_id,
}) {
  const plans = await ExecutionRuntime.list({
    organization_id,
    creative_project_id,
  });
  const plan = plans[0] || null;

  if (!plan) {
    throw new Error(
      "Creative execution plan required before production",
    );
  }

  const tasks = [];

  for (const step of plan.steps || []) {
    const task = await ProductionTaskRuntime.create({
      id: step.id,
      organization_id,
      creative_project_id,
      production_graph_id: plan.production_graph_id,
      scene_id: step.metadata?.scene_id || null,
      shot_id: step.metadata?.shot_id || null,
      type: resolveTaskType(step),
      status:
        step.status === "COMPLETED"
          ? "COMPLETED"
          : "WAITING",
      title:
        step.metadata?.node_title ||
        step.input?.title ||
        "Creative Production Task",
      description: step.input?.description || "",
      service_id:
        step.service_code || step.service || null,
      service_code:
        step.service_code || step.service || null,
      capability: step.capability || null,
      priority: Number(step.priority || 100),
      depends_on: step.depends_on || [],
      input: step.input || {},
      cost: {
        currency: "USD",
        estimated: Number(step.estimated_cost || 0),
        actual: 0,
        approved: true,
      },
      timing: {
        estimated_seconds:
          Number(step.estimated_seconds || 0),
      },
      review: {
        required:
          step.metadata?.requires_quality_approval !== false,
        approved: false,
      },
      metadata: {
        ...(step.metadata || {}),
        execution_plan_id: plan.id,
        node_id: step.node_id,
        idempotency_key: step.id,
        production_contract:
          plan.metadata?.production_contract ||
          "atomic_reference_grounded_shots_v1",
      },
    });

    tasks.push(task);
  }

  return {
    plan,
    tasks,
  };
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
      commands: [
        "create",
        "update",
        "archive",
        "runProduction",
      ],
      status: current?.status || "ready",
      permissions,
    };
  },

  async runProduction({
    organization_id,
    creative_project_id,
    max_cycles = 1,
  }) {
    if (!organization_id) {
      throw new Error("organization_id required");
    }

    if (!creative_project_id) {
      throw new Error("creative_project_id required");
    }

    const materialized = await materializeExecutionPlan({
      organization_id,
      creative_project_id,
    });

    const production = await CreativeOrchestrationWorker.runProject({
      organization_id,
      creative_project_id,
      max_cycles: Math.max(
        1,
        Math.min(5, Number(max_cycles || 1)),
      ),
    });

    return {
      success:
        production.failed === 0 &&
        production.blocked === 0,
      execution_plan_id: materialized.plan.id,
      tasks_materialized: materialized.tasks.length,
      ...production,
    };
  },
};
