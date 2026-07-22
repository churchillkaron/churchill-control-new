import {
  ExecutionRuntime,
} from "@/lib/creative/execution/runtime/ExecutionRuntime";

import {
  CreativeProductionControlRuntime,
} from "@/lib/creative/production/control/CreativeProductionControlRuntime";

import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";

import {
  buildProductionTaskIdentityMap,
  resolveProductionTaskDependencies,
} from "@/lib/operations/tasks/identity/ProductionTaskIdentity";

import {
  resolveOrganizationCurrency,
} from "@/lib/platform/context/resolveOrganizationCurrency";

import {
  CreativeStorageRuntime,
} from "@/lib/creative/storage/runtime/CreativeStorageRuntime";

import {
  CreativeAssetGraphRuntime,
} from "@/lib/creative/assets/graph/runtime/CreativeAssetGraphRuntime";

const MASTER_STILL = "MASTER_STILL";
const MASTER_STILL_QA = "MASTER_STILL_QA";
const SUCCESSFUL = new Set(["COMPLETED", "APPROVED"]);
const IN_PROGRESS = new Set(["RUNNING", "REVIEW"]);

function deliverable(step = {}) {
  return String(step.metadata?.deliverable || "").toUpperCase();
}

function specification(step = {}) {
  return (
    step.input?.specification ||
    step.input?.requirements?.specification ||
    step.input?.requirements?.shot_specification ||
    {}
  );
}

function sceneNumber(step = {}) {
  return Number(
    specification(step).scene?.number ||
    step.metadata?.scene_number ||
    0,
  );
}

function shotNumber(step = {}) {
  return Number(
    specification(step).shot?.number ||
    step.metadata?.shot_number ||
    0,
  );
}

function sortBySceneAndShot(left, right) {
  return (
    sceneNumber(left) - sceneNumber(right) ||
    shotNumber(left) - shotNumber(right) ||
    String(left.id || "").localeCompare(String(right.id || ""))
  );
}

function assertPilotStep(step, expectedDeliverable, expectedService) {
  if (!step) {
    throw new Error(`${expectedDeliverable}_STEP_REQUIRED`);
  }

  if (deliverable(step) !== expectedDeliverable) {
    throw new Error(`PILOT_STEP_MUST_BE_${expectedDeliverable}`);
  }

  const service = step.service_code || step.service || null;
  if (service !== expectedService) {
    throw new Error(
      `${expectedDeliverable}_SERVICE_MUST_BE_${expectedService}`,
    );
  }

  if (String(service).includes("video")) {
    throw new Error("PILOT_VIDEO_EXECUTION_FORBIDDEN");
  }
}

function findPilotSteps(plan = {}, requestedScene, requestedShot) {
  const steps = Array.isArray(plan.steps) ? plan.steps : [];
  const masters = steps
    .filter((step) => deliverable(step) === MASTER_STILL)
    .sort(sortBySceneAndShot);

  if (!masters.length) {
    throw new Error("MASTER_STILL_EXECUTION_STEP_REQUIRED");
  }

  const hasExplicitSelection =
    Number(requestedScene || 0) > 0 ||
    Number(requestedShot || 0) > 0;
  const selected = hasExplicitSelection
    ? masters.find((step) => (
        sceneNumber(step) === Number(requestedScene || 1) &&
        shotNumber(step) === Number(requestedShot || 1)
      ))
    : masters[0];

  if (!selected) {
    throw new Error(
      `MASTER_STILL_STEP_NOT_FOUND_FOR_SCENE_${Number(requestedScene || 1)}_SHOT_${Number(requestedShot || 1)}`,
    );
  }

  const qa = steps.find((step) => (
    deliverable(step) === MASTER_STILL_QA &&
    (
      step.metadata?.inspected_node_id === selected.node_id ||
      step.input?.inspected_node_id === selected.node_id ||
      (step.depends_on || []).includes(selected.id)
    )
  ));

  assertPilotStep(selected, MASTER_STILL, "ai.image.generate");
  assertPilotStep(qa, MASTER_STILL_QA, "ai.image.analyze");

  return {
    master: selected,
    qa,
  };
}

function taskType(step = {}) {
  switch (deliverable(step)) {
    case MASTER_STILL:
      return "GENERATE_IMAGE";
    case MASTER_STILL_QA:
      return "QUALITY_REVIEW";
    default:
      throw new Error("PILOT_SUPPORTS_MASTER_STILL_AND_QA_ONLY");
  }
}

async function materializeStep({
  step,
  plan,
  organization_id,
  creative_project_id,
  currency,
  identityMap,
  selectedStepIds,
  executionAllowed,
}) {
  const taskId = identityMap.get(step.id);
  const existing = await ProductionTaskRuntime.get(taskId, {
    organization_id,
    creative_project_id,
  });

  if (existing?.status === "FAILED") {
    return existing;
  }

  return ProductionTaskRuntime.create({
    id: taskId,
    organization_id,
    creative_project_id,
    production_graph_id: plan.production_graph_id,
    scene_id: step.metadata?.scene_id || null,
    shot_id: step.metadata?.shot_id || null,
    type: taskType(step),
    status: SUCCESSFUL.has(step.status)
      ? step.status
      : "WAITING",
    title:
      step.metadata?.node_title ||
      step.input?.title ||
      `${deliverable(step)} Pilot Task`,
    description: step.input?.description || "",
    service_id: step.service_code || step.service,
    service_code: step.service_code || step.service,
    capability: step.capability || null,
    priority: Number(step.priority || 100),
    depends_on: resolveProductionTaskDependencies(
      (step.depends_on || []).filter(
        (dependencyStepId) => selectedStepIds.has(dependencyStepId),
      ),
      identityMap,
    ),
    input: step.input || {},
    cost: {
      currency,
      estimated: Number(step.estimated_cost || 0),
      actual: Number(existing?.cost?.actual || 0),
      approved: executionAllowed === true,
    },
    timing: {
      estimated_seconds: Number(step.estimated_seconds || 0),
      started_at: existing?.timing?.started_at || null,
      completed_at: existing?.timing?.completed_at || null,
    },
    review: {
      required: step.metadata?.requires_quality_approval !== false,
      approved: existing?.review?.approved === true,
      approved_by: existing?.review?.approved_by || null,
      notes: existing?.review?.notes || "",
    },
    metadata: {
      ...(step.metadata || {}),
      execution_plan_id: plan.id,
      execution_step_id: step.id,
      node_id: step.node_id,
      idempotency_key: step.id,
      production_contract:
        plan.metadata?.production_contract ||
        "atomic_reference_grounded_shots_v1",
      pilot_scope: "SINGLE_MASTER_STILL_WITH_QA",
      video_execution_forbidden: true,
    },
  });
}

function hasTaskMediaOutput(task = {}) {
  return Boolean(
    task.output?.image_url ||
    task.output?.url ||
    task.output?.asset_id ||
    task.output?.asset?.url,
  );
}

function canRecoverInterruptedMaster(task = {}) {
  return (
    task.status === "RUNNING" &&
    !task.metadata?.provider_job_id &&
    !hasTaskMediaOutput(task)
  );
}

async function recoverInterruptedMaster(task = {}) {
  if (!canRecoverInterruptedMaster(task)) {
    return task;
  }

  const stored = await CreativeStorageRuntime.findStoredAsset({
    organization_id: task.organization_id,
    creative_project_id: task.creative_project_id,
    asset_id: task.id,
  });

  if (!stored?.signed_url || !stored?.storage_path) {
    return task;
  }

  const existingNodes = await CreativeAssetGraphRuntime.list({
    organization_id: task.organization_id,
    creative_project_id: task.creative_project_id,
  });
  let asset = existingNodes.find(
    (node) => node.production_task_id === task.id,
  ) || null;

  if (!asset) {
    asset = await CreativeAssetGraphRuntime.create({
      organization_id: task.organization_id,
      creative_project_id: task.creative_project_id,
      production_task_id: task.id,
      type: "IMAGE",
      status: "GENERATED",
      name: task.title || "Recovered Master Still",
      description: task.description || "",
      url: stored.signed_url,
      storage_path: stored.storage_path,
      lineage: {
        source: "canonical_storage_recovery",
        provider_id: task.metadata?.provider || null,
        capability: task.capability || task.service_code || null,
        generation_version: 1,
        source_task_id: task.id,
      },
      technical: {
        mime_type: stored.content_type || null,
        byte_size: stored.byte_size || null,
        checksum: stored.checksum || null,
      },
      cost: {
        currency: task.cost?.currency || null,
        estimated: Number(task.cost?.estimated || 0),
        actual: Number(task.cost?.actual || 0),
        saved_by_reuse: 0,
      },
      metadata: {
        task_type: task.type,
        canonical_storage: true,
        recovered_after_persistence_failure: true,
        recovery_source: "CREATIVE_STORAGE_TASK_DIRECTORY",
        recovered_at: new Date().toISOString(),
      },
    });
  }

  return ProductionTaskRuntime.update(
    task.id,
    {
      status: "COMPLETED",
      output: {
        ...(task.output || {}),
        asset_id: asset.id,
        asset,
        url: stored.signed_url,
        image_url: stored.signed_url,
        recovered_from_canonical_storage: true,
      },
      timing: {
        ...(task.timing || {}),
        completed_at: new Date().toISOString(),
      },
      metadata: {
        ...(task.metadata || {}),
        provider_status: "COMPLETED_RECOVERED",
        recovered_from_canonical_storage: true,
        recovered_storage_path: stored.storage_path,
        recovered_at: new Date().toISOString(),
      },
      worker_id: null,
      lease_expires_at: null,
      error: null,
    },
    {
      organization_id: task.organization_id,
      creative_project_id: task.creative_project_id,
    },
  );
}

async function dispatchWhenNeeded(task = {}) {
  if (SUCCESSFUL.has(task.status) || IN_PROGRESS.has(task.status)) {
    return task;
  }

  if (task.status === "FAILED") {
    return task;
  }

  return ProductionTaskRuntime.dispatch(task.id);
}

function taskCost(task = {}) {
  return {
    currency: task.cost?.currency || null,
    estimated: Number(task.cost?.estimated || 0),
    actual: Number(task.cost?.actual || 0),
  };
}

function masterAssetUrl(task = {}) {
  return (
    task.output?.image_url ||
    task.output?.url ||
    task.output?.asset?.url ||
    task.output?.asset?.image_url ||
    null
  );
}

function qaReview(task = {}) {
  return (
    task.output?.result?.json ||
    task.output?.result ||
    task.metadata?.quality_review ||
    task.metadata?.structured_failure?.quality_review ||
    null
  );
}

function summarizeTask(task = {}) {
  return {
    id: task.id || null,
    execution_step_id:
      task.metadata?.execution_step_id || null,
    status: task.status || null,
    title: task.title || "",
    deliverable: task.metadata?.deliverable || null,
    provider: task.metadata?.provider || null,
    attempt: Number(task.metadata?.attempt || 0),
    error: task.error || null,
    cost: taskCost(task),
  };
}

export const CreativeMasterStillPilotRuntime = {
  async run({
    organization_id,
    creative_project_id,
    scene_number = 1,
    shot_number = 1,
  } = {}) {
    if (!organization_id) {
      throw new Error("organization_id required");
    }

    if (!creative_project_id) {
      throw new Error("creative_project_id required");
    }

    const [control, plans, currency] = await Promise.all([
      CreativeProductionControlRuntime.assertExecutionAllowed({
        organization_id,
        creative_project_id,
      }),
      ExecutionRuntime.list({
        organization_id,
        creative_project_id,
      }),
      resolveOrganizationCurrency({
        organization_id,
      }),
    ]);

    const plan = plans[0] || null;
    if (!plan) {
      throw new Error("CREATIVE_EXECUTION_PLAN_REQUIRED");
    }

    const selected = findPilotSteps(
      plan,
      scene_number,
      shot_number,
    );
    const identityMap = buildProductionTaskIdentityMap({
      organization_id,
      creative_project_id,
      execution_plan_id: plan.id,
      steps: plan.steps || [],
    });
    const selectedStepIds = new Set([
      selected.master.id,
      selected.qa.id,
    ]);

    let masterTask = await materializeStep({
      step: selected.master,
      plan,
      organization_id,
      creative_project_id,
      currency,
      identityMap,
      selectedStepIds,
      executionAllowed: control.budget.execution_allowed,
    });
    let qaTask = await materializeStep({
      step: selected.qa,
      plan,
      organization_id,
      creative_project_id,
      currency,
      identityMap,
      selectedStepIds,
      executionAllowed: control.budget.execution_allowed,
    });

    masterTask = await recoverInterruptedMaster(masterTask);
    masterTask = await dispatchWhenNeeded(masterTask);

    if (SUCCESSFUL.has(masterTask.status)) {
      qaTask = await dispatchWhenNeeded(qaTask);
    }

    const review = qaReview(qaTask);
    const passed =
      SUCCESSFUL.has(masterTask.status) &&
      SUCCESSFUL.has(qaTask.status) &&
      review?.passed !== false;

    return {
      success: passed,
      pilot_only: true,
      production_scope: "ONE_MASTER_STILL_AND_ITS_QA",
      organization_id,
      creative_project_id,
      execution_plan_id: plan.id,
      selected_shot: {
        scene_number: sceneNumber(selected.master),
        shot_number: shotNumber(selected.master),
        scene_title:
          specification(selected.master).scene?.title || "",
        shot_title:
          specification(selected.master).shot?.title ||
          selected.master.input?.title ||
          "",
        reference_asset_count:
          selected.master.input?.reference_assets?.length ||
          selected.master.input?.assets?.length ||
          0,
      },
      master_still: {
        ...summarizeTask(masterTask),
        asset_url: masterAssetUrl(masterTask),
        asset_id: masterTask.output?.asset_id || null,
        recovered_from_canonical_storage:
          masterTask.output?.recovered_from_canonical_storage === true,
      },
      quality_review: {
        ...summarizeTask(qaTask),
        passed: review?.passed === true,
        overall_score: Number(review?.overall_score || 0),
        minimum_score: Number(
          selected.qa.input?.minimum_score ||
          selected.qa.input?.requirements?.minimum_score ||
          90,
        ),
        critical_failures:
          review?.critical_failures || [],
        issues: review?.issues || [],
        correction_instructions:
          review?.correction_instructions || [],
      },
      video_tasks_materialized: 0,
      video_tasks_dispatched: 0,
      production_dispatched: true,
      next_gate: passed
        ? "MASTER_STILL_PILOT_APPROVED"
        : qaTask.status === "FAILED"
          ? "MASTER_STILL_REPAIR_REQUIRED"
          : masterTask.status === "RUNNING"
            ? "MASTER_STILL_PROCESSING"
            : "MASTER_STILL_PILOT_INCOMPLETE",
    };
  },
};
