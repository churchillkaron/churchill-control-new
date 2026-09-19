import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";

const INSTALL_FLAG = Symbol.for("avantiqo.creative.visual-state-execution-gate.v1");
const STATE_CONTRACT = "CREATIVE_VISUAL_STATE_V1";
const REVIEW_CONTRACT = "CREATIVE_VISUAL_STATE_REVIEW_V1";
const BINDING_CONTRACT = "CREATIVE_APPROVED_VISUAL_STATE_BINDING_V1";

function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
function text(value) { return String(value ?? "").trim(); }
function finite(value) { const number = Number(value); return Number.isFinite(number) ? number : null; }

function outputValue(output = {}) { return output?.output?.output || output?.output || output || {}; }
function outputUrl(output = {}) {
  const value = outputValue(output);
  return text(value.image_url || value.imageUrl || value.asset_url || value.assetUrl || value.file_url || value.fileUrl || value.url || value.result?.url || value.images?.[0]?.url) || null;
}
function reviewEvidence(output = {}) {
  const value = outputValue(output);
  const candidate = value.result || value.review || value.validation || value;
  if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) return object(candidate);
  const raw = text(candidate);
  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first < 0 || last <= first) return {};
  try { return object(JSON.parse(raw.slice(first, last + 1))); } catch { return {}; }
}
export function visualStateReviewPassed(task = {}) {
  const evidence = reviewEvidence(task.output);
  const minimumVisual = finite(task.input?.requirements?.minimum_visual_score) ?? 94;
  const minimumComposition = finite(task.input?.requirements?.minimum_composition_score) ?? 94;
  const metrics = [
    "visual_hierarchy_score",
    "depth_score",
    "lighting_score",
    "material_realism_score",
    "production_design_score",
    "place_specificity_score",
    "scale_readability_score",
  ];
  if (evidence.passed !== true || evidence.matches_designed_frame !== true || evidence.artifacts_absent !== true) return false;
  if ((finite(evidence.composition_score) ?? -1) < minimumComposition) return false;
  for (const metric of metrics) if ((finite(evidence[metric]) ?? -1) < minimumVisual) return false;
  if (task.input?.requirements?.print_test_required === true) {
    if ((finite(evidence.iconic_frame_score) ?? -1) < 96 || evidence.would_print_as_world_class_campaign !== true) return false;
  }
  return true;
}

async function dependencyTasks(task = {}) {
  const dependencies = [];
  for (const id of list(task.depends_on)) {
    const dependency = await ProductionTaskRuntime.get(id);
    if (dependency) dependencies.push(dependency);
  }
  return dependencies;
}

async function prepareVisualState(task = {}) {
  return ProductionTaskRuntime.update(task.id, {
    input: {
      ...object(task.input),
      generation: {
        ...object(task.input?.generation),
        instructions: "Render the governed visual state exactly from the structured frame-design specification. Do not redesign the composition.",
        provider_parameters: {
          ...object(task.input?.generation?.provider_parameters),
          visual_state_contract: STATE_CONTRACT,
          composition_authority: "FRAME_DESIGN_ROOM",
          input_fidelity: "high",
        },
      },
      provider_parameters: {
        ...object(task.input?.provider_parameters),
        visual_state_contract: STATE_CONTRACT,
        composition_authority: "FRAME_DESIGN_ROOM",
        input_fidelity: "high",
      },
    },
    metadata: { ...object(task.metadata), visual_state_generation_prepared: true },
  });
}
async function prepareVisualStateReview(task = {}) {
  const dependencies = await dependencyTasks(task);
  const state = dependencies.find((dependency) => text(dependency.metadata?.contract) === STATE_CONTRACT);
  if (!state || text(state.status).toUpperCase() !== "COMPLETED") throw new Error("CREATIVE_VISUAL_STATE_NOT_COMPLETED");
  const url = outputUrl(state.output);
  if (!url) throw new Error("CREATIVE_VISUAL_STATE_OUTPUT_URL_REQUIRED");
  return ProductionTaskRuntime.update(task.id, {
    input: {
      ...object(task.input),
      image: url,
      media: url,
      source: url,
      assets: [{ url, role: `GENERATED_${text(task.metadata?.visual_state_role || "STATE")}_VISUAL_STATE` }],
      generation: {
        ...object(task.input?.generation),
        instructions: "Compare the generated frame against the structured Frame Design Room state. Reject any composition, depth, light, material, place, scale or hierarchy drift even when the image is attractive.",
        provider_parameters: { ...object(task.input?.generation?.provider_parameters), response_format: { type: "json_object" } },
      },
      provider_parameters: { ...object(task.input?.provider_parameters), response_format: { type: "json_object" }, visual_state_task_id: state.id },
    },
    metadata: { ...object(task.metadata), visual_state_task_id: state.id, visual_state_review_prepared: true },
  });
}

function visualStateConditioningRequired(task = {}) {
  return task.input?.requirements?.visual_state_conditioning_required === true || list(task.input?.requirements?.visual_state_review_node_ids).length > 0;
}

async function bindApprovedVisualStates(task = {}) {
  const dependencies = await dependencyTasks(task);
  const reviews = dependencies.filter((dependency) => text(dependency.metadata?.contract) === REVIEW_CONTRACT);
  const expected = list(task.input?.requirements?.visual_state_review_node_ids);
  if (!reviews.length || (expected.length && reviews.length < expected.length)) throw new Error("CREATIVE_VISUAL_STATE_REVIEWS_NOT_COMPLETED");
  const approved = [];
  for (const review of reviews) {
    if (text(review.status).toUpperCase() !== "COMPLETED") throw new Error("CREATIVE_VISUAL_STATE_REVIEW_NOT_COMPLETED");
    if (!visualStateReviewPassed(review)) throw new Error(`CREATIVE_VISUAL_STATE_REVIEW_FAILED:${review.id}`);
    const stateDependencies = await dependencyTasks(review);
    const state = stateDependencies.find((dependency) => text(dependency.metadata?.contract) === STATE_CONTRACT);
    if (!state || text(state.status).toUpperCase() !== "COMPLETED") throw new Error("CREATIVE_APPROVED_VISUAL_STATE_REQUIRED");
    const url = outputUrl(state.output);
    if (!url) throw new Error("CREATIVE_APPROVED_VISUAL_STATE_URL_REQUIRED");
    approved.push({ role: text(review.metadata?.visual_state_role).toUpperCase(), url, state_task_id: state.id, review_task_id: review.id });
  }
  const opening = approved.find((item) => item.role === "OPENING");
  const closing = approved.find((item) => item.role === "CLOSING");
  const hero = approved.find((item) => item.role === "HERO");
  return ProductionTaskRuntime.update(task.id, {
    input: {
      ...object(task.input),
      ...(opening ? { first_frame: opening.url, source_image: opening.url } : {}),
      ...(closing ? { last_frame: closing.url } : {}),
      ...(hero ? { keyframes: [...list(task.input?.keyframes), { reference: hero.url, frame_fraction: 0.5, strength: 1, crf: 0, role: "APPROVED_HERO_VISUAL_STATE" }] } : {}),
      source_assets: [
        ...list(task.input?.source_assets).filter((asset) => !text(asset?.role).startsWith("APPROVED_VISUAL_STATE_")),
        ...approved.map((item) => ({ url: item.url, role: `APPROVED_VISUAL_STATE_${item.role}`, source_production_task_id: item.state_task_id, source_review_task_id: item.review_task_id })),
      ],
      generation: {
        ...object(task.input?.generation),
        provider_parameters: {
          ...object(task.input?.generation?.provider_parameters),
          visual_state_conditioning_approved: true,
          visual_state_count: approved.length,
          ...(opening ? { first_frame: opening.url } : {}),
          ...(closing ? { last_frame: closing.url } : {}),
        },
      },
      provider_parameters: {
        ...object(task.input?.provider_parameters),
        visual_state_conditioning_approved: true,
        visual_state_count: approved.length,
        ...(opening ? { first_frame: opening.url } : {}),
        ...(closing ? { last_frame: closing.url } : {}),
      },
    },
    metadata: {
      ...object(task.metadata),
      visual_state_conditioning_bound: true,
      visual_state_binding_contract: BINDING_CONTRACT,
      approved_visual_states: approved,
    },
  });
}

function install() {
  if (ProductionTaskRuntime[INSTALL_FLAG]) return;
  const dispatchWithoutVisualStateGate = ProductionTaskRuntime.dispatch.bind(ProductionTaskRuntime);
  Object.defineProperty(ProductionTaskRuntime, INSTALL_FLAG, { value: true, enumerable: false, configurable: false });
  ProductionTaskRuntime.dispatch = async function dispatchWithVisualStateGate(id) {
    let task = await ProductionTaskRuntime.get(id);
    if (!task) throw new Error("Production task not found");
    const contract = text(task.metadata?.contract);
    if (contract === STATE_CONTRACT) task = await prepareVisualState(task);
    else if (contract === REVIEW_CONTRACT) task = await prepareVisualStateReview(task);
    else if (visualStateConditioningRequired(task)) task = await bindApprovedVisualStates(task);
    return dispatchWithoutVisualStateGate(task.id);
  };
}

install();

export const CreativeVisualStateExecutionGate = Object.freeze({
  installed: true,
  stateContract: STATE_CONTRACT,
  reviewContract: REVIEW_CONTRACT,
  bindingContract: BINDING_CONTRACT,
  reviewPassed: visualStateReviewPassed,
  bindApprovedVisualStates,
});
