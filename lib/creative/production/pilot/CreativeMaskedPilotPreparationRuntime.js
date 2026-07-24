import {
  CreativeProjectRuntime,
} from "@/lib/creative/projects/runtime/CreativeProjectRuntime";

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
const MASTER_STILL_QA = "MASTER_STILL_QA";
const FULL_SCENE_MODE = "FULL_SCENE_REFERENCE_SYNTHESIS";

function list(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value || "").trim();
}

function unique(values = []) {
  return [...new Set(values.map(String).filter(Boolean))];
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
  return String(
    step.metadata?.deliverable ||
    step.intent?.deliverable ||
    "",
  ).toUpperCase();
}

function findPair(plan, requestedScene, requestedShot) {
  const master = list(plan.steps).find((candidate) => (
    deliverable(candidate) === MASTER_STILL &&
    sceneNumber(candidate) === Number(requestedScene) &&
    shotNumber(candidate) === Number(requestedShot)
  ));

  if (!master) {
    throw new Error(
      `MASTER_STILL_STEP_NOT_FOUND_FOR_SCENE_${requestedScene}_SHOT_${requestedShot}`,
    );
  }

  const qa = list(plan.steps).find((candidate) => (
    deliverable(candidate) === MASTER_STILL_QA &&
    (
      candidate.metadata?.inspected_node_id === master.node_id ||
      candidate.input?.inspected_node_id === master.node_id ||
      list(candidate.depends_on).includes(master.id)
    )
  ));

  if (!qa) {
    throw new Error(
      `MASTER_STILL_QA_STEP_NOT_FOUND_FOR_SCENE_${requestedScene}_SHOT_${requestedShot}`,
    );
  }

  return { master, qa };
}

function hasOutput(task = {}) {
  return Boolean(
    task.output?.image_url ||
    task.output?.url ||
    task.output?.asset_id ||
    task.output?.asset?.url ||
    task.output?.result,
  );
}

function assertRewritable(task = {}, role) {
  const reasons = [];

  if (hasOutput(task)) reasons.push("TASK_ALREADY_HAS_OUTPUT");
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
  if (!["WAITING", "READY", "FAILED"].includes(String(task.status || ""))) {
    reasons.push(`TASK_STATUS_${String(task.status || "UNKNOWN")}_NOT_REWRITABLE`);
  }

  if (reasons.length) {
    const error = new Error("CREATIVE_FULL_SCENE_TASK_REWRITE_BLOCKED");
    error.code = reasons[0];
    error.details = {
      task_role: role,
      task_id: task.id,
      status: task.status,
      reasons,
    };
    throw error;
  }
}

function normalizeActor(value = {}, index = 0) {
  const referenceIds = unique([
    ...list(value.identity_reference_asset_ids),
    ...list(value.reference_asset_ids),
  ]);
  const count = Math.max(1, Number(value.count || 1));
  const normalized = {
    binding_key:
      text(value.binding_key || value.evidence_binding_key) ||
      `cast-${index + 1}`,
    role: text(value.role || value.narrative_role),
    count,
    identity_mode: String(
      value.identity_mode ||
      (referenceIds.length ? "REFERENCE_IDENTITY" : "GENERATED_CAST"),
    ).toUpperCase(),
    identity_reference_asset_ids: referenceIds,
    wardrobe: text(value.wardrobe),
    action: text(value.action),
    placement: text(value.placement),
  };
  const missing = [];

  if (!normalized.role) missing.push("role");
  if (!normalized.action) missing.push("action");
  if (!normalized.placement) missing.push("placement");
  if (!normalized.wardrobe) missing.push("wardrobe");
  if (!["GENERATED_CAST", "REFERENCE_IDENTITY"].includes(
    normalized.identity_mode,
  )) {
    missing.push("identity_mode");
  }
  if (
    normalized.identity_mode === "REFERENCE_IDENTITY" &&
    normalized.identity_reference_asset_ids.length !== count
  ) {
    missing.push("one_identity_reference_per_subject");
  }

  if (missing.length) {
    const error = new Error(
      `CREATIVE_FULL_SCENE_CAST_ACTOR_${index + 1}_INCOMPLETE`,
    );
    error.code = error.message;
    error.details = {
      binding_key: normalized.binding_key,
      missing,
    };
    throw error;
  }

  return normalized;
}

function approvedBinding(project = {}, masterTask = {}) {
  const binding = object(
    project.metadata?.authorized_proof_evidence_binding,
  );
  const manifest = object(binding.evidence_role_manifest);

  if (!text(binding.binding_hash)) {
    throw new Error("CREATIVE_APPROVED_EVIDENCE_BINDING_REQUIRED");
  }
  if (!binding.scene || !binding.shot) {
    throw new Error("CREATIVE_APPROVED_BOUND_SCENE_AND_SHOT_REQUIRED");
  }
  if (
    manifest.complete !== true ||
    manifest.spend_authorized !== true
  ) {
    const error = new Error("CREATIVE_APPROVED_EVIDENCE_MANIFEST_INCOMPLETE");
    error.details = manifest;
    throw error;
  }

  const taskAuthorization = text(
    masterTask.metadata?.proof_authorization_hash,
  );
  const bindingAuthorization = text(binding.proof_authorization_hash);

  if (
    taskAuthorization &&
    bindingAuthorization &&
    taskAuthorization !== bindingAuthorization
  ) {
    throw new Error("CREATIVE_EVIDENCE_BINDING_AUTHORIZATION_MISMATCH");
  }

  return binding;
}

function boundActors(binding = {}) {
  const source =
    binding.shot?.casting?.actors ||
    binding.scene?.casting?.actors ||
    binding.shot?.actors ||
    binding.scene?.actors ||
    [];

  return list(source).map(normalizeActor);
}

function boundAssetIds(binding = {}) {
  return unique([
    ...list(binding.shot?.reference_asset_ids),
    ...list(binding.shot?.assets),
    ...list(binding.evidence_role_manifest?.all_selected_asset_ids),
    ...list(binding.role_bindings).flatMap((item) => list(item.asset_ids)),
    ...list(binding.identity_bindings).flatMap((item) =>
      list(item.identity_reference_asset_ids),
    ),
  ]);
}

function assertFullSceneRequest(generationPlan = {}) {
  const requestedMode = String(
    generationPlan.composition_plan?.mode ||
    FULL_SCENE_MODE,
  ).toUpperCase();
  const hasMaskData = Boolean(
    list(generationPlan.composition_plan?.placement_regions).length ||
    list(generationPlan.composition_plan?.protected_regions).length ||
    generationPlan.composition_plan?.exact_pixels_outside_mask_required === true,
  );

  if (requestedMode !== FULL_SCENE_MODE || hasMaskData) {
    const error = new Error(
      "CREATIVE_MASKED_COMPOSITION_DISABLED_USE_FULL_SCENE_SYNTHESIS",
    );
    error.code = error.message;
    error.details = {
      requested_mode: requestedMode,
      full_scene_mode: FULL_SCENE_MODE,
    };
    throw error;
  }
}

function buildFullSceneContract(binding = {}, generationPlan = {}) {
  const actors = boundActors(binding);
  const assetIds = boundAssetIds(binding);
  const manifest = object(binding.evidence_role_manifest);
  const sourcePlateAssetId =
    manifest.authoritative_source_asset_id ||
    generationPlan.composition_plan?.source_plate_asset_id ||
    assetIds[0] ||
    null;

  if (!assetIds.length) {
    throw new Error("CREATIVE_FULL_SCENE_REFERENCE_ASSETS_REQUIRED");
  }
  if (!sourcePlateAssetId) {
    throw new Error("CREATIVE_FULL_SCENE_SOURCE_PLATE_REQUIRED");
  }

  const castingMode = actors.some(
    (item) => item.identity_mode === "REFERENCE_IDENTITY",
  )
    ? actors.some((item) => item.identity_mode === "GENERATED_CAST")
      ? "MIXED_CAST"
      : "REFERENCE_IDENTITY"
    : actors.length
      ? "GENERATED_CAST"
      : "NO_VISIBLE_CAST";

  return {
    asset_ids: assetIds,
    casting: {
      mode: castingMode,
      actors,
      exact_identity_required: actors.some(
        (item) => item.identity_mode === "REFERENCE_IDENTITY",
      ),
    },
    composition_plan: {
      mode: FULL_SCENE_MODE,
      source_plate_asset_id: sourcePlateAssetId,
      brand_mode: "REFERENCE_GROUNDED_WITH_EXACT_POST_OVERLAY",
      full_scene_regeneration_required: true,
      whole_frame_color_grade_required: true,
      whole_frame_lighting_coherence_required: true,
      camera_recomposition_allowed: true,
      coherent_depth_and_perspective_required: true,
      exact_pixels_outside_mask_required: false,
      placement_regions: [],
      protected_regions: [],
      generated_text_allowed: false,
      logo_redraw_allowed: false,
      exact_brand_overlay_required: true,
    },
    evidence_manifest: manifest,
  };
}

function mergedReferencePack(shot = {}) {
  const referencePack = object(shot.reference_pack);

  return {
    ...referencePack,
    preserve: [
      ...new Set([
        ...list(referencePack.preserve),
        "Recognizable real location geometry, proportions, materials, entrance structure and spatial relationships",
        "Exact referenced identities, human proportions and distinguishing facial characteristics",
        "Declared cast count, narrative roles, wardrobe responsibilities, placement, gaze and physical action",
        "Approved products, brand colors and factual visual details supported by references",
      ]),
    ],
    may_change: [
      ...new Set([
        ...list(referencePack.may_change),
        "The complete camera viewpoint, lens choice and framing when required by the approved shot",
        "The complete lighting design, atmosphere, exposure, contrast and cinematic color grade",
        "Human pose, expression and blocking required by the approved story action",
        "Background detail only when reference-supported and physically plausible",
      ]),
    ],
    never_change: [
      ...new Set([
        ...list(referencePack.never_change),
        "Referenced person identity",
        "Core location architecture and recognizable entrance geometry",
        "Declared cast count, role ownership, travel direction and interaction target",
        "Approved logo, wordmark, signage spelling, product geometry and factual brand identity",
      ]),
    ],
  };
}

function fullSceneSpecification({
  currentSpecification,
  binding,
  contract,
}) {
  const boundScene = object(binding.scene);
  const boundShot = object(binding.shot);
  const currentShot = object(currentSpecification.shot);
  const shot = {
    ...currentShot,
    ...boundShot,
    actors: contract.casting.actors,
    casting: contract.casting,
    composition_plan: contract.composition_plan,
    reference_asset_ids: contract.asset_ids,
    assets: contract.asset_ids,
    evidence_role_manifest: contract.evidence_manifest,
    reference_pack: mergedReferencePack({
      ...currentShot,
      ...boundShot,
    }),
    negative_constraints: [
      ...new Set([
        ...list(currentShot.negative_constraints),
        ...list(boundShot.negative_constraints),
        "No collage, pasted figures, rectangular inserts, cutout edges or disconnected local color grades",
        "No cropped bodies, floating feet, missing heads, merged people, duplicated people or disconnected shadows",
        "No generated logo, wordmark, signage, label, lettering or readable brand text",
        "No generic replacement location, invented architecture or reversed entrance orientation",
        "No undeclared people, role swapping, identity sharing or staff-customer ambiguity",
        "No artificial AI-film look, waxy skin, synthetic light, game-render appearance or inconsistent depth",
      ]),
    ],
  };

  return {
    ...currentSpecification,
    scene: {
      ...object(currentSpecification.scene),
      ...boundScene,
      actors: contract.casting.actors,
      casting: contract.casting,
      evidence_role_manifest: contract.evidence_manifest,
    },
    shot,
    composition_plan: contract.composition_plan,
    evidence_role_manifest: contract.evidence_manifest,
    approved_evidence_binding_hash: binding.binding_hash,
  };
}

function resetTask(task = {}, values = {}) {
  return {
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
    worker_id: null,
    lease_expires_at: null,
    error: null,
    ...values,
  };
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

    assertFullSceneRequest(generation_plan || {});

    const [project, plans] = await Promise.all([
      CreativeProjectRuntime.get(creative_project_id),
      ExecutionRuntime.list({
        organization_id,
        creative_project_id,
      }),
    ]);

    if (
      !project ||
      String(project.organization_id || "") !== String(organization_id)
    ) {
      throw new Error("CREATIVE_PROJECT_NOT_IN_ORGANIZATION");
    }

    const plan = plans[0] || null;
    if (!plan) {
      throw new Error("CREATIVE_EXECUTION_PLAN_REQUIRED");
    }

    const pair = findPair(
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
    const scope = { organization_id, creative_project_id };
    const masterTaskId = identityMap.get(pair.master.id);
    const qaTaskId = identityMap.get(pair.qa.id);
    const [masterTask, qaTask] = await Promise.all([
      ProductionTaskRuntime.get(masterTaskId, scope),
      ProductionTaskRuntime.get(qaTaskId, scope),
    ]);

    if (!masterTask || !qaTask) {
      throw new Error(
        "CREATIVE_MASTER_STILL_AND_QA_TASKS_MUST_BE_MATERIALIZED_FIRST",
      );
    }

    assertRewritable(masterTask, MASTER_STILL);
    assertRewritable(qaTask, MASTER_STILL_QA);

    const binding = approvedBinding(project, masterTask);
    const contract = buildFullSceneContract(
      binding,
      generation_plan || {},
    );
    const nextSpecification = fullSceneSpecification({
      currentSpecification: masterTask.input?.specification || {},
      binding,
      contract,
    });
    const generationContract = {
      version: "creative-full-scene-reference-synthesis-v1",
      mode: FULL_SCENE_MODE,
      evidence_binding_hash: binding.binding_hash,
      proof_authorization_hash: binding.proof_authorization_hash || null,
      approved_evidence_role_manifest: contract.evidence_manifest,
      source_plate: {
        authoritative_asset_id:
          contract.composition_plan.source_plate_asset_id,
      },
      generation: {
        mode: FULL_SCENE_MODE,
        whole_frame_regeneration: true,
        masked_editing: false,
      },
    };
    const commonInput = {
      reference_assets: contract.asset_ids,
      assets: contract.asset_ids,
      authorized_reference_asset_ids: contract.asset_ids,
      approved_evidence_role_manifest: contract.evidence_manifest,
      evidence_binding_hash: binding.binding_hash,
      generation_contract: generationContract,
      casting: contract.casting,
      composition_plan: contract.composition_plan,
      specification: nextSpecification,
    };
    const commonMetadata = {
      evidence_binding_hash: binding.binding_hash,
      proof_authorization_hash:
        binding.proof_authorization_hash ||
        masterTask.metadata?.proof_authorization_hash ||
        null,
      full_scene_synthesis_prepared: true,
      masked_composition_prepared: false,
      composition_prepared: true,
      composition_prepared_at: new Date().toISOString(),
      provider_dispatched: false,
      usage_created: false,
      wallet_reserved: false,
      wallet_charged: false,
      generation_contract_version:
        "creative-full-scene-reference-synthesis-v1",
    };

    const [updatedMaster, updatedQa] = await Promise.all([
      ProductionTaskRuntime.update(
        masterTask.id,
        resetTask(masterTask, {
          input: {
            ...(masterTask.input || {}),
            ...commonInput,
            mode: "reference_grounded_full_scene_synthesis",
          },
          metadata: {
            ...(masterTask.metadata || {}),
            ...commonMetadata,
            attempt: 0,
            provider_status: "FULL_SCENE_CONTRACT_READY",
          },
        }),
        scope,
      ),
      ProductionTaskRuntime.update(
        qaTask.id,
        resetTask(qaTask, {
          input: {
            ...(qaTask.input || {}),
            ...commonInput,
            mode: "creative_master_still_qa",
            inspected_node_id:
              qaTask.input?.inspected_node_id || pair.master.node_id,
          },
          metadata: {
            ...(qaTask.metadata || {}),
            ...commonMetadata,
            attempt: 0,
            provider_status: "FULL_SCENE_QA_CONTRACT_READY",
          },
        }),
        scope,
      ),
    ]);

    return {
      success: true,
      prepared_only: true,
      compatibility_endpoint: "legacy-masked-name-full-scene-runtime",
      full_scene_only: true,
      masked_composition_allowed: false,
      provider_dispatched: false,
      usage_created: false,
      wallet_reserved: false,
      wallet_charged: false,
      organization_id,
      creative_project_id,
      execution_plan_id: plan.id,
      task_id: updatedMaster.id,
      qa_task_id: updatedQa.id,
      scene_number: sceneNumber(pair.master),
      shot_number: shotNumber(pair.master),
      title: updatedMaster.title,
      reference_asset_count: contract.asset_ids.length,
      evidence_binding_hash: binding.binding_hash,
      casting: contract.casting,
      composition_plan: contract.composition_plan,
      status: updatedMaster.status,
      provider_status: updatedMaster.metadata?.provider_status,
      next_gate: "FULL_SCENE_MASTER_STILL_READY_FOR_EXPLICIT_GENERATION",
    };
  },
};