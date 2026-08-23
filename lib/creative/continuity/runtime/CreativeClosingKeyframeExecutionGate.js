import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.closing-keyframe-execution-gate.v1",
);
const KEYFRAME_CONTRACT = "CREATIVE_CLOSING_KEYFRAME_V1";
const REVIEW_CONTRACT = "CREATIVE_CLOSING_KEYFRAME_REVIEW_V1";
const BINDING_CONTRACT = "CREATIVE_APPROVED_CLOSING_KEYFRAME_BINDING_V1";
const FIRST_LAST_CAPABILITY = "ai.video.first_last_frame_to_video";

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
  return text(
    value.image_url ||
    value.imageUrl ||
    value.asset_url ||
    value.assetUrl ||
    value.file_url ||
    value.fileUrl ||
    value.url ||
    value.result?.url ||
    value.images?.[0]?.url,
  ) || null;
}

function reviewEvidence(output = {}) {
  const value = outputValue(output);
  const candidate = value.result || value.review || value.validation || value;
  if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
    return object(candidate);
  }
  const raw = text(candidate);
  if (!raw) return {};
  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first < 0 || last <= first) return {};
  try {
    return object(JSON.parse(raw.slice(first, last + 1)));
  } catch {
    return {};
  }
}

function reviewPassed(task = {}) {
  const evidence = reviewEvidence(task.output);
  const storyScore = finite(evidence.story_score);
  const compositionScore = finite(evidence.composition_score);
  const identityScore = finite(evidence.identity_score);
  const identityRequired = task.input?.requirements?.identity_expected === true;
  const minimumStory = finite(
    task.input?.requirements?.minimum_story_score,
  ) ?? 86;
  const minimumComposition = finite(
    task.input?.requirements?.minimum_composition_score,
  ) ?? 86;
  const minimumIdentity = finite(
    task.input?.requirements?.minimum_identity_score,
  ) ?? 90;

  return evidence.passed === true &&
    storyScore !== null && storyScore >= minimumStory &&
    compositionScore !== null && compositionScore >= minimumComposition &&
    (!identityRequired || (
      identityScore !== null &&
      identityScore >= minimumIdentity &&
      evidence.identity_preserved === true
    )) &&
    evidence.closing_state_correct === true &&
    evidence.camera_handoff_coherent === true &&
    evidence.artifacts_absent === true;
}

async function dependencyTasks(task = {}) {
  const dependencies = [];
  for (const id of list(task.depends_on)) {
    const dependency = await ProductionTaskRuntime.get(id);
    if (dependency) dependencies.push(dependency);
  }
  return dependencies;
}

function keyframeReferences(task = {}) {
  const requirements = object(task.input?.requirements);
  return [
    ...list(requirements.reference_images),
    ...list(requirements.identity_reference_images),
    requirements.identity_atlas_url,
    requirements.approved_identity_keyframe_url,
  ].filter(Boolean);
}

async function prepareClosingKeyframe(task = {}) {
  const references = keyframeReferences(task);
  return ProductionTaskRuntime.update(task.id, {
    input: {
      ...object(task.input),
      reference_images: references,
      source_assets: [
        ...list(task.input?.source_assets),
        ...references.map((value) => ({
          url: typeof value === "string" ? value : value?.url,
          role: "CLOSING_KEYFRAME_REFERENCE",
        })).filter((value) => value.url),
      ],
      generation: {
        ...object(task.input?.generation),
        instructions:
          "Render the immutable structured closing-frame specification exactly.",
        provider_parameters: {
          ...object(task.input?.generation?.provider_parameters),
          closing_keyframe_contract: KEYFRAME_CONTRACT,
          input_fidelity: "high",
        },
      },
      provider_parameters: {
        ...object(task.input?.provider_parameters),
        closing_keyframe_contract: KEYFRAME_CONTRACT,
        input_fidelity: "high",
      },
    },
    metadata: {
      ...object(task.metadata),
      closing_keyframe_generation_prepared: true,
      closing_keyframe_reference_count: references.length,
    },
  });
}

async function prepareClosingKeyframeReview(task = {}) {
  const dependencies = await dependencyTasks(task);
  const keyframe = dependencies.find((dependency) =>
    text(dependency.metadata?.contract) === KEYFRAME_CONTRACT,
  );
  if (!keyframe || text(keyframe.status).toUpperCase() !== "COMPLETED") {
    throw new Error("CREATIVE_CLOSING_KEYFRAME_GENERATION_NOT_COMPLETED");
  }
  const url = outputUrl(keyframe.output);
  if (!url) throw new Error("CREATIVE_CLOSING_KEYFRAME_OUTPUT_URL_REQUIRED");
  const references = keyframeReferences(keyframe);

  return ProductionTaskRuntime.update(task.id, {
    input: {
      ...object(task.input),
      image: url,
      media: url,
      source: url,
      assets: [
        { url, role: "GENERATED_CLOSING_KEYFRAME_UNDER_REVIEW" },
        ...references.map((value) => ({
          url: typeof value === "string" ? value : value?.url,
          role: "CLOSING_KEYFRAME_REFERENCE",
        })).filter((value) => value.url),
      ],
      generation: {
        ...object(task.input?.generation),
        instructions:
          "Evaluate the immutable closing-frame quality contract exactly and return strict JSON evidence.",
        provider_parameters: {
          ...object(task.input?.generation?.provider_parameters),
          response_format: { type: "json_object" },
        },
      },
      provider_parameters: {
        ...object(task.input?.provider_parameters),
        response_format: { type: "json_object" },
        closing_keyframe_task_id: keyframe.id,
      },
    },
    metadata: {
      ...object(task.metadata),
      closing_keyframe_task_id: keyframe.id,
      closing_keyframe_review_prepared: true,
    },
  });
}

function closingKeyframeRequired(task = {}) {
  return text(task.capability || task.service_code).toLowerCase() === FIRST_LAST_CAPABILITY &&
    (
      task.input?.requirements?.closing_keyframe_required === true ||
      task.input?.provider_parameters?.closing_keyframe_required === true ||
      Boolean(task.input?.requirements?.closing_keyframe_review_node_id)
    );
}

async function bindApprovedClosingKeyframe(task = {}) {
  const existingLastFrame = text(
    task.input?.last_frame ||
    task.input?.lastFrame ||
    task.input?.provider_parameters?.last_frame ||
    task.input?.generation?.provider_parameters?.last_frame,
  );
  if (existingLastFrame) return task;

  const dependencies = await dependencyTasks(task);
  const expectedReviewId = text(
    task.input?.requirements?.closing_keyframe_review_node_id ||
    task.input?.provider_parameters?.closing_keyframe_review_node_id,
  );
  const review = dependencies.find((dependency) =>
    text(dependency.metadata?.contract) === REVIEW_CONTRACT &&
    (!expectedReviewId || text(dependency.metadata?.execution_node_id) === expectedReviewId),
  );
  if (!review || text(review.status).toUpperCase() !== "COMPLETED") {
    throw new Error("CREATIVE_CLOSING_KEYFRAME_REVIEW_NOT_COMPLETED");
  }
  if (!reviewPassed(review)) {
    throw new Error("CREATIVE_CLOSING_KEYFRAME_REVIEW_FAILED");
  }

  const reviewDependencies = await dependencyTasks(review);
  const keyframe = reviewDependencies.find((dependency) =>
    text(dependency.metadata?.contract) === KEYFRAME_CONTRACT,
  );
  if (!keyframe || text(keyframe.status).toUpperCase() !== "COMPLETED") {
    throw new Error("CREATIVE_APPROVED_CLOSING_KEYFRAME_TASK_REQUIRED");
  }
  const url = outputUrl(keyframe.output);
  if (!url) throw new Error("CREATIVE_APPROVED_CLOSING_KEYFRAME_URL_REQUIRED");

  return ProductionTaskRuntime.update(task.id, {
    input: {
      ...object(task.input),
      last_frame: url,
      source_assets: [
        ...list(task.input?.source_assets).filter((asset) =>
          text(asset?.role) !== "APPROVED_CLOSING_KEYFRAME",
        ),
        {
          url,
          role: "APPROVED_CLOSING_KEYFRAME",
          source_production_task_id: keyframe.id,
          source_review_task_id: review.id,
        },
      ],
      generation: {
        ...object(task.input?.generation),
        provider_parameters: {
          ...object(task.input?.generation?.provider_parameters),
          last_frame: url,
          closing_keyframe_task_id: keyframe.id,
          closing_keyframe_review_task_id: review.id,
          closing_keyframe_approved: true,
        },
      },
      provider_parameters: {
        ...object(task.input?.provider_parameters),
        last_frame: url,
        closing_keyframe_task_id: keyframe.id,
        closing_keyframe_review_task_id: review.id,
        closing_keyframe_approved: true,
      },
    },
    metadata: {
      ...object(task.metadata),
      closing_keyframe_bound: true,
      closing_keyframe_task_id: keyframe.id,
      closing_keyframe_review_task_id: review.id,
      closing_keyframe_binding_contract: BINDING_CONTRACT,
    },
  });
}

function install() {
  if (ProductionTaskRuntime[INSTALL_FLAG]) return;
  const dispatchWithoutClosingKeyframe = ProductionTaskRuntime.dispatch.bind(
    ProductionTaskRuntime,
  );
  Object.defineProperty(ProductionTaskRuntime, INSTALL_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  ProductionTaskRuntime.dispatch = async function dispatchWithClosingKeyframe(id) {
    let task = await ProductionTaskRuntime.get(id);
    if (!task) throw new Error("Production task not found");
    const contract = text(task.metadata?.contract);

    if (contract === KEYFRAME_CONTRACT) {
      task = await prepareClosingKeyframe(task);
    } else if (contract === REVIEW_CONTRACT) {
      task = await prepareClosingKeyframeReview(task);
    } else if (closingKeyframeRequired(task)) {
      task = await bindApprovedClosingKeyframe(task);
    }

    return dispatchWithoutClosingKeyframe(task.id);
  };
}

install();

export const CreativeClosingKeyframeExecutionGate = Object.freeze({
  installed: true,
  keyframeContract: KEYFRAME_CONTRACT,
  reviewContract: REVIEW_CONTRACT,
  bindingContract: BINDING_CONTRACT,
  reviewPassed,
  bindApprovedClosingKeyframe,
});
