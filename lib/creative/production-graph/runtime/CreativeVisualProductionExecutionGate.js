import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";

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

function reviewApproved(review = {}) {
  return review.status === "COMPLETED" &&
    review.review?.approved === true &&
    review.metadata?.automated_perceptual_validation_passed === true &&
    review.metadata?.generated_media_released_for_downstream === true;
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

    if (derivedFrameRequired(task) && !identityControlled(task)) {
      task = await bindApprovedDerivedFrame(task);
    }

    return dispatchWithoutVisualProductionGate(task.id);
  };
}

install();

export const CreativeVisualProductionExecutionGate = Object.freeze({
  installed: true,
  outputUrl,
  bindApprovedDerivedFrame,
});
