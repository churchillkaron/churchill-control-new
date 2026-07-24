import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";

import {
  CreativeMasterStillPilotRepairRuntime,
} from "@/lib/creative/production/pilot/CreativeMasterStillPilotRepairRuntime";

const PREFLIGHT_BLOCKED = "CREATIVE_GENERATION_PREFLIGHT_BLOCKED";
const FULL_SCENE_MODE = "FULL_SCENE_REFERENCE_SYNTHESIS";
const CONTRACT_VERSION = "creative-full-scene-reference-synthesis-v1";

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
  const casting =
    task.input?.casting ||
    task.input?.specification?.shot?.casting ||
    null;
  const composition =
    task.input?.composition_plan ||
    task.input?.specification?.shot?.composition_plan ||
    null;
  const mode = String(composition?.mode || "").toUpperCase();
  const actors = Array.isArray(casting?.actors)
    ? casting.actors
    : [];
  const castingReady = Boolean(
    ["GENERATED_CAST", "REFERENCE_IDENTITY", "MIXED_CAST", "NO_VISIBLE_CAST"].includes(
      String(casting?.mode || "").toUpperCase(),
    ) &&
    (casting?.mode === "NO_VISIBLE_CAST" || actors.length > 0),
  );
  const bindingHash = String(
    task.input?.evidence_binding_hash ||
    task.metadata?.evidence_binding_hash ||
    "",
  );
  const contractVersion = String(
    task.metadata?.generation_contract_version ||
    task.input?.generation_contract?.version ||
    "",
  );
  const referenceIds = Array.isArray(
    task.input?.authorized_reference_asset_ids,
  )
    ? task.input.authorized_reference_asset_ids.filter(Boolean)
    : [];
  const evidenceManifest =
    task.input?.approved_evidence_role_manifest ||
    task.input?.evidence_role_manifest ||
    task.input?.specification?.evidence_role_manifest ||
    {};
  const prepared = Boolean(
    task.metadata?.composition_prepared === true &&
    task.metadata?.full_scene_synthesis_prepared === true &&
    task.metadata?.masked_composition_prepared !== true,
  );
  const ready = Boolean(
    prepared &&
    mode === FULL_SCENE_MODE &&
    castingReady &&
    bindingHash &&
    contractVersion === CONTRACT_VERSION &&
    referenceIds.length > 0 &&
    evidenceManifest.complete === true &&
    evidenceManifest.spend_authorized === true &&
    composition?.full_scene_regeneration_required === true &&
    composition?.whole_frame_color_grade_required === true &&
    composition?.whole_frame_lighting_coherence_required === true &&
    composition?.exact_pixels_outside_mask_required === false &&
    (!Array.isArray(composition?.placement_regions) ||
      composition.placement_regions.length === 0) &&
    (!Array.isArray(composition?.protected_regions) ||
      composition.protected_regions.length === 0),
  );

  return {
    casting,
    composition,
    mode,
    casting_ready: castingReady,
    evidence_binding_hash: bindingHash || null,
    generation_contract_version: contractVersion || null,
    reference_asset_count: referenceIds.length,
    evidence_manifest_complete:
      evidenceManifest.complete === true &&
      evidenceManifest.spend_authorized === true,
    is_full_scene: mode === FULL_SCENE_MODE,
    is_masked: mode !== FULL_SCENE_MODE,
    ready,
  };
}

function assertSafeRearm(task = {}) {
  const plan = preparedPlan(task);
  const reasons = [];

  if (!plan.ready) {
    reasons.push("CREATIVE_FULL_SCENE_CONTRACT_NOT_READY");
  }
  if (plan.is_masked) {
    reasons.push("CREATIVE_MASKED_COMPOSITION_DISABLED");
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
      composition_mode: plan.mode || null,
      casting_mode: plan.casting?.mode || null,
      evidence_binding_hash: plan.evidence_binding_hash,
      generation_contract_version: plan.generation_contract_version,
      reference_asset_count: plan.reference_asset_count,
      evidence_manifest_complete: plan.evidence_manifest_complete,
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
        provider_status: "FULL_SCENE_GENERATION_READY",
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
        full_scene_generation_rearmed: true,
        masked_generation_rearmed: false,
        generation_contract_version: CONTRACT_VERSION,
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
    const strictQaPassed = Boolean(
      result?.success === true &&
      result?.quality_review?.passed === true &&
      Number(result?.quality_review?.overall_score || 0) >=
        Number(result?.quality_review?.minimum_score || 90) &&
      Array.isArray(result?.quality_review?.critical_failures) &&
      result.quality_review.critical_failures.length === 0,
    );
    const generationEvidence = {
      explicit: true,
      compatibility_endpoint: "legacy-masked-name-full-scene-runtime",
      rearmed: true,
      rearmed_task_id: rearmed.task.id,
      previous_preflight_blocked: previousPreflightBlocked,
      previous_preflight_code: previousPreflightCode,
      casting_source: "APPROVED_EVIDENCE_BOUND_TASK",
      casting_mode: rearmed.plan.casting?.mode || null,
      composition_mode: rearmed.plan.mode || null,
      evidence_binding_hash: rearmed.plan.evidence_binding_hash,
      reference_asset_count: rearmed.plan.reference_asset_count,
      brand_mode:
        rearmed.task.input?.composition_plan?.brand_mode || null,
      full_scene_reference_synthesis: true,
      whole_frame_regeneration: true,
      masked_composition: false,
      strict_visual_qa_required: true,
      strict_visual_qa_passed: strictQaPassed,
      video_execution_forbidden: true,
    };

    return {
      ...result,
      success: strictQaPassed,
      next_gate: strictQaPassed
        ? "MASTER_STILL_PILOT_APPROVED"
        : result?.next_gate === "MASTER_STILL_PILOT_APPROVED"
          ? "MASTER_STILL_VISUAL_QA_REQUIRED"
          : result?.next_gate,
      creative_generation: generationEvidence,
      full_scene_generation: generationEvidence,
      masked_generation: {
        supported: false,
        reason: "FULL_SCENE_REFERENCE_SYNTHESIS_REQUIRED",
      },
    };
  },
};