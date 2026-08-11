const CONTRACT = "CREATIVE_SHOT_BIBLE_V1";

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return String(value ?? "").trim();
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function referenceIds(shot = {}, task = {}) {
  const values = [
    ...list(shot.reference_assets).map((item) =>
      typeof item === "string"
        ? item
        : item.asset_id || item.assetId || item.id,
    ),
    ...list(task.input?.source_assets).map((item) =>
      typeof item === "string"
        ? item
        : item.asset_id || item.assetId || item.id,
    ),
    shot.primary_source_asset_id,
  ];
  return [...new Set(values.map(text).filter(Boolean))];
}

function frameControl(shot = {}, task = {}) {
  const frame = object(shot.frame_plan);
  const params = {
    ...object(shot.provider_parameters),
    ...object(shot.generation?.provider_parameters),
    ...object(task.input?.provider_parameters),
    ...object(task.input?.generation?.provider_parameters),
  };
  const opening = object(frame.opening_frame || frame.openingFrame);
  const closing = object(frame.closing_frame || frame.closingFrame);
  const explicitLastFrame = Boolean(
    params.last_frame ||
    params.lastFrame ||
    params.last_frame_url ||
    params.lastFrameUrl ||
    closing.asset_id ||
    closing.assetId ||
    closing.url,
  );
  const extension = Boolean(
    params.extend_video ||
    params.extendVideo ||
    params.video_extension ||
    params.videoExtension ||
    params.extension_source ||
    params.extensionSource,
  );
  const referenceControl = list(
    params.reference_images || params.referenceImages,
  ).length > 1;
  return {
    opening_frame_defined: Boolean(
      opening.asset_id || opening.assetId || opening.url || Object.keys(opening).length,
    ),
    closing_frame_defined: Boolean(Object.keys(closing).length),
    exact_last_frame_required: explicitLastFrame,
    video_extension_required: extension,
    multi_reference_control_required: referenceControl,
    hard_precision_required:
      explicitLastFrame || extension || referenceControl,
  };
}

function outputSpec(shot = {}, task = {}) {
  const generation = object(shot.generation);
  const inputGeneration = object(task.input?.generation);
  const value = {
    ...object(generation.output_spec),
    ...object(shot.output_spec),
    ...object(inputGeneration.output_spec),
    ...object(task.input?.requirements?.output_spec),
  };
  const duration = finite(
    value.duration_seconds ??
    shot.duration_seconds ??
    inputGeneration.duration_seconds ??
    inputGeneration.estimated_seconds ??
    task.timing?.estimated_seconds,
  );
  return {
    ...value,
    duration_seconds: duration,
    aspect_ratio: value.aspect_ratio || value.aspectRatio || null,
    resolution: value.resolution || null,
    frame_rate: value.frame_rate || value.frameRate || null,
  };
}

function qualityRequirements(shot = {}, task = {}) {
  return {
    minimum_quality:
      finite(shot.metadata?.minimum_quality) ??
      finite(task.metadata?.minimum_quality) ??
      finite(task.input?.requirements?.minimum_quality),
    identity_required:
      Boolean(Object.keys(object(shot.identity_requirements)).length) ||
      list(shot.actors).length > 0,
    product_fidelity_required:
      Boolean(Object.keys(object(shot.product_requirements)).length) ||
      list(shot.products).length > 0,
    continuity_required:
      Boolean(Object.keys(object(shot.continuity)).length),
  };
}

function exactGraphicsPolicy(shot = {}) {
  const graphics = object(shot.graphics);
  const subtitles = list(shot.subtitles);
  const hasExactGraphics =
    Object.keys(graphics).length > 0 ||
    subtitles.length > 0;
  return {
    generative_rendering_allowed: false,
    deterministic_finishing_required: hasExactGraphics,
    rule: hasExactGraphics
      ? "Exact logos, typography, subtitles, legal copy and CTA are applied during deterministic finishing, not trusted to generative video rendering."
      : "Generative video must not invent brand marks, typography, legal copy or UI text.",
  };
}

function completeness(shot = {}, spec = {}) {
  const missing = [];
  if (!text(shot.subject)) missing.push("subject");
  if (!text(shot.action) && !text(shot.performance)) missing.push("action_or_performance");
  if (!spec.output.duration_seconds || spec.output.duration_seconds <= 0) {
    missing.push("duration_seconds");
  }
  if (!Object.keys(spec.camera).length) missing.push("camera");
  if (!Object.keys(spec.lighting).length) missing.push("lighting");
  return {
    passed: missing.length === 0,
    missing,
    fail_closed_fields: ["subject", "duration_seconds"],
  };
}

export function buildCreativeShotBible({ shot = {}, task = {} } = {}) {
  const output = outputSpec(shot, task);
  const precision = frameControl(shot, task);
  const bible = {
    contract: CONTRACT,
    version: 1,
    organization_id: shot.organization_id || task.organization_id || null,
    creative_project_id:
      shot.creative_project_id || task.creative_project_id || null,
    scene_id: shot.scene_id || task.scene_id || null,
    shot_id: shot.id || task.shot_id || null,
    story: {
      title: shot.title || task.title || null,
      purpose: shot.purpose || task.description || null,
      subject: shot.subject || task.input?.intent?.subject || null,
      action: shot.action || null,
      performance: shot.performance || null,
      performance_direction: object(shot.performance_direction),
      transition_in: shot.transition_in || null,
      transition_out: shot.transition_out || null,
    },
    identity: {
      actors: list(shot.actors),
      requirements: object(shot.identity_requirements),
      wardrobe: list(shot.wardrobe),
      hair_makeup: list(shot.hair_makeup),
    },
    product: {
      products: list(shot.products),
      requirements: object(shot.product_requirements),
    },
    environment: {
      location: object(shot.location),
      production_design: object(shot.production_design),
      props: list(shot.props),
      continuity: object(shot.continuity),
    },
    camera: object(shot.camera),
    frame_plan: object(shot.frame_plan),
    lighting: object(shot.lighting),
    audio: {
      dialogue: list(shot.dialogue),
      narration: object(shot.narration),
      audio: object(shot.audio),
      music: object(shot.music),
      sound_effects: list(shot.sound_effects),
      sound_design: object(shot.sound_design),
    },
    finishing: {
      graphics: object(shot.graphics),
      subtitles: list(shot.subtitles),
      vfx: object(shot.vfx),
      exact_graphics_policy: exactGraphicsPolicy(shot),
    },
    source: {
      primary_source_asset_id: shot.primary_source_asset_id || null,
      reference_asset_ids: referenceIds(shot, task),
    },
    rights: object(shot.rights_requirements),
    constraints: {
      negative: list(shot.negative_constraints),
      known_failure_modes: list(shot.known_failure_modes),
      repair_instructions: list(shot.repair_instructions),
    },
    output,
    quality: qualityRequirements(shot, task),
    precision_control: precision,
    provider_transport: {
      promptless_source_of_truth: true,
      provider_prompts_persisted: false,
      transport_prompt_allowed_only_at_execution_boundary: true,
    },
  };
  return {
    ...bible,
    completeness: completeness(shot, bible),
  };
}

export function assertCreativeShotBible(bible = {}) {
  if (bible.contract !== CONTRACT) {
    throw new Error("CREATIVE_SHOT_BIBLE_CONTRACT_REQUIRED");
  }
  const missing = list(bible.completeness?.missing);
  const fatal = missing.filter((field) =>
    list(bible.completeness?.fail_closed_fields).includes(field),
  );
  if (fatal.length) {
    throw new Error(`CREATIVE_SHOT_BIBLE_INCOMPLETE:${fatal.join(",")}`);
  }
  return bible;
}

export const CreativeShotBibleRuntime = Object.freeze({
  contract: CONTRACT,
  build: buildCreativeShotBible,
  assert: assertCreativeShotBible,
});
