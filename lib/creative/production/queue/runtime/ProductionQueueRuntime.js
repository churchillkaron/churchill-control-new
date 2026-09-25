import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import {
  CreativeFinalisationRouter,
} from "@/lib/creative/finalisation/runtime/CreativeFinalisationRouter";
import {
  CreativeAutonomousRepairDirectorRuntime,
} from "@/lib/creative/quality/runtime/CreativeAutonomousRepairDirectorRuntime";
import {
  CreativeDocumentProductionRuntime,
} from "@/lib/creative/documents/runtime/CreativeDocumentProductionRuntime";
import {
  CreativeStillFinishingRuntime,
} from "@/lib/creative/stills/runtime/CreativeStillFinishingRuntime";
import {
  StillValidationTaskRuntime,
} from "@/lib/creative/stills/runtime/StillValidationTaskRuntime";
import {
  CreativeImageAssetReconciliationRuntime,
} from "@/lib/creative/image/runtime/CreativeImageAssetReconciliationRuntime";
import {
  CreativeImageAssetPackConsistencyRuntime,
} from "@/lib/creative/image/runtime/CreativeImageAssetPackConsistencyRuntime";
import {
  CreativeImageAssetDesignExplorationRuntime,
} from "@/lib/creative/image/runtime/CreativeImageAssetDesignExplorationRuntime";
import {
  CreativeImageAssetDerivativeFactoryRuntime,
} from "@/lib/creative/image/runtime/CreativeImageAssetDerivativeFactoryRuntime";
import {
  CreativeImageAssetDerivativeExecutionRuntime,
} from "@/lib/creative/image/runtime/CreativeImageAssetDerivativeExecutionRuntime";
import {
  CreativeImageAssetDerivativeReconciliationRuntime,
} from "@/lib/creative/image/runtime/CreativeImageAssetDerivativeReconciliationRuntime";
import {
  CreativeImageAssetDerivativeQcRuntime,
} from "@/lib/creative/image/runtime/CreativeImageAssetDerivativeQcRuntime";
import {
  CreativeImageAssetMultiViewRuntime,
} from "@/lib/creative/image/runtime/CreativeImageAssetMultiViewRuntime";
import {
  CreativeImageAssetLocalizedRepairRuntime,
} from "@/lib/creative/image/runtime/CreativeImageAssetLocalizedRepairRuntime";
import {
  CreativeImageMaterialTruthPackRuntime,
} from "@/lib/creative/image/runtime/CreativeImageMaterialTruthPackRuntime";
import {
  CreativeImageMaterialMeasurementRuntime,
} from "@/lib/creative/image/runtime/CreativeImageMaterialMeasurementRuntime";
import {
  CreativeImageStudioCapabilityReadinessRuntime,
} from "@/lib/creative/image/runtime/CreativeImageStudioCapabilityReadinessRuntime";
import {
  CreativeImageFoundationAuthorityRuntime,
} from "@/lib/creative/image/runtime/CreativeImageFoundationAuthorityRuntime";
import {
  CreativeImageGenerationReferenceCompilerRuntime,
} from "@/lib/creative/image/runtime/CreativeImageGenerationReferenceCompilerRuntime";
import {
  CreativeImageAuthenticSourcePromotionRuntime,
} from "@/lib/creative/image/runtime/CreativeImageAuthenticSourcePromotionRuntime";
import {
  CreativeImageAuthorityInvalidationRuntime,
} from "@/lib/creative/image/runtime/CreativeImageAuthorityInvalidationRuntime";
import {
  CreativeImageProductionPackageRuntime,
} from "@/lib/creative/image/runtime/CreativeImageProductionPackageRuntime";
import {
  CreativeImagePrevisualizationAuthorityRuntime,
} from "@/lib/creative/image/runtime/CreativeImagePrevisualizationAuthorityRuntime";
import {
  CreativeImageShotReadyRuntime,
} from "@/lib/creative/image/runtime/CreativeImageShotReadyRuntime";
import {
  WebsiteValidationTaskRuntime,
} from "@/lib/creative/web/runtime/WebsiteValidationTaskRuntime";
import {
  bindWebsiteScreenshotForReview,
  dispatchWebsiteTask,
  isWebsiteQualityTask,
  localWebsiteOperation,
} from "@/lib/creative/web/runtime/WebsiteQueueRuntime";
import {
  SoftwareValidationTaskRuntime,
} from "@/lib/creative/software/runtime/SoftwareValidationTaskRuntime";
import {
  bindSoftwareEvidenceForReview,
  dispatchSoftwareTask,
  isSoftwareQualityTask,
  localSoftwareOperation,
} from "@/lib/creative/software/runtime/SoftwareQueueRuntime";
import {
  AudioValidationTaskRuntime,
} from "@/lib/creative/audio/runtime/AudioValidationTaskRuntime";
import {
  bindAudioEvidenceForReview,
  dispatchAudioTask,
  ensureAudioFinishTask,
  isAudioQualityTask,
  localAudioOperation,
} from "@/lib/creative/audio/runtime/AudioQueueRuntime";
import {
  CampaignValidationTaskRuntime,
} from "@/lib/creative/campaign/runtime/CampaignValidationTaskRuntime";
import {
  bindCampaignPackageForReview,
  dispatchCampaignTask,
  ensureCampaignPackageTask,
  isCampaignCoherenceTask,
  localCampaignOperation,
  routeCampaignTask,
} from "@/lib/creative/campaign/runtime/CampaignQueueRuntime";
import {
  creativeStorageReference,
  signCreativeStorageReference,
  downloadCreativeStorageReference,
} from "@/lib/creative/assets/storage/CreativePrivateStorageRuntime";
import {
  stillOutputUrl,
} from "@/lib/creative/stills/runtime/StillDesignContractRuntime";
import {
  CREATIVE_VIDEO_MASTERED_CAPABILITIES,
} from "@/lib/creative/video/runtime/CreativeVideoProductionReadinessRuntime";
import * as CreativeProjectRepository
from "@/lib/creative/projects/repositories/CreativeProjectRepository";
import {
  CreativeSimulationPassExecutionRuntime,
} from "@/lib/creative/simulation/runtime/CreativeSimulationPassExecutionRuntime";
import {
  CreativeSimulationTaskMaterializationRuntime,
} from "@/lib/creative/simulation/runtime/CreativeSimulationTaskMaterializationRuntime";
import {
  CreativeSimulationReviewTaskRuntime,
} from "@/lib/creative/simulation/runtime/CreativeSimulationReviewTaskRuntime";
import {
  CreativeTrackingRotoTaskMaterializationRuntime,
} from "@/lib/creative/tracking/runtime/CreativeTrackingRotoTaskMaterializationRuntime";
import {
  CreativeOpenCVMatchmoveExecutionRuntime,
} from "@/lib/creative/tracking/runtime/CreativeOpenCVMatchmoveExecutionRuntime";
import {
  CreativeMatchmoveArtifactRuntime,
} from "@/lib/creative/tracking/runtime/CreativeMatchmoveArtifactRuntime";
import {
  CreativeOpenCVRotoExecutionRuntime,
} from "@/lib/creative/roto/runtime/CreativeOpenCVRotoExecutionRuntime";
import {
  CreativeRotoArtifactRuntime,
} from "@/lib/creative/roto/runtime/CreativeRotoArtifactRuntime";
import {
  CreativeCinematicMotionTaskMaterializationRuntime,
} from "@/lib/creative/motion-graphics/runtime/CreativeCinematicMotionTaskMaterializationRuntime";
import {
  CreativeCinematicMotionDesignRenderRuntime,
} from "@/lib/creative/motion-graphics/runtime/CreativeCinematicMotionDesignRenderRuntime";
import {
  CreativeCinematicMotionDesignQualityRuntime,
} from "@/lib/creative/motion-graphics/runtime/CreativeCinematicMotionDesignQualityRuntime";
import {
  CreativeCinematicBrandLockRuntime,
} from "@/lib/creative/motion-graphics/runtime/CreativeCinematicBrandLockRuntime";
import {
  CreativeMultiPassArtifactRuntime,
} from "@/lib/creative/multipass/runtime/CreativeMultiPassArtifactRuntime";
import {
  CreativeVfxTaskMaterializationRuntime,
} from "@/lib/creative/vfx/runtime/CreativeVfxTaskMaterializationRuntime";
import {
  CreativeVfxIntegrationPassExecutionRuntime,
} from "@/lib/creative/vfx/runtime/CreativeVfxIntegrationPassExecutionRuntime";
import {
  CreativeVfxReviewTaskRuntime,
} from "@/lib/creative/vfx/runtime/CreativeVfxReviewTaskRuntime";
import {
  CreativePremiumLayerTaskMaterializationRuntime,
} from "@/lib/creative/vfx/runtime/CreativePremiumLayerTaskMaterializationRuntime";
import {
  CreativeAtmospherePassExecutionRuntime,
} from "@/lib/creative/vfx/runtime/CreativeAtmospherePassExecutionRuntime";
import {
  CreativeThreatHeroLayerPassExecutionRuntime,
} from "@/lib/creative/vfx/runtime/CreativeThreatHeroLayerPassExecutionRuntime";
import {
  CreativePhysicalInteractionTaskMaterializationRuntime,
} from "@/lib/creative/vfx/runtime/CreativePhysicalInteractionTaskMaterializationRuntime";
import {
  CreativePhysicalInteractionPassExecutionRuntime,
} from "@/lib/creative/vfx/runtime/CreativePhysicalInteractionPassExecutionRuntime";
import {
  CreativeCompositeTaskMaterializationRuntime,
} from "@/lib/creative/compositing/runtime/CreativeCompositeTaskMaterializationRuntime";
import {
  CreativeCompositeReviewTaskRuntime,
} from "@/lib/creative/compositing/runtime/CreativeCompositeReviewTaskRuntime";
import {
  CreativeLayeredCompositingRenderRuntime,
} from "@/lib/creative/compositing/runtime/CreativeLayeredCompositingRenderRuntime";
import { ShotRuntime } from "@/lib/creative/shots/runtime/ShotRuntime";
import {
  CreativeOpticalTaskMaterializationRuntime,
} from "@/lib/creative/post-production/runtime/CreativeOpticalTaskMaterializationRuntime";
import {
  CreativeOpticalReviewTaskRuntime,
} from "@/lib/creative/post-production/runtime/CreativeOpticalReviewTaskRuntime";
import {
  CreativeOpticalFinishingRuntime,
} from "@/lib/creative/post-production/runtime/CreativeOpticalFinishingRuntime";
import {
  CreativeShotEditReleaseRuntime,
} from "@/lib/creative/post-production/runtime/CreativeShotEditReleaseRuntime";
import {
  CreativeEditPreparationRuntime,
} from "@/lib/creative/post-production/runtime/CreativeEditPreparationRuntime";
import "@/lib/creative/vfx/runtime/CreativeVfxQualityGateBootstrap";
import {
  CreativeAssetGraphRuntime,
} from "@/lib/creative/assets/graph/runtime/CreativeAssetGraphRuntime";
import "@/lib/creative/quality/runtime/CreativeGeneratedMediaPerceptualExecutionGate";
import "@/lib/creative/simulation/runtime/CreativeSimulationQualityGateBootstrap";
import "@/lib/creative/production/dossier/runtime/CreativeProductionDossierEvidenceRuntime";
import {
  CreativeProductionDossierExecutionGate,
} from "@/lib/creative/production/dossier/runtime/CreativeProductionDossierExecutionGate";

function supersessionId(task = {}) {
  return (
    task.metadata?.superseded_by_repair_review_task_id ||
    task.metadata?.superseded_by_repair_task_id ||
    null
  );
}

function effectiveTask(taskMap, taskOrId, seen = new Set()) {
  const task = typeof taskOrId === "string" ? taskMap.get(taskOrId) : taskOrId;
  if (!task || seen.has(task.id)) return task || null;
  seen.add(task.id);
  const replacementId = supersessionId(task);
  return replacementId ? effectiveTask(taskMap, replacementId, seen) : task;
}

function dependencyComplete(taskMap, dependencyId) {
  return effectiveTask(taskMap, dependencyId)?.status === "COMPLETED";
}

function dependencyFailed(taskMap, dependencyId) {
  const status = effectiveTask(taskMap, dependencyId)?.status;
  return status === "FAILED" || status === "SKIPPED";
}

function hasPendingProviderJob(task = {}) {
  return Boolean(
    task.status === "RUNNING" &&
    (
      task.output?.provider_job_id ||
      task.output?.provider_submission?.provider_job_id ||
      task.output?.provider_submission?.output?.provider_job_id ||
      task.output?.provider_submission?.output?.output?.provider_job_id
    )
  );
}

function productionCapability(task = {}) {
  return String(task.capability || task.service_code || "").trim().toLowerCase();
}

function isMasteredNativeVideoTask(task = {}) {
  return CREATIVE_VIDEO_MASTERED_CAPABILITIES.has(productionCapability(task));
}

function localDocumentOperation(task = {}) {
  const capability = String(task.capability || task.service_code || "").trim();
  if (capability === "creative.document.render") return "render";
  if (capability === "creative.document.validate") return "validate";
  const workflow = String(task.metadata?.workflow_kind || "").toUpperCase();
  const step = String(task.metadata?.production_step_id || "").toLowerCase();
  if (workflow === "DOCUMENT" && step === "assemble") return "render";
  if (workflow === "DOCUMENT" && step === "quality") return "validate";
  return null;
}

function localStillOperation(task = {}) {
  const capability = String(task.capability || task.service_code || "").trim();
  if (capability === "creative.still.finish") return "finish";
  if (capability === "creative.still.validate") return "validate";
  const workflow = String(task.metadata?.workflow_kind || "").toUpperCase();
  const step = String(task.metadata?.production_step_id || "").toLowerCase();
  if (workflow === "STILL" && step === "finish") return "finish";
  if (workflow === "STILL" && step === "release-validation") return "validate";
  return null;
}

function isStillQualityTask(task = {}) {
  const workflow = String(task.metadata?.workflow_kind || "").toUpperCase();
  const step = String(task.metadata?.production_step_id || "").toLowerCase();
  const capability = String(task.capability || task.service_code || "").toLowerCase();
  const contract = String(task.metadata?.contract || "").toUpperCase();
  if (contract === "GENERATED_MEDIA_PERCEPTUAL_REVIEW_V1" || task.metadata?.source_generation_node_id) {
    return false;
  }
  return workflow === "STILL" &&
    (step === "quality" || step === "semantic-review" || capability.includes("image.analyze"));
}

async function ensureStillFinishTask(qualityTask) {
  const tasks = await ProductionTaskRuntime.list({
    organization_id: qualityTask.organization_id,
    creative_project_id: qualityTask.creative_project_id,
  });
  let finish = tasks.find((task) => task.metadata?.still_finish_for_task_id === qualityTask.id) || null;
  if (!finish) {
    finish = await ProductionTaskRuntime.create({
      organization_id: qualityTask.organization_id,
      creative_project_id: qualityTask.creative_project_id,
      production_graph_id: qualityTask.production_graph_id,
      type: "EXECUTE_CAPABILITY",
      status: "WAITING",
      title: `Finish ${qualityTask.title || "still deliverable"}`,
      description: "Apply exact brand assets, deterministic typography, legal copy and requested channel variants before semantic review.",
      service_id: "creative.still.finish",
      service_code: "creative.still.finish",
      capability: "creative.still.finish",
      priority: Math.max(0, Number(qualityTask.priority || 100) - 1),
      depends_on: Array.isArray(qualityTask.depends_on) ? qualityTask.depends_on : [],
      input: {
        ...(qualityTask.input || {}),
        output_spec:
          qualityTask.metadata?.requirements?.output_spec ||
          qualityTask.input?.requirements?.output_spec ||
          qualityTask.input?.output_spec ||
          qualityTask.metadata?.output_spec ||
          {},
      },
      cost: {
        estimated: 0,
        actual: 0,
        currency: qualityTask.cost?.currency || null,
        approved: true,
      },
      timing: { estimated_seconds: 0 },
      review: { required: false, approved: false },
      metadata: {
        ...(qualityTask.metadata || {}),
        output_spec:
          qualityTask.metadata?.requirements?.output_spec ||
          qualityTask.metadata?.output_spec ||
          {},
        execution_node_id: `${qualityTask.metadata?.execution_node_id || qualityTask.id}:still-finish`,
        execution_step_id: `${qualityTask.metadata?.execution_step_id || qualityTask.id}:still-finish`,
        production_step_id: "finish",
        production_step_index: Number(qualityTask.metadata?.production_step_index || 1) - 0.5,
        quality_gate: false,
        release_candidate: true,
        still_finish_for_task_id: qualityTask.id,
        world_class_quality_required: true,
      },
    });
  }
  await ProductionTaskRuntime.update(qualityTask.id, {
    depends_on: [finish.id],
    metadata: {
      ...(qualityTask.metadata || {}),
      still_finish_task_id: finish.id,
      release_candidate: false,
    },
  });
  return finish;
}

async function bindFinishedStillForReview(task) {
  const finishId = task.metadata?.still_finish_task_id;
  if (!finishId) return task;
  const finish = await ProductionTaskRuntime.get(finishId);
  if (!finish || finish.status !== "COMPLETED") {
    throw new Error("CREATIVE_STILL_FINISH_NOT_COMPLETED");
  }
  const privateUrl = stillOutputUrl(finish.output);
  if (!privateUrl) throw new Error("CREATIVE_STILL_FINISHED_URL_REQUIRED");
  const reviewUrl = creativeStorageReference(privateUrl)
    ? await signCreativeStorageReference({
        organization_id: task.organization_id,
        reference: privateUrl,
      })
    : privateUrl;
  return ProductionTaskRuntime.update(task.id, {
    input: {
      ...(task.input || {}),
      image: reviewUrl,
      media: reviewUrl,
      source: reviewUrl,
      assets: [{ url: reviewUrl, role: "finished_still" }],
      finished_still: {
        task_id: finish.id,
        private_url: privateUrl,
        review_url: reviewUrl,
        variants: finish.output?.output?.variants || finish.output?.variants || [],
      },
    },
    metadata: {
      ...(task.metadata || {}),
      still_finish_review_bound: true,
    },
  });
}

function localImageAuthenticSourcePromotionOperation(task = {}) {
  const capability = String(task.capability || task.service_code || "").trim();
  return capability === "creative.image.authentic-source-promote"
    ? "promote"
    : null;
}

async function dispatchImageAuthenticSourcePromotionTask(task = {}) {
  try {
    await CreativeProductionDossierExecutionGate.approvedDossier(task);
    const refreshed = await ProductionTaskRuntime.get(task.id);
    const result =
      await CreativeImageAuthenticSourcePromotionRuntime.promote(refreshed);
    return ProductionTaskRuntime.complete(refreshed.id, {
      provider: "avantiqo-owned-authentic-source",
      settlement: "LOCAL_EXECUTION",
      url: result.url,
      file_url: result.file_url,
      media_kind: "IMAGE",
      output: result,
      local_execution: true,
      provider_calls_performed: false,
      source_pixels_preserved_exactly: true,
    });
  } catch (error) {
    return ProductionTaskRuntime.fail(task.id, error);
  }
}

function localImageDerivativeOperation(task = {}) {
  const capability = String(task.capability || task.service_code || "").trim();
  return capability === "creative.image.segmentation.execute" &&
    task.metadata?.image_asset_derivative_task === true
    ? "segmentation"
    : null;
}

async function dispatchImageDerivativeTask(task = {}) {
  try {
    await CreativeProductionDossierExecutionGate.approvedDossier(task);
    const refreshed = await ProductionTaskRuntime.get(task.id);
    const project = await CreativeProjectRepository.getById(refreshed.creative_project_id);
    if (!project) throw new Error("IMAGE_DERIVATIVE_PROJECT_REQUIRED");
    const result = await CreativeImageAssetDerivativeExecutionRuntime.executeSegmentation({
      organization_id: refreshed.organization_id,
      creative_project_id: refreshed.creative_project_id,
      creative_mission_id: project.creative_mission_id || project.mission_id || null,
      project,
      parent_asset_node_id: refreshed.input?.parent_asset_node_id,
      continuity_group_id: refreshed.input?.continuity_group_id || null,
      source_reference: refreshed.input?.source_reference,
    });
    return ProductionTaskRuntime.complete(refreshed.id, {
      provider: "avantiqo-owned-image-tools",
      settlement: "LOCAL_EXECUTION",
      output: result,
      asset_node_id: result.segmentation?.node?.id || null,
      file_url: result.segmentation?.storage_reference || null,
      local_execution: true,
      provider_calls_performed: false,
    });
  } catch (error) {
    return ProductionTaskRuntime.fail(task.id, error);
  }
}

function localOpticalOperation(task = {}) {
  const capability = String(task.capability || task.service_code || "").trim();
  const passRole = String(
    task.input?.requirements?.pass_role ||
    task.metadata?.pass_role ||
    "",
  ).trim().toUpperCase();
  return capability === "creative.video.optical-finish" &&
    passRole === "OPTICAL_FINISH"
    ? "execute"
    : null;
}

async function dispatchOpticalTask(task = {}) {
  try {
    await CreativeProductionDossierExecutionGate.approvedDossier(task);
    const refreshed = await ProductionTaskRuntime.get(task.id);
    const [project, nodes] = await Promise.all([
      CreativeProjectRepository.getById(refreshed.creative_project_id),
      CreativeAssetGraphRuntime.list({
        organization_id: refreshed.organization_id,
        creative_project_id: refreshed.creative_project_id,
      }),
    ]);
    if (!project) throw new Error("OPTICAL_PROJECT_REQUIRED");
    const composite = nodes.find((node) =>
      node.id === refreshed.input?.composite_asset_node_id
    );
    if (!composite?.url) throw new Error("OPTICAL_COMPOSITE_ASSET_REQUIRED");
    const result = await CreativeOpticalFinishingRuntime.finish({
      organization_id: refreshed.organization_id,
      creative_project_id: refreshed.creative_project_id,
      creative_mission_id:
        refreshed.metadata?.creative_mission_id ||
        project.creative_mission_id ||
        project.mission_id ||
        null,
      shot_id: refreshed.shot_id || refreshed.input?.shot_id,
      project,
      composite_asset: composite,
      profile: refreshed.input?.optical_profile || {},
      policy: refreshed.input?.render_policy || {},
    });
    const artifact = result.artifact;
    if (!artifact?.node?.id || !artifact.storage_reference) {
      throw new Error("OPTICAL_FINISH_ARTIFACT_REQUIRED");
    }
    return ProductionTaskRuntime.complete(refreshed.id, {
      provider: "avantiqo-owned-optical",
      settlement: "LOCAL_EXECUTION",
      file_url: artifact.storage_reference,
      asset_node_id: artifact.node.id,
      output: result,
      technical_qc: result.technical_qc || null,
      local_execution: true,
      provider_calls_performed: false,
    });
  } catch (error) {
    return ProductionTaskRuntime.fail(task.id, error);
  }
}

function localCompositeOperation(task = {}) {
  const capability = String(task.capability || task.service_code || "").trim();
  const passRole = String(
    task.input?.requirements?.pass_role ||
    task.metadata?.pass_role ||
    "",
  ).trim().toUpperCase();
  return capability === "creative.shot.composite" &&
    passRole === "FINAL_COMPOSITE"
    ? "execute"
    : null;
}

async function dispatchCompositeTask(task = {}) {
  try {
    await CreativeProductionDossierExecutionGate.approvedDossier(task);
    const refreshed = await ProductionTaskRuntime.get(task.id);
    const [shot, nodes] = await Promise.all([
      ShotRuntime.get(refreshed.shot_id || refreshed.input?.shot_id),
      CreativeAssetGraphRuntime.list({
        organization_id: refreshed.organization_id,
        creative_project_id: refreshed.creative_project_id,
      }),
    ]);
    if (!shot) throw new Error("COMPOSITE_SHOT_REQUIRED");
    const rendered = await CreativeLayeredCompositingRenderRuntime.render({
      organization_id: refreshed.organization_id,
      creative_project_id: refreshed.creative_project_id,
      shot: {
        ...shot,
        compositing_contract: refreshed.input?.compositing_contract,
      },
      nodes,
      policy: refreshed.input?.render_policy || {},
    });
    if (!rendered?.render?.id || !rendered.render.url) {
      throw new Error("COMPOSITE_RENDER_ASSET_REQUIRED");
    }
    return ProductionTaskRuntime.complete(refreshed.id, {
      provider: "avantiqo-owned-compositor",
      settlement: "LOCAL_EXECUTION",
      file_url: rendered.render.url,
      asset_node_id: rendered.render.id,
      output: rendered,
      local_execution: true,
      provider_calls_performed: false,
    });
  } catch (error) {
    return ProductionTaskRuntime.fail(task.id, error);
  }
}

function localPhysicalInteractionOperation(task = {}) {
  const capability = String(task.capability || task.service_code || "").trim();
  const passRole = String(
    task.input?.requirements?.pass_role ||
    task.metadata?.pass_role ||
    "",
  ).trim().toUpperCase();
  return capability === "creative.vfx.physical-interaction" &&
    passRole === "PHYSICAL_INTERACTION"
    ? "execute"
    : null;
}

async function blobJson(blob) {
  if (!blob?.arrayBuffer) throw new Error("PHYSICAL_INTERACTION_MATERIAL_BLOB_REQUIRED");
  const buffer = Buffer.from(await blob.arrayBuffer());
  return JSON.parse(buffer.toString("utf8"));
}

async function createInteractionEvidenceTask({ parent, artifact, role }) {
  const tasks = await ProductionTaskRuntime.list({
    organization_id: parent.organization_id,
    creative_project_id: parent.creative_project_id,
  });
  const identity = `${parent.id}:${role}:${artifact.node.id}`;
  const prior = tasks.find((task) =>
    String(task.metadata?.physical_interaction_evidence_identity || "") === identity
  );
  if (prior) return prior;
  let child = await ProductionTaskRuntime.create({
    organization_id: parent.organization_id,
    creative_project_id: parent.creative_project_id,
    production_graph_id: parent.production_graph_id || null,
    scene_id: parent.scene_id || null,
    shot_id: parent.shot_id || null,
    type: "RENDER_PRODUCTION",
    status: "WAITING",
    title: `${parent.title || "Physical interaction"} · ${role}`,
    description: `Durable ${role} layer produced by the governed physical-interaction render.`,
    service_id: "creative.vfx.interaction.layer",
    service_code: "creative.vfx.interaction.layer",
    capability: "creative.vfx.interaction.layer",
    provider_id: "avantiqo-owned-vfx",
    priority: 43,
    depends_on: [parent.id],
    input: {
      vfx_contract: parent.input?.vfx_contract,
      effect: parent.input?.effect,
      requirements: {
        vfx_contract: parent.input?.vfx_contract,
        pass_role: role,
        source_physical_interaction_task_id: parent.id,
      },
    },
    cost: { estimated: 0, actual: 0, currency: null, approved: true },
    timing: { estimated_seconds: 0 },
    review: { required: false, approved: false },
    metadata: {
      workflow_kind: parent.metadata?.workflow_kind || null,
      shot_id: parent.shot_id || null,
      physical_interaction_evidence_identity: identity,
      physical_interaction_parent_task_id: parent.id,
      physical_interaction_role: role,
      production_step_id: role === "LIGHTING_INTERACTION" ? "lighting-interaction" : "reflection-shadow",
      production_step_index: role === "LIGHTING_INTERACTION" ? 43 : 44,
      release_candidate: false,
      quality_gate: false,
    },
  });
  child = await ProductionTaskRuntime.complete(child.id, {
    provider: "avantiqo-owned-vfx",
    settlement: "LOCAL_EXECUTION",
    file_url: artifact.storage_reference,
    asset_node_id: artifact.node.id,
    role,
    local_execution: true,
    provider_calls_performed: false,
  });
  return child;
}

async function dispatchPhysicalInteractionTask(task = {}) {
  try {
    await CreativeProductionDossierExecutionGate.approvedDossier(task);
    const refreshed = await ProductionTaskRuntime.get(task.id);
    const [project, assetNodes] = await Promise.all([
      CreativeProjectRepository.getById(refreshed.creative_project_id),
      CreativeAssetGraphRuntime.list({
        organization_id: refreshed.organization_id,
        creative_project_id: refreshed.creative_project_id,
      }),
    ]);
    if (!project) throw new Error("PHYSICAL_INTERACTION_PROJECT_REQUIRED");
    const vfxAsset = assetNodes.find((node) =>
      node.id === refreshed.input?.vfx_asset_node_id
    );
    const materialAsset = assetNodes.find((node) =>
      node.id === refreshed.input?.material_asset_node_id
    );
    if (!vfxAsset?.url) throw new Error("PHYSICAL_INTERACTION_VFX_ASSET_REQUIRED");
    if (!materialAsset?.url) throw new Error("PHYSICAL_INTERACTION_MATERIAL_ASSET_REQUIRED");
    const materialDownload = await downloadCreativeStorageReference({
      organization_id: refreshed.organization_id,
      reference: materialAsset.url,
    });
    const materialMap = await blobJson(materialDownload.blob);
    const result = await CreativePhysicalInteractionPassExecutionRuntime.execute({
      organization_id: refreshed.organization_id,
      creative_project_id: refreshed.creative_project_id,
      creative_mission_id:
        refreshed.metadata?.creative_mission_id ||
        project.creative_mission_id ||
        project.mission_id ||
        null,
      project,
      shot_id: refreshed.shot_id || refreshed.input?.shot_id,
      effect: refreshed.input?.effect,
      vfx_asset: vfxAsset,
      material_map: materialMap,
      output_spec: refreshed.input?.output_spec || {},
    });
    const completed = await ProductionTaskRuntime.complete(refreshed.id, {
      provider: "avantiqo-owned-vfx",
      settlement: "LOCAL_EXECUTION",
      output: result,
      local_execution: true,
      provider_calls_performed: false,
    });
    await createInteractionEvidenceTask({
      parent: completed,
      artifact: result.lighting,
      role: "LIGHTING_INTERACTION",
    });
    await createInteractionEvidenceTask({
      parent: completed,
      artifact: result.reflection_shadow,
      role: "REFLECTION_SHADOW",
    });
    return completed;
  } catch (error) {
    return ProductionTaskRuntime.fail(task.id, error);
  }
}

function localTrackingRotoOperation(task = {}) {
  const capability = String(task.capability || task.service_code || "").trim();
  if (capability === "creative.matchmove.solve") return "matchmove";
  if (capability === "creative.roto.propagate") return "roto";
  return null;
}

async function dispatchTrackingRotoTask(task = {}) {
  const operation = localTrackingRotoOperation(task);
  try {
    await CreativeProductionDossierExecutionGate.approvedDossier(task);
    const refreshed = await ProductionTaskRuntime.get(task.id);
    const project = await CreativeProjectRepository.getById(refreshed.creative_project_id);
    if (!project) throw new Error("TRACKING_ROTO_PROJECT_REQUIRED");
    if (operation === "matchmove") {
      const execution = await CreativeOpenCVMatchmoveExecutionRuntime.execute({
        organization_id: refreshed.organization_id,
        project,
        source_reference: refreshed.input?.source_reference,
        intrinsics: refreshed.input?.intrinsics || {},
        distortion: refreshed.input?.distortion || [0,0,0,0,0],
        sample_fps: refreshed.input?.sample_fps || 6,
        max_samples: refreshed.input?.max_samples || 180,
        rolling_shutter_model: refreshed.input?.rolling_shutter_model || null,
      });
      const artifact = await CreativeMatchmoveArtifactRuntime.persist({
        organization_id: refreshed.organization_id,
        creative_project_id: refreshed.creative_project_id,
        creative_mission_id: project.creative_mission_id || project.mission_id || null,
        shot_id: refreshed.shot_id || refreshed.input?.shot_id,
        reconstruction_contract_hash: refreshed.input?.reconstruction_contract_hash || refreshed.input?.requirements?.reconstruction_contract_hash,
        execution,
      });
      return ProductionTaskRuntime.complete(refreshed.id,{provider:"avantiqo-owned-tracking",settlement:"LOCAL_EXECUTION",file_url:artifact.storage_reference,asset_node_id:artifact.node.id,output:{execution,artifact},local_execution:true,provider_calls_performed:false,world_space_cgi_allowed:artifact.world_space_cgi_allowed});
    }
    if (operation === "roto") {
      const execution = await CreativeOpenCVRotoExecutionRuntime.execute({
        organization_id: refreshed.organization_id,
        project,
        source_reference: refreshed.input?.source_reference,
        seed_matte_reference: refreshed.input?.seed_matte_reference,
        subject_id: refreshed.input?.subject_id || refreshed.shot_id || "subject",
        tracking_asset_node_id: refreshed.input?.tracking_asset_node_id || "tracking",
        feather_sigma: refreshed.input?.feather_sigma || 1.4,
      });
      const artifact = await CreativeRotoArtifactRuntime.persist({
        organization_id: refreshed.organization_id,
        creative_project_id: refreshed.creative_project_id,
        creative_mission_id: project.creative_mission_id || project.mission_id || null,
        shot_id: refreshed.shot_id || refreshed.input?.shot_id,
        execution,
        upstream_asset_node_ids:[refreshed.input?.source_asset_node_id,refreshed.input?.seed_matte_asset_node_id,refreshed.input?.tracking_asset_node_id].filter(Boolean),
      });
      if (!artifact.passed) throw new Error(`ROTO_QC_FAILED:${artifact.blockers.join(",")}`);
      return ProductionTaskRuntime.complete(refreshed.id,{provider:"avantiqo-owned-roto",settlement:"LOCAL_EXECUTION",file_url:artifact.storage_reference,asset_node_id:artifact.node.id,output:{execution,artifact},local_execution:true,provider_calls_performed:false,roto_qc_passed:true});
    }
    throw new Error("TRACKING_ROTO_OPERATION_REQUIRED");
  } catch (error) {
    return ProductionTaskRuntime.fail(task.id,error);
  }
}

function localCinematicMotionOperation(task = {}) {
  const capability = String(task.capability || task.service_code || "").trim();
  const passRole = String(task.input?.requirements?.pass_role || "").trim().toUpperCase();
  return capability === "creative.motion.cinematic-design" && passRole === "CINEMATIC_MOTION_DESIGN"
    ? "execute"
    : null;
}

async function dispatchCinematicMotionTask(task = {}) {
  try {
    await CreativeProductionDossierExecutionGate.approvedDossier(task);
    const refreshed = await ProductionTaskRuntime.get(task.id);
    const project = await CreativeProjectRepository.getById(refreshed.creative_project_id);
    if (!project) throw new Error("CINEMATIC_MOTION_PROJECT_REQUIRED");
    const rendered = await CreativeCinematicMotionDesignRenderRuntime.render({
      project,
      plan: refreshed.input?.plan,
    });
    let finalRendered = rendered;
    if (rendered.exact_brand_lock_required === true) {
      const logos = rendered.exact_brand_logo_asset_node_ids || [];
      if (logos.length !== 1) throw new Error("CINEMATIC_BRAND_LOCK_SINGLE_EXACT_LOGO_REQUIRED");
      const plan = refreshed.input?.plan || {};
      const duration = Number(plan.frames || 1) / Math.max(1, Number(plan.fps || 24));
      const brandLock = await CreativeCinematicBrandLockRuntime.apply({
        organization_id: refreshed.organization_id,
        buffer: rendered.buffer,
        logo_asset_node_id: logos[0],
        width: Number(plan.width || 1920),
        height: Number(plan.height || 1080),
        duration_seconds: duration,
        policy: refreshed.input?.render_policy || {},
      });
      finalRendered = {
        ...rendered,
        buffer: brandLock.buffer,
        bytes: brandLock.buffer.length,
        brand_lock_applied: true,
        exact_brand_lock_contract: brandLock.contract,
        exact_logo_asset_node_id: brandLock.exact_logo_asset_node_id,
        exact_logo_checksum: brandLock.exact_logo_checksum,
        terminal_lock_start_seconds: brandLock.terminal_lock_start_seconds,
        generated_logo_pixels_used: false,
      };
    }
    const artifact = await CreativeMultiPassArtifactRuntime.persist({
      organization_id: refreshed.organization_id,
      creative_project_id: refreshed.creative_project_id,
      creative_mission_id: project.creative_mission_id || project.mission_id || null,
      shot_id: refreshed.shot_id || refreshed.input?.shot_id,
      pass_id: "cinematic-motion",
      artifact_kind: "CINEMATIC_MOTION_DESIGN",
      buffer: finalRendered.buffer,
      mime_type: finalRendered.mime_type || "video/quicktime",
      extension: "mov",
      provider_id: "blender",
      capability: "creative.motion.cinematic-design",
      metadata: {
        cinematic_motion_render_contract: finalRendered.contract,
        cinematic_motion_contract_hash: finalRendered.plan_contract_hash,
        cinematic_motion_render_identity: finalRendered.render_identity,
        cinematic_motion_sound_events: finalRendered.sound_events,
        exact_brand_lock_required: finalRendered.exact_brand_lock_required,
        exact_brand_logo_asset_node_ids: finalRendered.exact_brand_logo_asset_node_ids,
        exact_brand_lock_contract: finalRendered.exact_brand_lock_contract || null,
        exact_logo_asset_node_id: finalRendered.exact_logo_asset_node_id || null,
        exact_logo_checksum: finalRendered.exact_logo_checksum || null,
        generated_logo_pixels_used: finalRendered.generated_logo_pixels_used,
        brand_lock_applied: finalRendered.brand_lock_applied,
        world_space_rendered: finalRendered.world_space_rendered,
      },
    });
    const evaluation = CreativeCinematicMotionDesignQualityRuntime.evaluate({
      plan: refreshed.input?.plan,
      render: finalRendered,
    });
    let node = artifact.node;
    if (evaluation.passed) {
      node = await CreativeMultiPassArtifactRuntime.sealCinematicMotion({
        asset_node_id: artifact.node.id,
        motion_qc_seal_hash: evaluation.seal_hash,
        motion_contract_hash: refreshed.input?.plan?.contract_hash || null,
      });
    }
    const completed = await ProductionTaskRuntime.complete(refreshed.id, {
      provider: "avantiqo-owned-motion",
      settlement: "LOCAL_EXECUTION",
      file_url: artifact.storage_reference,
      asset_node_id: node.id,
      output: { render: rendered, qc: evaluation },
      local_execution: true,
      provider_calls_performed: false,
      cinematic_motion_qc_passed: evaluation.passed,
      cinematic_motion_qc_blockers: evaluation.blockers,
    });
    if (!evaluation.passed) {
      await ProductionTaskRuntime.update(completed.id, {
        metadata: {
          ...(completed.metadata || {}),
          cinematic_motion_blocked_for_downstream: true,
          cinematic_motion_qc_blockers: evaluation.blockers,
        },
      });
    }
    return completed;
  } catch (error) {
    return ProductionTaskRuntime.fail(task.id, error);
  }
}

function localPremiumLayerOperation(task = {}) {
  const capability = String(task.capability || task.service_code || "").trim();
  const passRole = String(
    task.input?.requirements?.pass_role ||
    task.metadata?.pass_role ||
    "",
  ).trim().toUpperCase();
  if (capability === "creative.vfx.atmosphere" && passRole === "ATMOSPHERE") return "atmosphere";
  if (capability === "creative.vfx.threat-hero-layer" && passRole === "THREAT_HERO_LAYER") return "threat-hero";
  return null;
}

async function dispatchPremiumLayerTask(task = {}) {
  const operation = localPremiumLayerOperation(task);
  try {
    await CreativeProductionDossierExecutionGate.approvedDossier(task);
    const refreshed = await ProductionTaskRuntime.get(task.id);
    const project = await CreativeProjectRepository.getById(refreshed.creative_project_id);
    if (!project) throw new Error("PREMIUM_LAYER_PROJECT_REQUIRED");
    const common = {
      organization_id: refreshed.organization_id,
      creative_project_id: refreshed.creative_project_id,
      creative_mission_id:
        refreshed.metadata?.creative_mission_id ||
        project.creative_mission_id ||
        project.mission_id ||
        null,
      project,
      shot_id: refreshed.shot_id || refreshed.input?.shot_id,
      output_spec: refreshed.input?.output_spec || {},
    };
    const result = operation === "atmosphere"
      ? await CreativeAtmospherePassExecutionRuntime.execute({
          ...common,
          environmental_continuity_state:
            refreshed.input?.environmental_continuity_state ||
            refreshed.input?.requirements?.environmental_continuity_state ||
            {},
        })
      : await CreativeThreatHeroLayerPassExecutionRuntime.execute({
          ...common,
          vfx_contract: refreshed.input?.vfx_contract,
          base_reference: refreshed.input?.base_reference,
          threat_reference: refreshed.input?.threat_reference,
          depth_reference: refreshed.input?.depth_reference,
          source_asset_node_id: refreshed.input?.source_asset_node_id || null,
        });
    const artifact = result.artifact;
    if (!artifact?.node?.id || !artifact.storage_reference) {
      throw new Error("PREMIUM_LAYER_ARTIFACT_REQUIRED");
    }
    return ProductionTaskRuntime.complete(refreshed.id, {
      provider: "avantiqo-owned-vfx",
      settlement: "LOCAL_EXECUTION",
      file_url: artifact.storage_reference,
      asset_node_id: artifact.node.id,
      output: result,
      local_execution: true,
      provider_calls_performed: false,
    });
  } catch (error) {
    return ProductionTaskRuntime.fail(task.id, error);
  }
}

function localVfxOperation(task = {}) {
  const capability = String(task.capability || task.service_code || "").trim();
  const passRole = String(
    task.input?.requirements?.pass_role ||
    task.metadata?.pass_role ||
    "",
  ).trim().toUpperCase();
  return capability === "creative.vfx.integrate" &&
    passRole === "VFX_INTEGRATION"
    ? "execute"
    : null;
}

async function dispatchVfxTask(task = {}) {
  try {
    await CreativeProductionDossierExecutionGate.approvedDossier(task);
    const refreshed = await ProductionTaskRuntime.get(task.id);
    const [project, assetNodes] = await Promise.all([
      CreativeProjectRepository.getById(refreshed.creative_project_id),
      CreativeAssetGraphRuntime.list({
        organization_id: refreshed.organization_id,
        creative_project_id: refreshed.creative_project_id,
      }),
    ]);
    if (!project) throw new Error("VFX_PROJECT_REQUIRED");
    const ids = new Set(refreshed.input?.simulation_asset_node_ids || []);
    const simulations = assetNodes.filter((node) => ids.has(node.id));
    if (simulations.length !== ids.size) {
      throw new Error("VFX_SIMULATION_ASSET_RESOLUTION_MISMATCH");
    }
    const result = await CreativeVfxIntegrationPassExecutionRuntime.execute({
      organization_id: refreshed.organization_id,
      creative_project_id: refreshed.creative_project_id,
      creative_mission_id:
        refreshed.metadata?.creative_mission_id ||
        project.creative_mission_id ||
        project.mission_id ||
        null,
      project,
      shot_id: refreshed.shot_id || refreshed.input?.shot_id,
      vfx_contract: refreshed.input?.vfx_contract,
      base_reference: refreshed.input?.base_reference,
      depth_reference: refreshed.input?.depth_reference,
      simulation_assets: simulations,
      output_spec: refreshed.input?.output_spec || {},
    });
    const first = result.outputs?.[0]?.artifact || null;
    return ProductionTaskRuntime.complete(refreshed.id, {
      provider: "avantiqo-owned-vfx",
      settlement: "LOCAL_EXECUTION",
      file_url: first?.storage_reference || null,
      asset_node_id: first?.node?.id || null,
      output: result,
      vfx_contract_hash: result.vfx_contract_hash,
      local_execution: true,
      provider_calls_performed: false,
    });
  } catch (error) {
    return ProductionTaskRuntime.fail(task.id, error);
  }
}

function localSimulationOperation(task = {}) {
  const capability = String(task.capability || task.service_code || "").trim();
  const passRole = String(
    task.input?.requirements?.pass_role ||
    task.metadata?.pass_role ||
    "",
  ).trim().toUpperCase();
  return capability === "creative.simulation.execute" &&
    passRole === "PHYSICAL_SIMULATION"
    ? "execute"
    : null;
}

async function dispatchSimulationTask(task = {}) {
  try {
    await CreativeProductionDossierExecutionGate.approvedDossier(task);
    const refreshed = await ProductionTaskRuntime.get(task.id);
    const project = await CreativeProjectRepository.getById(
      refreshed.creative_project_id,
    );
    if (!project) throw new Error("SIMULATION_PROJECT_REQUIRED");
    const simulationContract =
      refreshed.input?.simulation_contract ||
      refreshed.input?.requirements?.simulation_contract ||
      null;
    if (!simulationContract) {
      throw new Error("SIMULATION_TASK_CONTRACT_REQUIRED");
    }
    const result = await CreativeSimulationPassExecutionRuntime.execute({
      organization_id: refreshed.organization_id,
      creative_project_id: refreshed.creative_project_id,
      creative_mission_id:
        refreshed.metadata?.creative_mission_id ||
        project.creative_mission_id ||
        project.mission_id ||
        null,
      project,
      shot_id: refreshed.shot_id || refreshed.input?.shot_id,
      simulation_contract: simulationContract,
      output_spec: refreshed.input?.output_spec || {},
    });
    const first = result.outputs?.[0]?.artifact || null;
    return ProductionTaskRuntime.complete(refreshed.id, {
      provider: "avantiqo-owned-simulation",
      settlement: "LOCAL_EXECUTION",
      file_url: first?.storage_reference || null,
      asset_node_id: first?.node?.id || null,
      output: result,
      simulation_contract_hash: result.simulation_contract_hash,
      local_execution: true,
      provider_calls_performed: false,
    });
  } catch (error) {
    return ProductionTaskRuntime.fail(task.id, error);
  }
}

async function dispatchCreativeTask(task) {
  const foundationBound =
    await CreativeImageFoundationAuthorityRuntime.bind(task);
  const referenceBound =
    await CreativeImageGenerationReferenceCompilerRuntime.bind(foundationBound);
  const routed = routeCampaignTask(referenceBound);
  const documentOperation = localDocumentOperation(routed);
  if (documentOperation) {
    try {
      const output = documentOperation === "render"
        ? await CreativeDocumentProductionRuntime.render(routed)
        : await CreativeDocumentProductionRuntime.validate(routed);
      return ProductionTaskRuntime.complete(routed.id, {
        provider: "avantiqo-local-document-worker",
        settlement: "LOCAL_EXECUTION",
        output,
      });
    } catch (error) {
      return ProductionTaskRuntime.fail(routed.id, error);
    }
  }

  const stillOperation = localStillOperation(routed);
  if (stillOperation) {
    try {
      const output = stillOperation === "finish"
        ? await CreativeStillFinishingRuntime.finish(routed)
        : await CreativeStillFinishingRuntime.validate(routed);
      return ProductionTaskRuntime.complete(routed.id, {
        provider: "avantiqo-local-still-worker",
        settlement: "LOCAL_EXECUTION",
        output,
      });
    } catch (error) {
      return ProductionTaskRuntime.fail(routed.id, error);
    }
  }

  if (localImageAuthenticSourcePromotionOperation(routed)) {
    return dispatchImageAuthenticSourcePromotionTask(routed);
  }
  if (localSimulationOperation(routed)) return dispatchSimulationTask(routed);
  if (localTrackingRotoOperation(routed)) return dispatchTrackingRotoTask(routed);
  if (localCinematicMotionOperation(routed)) return dispatchCinematicMotionTask(routed);
  if (localImageDerivativeOperation(routed)) return dispatchImageDerivativeTask(routed);
  if (localPremiumLayerOperation(routed)) return dispatchPremiumLayerTask(routed);
  if (localVfxOperation(routed)) return dispatchVfxTask(routed);
  if (localPhysicalInteractionOperation(routed)) return dispatchPhysicalInteractionTask(routed);
  if (localCompositeOperation(routed)) return dispatchCompositeTask(routed);
  if (localOpticalOperation(routed)) return dispatchOpticalTask(routed);
  if (localWebsiteOperation(routed)) return dispatchWebsiteTask(routed);
  if (localSoftwareOperation(routed)) return dispatchSoftwareTask(routed);
  if (localAudioOperation(routed)) return dispatchAudioTask(routed);
  if (localCampaignOperation(routed)) return dispatchCampaignTask(routed);
  return ProductionTaskRuntime.dispatch(routed.id);
}

export const ProductionQueueRuntime = {
  async build({ organization_id, creative_project_id, production_graph_id = null }) {
    const [tasks, imageAssetNodes] = await Promise.all([
      ProductionTaskRuntime.list({
        organization_id,
        creative_project_id,
        production_graph_id,
      }),
      CreativeAssetGraphRuntime.list({ organization_id, creative_project_id }),
    ]);
    const map = new Map(tasks.map((task) => [task.id, task]));
    const active = tasks.filter((task) => !supersessionId(task));
    const queue = {
      waiting: [],
      ready: [],
      running: [],
      review: [],
      completed: [],
      failed: [],
      blocked: [],
      superseded: tasks.filter((task) => supersessionId(task)),
      total: active.length,
      historical_total: tasks.length,
    };

    for (const task of active) {
      const dependencies = task.depends_on || [];
      const hasFailedDependency = dependencies.some((id) => dependencyFailed(map, id));
      const canRun = dependencies.every((id) => dependencyComplete(map, id));
      const imageStudioReadiness =
        CreativeImageStudioCapabilityReadinessRuntime.evaluate({ task });
      const imageFoundationAuthority =
        CreativeImageFoundationAuthorityRuntime.evaluate({
          task,
          asset_nodes: imageAssetNodes,
        });
      const taskCapability = String(
        task.capability || task.service_code || task.service_id || "",
      ).trim().toLowerCase();
      const governedVideoTask = [
        "ai.video.generate",
        "ai.video.image_to_video",
        "ai.video.first_last_frame_to_video",
      ].includes(taskCapability);
      let imageStudioVideoReadiness = null;
      if (
        governedVideoTask &&
        ["WAITING", "PLANNING", "PLANNED", "READY"].includes(task.status)
      ) {
        const previsualizationAuthority =
          CreativeImagePrevisualizationAuthorityRuntime.evaluate({
            task,
            asset_nodes: imageAssetNodes,
          });
        const productionPackage = CreativeImageProductionPackageRuntime.build({
          task,
          asset_nodes: imageAssetNodes,
          previsualization_authority: previsualizationAuthority,
        });
        const shotReady = CreativeImageShotReadyRuntime.evaluate({
          task,
          previsualization_authority: previsualizationAuthority,
          production_package: productionPackage,
        });
        imageStudioVideoReadiness = {
          passed:
            previsualizationAuthority.passed === true &&
            productionPackage.passed === true &&
            shotReady.passed === true,
          previsualizationAuthority,
          productionPackage,
          shotReady,
        };
      }
      let closingImageStudioPackage = null;
      if (
        task.metadata?.image_studio_closing_authority_required === true &&
        ["WAITING", "PLANNING", "PLANNED", "READY"].includes(task.status)
      ) {
        closingImageStudioPackage = CreativeImageProductionPackageRuntime.build({
          task,
          asset_nodes: imageAssetNodes,
          previsualization_authority:
            task.input?.requirements?.previsualization_blueprint || null,
        });
      }
      if (
        imageFoundationAuthority.required === true &&
        imageFoundationAuthority.passed !== true &&
        ["WAITING", "PLANNING", "PLANNED", "READY"].includes(task.status)
      ) {
        queue.waiting.push({
          ...task,
          queue_wait_reason: {
            contract: imageFoundationAuthority.contract,
            code: "IMAGE_STUDIO_FOUNDATION_AUTHORITY_PENDING",
            failures: imageFoundationAuthority.failures,
            retryable: true,
          },
        });
      } else if (
        imageStudioVideoReadiness &&
        imageStudioVideoReadiness.passed !== true
      ) {
        queue.waiting.push({
          ...task,
          queue_wait_reason: {
            contract: "CREATIVE_IMAGE_VIDEO_READINESS_HOLD_V1",
            code: "IMAGE_STUDIO_VIDEO_PACKAGE_PENDING",
            previsualization_failures:
              imageStudioVideoReadiness.previsualizationAuthority.failures,
            production_package_failures:
              imageStudioVideoReadiness.productionPackage.failures,
            shot_ready_failures:
              imageStudioVideoReadiness.shotReady.failures,
            retryable: true,
          },
        });
      } else if (
        closingImageStudioPackage &&
        closingImageStudioPackage.passed !== true
      ) {
        queue.waiting.push({
          ...task,
          queue_wait_reason: {
            contract: closingImageStudioPackage.contract,
            code: "IMAGE_STUDIO_CLOSING_PACKAGE_PENDING",
            failures: closingImageStudioPackage.failures,
          },
        });
      } else if (
        imageStudioReadiness.required === true &&
        imageStudioReadiness.ready !== true &&
        !["COMPLETED", "FAILED", "RUNNING"].includes(task.status)
      ) {
        queue.blocked.push({
          ...task,
          queue_blocker: {
            contract: imageStudioReadiness.contract,
            code: "IMAGE_STUDIO_CAPABILITY_NOT_READY",
            capability: imageStudioReadiness.capability,
            provider_id: imageStudioReadiness.provider_id,
            blockers: imageStudioReadiness.blockers,
          },
        });
      } else if (hasFailedDependency && !["COMPLETED", "FAILED"].includes(task.status)) {
        queue.blocked.push(task);
      } else if (["WAITING", "PLANNING", "PLANNED"].includes(task.status) && canRun) {
        queue.ready.push(task);
      } else {
        const group = {
          READY: "ready",
          RUNNING: "running",
          REVIEW: "review",
          COMPLETED: "completed",
          FAILED: "failed",
          SKIPPED: "failed",
        }[task.status] || "waiting";
        queue[group].push(task);
      }
    }
    return queue;
  },

  async pollRunning(input, { maxTasks = 100 } = {}) {
    const queue = await this.build(input);
    const pending = queue.running.filter(hasPendingProviderJob).slice(0, maxTasks);
    const polled = [];
    for (const task of pending) polled.push(await ProductionTaskRuntime.poll(task.id));
    return { polled, total: polled.length };
  },

  async dispatchAll(input, {
    maxTasks = 100,
    maxPasses = 100,
    runPostProduction = true,
    pollRunning = true,
  } = {}) {
    const dispatched = [];
    const polled = [];
    const repairs = [];
    const repairBlocks = [];
    const initialQueue = await this.build(input);
    const masteredVideoRunningAtStart = initialQueue.running.filter(isMasteredNativeVideoTask);
    const masteredVideoLaneLimit = Math.max(1, Number(process.env.CREATIVE_MASTERED_VIDEO_CONCURRENCY || 6));
    let masteredVideoRunningCount = masteredVideoRunningAtStart.length;
    const masteredVideoDispatchedTaskIds = [];
    let passes = 0;

    while (passes < maxPasses && dispatched.length < maxTasks) {
      passes += 1;
      let progressed = false;

      if (input.production_graph_id) {
        const fastNext = await this.dispatchNext(input, {
          skipMasteredVideo:
            masteredVideoRunningCount >= masteredVideoLaneLimit,
        });
        if (fastNext) {
          dispatched.push(fastNext);
          if (isMasteredNativeVideoTask(fastNext)) {
            masteredVideoRunningCount += 1;
            if (fastNext.id) masteredVideoDispatchedTaskIds.push(fastNext.id);
          }
          continue;
        }
      }

      const imageAuthorityInvalidation =
        await CreativeImageAuthorityInvalidationRuntime.reconcile(input);
      if (imageAuthorityInvalidation.invalidated_asset_count > 0) {
        progressed = true;
      }

      const repair = await CreativeAutonomousRepairDirectorRuntime.ensure(input);
      if (repair.created.length) {
        repairs.push(...repair.created);
        progressed = true;
      }
      if (repair.blocked.length) repairBlocks.push(...repair.blocked);

      const simulationMaterialization =
        await CreativeSimulationTaskMaterializationRuntime.ensure(input);
      if (simulationMaterialization.created.length) progressed = true;

      const simulationReviews =
        await CreativeSimulationReviewTaskRuntime.ensure(input);
      if (simulationReviews.created.length) progressed = true;

      const trackingRotoMaterialization =
        await CreativeTrackingRotoTaskMaterializationRuntime.ensure(input);
      if (trackingRotoMaterialization.created.length) progressed = true;

      const cinematicMotionMaterialization =
        await CreativeCinematicMotionTaskMaterializationRuntime.ensure(input);
      if (cinematicMotionMaterialization.created.length) progressed = true;

      const vfxMaterialization =
        await CreativeVfxTaskMaterializationRuntime.ensure(input);
      if (vfxMaterialization.created.length) progressed = true;

      const premiumLayerMaterialization =
        await CreativePremiumLayerTaskMaterializationRuntime.ensure(input);
      if (premiumLayerMaterialization.created.length) progressed = true;

      const vfxReviews = await CreativeVfxReviewTaskRuntime.ensure(input);
      if (vfxReviews.created.length) progressed = true;

      const physicalInteractionMaterialization =
        await CreativePhysicalInteractionTaskMaterializationRuntime.ensure(input);
      if (physicalInteractionMaterialization.created.length) progressed = true;

      const compositeMaterialization =
        await CreativeCompositeTaskMaterializationRuntime.ensure(input);
      if (compositeMaterialization.created.length) progressed = true;

      const compositeReviews = await CreativeCompositeReviewTaskRuntime.ensure(input);
      if (compositeReviews.created.length) progressed = true;

      const opticalMaterialization =
        await CreativeOpticalTaskMaterializationRuntime.ensure(input);
      if (opticalMaterialization.created.length) progressed = true;

      const opticalReviews = await CreativeOpticalReviewTaskRuntime.ensure(input);
      if (opticalReviews.created.length) progressed = true;

      const shotEditRelease = await CreativeShotEditReleaseRuntime.ensure(input);
      if (shotEditRelease.changed === true) progressed = true;

      const editPreparation = await CreativeEditPreparationRuntime.ensure({
        ...input,
        render_policy: input.render_policy || input.compositing_policy || {},
      });
      if (editPreparation.changed === true) progressed = true;

      const imageAssets = await CreativeImageAssetReconciliationRuntime.reconcile(input);
      if (imageAssets.created.length) progressed = true;

      const imageExplorations = await CreativeImageAssetDesignExplorationRuntime.ensure(input);
      if (imageExplorations.created.length) progressed = true;

      const imageExplorationSelections = await CreativeImageAssetDesignExplorationRuntime.reconcile(input);
      if (imageExplorationSelections.selected.length) progressed = true;

      const imageAssetPackReviews = await CreativeImageAssetPackConsistencyRuntime.ensure(input);
      if (imageAssetPackReviews.created.length) progressed = true;

      const imageAssetPackQc = await CreativeImageAssetPackConsistencyRuntime.reconcile(input);
      if (imageAssetPackQc.sealed.length) progressed = true;

      const materialTruthReferences = await CreativeImageMaterialTruthPackRuntime.ensure(input);
      if (materialTruthReferences.created.length) progressed = true;

      const materialTruthAssets = await CreativeImageMaterialTruthPackRuntime.reconcile(input);
      if (materialTruthAssets.created.length) progressed = true;

      const materialTruthReviews = await CreativeImageMaterialTruthPackRuntime.ensureQc(input);
      if (materialTruthReviews.created.length) progressed = true;

      const materialTruthQc = await CreativeImageMaterialTruthPackRuntime.reconcileQc(input);
      if (materialTruthQc.sealed.length) progressed = true;

      const materialMeasurements = await CreativeImageMaterialMeasurementRuntime.ensure(input);
      if (materialMeasurements.created.length) progressed = true;

      const materialMeasurementQc = await CreativeImageMaterialMeasurementRuntime.reconcile(input);
      if (materialMeasurementQc.sealed.length) progressed = true;

      const imageDerivatives = await CreativeImageAssetDerivativeFactoryRuntime.ensure(input);
      if (imageDerivatives.created.length) progressed = true;

      const imageDerivativeAssets = await CreativeImageAssetDerivativeReconciliationRuntime.reconcile(input);
      if (imageDerivativeAssets.created.length) progressed = true;

      const imageDerivativeReviews = await CreativeImageAssetDerivativeQcRuntime.ensure(input);
      if (imageDerivativeReviews.created.length) progressed = true;

      const imageDerivativeQc = await CreativeImageAssetDerivativeQcRuntime.reconcile(input);
      if (imageDerivativeQc.sealed.length) progressed = true;

      const imageMultiViews = await CreativeImageAssetMultiViewRuntime.ensure(input);
      if (imageMultiViews.created.length) progressed = true;

      const imageMultiViewAssets = await CreativeImageAssetMultiViewRuntime.reconcile(input);
      if (imageMultiViewAssets.created.length) progressed = true;

      const imageMultiViewReviews = await CreativeImageAssetMultiViewRuntime.ensureQc(input);
      if (imageMultiViewReviews.created.length) progressed = true;

      const imageMultiViewQc = await CreativeImageAssetMultiViewRuntime.reconcileQc(input);
      if (imageMultiViewQc.sealed.length) progressed = true;

      const localizedImageRepairs = await CreativeImageAssetLocalizedRepairRuntime.ensure(input);
      if (localizedImageRepairs.created.length) progressed = true;

      const localizedImageRepairAssets = await CreativeImageAssetLocalizedRepairRuntime.reconcile(input);
      if (localizedImageRepairAssets.created.length) progressed = true;

      const localizedImageRepairReviews = await CreativeImageAssetLocalizedRepairRuntime.ensureReview(input);
      if (localizedImageRepairReviews.created.length) progressed = true;

      const localizedImageRepairQc = await CreativeImageAssetLocalizedRepairRuntime.reconcileReview(input);
      if (localizedImageRepairQc.sealed.length) progressed = true;

      const validations = await Promise.all([
        StillValidationTaskRuntime.ensure(input),
        WebsiteValidationTaskRuntime.ensure(input),
        SoftwareValidationTaskRuntime.ensure(input),
        AudioValidationTaskRuntime.ensure(input),
        CampaignValidationTaskRuntime.ensure(input),
      ]);
      if (validations.some((items) => items.length)) progressed = true;

      if (pollRunning) {
        const pollResult = await this.pollRunning(input, {
          maxTasks: Math.max(0, maxTasks - polled.length),
        });
        if (pollResult.total) {
          polled.push(...pollResult.polled);
          progressed = true;
        }
      }

      const next = await this.dispatchNext(input, {
        skipMasteredVideo: masteredVideoRunningCount >= masteredVideoLaneLimit,
      });
      if (next) {
        dispatched.push(next);
        progressed = true;
        if (isMasteredNativeVideoTask(next)) {
          masteredVideoRunningCount += 1;
          if (next.id) masteredVideoDispatchedTaskIds.push(next.id);
        }
      }
      if (!progressed) break;
    }

    const queue = await this.build(input);
    let finalisation = null;
    const settled = queue.total > 0 &&
      queue.ready.length === 0 &&
      queue.running.length === 0 &&
      queue.waiting.length === 0;
    if (runPostProduction && settled && !queue.failed.length && !queue.blocked.length) {
      finalisation = await CreativeFinalisationRouter.run(input);
    }
    return {
      dispatched,
      polled,
      repairs,
      repair_blocks: repairBlocks,
      total: dispatched.length,
      poll_total: polled.length,
      repair_total: repairs.length,
      passes,
      queue,
      finalisation,
      post_production: finalisation,
      dispatch_policy: {
        mastered_native_video_serialized: false,
        mastered_native_video_concurrency_limit: masteredVideoLaneLimit,
        mastered_native_video_running_at_start:
          masteredVideoRunningAtStart.map((task) => task.id),
        mastered_native_video_dispatched_task_ids:
          masteredVideoDispatchedTaskIds,
        mastered_native_video_dispatch_count:
          dispatched.filter(isMasteredNativeVideoTask).length,
      },
    };
  },

  async dispatchNext(input, { skipMasteredVideo = false } = {}) {
    const queue = await this.build(input);
    const eligible = skipMasteredVideo
      ? queue.ready.filter((task) => !isMasteredNativeVideoTask(task))
      : queue.ready;
    if (!eligible.length) return null;

    let next = [...eligible].sort(
      (left, right) => Number(left.priority || 100) - Number(right.priority || 100),
    )[0];
    next = routeCampaignTask(next);

    if (isStillQualityTask(next) && !next.metadata?.still_finish_task_id) {
      const finish = await ensureStillFinishTask(next);
      await ProductionTaskRuntime.markReady(finish.id);
      return dispatchCreativeTask(finish);
    }
    if (isStillQualityTask(next) && next.metadata?.still_finish_task_id) {
      next = await bindFinishedStillForReview(next);
    }
    if (isWebsiteQualityTask(next)) next = await bindWebsiteScreenshotForReview(next);
    if (isSoftwareQualityTask(next)) next = await bindSoftwareEvidenceForReview(next);
    if (isAudioQualityTask(next) && !next.metadata?.audio_finish_task_id) {
      const finish = await ensureAudioFinishTask(next);
      await ProductionTaskRuntime.markReady(finish.id);
      return dispatchCreativeTask(finish);
    }
    if (isAudioQualityTask(next) && next.metadata?.audio_finish_task_id) {
      next = await bindAudioEvidenceForReview(next);
    }
    if (isCampaignCoherenceTask(next) && !next.metadata?.campaign_package_task_id) {
      const packageTask = await ensureCampaignPackageTask(next);
      const dependencies = packageTask.depends_on || [];
      const current = await this.build(input);
      const completedIds = new Set(current.completed.map((task) => task.id));
      if (dependencies.every((id) => completedIds.has(id))) {
        await ProductionTaskRuntime.markReady(packageTask.id);
        return dispatchCreativeTask(packageTask);
      }
      return null;
    }
    if (isCampaignCoherenceTask(next) && next.metadata?.campaign_package_task_id) {
      next = await bindCampaignPackageForReview(next);
    }

    await ProductionTaskRuntime.markReady(next.id);
    return dispatchCreativeTask(next);
  },
};