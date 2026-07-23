import { createHash } from "node:crypto";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";

import {
  CreativeDirectorJobRuntime,
} from "@/lib/creative/director/runtime/CreativeDirectorJobRuntime";

import {
  CreativeProjectRuntime,
} from "@/lib/creative/projects/runtime/CreativeProjectRuntime";

import {
  CreativeAssetsRuntime,
} from "@/lib/creative/assets/runtime/CreativeAssetsRuntime";

import {
  CreativeDetailedStorySemanticRevalidationRuntimeV5,
} from "@/lib/creative/production/story/CreativeDetailedStorySemanticRevalidationRuntimeV5";

import {
  CreativeProofAuthorizationRuntime,
} from "@/lib/creative/production/approval/CreativeProofAuthorizationRuntime";

import {
  CreativeAuthorizedMasterStillPreparationRuntime,
} from "@/lib/creative/production/approval/CreativeAuthorizedMasterStillPreparationRuntime";

import {
  CreativeAuthorizedProofEvidenceAuditRuntime,
} from "@/lib/creative/production/approval/CreativeAuthorizedProofEvidenceAuditRuntime";

import {
  CreativeAuthorizedProofEvidenceBindingRuntimeV2,
} from "@/lib/creative/production/approval/CreativeAuthorizedProofEvidenceBindingRuntimeV2";

import {
  CreativeAuthorizedProofIdentityBindingRuntime,
} from "@/lib/creative/production/approval/CreativeAuthorizedProofIdentityBindingRuntime";

import {
  CreativeAuthorizedFullSceneMasterStillRuntime,
} from "@/lib/creative/production/approval/CreativeAuthorizedFullSceneMasterStillRuntime";

import {
  classifyCreativeEvidenceRoles,
  creativeEvidenceAssetId,
  isCreativeEvidenceApproved,
} from "@/lib/creative/production/contracts/CreativeEvidenceRoleContractV2";

const DIRECTOR_JOBS = "creative_director_jobs";
const RUNTIME_VERSION =
  "CREATIVE_AUTONOMOUS_FULL_SCENE_PROOF_V1";
const APPROVAL_VERSION =
  "CREATIVE_AUTONOMOUS_UNCHANGED_STORY_APPROVAL_V1";
const FULL_SCENE_BINDING_VERSION =
  "CREATIVE_AUTHORIZED_PROOF_FULL_SCENE_BINDING_V1";
const FULL_SCENE_MODE =
  "FULL_SCENE_REFERENCE_SYNTHESIS";
const PAID_CONFIRMATION =
  "GENERATE_AUTHORIZED_MASTER_STILL_PROOF";

function list(value) {
  if (!value) return [];
  return Array.isArray(value)
    ? value.filter(Boolean)
    : [value];
}

function object(value) {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value || "").trim();
}

function unique(values = []) {
  return [...new Set(values.map(String).filter(Boolean))];
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);

  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((output, key) => {
        output[key] = stableValue(value[key]);
        return output;
      }, {});
  }

  return value;
}

function stableHash(value) {
  return createHash("sha256")
    .update(JSON.stringify(stableValue(value || {})))
    .digest("hex");
}

function runtimeError(code, details = {}) {
  const error = new Error(code);
  error.code = code;
  error.details = details;
  return error;
}

function actorReferences(actor = {}) {
  return unique([
    ...list(actor.identity_reference_asset_ids),
    ...list(actor.reference_asset_ids),
    actor.identity_reference_asset_id,
    actor.reference_asset_id,
  ]);
}

function shotReferences(shot = {}) {
  return unique([
    ...list(shot.reference_asset_ids),
    ...list(shot.assets),
    ...list(shot.master_still_contract?.reference_asset_ids),
    ...list(shot.actors).flatMap(actorReferences),
    ...list(shot.casting?.actors).flatMap(actorReferences),
  ]);
}

function allStoryShots(story = {}) {
  return list(story.scenes).flatMap((scene, sceneIndex) =>
    list(scene.shots).map((shot, shotIndex) => ({
      key: `${sceneIndex + 1}:${shotIndex + 1}`,
      scene,
      shot,
      scene_number: sceneIndex + 1,
      shot_number: shotIndex + 1,
    })),
  );
}

function shotScore(candidate = {}, assetRoles = new Map()) {
  const shot = object(candidate.shot);
  const refs = shotReferences(shot);
  const roles = new Set(
    refs.flatMap((id) => list(assetRoles.get(String(id)))),
  );
  const actors = list(shot.casting?.actors).length
    ? list(shot.casting?.actors)
    : list(shot.actors);
  const source = [
    shot.title,
    shot.story_purpose,
    shot.purpose,
    shot.opening_frame,
    shot.decisive_moment,
    shot.location,
  ].filter(Boolean).join(" ").toLowerCase();
  let score = refs.length * 20;

  if (text(shot.reference_grounding).toUpperCase() ===
    "EXACT_REFERENCE_GROUNDED") score += 100;
  if (roles.has("LOCATION")) score += 80;
  if (roles.has("BRAND")) score += 55;
  if (roles.has("IDENTITY")) score += 45;
  if (roles.has("PRODUCT")) score += 25;
  if (actors.length) score += 35;
  if (text(shot.decisive_moment)) score += 20;
  if (text(shot.provider_brief).length >= 1400) score += 15;
  if (list(shot.qa_checks).length >= 12) score += 10;
  if (/entrance|arrival|arrive|enter|threshold|door|exterior|establish/.test(source)) {
    score += 20;
  }
  if (/end card|title card|logo only|black frame|closing card/.test(source)) {
    score -= 100;
  }

  return score;
}

function selectProofShot(story, assetRoles) {
  const candidates = allStoryShots(story)
    .filter((candidate) => shotReferences(candidate.shot).length)
    .map((candidate) => ({
      ...candidate,
      score: shotScore(candidate, assetRoles),
    }))
    .sort((left, right) =>
      right.score - left.score ||
      left.scene_number - right.scene_number ||
      left.shot_number - right.shot_number,
    );

  if (!candidates.length) {
    throw runtimeError(
      "CREATIVE_AUTONOMOUS_PROOF_SHOT_WITH_REFERENCES_REQUIRED",
    );
  }

  return candidates[0];
}

function mergeAssets(...groups) {
  const byId = new Map();

  for (const asset of groups.flat()) {
    const id = creativeEvidenceAssetId(asset);
    if (!id) continue;
    byId.set(String(id), {
      ...(byId.get(String(id)) || {}),
      ...asset,
      metadata: {
        ...(byId.get(String(id))?.metadata || {}),
        ...(asset.metadata || {}),
      },
      analysis: {
        ...(byId.get(String(id))?.analysis || {}),
        ...(asset.analysis || {}),
      },
    });
  }

  return [...byId.values()];
}

async function loadEvidenceAssets({
  organization_id,
  creative_project_id,
  creative_mission_id,
}) {
  const [projectAssets, missionAssets, organizationAssets] =
    await Promise.all([
      CreativeAssetsRuntime.list({
        organization_id,
        creative_project_id,
        limit: 500,
      }),
      creative_mission_id
        ? CreativeAssetsRuntime.list({
            organization_id,
            creative_mission_id,
            limit: 500,
          })
        : Promise.resolve([]),
      CreativeAssetsRuntime.list({
        organization_id,
        limit: 500,
      }),
    ]);

  return mergeAssets(
    projectAssets,
    missionAssets,
    organizationAssets,
  );
}

function assetRoleMap(assets = []) {
  return new Map(
    assets.map((asset) => [
      String(creativeEvidenceAssetId(asset)),
      classifyCreativeEvidenceRoles(asset),
    ]),
  );
}

function finalAudit(job = {}) {
  return list(job.steps).find((step) =>
    step?.step_key === "final_audit",
  ) || null;
}

async function loadCompletedDirectorStory({
  organization_id,
  creative_project_id,
  director_job_id,
}) {
  const job = await CreativeDirectorJobRuntime.get({
    job_id: director_job_id,
    organization_id,
    include_plan: true,
  });
  const audit = finalAudit(job);

  if (
    job.status !== "COMPLETED" ||
    audit?.status !== "COMPLETED" ||
    audit?.metrics?.audit?.passed !== true ||
    Number(audit?.metrics?.audit?.failure_count ?? -1) !== 0
  ) {
    throw runtimeError(
      "CREATIVE_AUTONOMOUS_DIRECTOR_FINAL_AUDIT_REQUIRED",
      {
        job_status: job.status || null,
        final_audit_status: audit?.status || null,
        final_audit_passed:
          audit?.metrics?.audit?.passed === true,
        final_failure_count:
          audit?.metrics?.audit?.failure_count ?? null,
      },
    );
  }

  const { data, error } = await supabaseAdmin
    .from(DIRECTOR_JOBS)
    .select(
      "id,organization_id,creative_project_id,creative_mission_id,status,current_plan,pipeline_result,storyboard_audit,input_snapshot",
    )
    .eq("id", director_job_id)
    .eq("organization_id", organization_id)
    .eq("creative_project_id", creative_project_id)
    .single();

  if (error) throw error;

  const story = object(data.current_plan);
  if (!list(story.scenes).length) {
    throw runtimeError(
      "CREATIVE_AUTONOMOUS_DIRECTOR_STORY_MISSING",
    );
  }

  return {
    job,
    row: data,
    story,
    final_audit: audit,
  };
}

async function buildApprovalCandidate({
  organization_id,
  creative_project_id,
  story,
}) {
  const shots = allStoryShots(story);
  const targetDuration = list(story.scenes).reduce(
    (total, scene) =>
      total + Number(scene.duration_seconds || 0),
    0,
  );
  const repairedResult = {
    success: true,
    preview_only: true,
    repair_only: true,
    preview_version: APPROVAL_VERSION,
    organization_id,
    creative_project_id,
    story,
    source_scene_count: list(story.scenes).length,
    source_shot_count: shots.length,
    validation: {
      scene_count: list(story.scenes).length,
      shot_count: shots.length,
      target_duration_seconds: targetDuration,
    },
    media_generation_dispatched: false,
    image_generation_dispatched: false,
    video_generation_dispatched: false,
    production_tasks_created: 0,
    assets_created: 0,
  };
  const finalValidation =
    await CreativeDetailedStorySemanticRevalidationRuntimeV5.run({
      organization_id,
      creative_project_id,
      repaired_result: repairedResult,
    });

  if (
    finalValidation.success !== true ||
    Number(
      finalValidation.revalidation?.failed_shot_count || 0,
    ) !== 0 ||
    list(
      finalValidation.revalidation?.failed_shot_keys,
    ).length
  ) {
    throw runtimeError(
      "CREATIVE_AUTONOMOUS_STORY_FINAL_REVALIDATION_FAILED",
      finalValidation.revalidation || {},
    );
  }

  const approvalCandidateHash = stableHash(story);

  return {
    ...repairedResult,
    success: true,
    human_normalization: {
      version: APPROVAL_VERSION,
      mode: "UNCHANGED_AUTONOMOUS_STORY_AFTER_FINAL_VALIDATION",
      target_keys: [],
      target_count: 0,
      preserved_shot_count: shots.length,
      preserved_shot_keys: shots.map((shot) => shot.key),
      validation_passed: true,
      approval_candidate_hash: approvalCandidateHash,
    },
    final_revalidation: finalValidation,
    next_gate: "DETAILED_STORY_HUMAN_APPROVAL_REQUIRED",
  };
}

function approvedInventoryAssets(audit = {}, role) {
  return list(audit.evidence_role_inventory?.[role])
    .filter((asset) =>
      asset.approved === true &&
      asset.has_delivery_url === true &&
      asset.ai_generated !== true,
    )
    .sort((left, right) =>
      Number(right.authorized_for_proof === true) -
      Number(left.authorized_for_proof === true),
    );
}

function automaticRoleBindings(audit = {}) {
  const location = approvedInventoryAssets(audit, "LOCATION")[0];
  const brand = approvedInventoryAssets(audit, "BRAND")[0];
  const blockers = [];

  if (!location) blockers.push("APPROVED_LOCATION_EVIDENCE_REQUIRED");
  if (!brand) blockers.push("APPROVED_BRAND_EVIDENCE_REQUIRED");

  if (blockers.length) {
    throw runtimeError(
      "CREATIVE_AUTONOMOUS_EVIDENCE_BINDING_BLOCKED",
      {
        blockers,
        available_roles: Object.fromEntries(
          Object.entries(
            audit.evidence_role_inventory || {},
          ).map(([role, assets]) => [
            role,
            list(assets).length,
          ]),
        ),
      },
    );
  }

  return [
    {
      role: "LOCATION",
      asset_ids: [location.id],
      exact_fidelity_required: true,
      authoritative_source_required: true,
    },
    {
      role: "BRAND",
      asset_ids: [brand.id],
      exact_fidelity_required: true,
      authoritative_source_required: false,
    },
  ];
}

function actorRole(actor = {}, index = 0) {
  return text(
    actor.role ||
    actor.narrative_role ||
    actor.character ||
    actor.name ||
    actor.description,
  ) || `Visible subject ${index + 1}`;
}

function actorAction(actor = {}, shot = {}) {
  return text(
    actor.action ||
    actor.performance ||
    actor.blocking ||
    shot.decisive_moment ||
    shot.foreground_action ||
    shot.story_purpose,
  );
}

function actorPlacement(actor = {}, shot = {}) {
  return text(
    actor.placement ||
    actor.position ||
    actor.start_position ||
    actor.screen_position ||
    shot.screen_direction ||
    shot.opening_frame,
  );
}

function automaticCastBindings({
  selected,
  audit,
}) {
  const approvedIdentityIds = new Set(
    approvedInventoryAssets(audit, "IDENTITY")
      .map((asset) => String(asset.id)),
  );
  const actors = list(selected.shot.casting?.actors).length
    ? list(selected.shot.casting?.actors)
    : list(selected.shot.actors).length
      ? list(selected.shot.actors)
      : list(selected.scene.actors);
  const identityBindings = [];
  const generatedGroups = [];

  actors.forEach((actor, index) => {
    const count = Math.max(1, Number(actor.count || 1));
    const explicitIds = actorReferences(actor)
      .filter((id) => approvedIdentityIds.has(String(id)));
    const common = {
      binding_key:
        text(actor.binding_key || actor.evidence_binding_key) ||
        `autonomous-cast-${index + 1}`,
      narrative_role: actorRole(actor, index),
      count,
      action: actorAction(actor, selected.shot),
      placement: actorPlacement(actor, selected.shot),
      wardrobe_brief: text(
        actor.wardrobe ||
        actor.clothing ||
        actor.costume ||
        actor.outfit,
      ),
    };

    if (
      explicitIds.length === count &&
      common.action &&
      common.placement
    ) {
      identityBindings.push({
        ...common,
        asset_ids: explicitIds,
      });
      return;
    }

    if (common.action && common.placement) {
      generatedGroups.push(common);
    }
  });

  return {
    identity_bindings: identityBindings,
    generated_cast_groups: generatedGroups,
  };
}

function fullSceneCompositionPlan(binding = {}) {
  const manifest = object(binding.evidence_role_manifest);
  const locationBinding = list(binding.role_bindings)
    .find((item) =>
      text(item.role).toUpperCase() === "LOCATION",
    );

  return {
    mode: FULL_SCENE_MODE,
    source_plate_asset_id:
      manifest.authoritative_source_asset_id ||
      list(locationBinding?.asset_ids)[0] ||
      null,
    brand_mode:
      "REFERENCE_GROUNDED_WITH_EXACT_POST_OVERLAY",
    full_scene_regeneration_required: true,
    whole_frame_color_grade_required: true,
    whole_frame_lighting_coherence_required: true,
    coherent_depth_and_perspective_required: true,
    camera_recomposition_allowed: true,
    exact_pixels_outside_mask_required: false,
    placement_regions: [],
    protected_regions: [],
    generated_text_allowed: false,
    logo_redraw_allowed: false,
    exact_brand_overlay_required: true,
  };
}

async function normalizeStoredBindingToFullScene({
  organization_id,
  creative_project_id,
}) {
  const project = await CreativeProjectRuntime.get(
    creative_project_id,
  );

  if (
    !project ||
    String(project.organization_id || "") !==
      String(organization_id)
  ) {
    throw runtimeError("CREATIVE_PROJECT_NOT_IN_ORGANIZATION");
  }

  const stored = object(
    project.metadata?.authorized_proof_evidence_binding,
  );
  const compositionPlan = fullSceneCompositionPlan(stored);

  if (!text(stored.binding_hash)) {
    throw runtimeError(
      "CREATIVE_STORED_EVIDENCE_BINDING_REQUIRED",
    );
  }
  if (!compositionPlan.source_plate_asset_id) {
    throw runtimeError(
      "CREATIVE_FULL_SCENE_SOURCE_PLATE_REQUIRED",
    );
  }

  const scene = {
    ...object(stored.scene),
    composition_plan: compositionPlan,
  };
  const shot = {
    ...object(stored.shot),
    composition_plan: compositionPlan,
    reference_pack: {
      ...object(stored.shot?.reference_pack),
      preserve: unique([
        ...list(stored.shot?.reference_pack?.preserve),
        "Recognizable factual location geometry and spatial relationships",
        "Declared exact identities and approved brand evidence",
      ]),
      may_change: unique([
        ...list(stored.shot?.reference_pack?.may_change),
        "Complete camera viewpoint, lens, framing and depth composition",
        "Complete cinematic lighting, exposure, atmosphere and color grade",
        "Human pose, expression and blocking required by the approved shot",
      ]),
      never_change: unique([
        ...list(stored.shot?.reference_pack?.never_change),
        "Referenced identity",
        "Core location architecture",
        "Declared cast count, role ownership and action direction",
        "Approved logo, wordmark, product and factual brand identity",
      ]),
    },
  };
  const payload = {
    ...stored,
    version: FULL_SCENE_BINDING_VERSION,
    supersedes_binding_hash: stored.binding_hash,
    composition_plan: compositionPlan,
    full_scene_only: true,
    masked_composition_allowed: false,
    scene,
    shot,
  };

  delete payload.binding_hash;
  delete payload.bound_at;

  const bindingHash = stableHash(payload);
  const finalBinding = {
    ...payload,
    binding_hash: bindingHash,
    bound_at: new Date().toISOString(),
  };

  await CreativeProjectRuntime.update(creative_project_id, {
    metadata: {
      ...(project.metadata || {}),
      authorized_proof_evidence_binding: finalBinding,
    },
  });

  return finalBinding;
}

export const CreativeAutonomousFullSceneProofRuntime = {
  async run({
    organization_id,
    creative_project_id,
    director_job_id,
    human_approved = false,
    execute_paid_master_still = false,
  } = {}) {
    if (!organization_id) {
      throw runtimeError("organization_id required");
    }
    if (!creative_project_id) {
      throw runtimeError("creative_project_id required");
    }
    if (!director_job_id) {
      throw runtimeError("director_job_id required");
    }
    if (human_approved !== true) {
      throw runtimeError(
        "CREATIVE_AUTONOMOUS_PROOF_EXPLICIT_APPROVAL_REQUIRED",
      );
    }

    const project = await CreativeProjectRuntime.get(
      creative_project_id,
    );

    if (
      !project ||
      String(project.organization_id || "") !==
        String(organization_id)
    ) {
      throw runtimeError("CREATIVE_PROJECT_NOT_IN_ORGANIZATION");
    }

    const director = await loadCompletedDirectorStory({
      organization_id,
      creative_project_id,
      director_job_id,
    });
    const assets = await loadEvidenceAssets({
      organization_id,
      creative_project_id,
      creative_mission_id:
        project.creative_mission_id || null,
    });
    const roles = assetRoleMap(assets);
    const approvalCandidate = await buildApprovalCandidate({
      organization_id,
      creative_project_id,
      story: director.story,
    });
    const selected = selectProofShot(
      approvalCandidate.story,
      roles,
    );
    const proofAuthorization =
      await CreativeProofAuthorizationRuntime.issue({
        organization_id,
        creative_project_id,
        approval_candidate: approvalCandidate,
        approval_candidate_hash:
          approvalCandidate.human_normalization
            .approval_candidate_hash,
        proof_shot_key: selected.key,
        human_approved: true,
      });
    const authorizedPreparation =
      await CreativeAuthorizedMasterStillPreparationRuntime.prepare({
        organization_id,
        creative_project_id,
        approval_candidate: approvalCandidate,
        proof_authorization: proofAuthorization,
      });
    const evidenceAudit =
      await CreativeAuthorizedProofEvidenceAuditRuntime.audit({
        organization_id,
        creative_project_id,
        approval_candidate: approvalCandidate,
        proof_authorization: proofAuthorization,
        authorized_preparation: authorizedPreparation,
      });
    const roleBindings = automaticRoleBindings(evidenceAudit);
    const evidenceBinding =
      await CreativeAuthorizedProofEvidenceBindingRuntimeV2.bind({
        organization_id,
        creative_project_id,
        approval_candidate: approvalCandidate,
        proof_authorization: proofAuthorization,
        authorized_preparation: authorizedPreparation,
        evidence_audit: evidenceAudit,
        role_bindings: roleBindings,
      });
    const castBindings = automaticCastBindings({
      selected,
      audit: evidenceAudit,
    });
    let identityBinding = null;

    if (castBindings.identity_bindings.length) {
      identityBinding =
        await CreativeAuthorizedProofIdentityBindingRuntime.bind({
          organization_id,
          creative_project_id,
          approval_candidate: approvalCandidate,
          proof_authorization: proofAuthorization,
          authorized_preparation: authorizedPreparation,
          evidence_audit: evidenceAudit,
          previous_binding: evidenceBinding,
          identity_bindings:
            castBindings.identity_bindings,
          generated_cast_groups:
            castBindings.generated_cast_groups,
        });
    }

    const finalBinding =
      await normalizeStoredBindingToFullScene({
        organization_id,
        creative_project_id,
      });
    const common = {
      organization_id,
      creative_project_id,
      approval_candidate: approvalCandidate,
      proof_authorization: proofAuthorization,
      authorized_preparation: authorizedPreparation,
    };
    const fullScenePreflight =
      await CreativeAuthorizedFullSceneMasterStillRuntime.prepare(
        common,
      );
    let paidExecution = null;

    if (execute_paid_master_still === true) {
      paidExecution =
        await CreativeAuthorizedFullSceneMasterStillRuntime.run({
          ...common,
          explicit_confirmation: PAID_CONFIRMATION,
          accept_paid_execution: true,
        });
    }

    return {
      success: paidExecution
        ? paidExecution.success === true
        : fullScenePreflight.success === true,
      runtime_version: RUNTIME_VERSION,
      organization_id,
      creative_project_id,
      creative_mission_id:
        project.creative_mission_id || null,
      director_job_id,
      autonomous_story_created: true,
      director_final_audit_passed: true,
      story_scene_count:
        list(approvalCandidate.story.scenes).length,
      story_shot_count:
        allStoryShots(approvalCandidate.story).length,
      approval_candidate_hash:
        approvalCandidate.human_normalization
          .approval_candidate_hash,
      selected_proof_shot: {
        key: selected.key,
        scene_number: selected.scene_number,
        shot_number: selected.shot_number,
        title: selected.shot.title || null,
        score: selected.score,
        reference_asset_ids:
          shotReferences(selected.shot),
      },
      proof_authorization: proofAuthorization,
      authorized_preparation: authorizedPreparation,
      evidence_audit: evidenceAudit,
      evidence_binding: evidenceBinding,
      identity_binding: identityBinding,
      final_full_scene_binding: {
        version: finalBinding.version,
        binding_hash: finalBinding.binding_hash,
        supersedes_binding_hash:
          finalBinding.supersedes_binding_hash,
        composition_plan: finalBinding.composition_plan,
        cast_mode: finalBinding.cast_mode ||
          finalBinding.shot?.casting?.mode || null,
      },
      full_scene_preflight: fullScenePreflight,
      paid_execution: paidExecution,
      paid_execution_started:
        execute_paid_master_still === true,
      image_generation_limit: 1,
      video_generation_allowed: false,
      next_gate: paidExecution
        ? paidExecution.next_gate
        : fullScenePreflight.next_gate,
    };
  },
};