const CONTRACT = "CREATIVE_SHOT_BIBLE_V1";
const BRAND_MARK_COMPOSITING_CONTRACT = "CREATIVE_BRAND_MARK_COMPOSITING_V1";

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

function sourceData(shot = {}) {
  return object(shot.metadata?.shot_bible_source);
}

function referenceIds(shot = {}, task = {}) {
  const source = sourceData(shot);
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
    source.primary_source_asset_id,
  ];
  return [...new Set(values.map(text).filter(Boolean))];
}

function frameControl(shot = {}, task = {}) {
  const source = sourceData(shot);
  const frame = object(shot.frame_plan);
  const params = {
    ...object(source.provider_parameters),
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
  const source = sourceData(shot);
  const generation = object(shot.generation);
  const inputGeneration = object(task.input?.generation);
  const value = {
    ...object(generation.output_spec),
    ...object(source.output_spec),
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
  const source = sourceData(shot);
  return {
    minimum_quality:
      finite(shot.metadata?.minimum_quality) ??
      finite(task.metadata?.minimum_quality) ??
      finite(task.input?.requirements?.minimum_quality),
    identity_required:
      Boolean(Object.keys(object(source.identity_requirements)).length) ||
      list(shot.actors).length > 0,
    product_fidelity_required:
      Boolean(Object.keys(object(source.product_requirements)).length) ||
      list(shot.products).length > 0,
    continuity_required:
      Boolean(Object.keys(object(shot.continuity)).length),
  };
}

function brandMarkCompositing(shot = {}) {
  const source = sourceData(shot);
  const graphics = object(shot.graphics);
  const raw = object(
    graphics.brand_mark_compositing ||
    source.brand_mark_compositing,
  );
  if (!Object.keys(raw).length) return null;

  const sourceAssetId = text(
    raw.source_asset_id ||
    raw.asset_id ||
    raw.brand_asset_id,
  );
  const checksum = text(
    raw.source_checksum_sha256 ||
    raw.checksum_sha256 ||
    raw.content_hash,
  );
  const requiredMarks = list(
    raw.required_marks ||
    raw.exact_marks ||
    raw.visible_marks,
  ).map(text).filter(Boolean);
  const maskRequirements = list(raw.mask_requirements).map(text).filter(Boolean);
  const preservationRequirements = list(
    raw.preservation_requirements,
  ).map(text).filter(Boolean);

  return {
    contract: BRAND_MARK_COMPOSITING_CONTRACT,
    required: raw.required !== false,
    source_asset_id: sourceAssetId || null,
    source_checksum_sha256: checksum || null,
    required_marks: requiredMarks,
    mask_requirements: maskRequirements,
    preservation_requirements: preservationRequirements,
    deterministic_finishing_required: true,
    generative_brand_mark_rendering_allowed: false,
    post_composition_review_required:
      raw.post_composition_review_required !== false,
  };
}

function assertBrandMarkCompositing(compositing = null) {
  if (!compositing || compositing.required !== true) return compositing;
  if (compositing.contract !== BRAND_MARK_COMPOSITING_CONTRACT) {
    throw new Error("CREATIVE_BRAND_MARK_COMPOSITING_CONTRACT_REQUIRED");
  }
  if (!text(compositing.source_asset_id)) {
    throw new Error("CREATIVE_BRAND_MARK_SOURCE_ASSET_REQUIRED");
  }
  if (!text(compositing.source_checksum_sha256)) {
    throw new Error("CREATIVE_BRAND_MARK_SOURCE_CHECKSUM_REQUIRED");
  }
  if (!list(compositing.required_marks).length) {
    throw new Error("CREATIVE_BRAND_MARK_EXACT_MARKS_REQUIRED");
  }
  if (!list(compositing.preservation_requirements).length) {
    throw new Error("CREATIVE_BRAND_MARK_PRESERVATION_REQUIREMENTS_REQUIRED");
  }
  if (compositing.generative_brand_mark_rendering_allowed !== false) {
    throw new Error("CREATIVE_BRAND_MARK_GENERATIVE_RENDERING_FORBIDDEN");
  }
  if (compositing.deterministic_finishing_required !== true) {
    throw new Error("CREATIVE_BRAND_MARK_DETERMINISTIC_FINISHING_REQUIRED");
  }
  return compositing;
}

function exactGraphicsPolicy(shot = {}, compositing = null) {
  const graphics = object(shot.graphics);
  const subtitles = list(shot.subtitles);
  const hasExactGraphics =
    Object.keys(graphics).length > 0 ||
    subtitles.length > 0 ||
    compositing?.required === true;
  return {
    generative_rendering_allowed: false,
    deterministic_finishing_required: hasExactGraphics,
    source_backed_brand_marks_required: compositing?.required === true,
    rule: hasExactGraphics
      ? "Exact logos, typography, subtitles, legal copy and CTA are applied during deterministic finishing from governed source assets, not trusted to generative video rendering."
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
  const source = sourceData(shot);
  const output = outputSpec(shot, task);
  const precision = frameControl(shot, task);
  const compositing = assertBrandMarkCompositing(brandMarkCompositing(shot));
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
      performance_direction: object(source.performance_direction),
      transition_in: shot.transition_in || null,
      transition_out: shot.transition_out || null,
    },
    identity: {
      actors: list(shot.actors),
      requirements: object(source.identity_requirements),
      wardrobe: list(source.wardrobe),
      hair_makeup: list(source.hair_makeup),
    },
    product: {
      products: list(shot.products),
      requirements: object(source.product_requirements),
    },
    environment: {
      location: object(shot.location),
      production_design: object(shot.production_design),
      props: list(source.props),
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
      sound_design: object(source.sound_design),
    },
    finishing: {
      graphics: object(shot.graphics),
      subtitles: list(shot.subtitles),
      vfx: object(shot.vfx),
      brand_mark_compositing: compositing,
      exact_graphics_policy: exactGraphicsPolicy(shot, compositing),
    },
    source: {
      primary_source_asset_id: source.primary_source_asset_id || null,
      reference_asset_ids: referenceIds(shot, task),
    },
    rights: object(source.rights_requirements),
    constraints: {
      negative: list(shot.negative_constraints),
      known_failure_modes: list(shot.known_failure_modes),
      repair_instructions: list(shot.repair_instructions),
      repair_contract: object(source.repair_contract),
      reuse_policy: object(source.reuse_policy),
    },
    output,
    quality: qualityRequirements(shot, task),
    precision_control: precision,
    provider_transport: {
      promptless_source_of_truth: true,
      provider_prompts_persisted: false,
      transport_prompt_allowed_only_at_execution_boundary: true,
      exact_brand_marks_transport_rendering_allowed: false,
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
  assertBrandMarkCompositing(bible.finishing?.brand_mark_compositing || null);
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
  brand_mark_compositing_contract: BRAND_MARK_COMPOSITING_CONTRACT,
  build: buildCreativeShotBible,
  assert: assertCreativeShotBible,
});
