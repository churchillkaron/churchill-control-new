import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";

import {
  CreativeMasterStillPilotRepairRuntime,
} from "@/lib/creative/production/pilot/CreativeMasterStillPilotRepairRuntime";

const PREFLIGHT_BLOCKED = "CREATIVE_GENERATION_PREFLIGHT_BLOCKED";
const MASKED_MODES = new Set([
  "IMMUTABLE_PLATE_MASKED_CAST",
  "MASKED_CAST_COMPOSITE",
]);

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
  const mode = String(composition?.mode || "").toUpperCase();
  const isFullScene = mode === "FULL_SCENE_REFERENCE_SYNTHESIS";
  const isMasked = MASKED_MODES.has(mode);
  const actors = Array.isArray(casting?.actors)
    ? casting.actors
    : [];
  const castingReady = Boolean(
    ["GENERATED_CAST", "REFERENCE_IDENTITY"].includes(
      String(casting?.mode || "").toUpperCase(),
    ) &&
    actors.length > 0,
  );
  const prepared = Boolean(
    task.metadata?.composition_prepared === true ||
    task.metadata?.full_scene_synthesis_prepared === true ||
    task.metadata?.masked_composition_prepared === true,
  );
  const fullSceneReady = Boolean(
    prepared &&
    isFullScene &&
    castingReady &&
    composition?.full_scene_regeneration_required !== false,
  );
  const maskedReady = Boolean(
    prepared &&
    isMasked &&
    castingReady &&
    Array.isArray(composition?.placement_regions) &&
    composition.placement_regions.length > 0 &&
    Array.isArray(composition?.protected_regions) &&
    composition.protected_regions.length > 0,
  );

  return {
    casting,
    composition,
    mode,
    is_full_scene: isFullScene,
    is_masked: isMasked,
    casting_ready: castingReady,
    ready: fullSceneReady || maskedReady,
  };
}

function assertSafeRearm(task = {}) {
  const plan = preparedPlan(task);
  const reasons = [];

  if (!plan.ready) {
    reasons.push("CREATIVE_COMPOSITION_PLAN_NOT_READY");
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
    const error = new Error("CREATIVE_MASTER_STILL_REARM_BLOCKED");
    error.code = reasons[0];
    error.details = {
      task_id: task.id,
      reasons,
      status: task.status,
      actual_cost: Number(task.cost?.actual || 0),
      provider_status: task.metadata?.provider_status || null,
      has_output: hasOutput(task),
      composition_plan_ready: plan.ready,
      composition_mode: plan.mode || null,
      casting_mode: plan.casting?.mode || null,
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
      `CREATIVE_MASTER_STILL_TASK_NOT_FOUND_FOR_SCENE_${scene_number}_SHOT_${shot_number}`,
    );
  }

  return task;
}

async function rearm(task = {}) {
  const plan = assertSafeRearm(task);

  const updated = await ProductionTaskRuntime.update(
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
        provider_status: "CREATIVE_PLAN_READY",
        preflight_blocked: false,
        preflight_code: null,
        preflight_blocked_at: null,
        structured_failure: null,
        provider_dispatched: false,
        usage_created: false,
        wallet_reserved: false,
        wallet_charged: false,
        creative_generation_rearmed: true,
        creative_generation_rearmed_at: new Date().toISOString(),
        full_scene_generation_rearmed: plan.is_full_scene,
        masked_generation_rearmed: plan.is_masked,
        generation_contract_version:
          "creative-generation-evidence-v3",
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

  return {
    task: updated,
    plan,
  };
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
    const generationEvidence = {
      explicit: true,
      rearmed: true,
      rearmed_task_id: rearmed.task.id,
      previous_preflight_blocked: previousPreflightBlocked,
      previous_preflight_code: previousPreflightCode,
      casting_source: "TASK_PREPARED_CASTING",
      casting_mode: rearmed.plan.casting?.mode || null,
      composition_mode: rearmed.plan.mode || null,
      brand_mode:
        rearmed.task.input?.composition_plan?.brand_mode || null,
      full_scene_reference_synthesis: rearmed.plan.is_full_scene,
      masked_composition: rearmed.plan.is_masked,
      video_execution_forbidden: true,
    };

    return {
      ...result,
      creative_generation: generationEvidence,
      masked_generation: generationEvidence,
    };
  },
};
