import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";

import {
  CreativeMasterStillPilotRepairRuntime,
} from "@/lib/creative/production/pilot/CreativeMasterStillPilotRepairRuntime";

const PREFLIGHT_BLOCKED = "CREATIVE_GENERATION_PREFLIGHT_BLOCKED";

function specification(task = {}) {
  return task.input?.specification || {};
}

function sceneNumber(task = {}) {
  return Number(
    specification(task).scene?.number ||
    task.metadata?.scene_number ||
    0,
  );
}

function shotNumber(task = {}) {
  return Number(
    specification(task).shot?.number ||
    task.metadata?.shot_number ||
    0,
  );
}

function isMasterStill(task = {}) {
  return String(
    task.metadata?.deliverable || "",
  ).toUpperCase() === "MASTER_STILL";
}

function hasOutput(task = {}) {
  return Boolean(
    task.output?.image_url ||
    task.output?.url ||
    task.output?.asset_id ||
    task.output?.asset?.url,
  );
}

function preparedPlan(task = {}) {
  const casting = task.input?.casting || null;
  const composition =
    task.input?.composition_plan ||
    task.input?.specification?.shot?.composition_plan ||
    null;

  return {
    casting,
    composition,
    ready: Boolean(
      task.metadata?.masked_composition_prepared === true &&
      casting?.mode === "GENERATED_CAST" &&
      Array.isArray(casting?.actors) &&
      casting.actors.length > 0 &&
      composition?.mode === "IMMUTABLE_PLATE_MASKED_CAST" &&
      composition?.brand_mode === "SOURCE_PIXELS_ONLY" &&
      Array.isArray(composition?.placement_regions) &&
      composition.placement_regions.length > 0 &&
      Array.isArray(composition?.protected_regions) &&
      composition.protected_regions.length > 0
    ),
  };
}

function assertSafeRearm(task = {}) {
  const plan = preparedPlan(task);
  const reasons = [];

  if (!plan.ready) {
    reasons.push("MASKED_COMPOSITION_PLAN_NOT_READY");
  }
  if (hasOutput(task)) {
    reasons.push("TASK_ALREADY_HAS_MEDIA_OUTPUT");
  }
  if (Number(task.cost?.actual || 0) > 0) {
    reasons.push("TASK_ALREADY_HAS_ACTUAL_COST");
  }
  if (task.metadata?.provider_job_id) {
    reasons.push("TASK_ALREADY_HAS_PROVIDER_JOB");
  }
  if (task.metadata?.provider_dispatched === true) {
    reasons.push("TASK_ALREADY_DISPATCHED");
  }
  if (task.metadata?.usage_created === true) {
    reasons.push("TASK_ALREADY_HAS_USAGE");
  }
  if (task.metadata?.wallet_reserved === true) {
    reasons.push("TASK_ALREADY_HAS_WALLET_RESERVATION");
  }
  if (!["WAITING", "FAILED"].includes(String(task.status || ""))) {
    reasons.push(`TASK_STATUS_${String(task.status || "UNKNOWN")}_NOT_REARMABLE`);
  }

  if (reasons.length) {
    const error = new Error("MASKED_MASTER_STILL_REARM_BLOCKED");
    error.code = reasons[0];
    error.details = {
      task_id: task.id,
      reasons,
      status: task.status,
      actual_cost: Number(task.cost?.actual || 0),
      provider_status: task.metadata?.provider_status || null,
      has_output: hasOutput(task),
      masked_plan_ready: plan.ready,
    };
    throw error;
  }

  return plan;
}

async function findTask({
  organization_id,
  creative_project_id,
  scene_number,
  shot_number,
}) {
  const tasks = await ProductionTaskRuntime.list({
    organization_id,
    creative_project_id,
  });
  const task = (tasks || []).find((candidate) => (
    isMasterStill(candidate) &&
    sceneNumber(candidate) === Number(scene_number) &&
    shotNumber(candidate) === Number(shot_number)
  ));

  if (!task) {
    throw new Error(
      `MASKED_MASTER_STILL_TASK_NOT_FOUND_FOR_SCENE_${scene_number}_SHOT_${shot_number}`,
    );
  }

  return task;
}

async function rearm(task = {}) {
  assertSafeRearm(task);

  return ProductionTaskRuntime.update(
    task.id,
    {
      status: "WAITING",
      timing: {
        ...(task.timing || {}),
        started_at: null,
        completed_at: null,
      },
      review: {
        ...(task.review || {}),
        approved: false,
        approved_by: null,
        notes: "",
      },
      metadata: {
        ...(task.metadata || {}),
        attempt: 0,
        provider_status: "MASKED_PLAN_READY",
        preflight_blocked: false,
        preflight_code: null,
        preflight_blocked_at: null,
        structured_failure: null,
        provider_dispatched: false,
        usage_created: false,
        wallet_reserved: false,
        wallet_charged: false,
        masked_generation_rearmed: true,
        masked_generation_rearmed_at: new Date().toISOString(),
        generation_contract_version:
          "creative-generation-evidence-v2",
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

export const CreativeMaskedPilotGenerationRuntime = {
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

    const task = await findTask({
      organization_id,
      creative_project_id,
      scene_number,
      shot_number,
    });
    const previousPreflightCode =
      task.metadata?.preflight_code ||
      task.metadata?.structured_failure?.code ||
      null;
    const previousPreflightBlocked = Boolean(
      task.metadata?.preflight_blocked === true ||
      task.metadata?.provider_status === "PREFLIGHT_BLOCKED" ||
      task.error === PREFLIGHT_BLOCKED,
    );
    const rearmed = await rearm(task);
    const result = await CreativeMasterStillPilotRepairRuntime.run({
      organization_id,
      creative_project_id,
      scene_number: Number(scene_number),
      shot_number: Number(shot_number),
    });

    return {
      ...result,
      masked_generation: {
        explicit: true,
        rearmed: true,
        rearmed_task_id: rearmed.id,
        previous_preflight_blocked: previousPreflightBlocked,
        previous_preflight_code: previousPreflightCode,
        casting_source: "TASK_PREPARED_CASTING",
        composition_mode:
          rearmed.input?.composition_plan?.mode || null,
        brand_mode:
          rearmed.input?.composition_plan?.brand_mode || null,
        video_execution_forbidden: true,
      },
    };
  },
};
