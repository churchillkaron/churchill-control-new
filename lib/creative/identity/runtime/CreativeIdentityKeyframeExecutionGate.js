import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import * as AssetGraphRepository
from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.identity-keyframe-execution-gate.v1",
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

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
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
    null;
}

function reviewEvidence(output = {}) {
  const value = outputValue(output);
  return object(
    value.result ||
    value.review ||
    value.validation ||
    value,
  );
}

function reviewPassed(task = {}) {
  const evidence = reviewEvidence(task.output);
  const identityScore = finite(
    evidence.identity_score ||
    evidence.identityScore,
  );
  const storyScore = finite(
    evidence.story_score ||
    evidence.storyScore,
  );
  const totalScore = finite(
    evidence.total_score ||
    evidence.totalScore ||
    evidence.score,
  );
  const minimumIdentity = finite(task.metadata?.minimum_identity_score) ?? 90;
  const minimumStory = finite(task.metadata?.minimum_story_score) ?? 85;
  const minimumTotal = finite(task.metadata?.minimum_total_score) ?? 88;

  return evidence.passed === true &&
    identityScore !== null && identityScore >= minimumIdentity &&
    storyScore !== null && storyScore >= minimumStory &&
    totalScore !== null && totalScore >= minimumTotal &&
    evidence.person_count_correct !== false &&
    evidence.requested_angle_correct !== false &&
    evidence.background_is_new_story_environment !== false;
}

async function dependencyTasks(task = {}) {
  const dependencies = [];
  for (const id of list(task.depends_on)) {
    const dependency = await ProductionTaskRuntime.get(id);
    if (dependency) dependencies.push(dependency);
  }
  return dependencies;
}

async function approvedAtlas(task = {}) {
  const atlasId = text(
    task.metadata?.identity_atlas_asset_node_id ||
    task.input?.requirements?.identity_atlas_asset_node_id ||
    task.input?.generation?.provider_parameters?.identity_atlas_asset_node_id ||
    task.input?.provider_parameters?.identity_atlas_asset_node_id,
  );
  if (!atlasId) throw new Error("IDENTITY_ATLAS_ASSET_NODE_REQUIRED");
  const atlas = await AssetGraphRepository.getById(atlasId);
  if (!atlas || atlas.organization_id !== task.organization_id) {
    throw new Error("IDENTITY_ATLAS_NOT_FOUND");
  }
  if (atlas.metadata?.contract !== "IDENTITY_ATLAS_V1") {
    throw new Error("IDENTITY_ATLAS_CONTRACT_INVALID");
  }
  if (atlas.review?.approved !== true || atlas.review?.human_reviewed !== true) {
    throw new Error("IDENTITY_ATLAS_HUMAN_APPROVAL_REQUIRED");
  }
  if (!atlas.url) throw new Error("IDENTITY_ATLAS_URL_REQUIRED");
  return atlas;
}

async function prepareKeyframeGeneration(task = {}) {
  const atlas = await approvedAtlas(task);
  return ProductionTaskRuntime.update(task.id, {
    input: {
      ...object(task.input),
      image: atlas.url,
      media: atlas.url,
      source: atlas.url,
      identity_source: atlas.url,
      reference_images: [
        { url: atlas.url, role: "IDENTITY_ATLAS" },
        ...list(task.input?.generation?.provider_parameters?.reference_images),
        ...list(task.input?.provider_parameters?.reference_images),
      ],
      provider_parameters: {
        ...object(task.input?.provider_parameters),
        ...object(task.input?.generation?.provider_parameters),
        identity_atlas_asset_node_id: atlas.id,
        identity_atlas_url: atlas.url,
        identity_atlas_hash: atlas.metadata?.identity_atlas_hash || null,
        use_reference_image_edit: true,
        input_fidelity: "high",
      },
      generation: {
        ...object(task.input?.generation),
        provider_parameters: {
          ...object(task.input?.generation?.provider_parameters),
          identity_atlas_asset_node_id: atlas.id,
          identity_atlas_url: atlas.url,
          identity_atlas_hash: atlas.metadata?.identity_atlas_hash || null,
          use_reference_image_edit: true,
          input_fidelity: "high",
        },
      },
    },
    metadata: {
      ...object(task.metadata),
      identity_atlas_bound: true,
      identity_atlas_asset_node_id: atlas.id,
      identity_atlas_hash: atlas.metadata?.identity_atlas_hash || null,
    },
  });
}

async function prepareKeyframeReview(task = {}) {
  const dependencies = await dependencyTasks(task);
  const keyframe = dependencies.find((dependency) =>
    dependency.metadata?.contract === "IDENTITY_STORY_KEYFRAME_V1" ||
    dependency.metadata?.identity_keyframe_for_shot_id,
  );
  if (!keyframe || keyframe.status !== "COMPLETED") {
    throw new Error("IDENTITY_KEYFRAME_GENERATION_NOT_COMPLETED");
  }
  const url = outputUrl(keyframe.output);
  if (!url) throw new Error("IDENTITY_KEYFRAME_OUTPUT_URL_REQUIRED");
  const atlas = await approvedAtlas(task);

  return ProductionTaskRuntime.update(task.id, {
    input: {
      ...object(task.input),
      image: url,
      media: url,
      source: url,
      assets: [
        { url, role: "GENERATED_IDENTITY_KEYFRAME" },
        { url: atlas.url, role: "APPROVED_IDENTITY_ATLAS" },
      ],
      generated_keyframe: {
        task_id: keyframe.id,
        url,
      },
      identity_atlas: {
        asset_node_id: atlas.id,
        url: atlas.url,
        hash: atlas.metadata?.identity_atlas_hash || null,
      },
      provider_parameters: {
        ...object(task.input?.provider_parameters),
        ...object(task.input?.generation?.provider_parameters),
        response_format: { type: "json_object" },
      },
    },
    metadata: {
      ...object(task.metadata),
      identity_keyframe_task_id: keyframe.id,
      identity_keyframe_url_bound: true,
      identity_atlas_asset_node_id: atlas.id,
    },
  });
}

async function prepareVideoFromKeyframe(task = {}) {
  const dependencies = await dependencyTasks(task);
  const review = dependencies.find((dependency) =>
    dependency.metadata?.contract === "IDENTITY_KEYFRAME_REVIEW_V1" ||
    dependency.metadata?.identity_keyframe_review_for_shot_id,
  );
  if (!review || review.status !== "COMPLETED") {
    throw new Error("IDENTITY_KEYFRAME_REVIEW_NOT_COMPLETED");
  }
  if (!reviewPassed(review)) {
    throw new Error("IDENTITY_KEYFRAME_REVIEW_FAILED");
  }
  if (review.review?.approved !== true || review.review?.required === false) {
    throw new Error("IDENTITY_KEYFRAME_HUMAN_APPROVAL_REQUIRED");
  }
  const reviewDependencies = await dependencyTasks(review);
  const keyframe = reviewDependencies.find((dependency) =>
    dependency.metadata?.contract === "IDENTITY_STORY_KEYFRAME_V1" ||
    dependency.metadata?.identity_keyframe_for_shot_id,
  );
  if (!keyframe || keyframe.status !== "COMPLETED") {
    throw new Error("APPROVED_IDENTITY_KEYFRAME_TASK_REQUIRED");
  }
  const url = outputUrl(keyframe.output);
  if (!url) throw new Error("APPROVED_IDENTITY_KEYFRAME_URL_REQUIRED");

  return ProductionTaskRuntime.update(task.id, {
    input: {
      ...object(task.input),
      image: url,
      source: url,
      prompt_image: url,
      identity_source: url,
      source_assets: [
        { url, role: "APPROVED_IDENTITY_STORY_KEYFRAME" },
      ],
      identity_lock: {
        ...object(task.input?.identity_lock || task.input?.generation?.identity_lock),
        required: true,
        approved_keyframe_task_id: keyframe.id,
        approved_keyframe_review_task_id: review.id,
        approved_keyframe_url: url,
        verification_required: true,
      },
      generation: {
        ...object(task.input?.generation),
        identity_lock: {
          ...object(task.input?.generation?.identity_lock),
          required: true,
          approved_keyframe_task_id: keyframe.id,
          approved_keyframe_review_task_id: review.id,
          approved_keyframe_url: url,
          verification_required: true,
        },
        provider_parameters: {
          ...object(task.input?.generation?.provider_parameters),
          identity_keyframe_task_id: keyframe.id,
          identity_keyframe_review_task_id: review.id,
          identity_keyframe_url: url,
          identity_keyframe_approved: true,
        },
      },
      provider_parameters: {
        ...object(task.input?.provider_parameters),
        identity_keyframe_task_id: keyframe.id,
        identity_keyframe_review_task_id: review.id,
        identity_keyframe_url: url,
        identity_keyframe_approved: true,
      },
    },
    metadata: {
      ...object(task.metadata),
      identity_keyframe_task_id: keyframe.id,
      identity_keyframe_review_task_id: review.id,
      identity_keyframe_bound: true,
      identity_keyframe_human_approved: true,
    },
  });
}

function install() {
  if (ProductionTaskRuntime[INSTALL_FLAG]) return;
  const dispatchWithoutGate = ProductionTaskRuntime.dispatch.bind(
    ProductionTaskRuntime,
  );
  Object.defineProperty(ProductionTaskRuntime, INSTALL_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  ProductionTaskRuntime.dispatch = async function dispatchWithIdentityKeyframeGate(id) {
    let task = await ProductionTaskRuntime.get(id);
    if (!task) throw new Error("Production task not found");
    const contract = text(task.metadata?.contract);
    const keyframeRequired =
      task.input?.requirements?.identity_keyframe_required === true ||
      task.input?.generation?.provider_parameters?.identity_keyframe_required === true ||
      task.input?.provider_parameters?.identity_keyframe_required === true ||
      Boolean(task.metadata?.identity_keyframe_review_node_id);

    if (contract === "IDENTITY_STORY_KEYFRAME_V1") {
      task = await prepareKeyframeGeneration(task);
    } else if (contract === "IDENTITY_KEYFRAME_REVIEW_V1") {
      task = await prepareKeyframeReview(task);
    } else if (keyframeRequired) {
      task = await prepareVideoFromKeyframe(task);
    }

    return dispatchWithoutGate(task.id);
  };
}

install();

export const CreativeIdentityKeyframeExecutionGate = {
  installed: true,
  outputUrl,
  reviewPassed,
};
