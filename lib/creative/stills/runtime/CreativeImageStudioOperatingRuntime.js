import { CREATIVE_AGENCY_ROLES } from "../../director/registry/CreativeAgencyRoleRegistry.js";
import { planCreativeStillWorldClassProduction } from "./CreativeStillWorldClassPlanningRuntime.js";
import { resolveCreativeStillReferences } from "./CreativeStillReferenceIntelligenceRuntime.js";
import { CreativeImageVisualBibleRuntime } from "../../image/runtime/CreativeImageVisualBibleRuntime.js";
import { CreativeStillFinishingChainRuntime } from "./CreativeStillFinishingChainRuntime.js";

const STAGES = Object.freeze([
  { id: "direction", label: "Direction", detail: "Purpose, audience, concept, art direction and brand truth." },
  { id: "references", label: "References", detail: "Source images, identity, products, places, style and brand evidence." },
  { id: "create", label: "Create", detail: "Generate or source the visual material required by the approved direction." },
  { id: "compose", label: "Compose", detail: "Build exact layout, typography, logos, data and responsive variants." },
  { id: "refine", label: "Refine", detail: "Retouch, repair, relight, inpaint, outpaint and finish without unnecessary regeneration." },
  { id: "review", label: "Review", detail: "Art direction, realism, brand, copy, layout and technical quality gates." },
  { id: "deliver", label: "Deliver", detail: "Approved channel variants, print/digital masters and release evidence." },
]);

const WORLD_CLASS_CONTROLS = Object.freeze([
  { id: "business_intent", label: "Business intent", execution: "DYNAMIC", reason: "The job begins from outcome, audience, channel and business truth rather than provider syntax." },
  { id: "subject_identity", label: "Subject / identity reference", execution: "EVIDENCE_BOUND", reason: "People, products and hero objects retain identity from governed references." },
  { id: "style_system", label: "Style system", execution: "REFERENCE_BOUND", reason: "Style is reusable campaign direction, not a one-off generation accident." },
  { id: "composition_structure", label: "Composition / structure", execution: "DIRECTOR_BOUND", reason: "Framing, depth and element placement can be constrained independently from style." },
  { id: "local_editing", label: "Local editing", execution: "BOUNDED_REPAIR", reason: "Inpaint, outpaint, cleanup, relight and repair preserve approved work where possible." },
  { id: "exact_design", label: "Exact graphic design", execution: "DETERMINISTIC", reason: "Typography, logos, business facts, grids and geometry remain editable and exact." },
  { id: "vector_master", label: "Vector / scalable master", execution: "DETERMINISTIC", reason: "Design work can preserve structured/vector masters instead of flattening early." },
  { id: "format_adaptation", label: "Multi-format adaptation", execution: "DIRECTOR_SPECIFIED", reason: "Channel variants recompose hierarchy and crops rather than merely resize." },
  { id: "independent_review", label: "Independent review", execution: "QUALITY_GATE", reason: "Art direction, realism, brand, copy and technical quality are reviewed separately from creation." },
  { id: "release_evidence", label: "Release evidence", execution: "GOVERNED", reason: "Approved masters retain source, version, review and delivery evidence." },
]);

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return String(value ?? "").trim();
}

function assetUrl(asset) {
  return asset?.image_url || asset?.thumbnail_url || asset?.file_url || asset?.uri || asset?.url || "";
}

function isImage(asset) {
  const type = text(asset?.asset_type || asset?.mime_type || asset?.type).toLowerCase();
  return type.includes("image") || /\.(png|jpe?g|webp|gif|avif)(\?|$)/i.test(assetUrl(asset));
}

function isReference(asset) {
  const role = text(asset?.role || asset?.reference_role || asset?.metadata?.reference_role).toUpperCase();
  const tags = list(asset?.tags).map((item) => text(item).toUpperCase());
  return role.includes("REFERENCE") || tags.some((tag) => tag.includes("REFERENCE"));
}

function taskText(task) {
  return [task?.type, task?.title, task?.description, task?.capability, task?.service_code, task?.metadata?.production_step_id]
    .map(text)
    .join(" ")
    .toLowerCase();
}

function taskMatches(task, words) {
  const haystack = taskText(task);
  return words.some((word) => haystack.includes(word));
}

function completed(task) {
  return ["COMPLETED", "APPROVED", "PASSED", "RELEASED", "PUBLISHED"].includes(text(task?.status).toUpperCase());
}

function stageState({ complete = false, active = false, blocked = false } = {}) {
  if (blocked) return "BLOCKED";
  if (complete) return "COMPLETE";
  if (active) return "ACTIVE";
  return "UPCOMING";
}

function activeIndex(stages) {
  const explicit = stages.findIndex((stage) => stage.state === "ACTIVE" || stage.state === "BLOCKED");
  if (explicit >= 0) return explicit;
  const firstUpcoming = stages.findIndex((stage) => stage.state === "UPCOMING");
  return firstUpcoming >= 0 ? firstUpcoming : stages.length - 1;
}

export function buildCreativeImageStudioOperatingState(runtime = {}) {
  const assets = list(runtime.assetRuntime?.items);
  const images = assets.filter(isImage);
  const references = assets.filter(isReference);
  const tasks = list(runtime.taskRuntime?.items);
  const project = runtime.projectRuntime?.current || null;
  const mission = runtime.missionRuntime?.current || null;
  const strategy = runtime.strategyRuntime?.current || null;
  const concepts = list(runtime.conceptRuntime?.items);
  const director = runtime.directorRuntime?.current || null;
  const render = runtime.renderRuntime?.current || null;
  const publishing = runtime.publishingRuntime?.current || null;

  const worldClassPlan = planCreativeStillWorldClassProduction({
    mission,
    project,
    brief: runtime.briefRuntime?.current || null,
    assets,
    deliverables: list(runtime.strategyRuntime?.current?.production_direction?.deliverables || runtime.projectRuntime?.current?.metadata?.deliverables),
  });
  const referenceIntelligence = resolveCreativeStillReferences({
    assets,
    requirements: {
      identity_required: worldClassPlan.controls.subject_identity === true,
      product_required: worldClassPlan.controls.product_fidelity === true,
      brand_required: false,
      style_required: worldClassPlan.controls.style_system === true,
      composition_required: false,
      location_required: false,
    },
  });
  const visualBible = CreativeImageVisualBibleRuntime.build({
    asset_nodes: assets,
    requirements: {
      required_classes: [
        worldClassPlan.controls.subject_identity ? "CHARACTER" : null,
        worldClassPlan.controls.product_fidelity ? "PRODUCT" : null,
        worldClassPlan.controls.location_authority ? "LOCATION" : null,
      ].filter(Boolean),
    },
  });
  const directionReady = Boolean(strategy || concepts.length || director || mission?.approved_at || project?.approved_at);
  const referencesReady = referenceIntelligence.ready === true &&
    (worldClassPlan.controls.persistent_visual_bible !== true || visualBible.ready === true);
  const createTasks = tasks.filter((task) => taskMatches(task, ["image.generate", "generate image", "image generation", "still source"]));
  const compositionTasks = tasks.filter((task) => taskMatches(task, ["design", "composition", "layout", "typeset", "typography", "still finish"]));
  const refineTasks = tasks.filter((task) => taskMatches(task, ["inpaint", "outpaint", "retouch", "repair", "re-light", "relight", "background remove", "composite"]));
  const reviewTasks = tasks.filter((task) => taskMatches(task, ["quality", "review", "validate", "perceptual", "brand compliance"]));
  const deliveryTasks = tasks.filter((task) => taskMatches(task, ["release", "publish", "export", "delivery", "render master"]));
  const finishingChain = CreativeStillFinishingChainRuntime.build({ tasks, plan: worldClassPlan, assets: images });

  const createReady = images.length > 0 || createTasks.some(completed);
  const compositionReady = compositionTasks.some(completed) || images.some((asset) => asset?.metadata?.design_document_id || asset?.design_document_id);
  const refinementReady = finishingChain.stages.some((stage) => stage.required)
    ? finishingChain.passed === true
    : (refineTasks.some(completed) || images.some((asset) => Number(asset?.revision || asset?.version || 1) > 1));
  const worldClassReviewedImages = images.filter((asset) => {
    const state = text(asset?.approval_state || asset?.status).toUpperCase();
    const metadata = asset?.metadata || {};
    return ["APPROVED", "PASSED", "RELEASE_READY"].includes(state) &&
      metadata.image_asset_perceptual_qc_sealed === true &&
      metadata.release_approved === true;
  });
  const reviewReady = worldClassReviewedImages.length > 0 && reviewTasks.some(completed);
  const deliveryReady = reviewReady && (Boolean(publishing?.published_at || publishing?.status === "COMPLETED" || render?.release_ready) || deliveryTasks.some(completed));

  const raw = [
    { complete: directionReady, active: !directionReady },
    { complete: referencesReady && directionReady, active: directionReady && !referencesReady },
    { complete: createReady, active: referencesReady && !createReady },
    { complete: compositionReady, active: createReady && !compositionReady },
    { complete: refinementReady, active: compositionReady && !refinementReady },
    { complete: reviewReady, active: (refinementReady || compositionReady) && !reviewReady },
    { complete: deliveryReady, active: reviewReady && !deliveryReady },
  ];
  const stages = STAGES.map((stage, index) => ({ ...stage, state: stageState(raw[index]) }));
  const index = activeIndex(stages);

  const roleMap = new Map(CREATIVE_AGENCY_ROLES.map((role) => [role.id, role]));
  const team = worldClassPlan.active_role_ids.map((id) => roleMap.get(id)).filter(Boolean).map((role) => ({
    ...role,
    status: "ACTIVE",
  }));

  const approvedImages = images.filter((asset) => ["APPROVED", "PASSED", "RELEASE_READY"].includes(text(asset?.approval_state || asset?.status).toUpperCase())).length;
  const reviewOpen = reviewTasks.filter((task) => !completed(task)).length;

  return {
    contract: "CREATIVE_IMAGE_STUDIO_OPERATING_STATE_V1",
    project,
    mission,
    stages,
    active_stage_index: index,
    active_stage: stages[index] || stages[0],
    team,
    counts: {
      images: images.length,
      references: references.length,
      tasks: tasks.length,
      approved_images: approvedImages,
      review_open: reviewOpen,
    },
    references,
    reference_intelligence: referenceIntelligence,
    visual_bible: visualBible,
    finishing_chain: finishingChain,
    images,
    world_class_controls: WORLD_CLASS_CONTROLS,
    world_class_plan: worldClassPlan,
    departments: worldClassPlan.departments,
    interaction: {
      prompt_free: true,
      dynamic_planning: true,
      provider_prompts_user_visible: false,
      user_input_model: "NATURAL_LANGUAGE_OUTCOME_AND_FEEDBACK",
      planning_sources: [
        "BUSINESS_CONTEXT",
        "CREATIVE_MISSION",
        "APPROVED_BRIEF",
        "ORGANIZATION_BRAND_EVIDENCE",
        "PROJECT_ASSETS",
        "CHANNEL_AND_DELIVERABLE_REQUIREMENTS",
        "APPROVAL_HISTORY",
      ],
    },
    quality: {
      release_ready: deliveryReady,
      approved_images: approvedImages,
      world_class_reviewed_images: worldClassReviewedImages.length,
      review_open: reviewOpen,
      independent_review_evidence_required: true,
      perceptual_qc_seal_required: true,
      release_approval_required: true,
      visual_bible_required: worldClassPlan.controls.persistent_visual_bible === true,
      visual_bible_ready: visualBible.ready === true,
      visual_bible_digest: visualBible.bible_digest,
      finishing_chain_required: finishingChain.stages.some((stage) => stage.required),
      finishing_chain_ready: finishingChain.passed === true,
      finishing_chain_digest: finishingChain.final_chain_digest,
      finishing_blockers: finishingChain.failures,
      exact_brand_assets_required: true,
      deterministic_typography_required: true,
      premium_graphic_benchmark: worldClassPlan.premium_graphic_benchmark,
      premium_typography_minimum: worldClassPlan.premium_graphic_benchmark?.typography_floor || null,
      premium_alignment_minimum: worldClassPlan.premium_graphic_benchmark?.alignment_floor || null,
      bounded_repair_preferred: true,
      generative_text_pixels_for_exact_copy_forbidden: true,
    },
  };
}

export const CreativeImageStudioOperatingRuntime = Object.freeze({
  contract: "CREATIVE_IMAGE_STUDIO_OPERATING_STATE_V1",
  stages: STAGES,
  world_class_controls: WORLD_CLASS_CONTROLS,
  build: buildCreativeImageStudioOperatingState,
});

export default CreativeImageStudioOperatingRuntime;
