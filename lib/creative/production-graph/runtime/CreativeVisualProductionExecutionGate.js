import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import {
  CreativeAssetGraphRuntime,
} from "@/lib/creative/assets/graph/runtime/CreativeAssetGraphRuntime";
import {
  CreativeImageAssetHandoffRuntime,
} from "@/lib/creative/image/runtime/CreativeImageAssetHandoffRuntime";
import {
  CreativeImageAssetMultiViewHandoffRuntime,
} from "@/lib/creative/image/runtime/CreativeImageAssetMultiViewHandoffRuntime";
import {
  CreativeImageCameraAuthorityRuntime,
} from "@/lib/creative/image/runtime/CreativeImageCameraAuthorityRuntime";
import {
  CreativeImageMaterialTruthPackRuntime,
} from "@/lib/creative/image/runtime/CreativeImageMaterialTruthPackRuntime";
import {
  CreativeImagePrevisualizationAuthorityRuntime,
} from "@/lib/creative/image/runtime/CreativeImagePrevisualizationAuthorityRuntime";
import {
  CreativeImageProductionPackageRuntime,
} from "@/lib/creative/image/runtime/CreativeImageProductionPackageRuntime";
import {
  CreativeImageShotReadyRuntime,
} from "@/lib/creative/image/runtime/CreativeImageShotReadyRuntime";
import {
  CreativeImageProviderReferenceCompilerRuntime,
} from "@/lib/creative/image/runtime/CreativeImageProviderReferenceCompilerRuntime";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.visual-production-execution-gate.v1",
);

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function outputValue(output = {}) {
  return output?.output?.output || output?.output || output || {};
}

function outputUrl(output = {}) {
  const value = outputValue(output);
  return value.image_url ||
    value.imageUrl ||
    value.file_url ||
    value.fileUrl ||
    value.url ||
    value.result?.url ||
    value.images?.[0]?.url ||
    value.files?.[0]?.url ||
    null;
}

function derivedFrameRequired(task = {}) {
  return task.input?.requirements?.visual_derived_frame_required === true ||
    task.input?.generation?.provider_parameters?.visual_derived_frame_required === true ||
    task.input?.provider_parameters?.visual_derived_frame_required === true ||
    Boolean(text(task.metadata?.visual_derived_frame_node_id));
}

function imageStudioAuthorityRequired(task = {}) {
  const strategy = object(
    task.input?.requirements?.generation_strategy ||
    task.input?.generation?.generation_strategy ||
    task.metadata?.generation_strategy,
  );
  const capability = text(task.capability || task.service_code || task.service_id).toLowerCase();
  return [
    "ai.video.generate",
    "ai.video.image_to_video",
    "ai.video.first_last_frame_to_video",
  ].includes(capability);
}

function humanSubjectExpected(task = {}) {
  const requirements = object(task.input?.requirements);
  const source = [
    requirements.subject,
    requirements.action,
    requirements.purpose,
    task.input?.subject,
    task.input?.action,
    task.input?.purpose,
    JSON.stringify(requirements.actors || []),
  ].map((value) => text(value)).join(" ").toLowerCase();
  return Array.isArray(requirements.actors) && requirements.actors.length > 0 ||
    /\b(man|woman|person|human|runner|performer|actor|face|hand|feet)\b/.test(source);
}

function threatIdentityKey(task = {}) {
  const requirements = object(task.input?.requirements);
  const moving = object(requirements.environmental_continuity_state?.moving_threat_state);
  const pursuit = object(requirements.pursuit_spatial_choreography);
  return text(
    requirements.threat_identity_key ||
    moving.identity_key ||
    moving.threat_identity_key ||
    moving.threat_id ||
    moving.vehicle_id ||
    moving.id ||
    pursuit.threat_identity_key ||
    pursuit.threat_id ||
    pursuit.predator_id ||
    task.metadata?.threat_identity_key,
  ) || null;
}

function threatSubjectExpected(task = {}) {
  const requirements = object(task.input?.requirements);
  const source = [
    requirements.subject,
    requirements.action,
    requirements.purpose,
    JSON.stringify(requirements.pursuit_spatial_choreography || {}),
  ].map((value) => text(value)).join(" ").toLowerCase();
  return /\b(drone|threat|pursu|hunt|predator|search beam)\b/.test(source);
}

function materialTruthExpected(task = {}) {
  const requirements = object(task.input?.requirements);
  const source = [
    requirements.subject,
    requirements.action,
    requirements.purpose,
    JSON.stringify(requirements.production_design || {}),
    JSON.stringify(requirements.environmental_continuity_state || {}),
    JSON.stringify(requirements.lighting || {}),
    JSON.stringify(requirements.pursuit_spatial_choreography || {}),
  ].map((value) => text(value)).join(" ").toLowerCase();
  return /rain|wet|storm|mist|fog|water|skin|fabric|bark|forest|tree|wood|mud|ground|soil|drone|threat|metal|glass|window|search.?light|beam|spotlight/.test(source);
}

function identityControlled(task = {}) {
  return task.input?.requirements?.identity_keyframe_required === true ||
    task.input?.generation?.provider_parameters?.identity_keyframe_required === true ||
    task.input?.provider_parameters?.identity_keyframe_required === true ||
    Boolean(text(task.metadata?.identity_keyframe_review_node_id));
}

async function dependencyTasks(task = {}) {
  const dependencies = [];
  for (const id of list(task.depends_on)) {
    const dependency = await ProductionTaskRuntime.get(id);
    if (dependency) dependencies.push(dependency);
  }
  return dependencies;
}

function executionNodeId(task = {}) {
  return text(
    task.metadata?.execution_node_id ||
    task.input?.node_id,
  );
}

async function bindApprovedImageStudioAuthority(task = {}) {
  if (!imageStudioAuthorityRequired(task)) return task;
  const strategy = object(
    task.input?.requirements?.generation_strategy ||
    task.input?.generation?.generation_strategy ||
    task.metadata?.generation_strategy,
  );
  const continuityGroupId = text(
    strategy.shared_state_group_id ||
    task.input?.requirements?.continuity_group_id ||
    task.scene_id ||
    task.metadata?.scene_id,
  );
  if (!continuityGroupId) {
    throw new Error("IMAGE_STUDIO_CONTINUITY_GROUP_REQUIRED");
  }
  const nodes = await CreativeAssetGraphRuntime.list({
    organization_id: task.organization_id,
    creative_project_id: task.creative_project_id,
  });
  const previsualizationAuthority = CreativeImagePrevisualizationAuthorityRuntime.evaluate({
    task,
    asset_nodes: nodes,
  });
  if (previsualizationAuthority.passed !== true) {
    throw new Error(
      `IMAGE_STUDIO_PREVIS_AUTHORITY_BLOCKED:${previsualizationAuthority.failures.join(",")}`,
    );
  }
  const imageProductionPackage = CreativeImageProductionPackageRuntime.build({
    task,
    asset_nodes: nodes,
    previsualization_authority: previsualizationAuthority,
  });
  if (imageProductionPackage.passed !== true) {
    throw new Error(
      `IMAGE_STUDIO_PRODUCTION_PACKAGE_BLOCKED:${imageProductionPackage.failures.join(",")}`,
    );
  }
  const imageShotReady = CreativeImageShotReadyRuntime.evaluate({
    task,
    previsualization_authority: previsualizationAuthority,
    production_package: imageProductionPackage,
  });
  if (imageShotReady.passed !== true) {
    throw new Error(
      `IMAGE_STUDIO_SHOT_READY_BLOCKED:${imageShotReady.failures.join(",")}`,
    );
  }
  const shotId = text(task.shot_id || task.metadata?.shot_id || task.input?.shot_id);
  const sceneId = text(task.scene_id || task.metadata?.scene_id || task.input?.scene_id);
  const hero = CreativeImageAssetHandoffRuntime.select({
    asset_nodes: nodes,
    scene_id: sceneId || null,
    shot_id: shotId || null,
    continuity_group_id: continuityGroupId,
    asset_classes: ["HERO_FRAME"],
    downstream_role: "VIDEO",
  }).selected;
  if (!hero?.url) {
    throw new Error("IMAGE_STUDIO_APPROVED_HERO_FRAME_REQUIRED");
  }
  const imageCameraAuthority = object(hero.metadata?.image_camera_authority);
  if (text(imageCameraAuthority.contract) !== CreativeImageCameraAuthorityRuntime.contract) {
    throw new Error("IMAGE_STUDIO_CAMERA_AUTHORITY_REQUIRED");
  }
  const expectedCameraAuthority = CreativeImageCameraAuthorityRuntime.build({
    shot: {
      id: shotId,
      ...object(task.input?.requirements),
      camera: object(task.input?.requirements?.camera || task.input?.camera),
      lighting: object(task.input?.requirements?.lighting || task.input?.lighting),
      virtual_camera_state: object(
        task.input?.requirements?.virtual_camera_state ||
        task.input?.virtual_camera_state,
      ),
    },
    task,
  });
  const imageCameraComparison = CreativeImageCameraAuthorityRuntime.compare({
    authority: imageCameraAuthority,
    cinematography_acquisition: {
      camera: {
        rig_type: expectedCameraAuthority.rig_type,
        sensor_format: expectedCameraAuthority.sensor_format,
        focal_length_mm: expectedCameraAuthority.focal_length_mm,
        aperture_t_stop: expectedCameraAuthority.aperture_t_stop,
        shutter_angle: expectedCameraAuthority.shutter_angle_degrees,
      },
    },
    virtual_camera_state: {
      start: expectedCameraAuthority.start,
      end: expectedCameraAuthority.end,
      zoom_or_lens_change_declared:
        expectedCameraAuthority.zoom_or_lens_change_declared,
    },
  });
  if (imageCameraComparison.passed !== true) {
    throw new Error(
      `IMAGE_STUDIO_CAMERA_AUTHORITY_DRIFT:${imageCameraComparison.failures.join(",")}`,
    );
  }
  const continuitySelection = CreativeImageAssetHandoffRuntime.selectContinuity({
    asset_nodes: nodes,
    scene_id: sceneId || null,
    shot_id: shotId || null,
    continuity_group_id: continuityGroupId,
    downstream_role: "VIDEO",
  });
  const continuity = continuitySelection.selected;
  if (!continuity?.url) {
    throw new Error("IMAGE_STUDIO_CONTINUITY_REFERENCE_REQUIRED");
  }
  const sourceAssets = [
    {
      url: hero.url,
      role: "IMAGE_STUDIO_SELECTED_HERO_FRAME",
      asset_node_id: hero.id,
      continuity_group_id: continuityGroupId,
    },
    {
      url: continuity.url,
      role: "IMAGE_STUDIO_CONTINUITY_REFERENCE",
      asset_node_id: continuity.id,
      continuity_group_id: continuityGroupId,
    },
  ];
  if (imageProductionPackage.performance_reference?.url) {
    sourceAssets.push({
      url: imageProductionPackage.performance_reference.url,
      role: "IMAGE_STUDIO_PERFORMANCE_REFERENCE",
      asset_node_id: imageProductionPackage.performance_reference.asset_node_id,
      continuity_group_id: continuityGroupId,
    });
  }
  if (imageProductionPackage.contact_detail_reference?.url) {
    sourceAssets.push({
      url: imageProductionPackage.contact_detail_reference.url,
      role: "IMAGE_STUDIO_CONTACT_DETAIL_REFERENCE",
      asset_node_id: imageProductionPackage.contact_detail_reference.asset_node_id,
      continuity_group_id: continuityGroupId,
    });
  }

  let characterMultiView = null;
  if (humanSubjectExpected(task)) {
    const identityKey = text(
      task.input?.requirements?.subject_identity_key ||
      task.input?.requirements?.identity_requirements?.profile_id ||
      task.input?.requirements?.identity_requirements?.identity_profile_id ||
      task.input?.requirements?.performance_contract?.identity_profile_id,
    );
    const character = CreativeImageAssetHandoffRuntime.select({
      asset_nodes: nodes,
      scene_id: sceneId || null,
      shot_id: null,
      continuity_group_id: continuityGroupId,
      identity_key: identityKey || null,
      asset_classes: ["CHARACTER_SHEET"],
      downstream_role: "VIDEO",
    }).selected;
    if (!character?.id) throw new Error("IMAGE_STUDIO_CHARACTER_AUTHORITY_REQUIRED");
    characterMultiView = CreativeImageAssetMultiViewHandoffRuntime.select({
      asset_nodes: nodes,
      parent_asset_node_id: character.id,
      continuity_group_id: continuityGroupId,
    });
    if (characterMultiView.complete !== true) {
      throw new Error("IMAGE_STUDIO_CHARACTER_MULTIVIEW_AUTHORITY_REQUIRED");
    }
    for (const node of [
      characterMultiView.front,
      characterMultiView.left_three_quarter,
      characterMultiView.right_profile,
      characterMultiView.rear,
      characterMultiView.detail,
    ].filter(Boolean)) {
      sourceAssets.push({
        url: node.url,
        role: `IMAGE_STUDIO_CHARACTER_${text(node.metadata?.image_multiview_view_id)}`,
        asset_node_id: node.id,
        continuity_group_id: continuityGroupId,
      });
    }
  }

  let materialTruthPack = null;
  if (materialTruthExpected(task)) {
    materialTruthPack = CreativeImageMaterialTruthPackRuntime.select({
      asset_nodes: nodes,
      continuity_group_id: continuityGroupId,
    });
    if (materialTruthPack.complete !== true) {
      throw new Error("IMAGE_STUDIO_MATERIAL_TRUTH_PACK_REQUIRED");
    }
    for (const material of materialTruthPack.assets) {
      sourceAssets.push({
        url: material.url,
        role: `IMAGE_STUDIO_MATERIAL_TRUTH_${text(material.material_truth_key || "REFERENCE")}`,
        asset_node_id: material.asset_node_id,
        continuity_group_id: continuityGroupId,
      });
    }
  }

  let threatMultiView = null;
  let governedThreatKey = null;
  if (threatSubjectExpected(task)) {
    governedThreatKey = threatIdentityKey(task);
    const threatSelection = CreativeImageAssetHandoffRuntime.select({
      asset_nodes: nodes,
      scene_id: sceneId || null,
      shot_id: null,
      continuity_group_id: continuityGroupId,
      threat_identity_key: governedThreatKey,
      asset_classes: ["THREAT_DESIGN"],
      downstream_role: "VIDEO",
    });
    if (!governedThreatKey && threatSelection.candidate_count > 1) {
      throw new Error("IMAGE_STUDIO_THREAT_IDENTITY_REQUIRED");
    }
    const threat = threatSelection.selected;
    if (!threat?.id) throw new Error("IMAGE_STUDIO_THREAT_AUTHORITY_REQUIRED");
    threatMultiView = CreativeImageAssetMultiViewHandoffRuntime.select({
      asset_nodes: nodes,
      parent_asset_node_id: threat.id,
      continuity_group_id: continuityGroupId,
    });
    if (threatMultiView.complete !== true) {
      throw new Error("IMAGE_STUDIO_THREAT_MULTIVIEW_AUTHORITY_REQUIRED");
    }
    for (const node of [
      threatMultiView.front,
      threatMultiView.left_three_quarter,
      threatMultiView.right_profile,
      threatMultiView.rear,
      threatMultiView.detail,
    ].filter(Boolean)) {
      sourceAssets.push({
        url: node.url,
        role: `IMAGE_STUDIO_THREAT_${text(node.metadata?.image_multiview_view_id)}`,
        asset_node_id: node.id,
        continuity_group_id: continuityGroupId,
      });
    }
  }

  const providerReferences = CreativeImageProviderReferenceCompilerRuntime.compile({
    task,
    source_assets: sourceAssets,
  });
  if (providerReferences.provider_transport_safe !== true) {
    throw new Error("IMAGE_STUDIO_PROVIDER_REFERENCE_TRANSPORT_UNSAFE");
  }

  return ProductionTaskRuntime.update(task.id, {
    input: {
      ...object(task.input),
      image: hero.url,
      source: hero.url,
      prompt_image: hero.url,
      source_assets: providerReferences.source_assets,
      image_provider_reference_manifest: providerReferences,
      image_camera_authority: imageCameraAuthority,
      image_previsualization_authority: previsualizationAuthority,
      image_production_package: imageProductionPackage,
      image_shot_ready: imageShotReady,
      generation: {
        ...object(task.input?.generation),
        provider_parameters: {
          ...object(task.input?.generation?.provider_parameters),
          image_studio_authority_bound: true,
          image_studio_hero_asset_node_id: hero.id,
          image_studio_hero_url: hero.url,
          image_studio_continuity_asset_node_id: continuity.id,
          image_studio_continuity_url: continuity.url,
          image_studio_continuity_source:
            continuitySelection.continuity_source || null,
          image_studio_continuity_reuses_hero:
            continuitySelection.continuity_reuses_hero === true,
          continuity_group_id: continuityGroupId,
          visual_input_mode: "IMAGE_STUDIO_PACK_AUTHORITY",
          character_multiview_authority_bound: characterMultiView?.complete === true,
          character_multiview_qc_seal_hash: characterMultiView?.qc_seal_hash || null,
          threat_multiview_authority_bound: threatMultiView?.complete === true,
          threat_multiview_qc_seal_hash: threatMultiView?.qc_seal_hash || null,
        },
      },
      provider_parameters: {
        ...object(task.input?.provider_parameters),
        image_studio_authority_bound: true,
        image_studio_hero_asset_node_id: hero.id,
        image_studio_hero_url: hero.url,
        image_studio_continuity_asset_node_id: continuity.id,
        image_studio_continuity_url: continuity.url,
        image_studio_continuity_source:
          continuitySelection.continuity_source || null,
        image_studio_continuity_reuses_hero:
          continuitySelection.continuity_reuses_hero === true,
        continuity_group_id: continuityGroupId,
        visual_input_mode: "IMAGE_STUDIO_PACK_AUTHORITY",
        character_multiview_authority_bound: characterMultiView?.complete === true,
        character_multiview_qc_seal_hash: characterMultiView?.qc_seal_hash || null,
        threat_multiview_authority_bound: threatMultiView?.complete === true,
        threat_multiview_qc_seal_hash: threatMultiView?.qc_seal_hash || null,
      },
    },
    metadata: {
      ...object(task.metadata),
      image_studio_authority_bound: true,
      image_studio_hero_asset_node_id: hero.id,
      image_studio_continuity_asset_node_id: continuity.id,
      image_studio_continuity_group_id: continuityGroupId,
      image_studio_continuity_source:
        continuitySelection.continuity_source || null,
      image_studio_continuity_reuses_hero:
        continuitySelection.continuity_reuses_hero === true,
      visual_input_mode: "IMAGE_STUDIO_PACK_AUTHORITY",
      image_camera_authority_contract: imageCameraAuthority.contract,
      image_camera_authority_hash: imageCameraAuthority.authority_hash,
      image_camera_authority_validated: true,
      character_multiview_authority_bound: characterMultiView?.complete === true,
      character_multiview_qc_seal_hash: characterMultiView?.qc_seal_hash || null,
      threat_identity_key: governedThreatKey,
      threat_multiview_authority_bound: threatMultiView?.complete === true,
      threat_multiview_qc_seal_hash: threatMultiView?.qc_seal_hash || null,
      material_truth_pack_bound: materialTruthPack?.complete === true,
      material_truth_pack_qc_seal_hash: materialTruthPack?.qc_seal_hash || null,
      material_truth_asset_count: materialTruthPack?.asset_count || 0,
      image_previsualization_authority_contract:
        previsualizationAuthority.contract,
      image_previsualization_authority_digest:
        previsualizationAuthority.previsualization_authority_digest,
      image_previsualization_authority_passed: true,
      image_production_package_contract:
        imageProductionPackage.contract,
      image_production_package_digest:
        imageProductionPackage.production_package_digest,
      image_production_package_bound: true,
      image_shot_ready_contract: imageShotReady.contract,
      image_shot_ready_digest: imageShotReady.shot_ready_digest,
      image_shot_ready_passed: true,
      image_provider_reference_manifest_contract: providerReferences.contract,
      image_provider_reference_count: providerReferences.compiled_asset_count,
      image_provider_reference_truncated: providerReferences.truncated,
      image_provider_reference_omitted_asset_node_ids:
        providerReferences.omitted_asset_node_ids,
    },
  });
}

function reviewApproved(review = {}) {
  return review.status === "COMPLETED" &&
    review.review?.approved === true &&
    review.metadata?.automated_perceptual_validation_passed === true &&
    review.metadata?.generated_media_released_for_downstream === true;
}


function basePlateRole(task = {}) {
  return task.input?.requirements?.base_plate_role === true ||
    task.input?.generation?.provider_parameters?.base_plate_role === true ||
    task.input?.provider_parameters?.base_plate_role === true ||
    task.metadata?.base_plate_role === true;
}

function reconstructionCertification(task = {}) {
  const requirements = object(task.input?.requirements);
  const generation = object(task.input?.generation);
  const provider = object(task.input?.provider_parameters);
  const generationProvider = object(generation.provider_parameters);
  const passed = requirements.reconstruction_certification_passed === true ||
    generationProvider.reconstruction_certification_passed === true ||
    provider.reconstruction_certification_passed === true ||
    task.metadata?.reconstruction_certification_passed === true;
  const hash = text(
    requirements.reconstruction_qc_certification_hash ||
    generationProvider.reconstruction_qc_certification_hash ||
    provider.reconstruction_qc_certification_hash ||
    task.metadata?.reconstruction_qc_certification_hash,
  );
  const artifacts = list(
    requirements.reconstruction_artifact_node_ids ||
    generationProvider.reconstruction_artifact_node_ids ||
    provider.reconstruction_artifact_node_ids ||
    task.metadata?.reconstruction_artifact_node_ids,
  );
  return { passed, hash, artifacts };
}

function assertBasePlateReconstructionCertified(task = {}) {
  if (!basePlateRole(task)) return;
  const certification = reconstructionCertification(task);
  if (!certification.passed) {
    throw new Error("BASE_PLATE_RECONSTRUCTION_CERTIFICATION_REQUIRED");
  }
  if (!/^[a-f0-9]{64}$/i.test(certification.hash)) {
    throw new Error("BASE_PLATE_RECONSTRUCTION_CERTIFICATION_HASH_REQUIRED");
  }
  if (certification.artifacts.length < 7) {
    throw new Error("BASE_PLATE_RECONSTRUCTION_ARTIFACT_EVIDENCE_REQUIRED");
  }
}
async function bindApprovedDerivedFrame(task = {}) {
  if (!derivedFrameRequired(task) || identityControlled(task)) return task;

  const derivedFrameNodeId = text(
    task.input?.requirements?.visual_derived_frame_node_id ||
    task.input?.generation?.provider_parameters?.visual_derived_frame_node_id ||
    task.input?.provider_parameters?.visual_derived_frame_node_id ||
    task.metadata?.visual_derived_frame_node_id,
  );
  if (!derivedFrameNodeId) {
    throw new Error("VISUAL_DERIVED_FRAME_NODE_REQUIRED");
  }

  const dependencies = await dependencyTasks(task);
  const derivedFrame = dependencies.find((dependency) =>
    executionNodeId(dependency) === derivedFrameNodeId ||
    text(dependency.metadata?.visual_derived_frame_for_shot_id) ===
      text(task.shot_id || task.metadata?.shot_id),
  );
  if (!derivedFrame || derivedFrame.status !== "COMPLETED") {
    throw new Error("VISUAL_DERIVED_FRAME_NOT_COMPLETED");
  }
  if (
    derivedFrame.metadata?.approved_for_downstream_after_perceptual_review !== true ||
    derivedFrame.metadata?.automated_perceptual_validation_passed !== true
  ) {
    throw new Error("VISUAL_DERIVED_FRAME_NOT_APPROVED_FOR_MOTION");
  }

  const review = dependencies.find((dependency) =>
    text(dependency.metadata?.source_generation_node_id) === derivedFrameNodeId &&
    text(dependency.metadata?.contract) === "GENERATED_MEDIA_PERCEPTUAL_REVIEW_V1",
  );
  if (!review || !reviewApproved(review)) {
    throw new Error("VISUAL_DERIVED_FRAME_PERCEPTUAL_REVIEW_REQUIRED");
  }

  const url = outputUrl(derivedFrame.output);
  if (!url) throw new Error("VISUAL_DERIVED_FRAME_OUTPUT_URL_REQUIRED");

  const originalPrimarySourceAssetId = text(
    task.input?.requirements?.primary_source_asset_id ||
    task.input?.generation?.primary_source_asset_id ||
    task.input?.generation?.provider_parameters?.primary_source_asset_id ||
    task.input?.provider_parameters?.primary_source_asset_id ||
    task.metadata?.primary_source_asset_id,
  ) || null;

  return ProductionTaskRuntime.update(task.id, {
    input: {
      ...object(task.input),
      image: url,
      source: url,
      prompt_image: url,
      source_assets: [
        {
          url,
          role: "APPROVED_VISUAL_DERIVED_FRAME",
          production_node_id: derivedFrameNodeId,
          task_id: derivedFrame.id,
        },
      ],
      generation: {
        ...object(task.input?.generation),
        primary_source_asset_id: originalPrimarySourceAssetId,
        provider_parameters: {
          ...object(task.input?.generation?.provider_parameters),
          primary_source_asset_id: originalPrimarySourceAssetId,
          visual_derived_frame_node_id: derivedFrameNodeId,
          visual_derived_frame_task_id: derivedFrame.id,
          visual_derived_frame_review_task_id: review.id,
          visual_derived_frame_url: url,
          visual_derived_frame_approved: true,
          visual_input_mode: "APPROVED_DEPENDENCY_FRAME",
        },
      },
      provider_parameters: {
        ...object(task.input?.provider_parameters),
        primary_source_asset_id: originalPrimarySourceAssetId,
        visual_derived_frame_node_id: derivedFrameNodeId,
        visual_derived_frame_task_id: derivedFrame.id,
        visual_derived_frame_review_task_id: review.id,
        visual_derived_frame_url: url,
        visual_derived_frame_approved: true,
        visual_input_mode: "APPROVED_DEPENDENCY_FRAME",
      },
    },
    metadata: {
      ...object(task.metadata),
      visual_derived_frame_node_id: derivedFrameNodeId,
      visual_derived_frame_task_id: derivedFrame.id,
      visual_derived_frame_review_task_id: review.id,
      visual_derived_frame_bound: true,
      visual_derived_frame_approved: true,
      visual_input_mode: "APPROVED_DEPENDENCY_FRAME",
      original_primary_source_asset_id: originalPrimarySourceAssetId,
    },
  });
}

function install() {
  if (ProductionTaskRuntime[INSTALL_FLAG]) return;

  const dispatchWithoutVisualProductionGate = ProductionTaskRuntime.dispatch.bind(
    ProductionTaskRuntime,
  );

  Object.defineProperty(ProductionTaskRuntime, INSTALL_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  ProductionTaskRuntime.dispatch = async function dispatchWithVisualProductionGate(id) {
    let task = await ProductionTaskRuntime.get(id);
    if (!task) throw new Error("Production task not found");

    assertBasePlateReconstructionCertified(task);

    if (derivedFrameRequired(task) && !identityControlled(task)) {
      task = await bindApprovedDerivedFrame(task);
    }

    if (imageStudioAuthorityRequired(task)) {
      task = await bindApprovedImageStudioAuthority(task);
    }

    return dispatchWithoutVisualProductionGate(task.id);
  };
}

install();

export const CreativeVisualProductionExecutionGate = Object.freeze({
  installed: true,
  outputUrl,
  bindApprovedDerivedFrame,
  bindApprovedImageStudioAuthority,
  assertBasePlateReconstructionCertified,
});
