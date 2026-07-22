import {
  ExecutionRuntime,
} from "@/lib/creative/execution/runtime/ExecutionRuntime";

import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";

import {
  buildProductionTaskIdentityMap,
} from "@/lib/operations/tasks/identity/ProductionTaskIdentity";

const MASTER_STILL = "MASTER_STILL";
const ALLOWED_MODES = new Set([
  "IMMUTABLE_PLATE_MASKED_CAST",
  "MASKED_CAST_COMPOSITE",
]);

function list(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value];
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

function deliverable(step = {}) {
  return String(step.metadata?.deliverable || "").toUpperCase();
}

function findMasterStep(plan, requestedScene, requestedShot) {
  const step = (plan.steps || []).find((candidate) => (
    deliverable(candidate) === MASTER_STILL &&
    sceneNumber(candidate) === Number(requestedScene) &&
    shotNumber(candidate) === Number(requestedShot)
  ));

  if (!step) {
    throw new Error(
      `MASTER_STILL_STEP_NOT_FOUND_FOR_SCENE_${requestedScene}_SHOT_${requestedShot}`,
    );
  }

  return step;
}

function normalizedRegion(region = {}, index, kind) {
  const values = [
    Number(region.x),
    Number(region.y),
    Number(region.width),
    Number(region.height),
  ];

  if (
    values.some((value) => !Number.isFinite(value)) ||
    values.some((value) => value < 0 || value > 1) ||
    values[2] <= 0 ||
    values[3] <= 0 ||
    values[0] + values[2] > 1 ||
    values[1] + values[3] > 1
  ) {
    throw new Error(
      `CREATIVE_${kind}_REGION_${index + 1}_INVALID`,
    );
  }

  return {
    id: region.id || `${kind.toLowerCase()}-${index + 1}`,
    role: region.role || null,
    coordinate_space: "NORMALIZED",
    x: values[0],
    y: values[1],
    width: values[2],
    height: values[3],
  };
}

function actor(value = {}, index) {
  const normalized = {
    role: String(value.role || "").trim(),
    count: Math.max(0, Number(value.count || 0)),
    identity_mode: String(
      value.identity_mode || "GENERATED_CAST",
    ).toUpperCase(),
    wardrobe: String(value.wardrobe || "").trim(),
    action: String(value.action || "").trim(),
    placement: String(value.placement || "").trim(),
    identity_reference_asset_ids: list(
      value.identity_reference_asset_ids,
    ).map(String),
  };
  const missing = Object.entries({
    role: normalized.role,
    count: normalized.count,
    wardrobe: normalized.wardrobe,
    action: normalized.action,
    placement: normalized.placement,
  })
    .filter(([, field]) => !field)
    .map(([key]) => key);

  if (!["GENERATED_CAST", "REFERENCE_IDENTITY"].includes(
    normalized.identity_mode,
  )) {
    missing.push("identity_mode");
  }

  if (
    normalized.identity_mode === "REFERENCE_IDENTITY" &&
    !normalized.identity_reference_asset_ids.length
  ) {
    missing.push("identity_reference_asset_ids");
  }

  if (missing.length) {
    const error = new Error(
      `CREATIVE_CAST_ACTOR_${index + 1}_INCOMPLETE`,
    );
    error.details = { missing };
    throw error;
  }

  return normalized;
}

function safePlan(input = {}) {
  const castingActors = list(input.casting?.actors).map(actor);
  if (!castingActors.length) {
    throw new Error("CREATIVE_CASTING_ACTORS_REQUIRED");
  }

  const mode = String(
    input.composition_plan?.mode ||
    "IMMUTABLE_PLATE_MASKED_CAST",
  ).toUpperCase();

  if (!ALLOWED_MODES.has(mode)) {
    throw new Error("CREATIVE_MASKED_COMPOSITION_MODE_INVALID");
  }

  const placementRegions = list(
    input.composition_plan?.placement_regions,
  ).map((region, index) =>
    normalizedRegion(region, index, "PLACEMENT"),
  );
  const protectedRegions = list(
    input.composition_plan?.protected_regions,
  ).map((region, index) =>
    normalizedRegion(region, index, "PROTECTED"),
  );

  if (!placementRegions.length) {
    throw new Error("CREATIVE_MASK_PLACEMENT_REGION_REQUIRED");
  }
  if (!protectedRegions.length) {
    throw new Error("CREATIVE_PROTECTED_BRAND_REGION_REQUIRED");
  }

  return {
    casting: {
      mode: "GENERATED_CAST",
      actors: castingActors,
    },
    composition_plan: {
      mode,
      brand_mode: "SOURCE_PIXELS_ONLY",
      source_plate_asset_id:
        input.composition_plan?.source_plate_asset_id ||
        "AUTO_PRIMARY_REFERENCE",
      placement_regions: placementRegions,
      protected_regions: protectedRegions,
      exact_pixels_outside_mask_required: true,
      generated_text_allowed: false,
      logo_redraw_allowed: false,
    },
  };
}

function referenceCount(step = {}) {
  return (
    step.input?.reference_assets?.length ||
    step.input?.assets?.length ||
    0
  );
}

export const CreativeMaskedPilotPreparationRuntime = {
  async prepare({
    organization_id,
    creative_project_id,
    scene_number,
    shot_number,
    generation_plan,
  } = {}) {
    if (!organization_id) {
      throw new Error("organization_id required");
    }
    if (!creative_project_id) {
      throw new Error("creative_project_id required");
    }

    const plans = await ExecutionRuntime.list({
      organization_id,
      creative_project_id,
    });
    const plan = plans[0] || null;
    if (!plan) {
      throw new Error("CREATIVE_EXECUTION_PLAN_REQUIRED");
    }

    const step = findMasterStep(
      plan,
      Number(scene_number || 1),
      Number(shot_number || 1),
    );
    const identityMap = buildProductionTaskIdentityMap({
      organization_id,
      creative_project_id,
      execution_plan_id: plan.id,
      steps: plan.steps || [],
    });
    const taskId = identityMap.get(step.id);
    const task = await ProductionTaskRuntime.get(taskId, {
      organization_id,
      creative_project_id,
    });

    if (!task) {
      throw new Error(
        "CREATIVE_MASTER_STILL_TASK_MUST_BE_MATERIALIZED_FIRST",
      );
    }
    if (
      task.output?.image_url ||
      task.output?.url ||
      task.output?.asset_id ||
      Number(task.cost?.actual || 0) > 0
    ) {
      throw new Error(
        "CREATIVE_MASKED_PLAN_CANNOT_REWRITE_SPENT_OR_COMPLETED_TASK",
      );
    }

    const prepared = safePlan(generation_plan || {});
    const currentSpecification = task.input?.specification || {};
    const currentShot = currentSpecification.shot || {};
    const nextInput = {
      ...(task.input || {}),
      casting: prepared.casting,
      composition_plan: prepared.composition_plan,
      specification: {
        ...currentSpecification,
        composition_plan: prepared.composition_plan,
        shot: {
          ...currentShot,
          casting: prepared.casting,
          composition_plan: prepared.composition_plan,
          reference_pack: {
            ...(currentShot.reference_pack || {}),
            preserve: [
              ...new Set([
                ...list(currentShot.reference_pack?.preserve),
                "Exact source venue pixels outside approved cast mask",
                "Exact original logo, wordmark, signage, spelling, geometry, color, and placement",
              ]),
            ],
            may_change: [
              "Pixels inside approved cast placement mask only",
            ],
            never_change: [
              ...new Set([
                ...list(currentShot.reference_pack?.never_change),
                "Any logo, wordmark, signage text, spelling, geometry, color, or placement",
                "Any source pixel outside the approved cast placement mask",
              ]),
            ],
          },
          negative_constraints: [
            ...new Set([
              ...list(currentShot.negative_constraints),
              "No generated logo, wordmark, signage, label, lettering, or text",
              "No venue reconstruction outside the approved cast mask",
              "No undeclared people",
            ]),
          ],
        },
      },
    };

    const updated = await ProductionTaskRuntime.update(
      task.id,
      {
        status: "WAITING",
        input: nextInput,
        timing: {
          ...(task.timing || {}),
          started_at: null,
          completed_at: null,
        },
        metadata: {
          ...(task.metadata || {}),
          attempt: 0,
          provider_status: "MASKED_PLAN_READY",
          preflight_blocked: false,
          preflight_code: null,
          masked_composition_prepared: true,
          masked_composition_prepared_at:
            new Date().toISOString(),
          provider_dispatched: false,
          usage_created: false,
          wallet_reserved: false,
        },
        worker_id: null,
        lease_expires_at: null,
        error: null,
      },
      {
        organization_id,
        creative_project_id,
      },
    );

    return {
      success: true,
      prepared_only: true,
      provider_dispatched: false,
      usage_created: false,
      wallet_reserved: false,
      wallet_charged: false,
      organization_id,
      creative_project_id,
      execution_plan_id: plan.id,
      task_id: updated.id,
      scene_number: sceneNumber(step),
      shot_number: shotNumber(step),
      title: updated.title,
      reference_asset_count: referenceCount(step),
      casting: prepared.casting,
      composition_plan: prepared.composition_plan,
      status: updated.status,
      provider_status: updated.metadata?.provider_status,
      next_gate: "MASKED_MASTER_STILL_READY_FOR_EXPLICIT_GENERATION",
    };
  },
};
