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

function completeness(shot = {}, spec = {}, task = {}) {
  const missing = [];
  if (!text(shot.subject)) missing.push("subject");
  const truth = object(spec.subject_truth);
  if (truth.required === true) {
    if (!text(truth.exact_subject)) missing.push("subject_truth.exact_subject");
    if (!text(truth.variant)) missing.push("subject_truth.variant");
    if (list(truth.defining_visual_features).length < 3) missing.push("subject_truth.defining_visual_features");
    if (!list(truth.source_ids).length) missing.push("subject_truth.source_ids");
    if (!list(spec.reference_evidence).length) missing.push("reference_evidence");
  }
  const cinematicDna = object(spec.cinematic?.dna);
  const frameDesign = object(spec.cinematic?.frame_design);
  const visualStateConditioning = object(spec.cinematic?.visual_state_conditioning);
  const physicalWorld = object(spec.cinematic?.physical_world);
  const visualJourneyState = object(spec.cinematic?.visual_journey_state);
  const dpIntent = object(spec.cinematic?.dp_intent);
  if (shot.generation?.required === true || String(task.capability || task.service_code || "").includes("video")) {
    if (cinematicDna.contract !== "CREATIVE_SHOT_CINEMATIC_DNA_V1") missing.push("cinematic.dna.contract");
    if (Number(cinematicDna.visual_quality_floor || 0) < 94) missing.push("cinematic.dna.visual_quality_floor");
    if (!text(cinematicDna.visual_hierarchy)) missing.push("cinematic.dna.visual_hierarchy");
    if (!text(cinematicDna.composition)) missing.push("cinematic.dna.composition");
    if (!text(cinematicDna.camera_philosophy)) missing.push("cinematic.dna.camera_philosophy");
    if (!text(cinematicDna.place_causality)) missing.push("cinematic.dna.place_causality");
    if (list(cinematicDna.anti_generic_constraints).length < 5) missing.push("cinematic.dna.anti_generic_constraints");
    if (frameDesign.contract !== "CREATIVE_FRAME_DESIGN_V1") missing.push("cinematic.frame_design.contract");
    if (visualStateConditioning.contract !== "CREATIVE_VISUAL_STATE_CONDITIONING_V1") missing.push("cinematic.visual_state_conditioning.contract");
    if (["A", "B"].includes(text(frameDesign.shot_tier)) && visualStateConditioning.generator_may_invent_complete_composition !== false) missing.push("cinematic.visual_state_conditioning.composition_authority");
    if (physicalWorld.contract !== "CREATIVE_SHOT_PHYSICAL_WORLD_V1") missing.push("cinematic.physical_world.contract");
    if (physicalWorld.material_physics?.contract !== "CREATIVE_SHOT_MATERIAL_PHYSICS_V1") missing.push("cinematic.physical_world.material_physics.contract");
    if (physicalWorld.release_blocking !== true) missing.push("cinematic.physical_world.release_blocking");
    if (visualJourneyState.contract !== "CREATIVE_SHOT_VISUAL_JOURNEY_STATE_V1") missing.push("cinematic.visual_journey_state.contract");
    if (dpIntent.contract !== "CREATIVE_SHOT_DP_INTENT_V1") missing.push("cinematic.dp_intent.contract");
    if (dpIntent.release_blocking !== true) missing.push("cinematic.dp_intent.release_blocking");
    if (dpIntent.provider_may_replace_lens_or_light_plan !== false) missing.push("cinematic.dp_intent.provider_authority");
  }
  if (object(spec.cinematic_beauty_intent).required === true) {
    const beauty = object(spec.cinematic_beauty_intent);
    for (const field of ["composition", "lighting", "atmosphere", "camera_placement", "emotional_charge"]) {
      if (!text(beauty[field])) missing.push(`cinematic_beauty_intent.${field}`);
    }
  }
  if (!text(shot.action) && !text(shot.performance)) missing.push("action_or_performance");
  if (!spec.output.duration_seconds || spec.output.duration_seconds <= 0) {
    missing.push("duration_seconds");
  }
  if (!Object.keys(spec.camera).length) missing.push("camera");
  if (!Object.keys(spec.lighting).length) missing.push("lighting");
  return {
    passed: missing.length === 0,
    missing,
    fail_closed_fields: [
      "subject", "duration_seconds",
      "subject_truth.exact_subject", "subject_truth.variant",
      "subject_truth.defining_visual_features", "subject_truth.source_ids",
      "reference_evidence",
      "cinematic_beauty_intent.composition", "cinematic_beauty_intent.lighting",
      "cinematic_beauty_intent.atmosphere", "cinematic_beauty_intent.camera_placement",
      "cinematic_beauty_intent.emotional_charge",
      "cinematic.dna.contract", "cinematic.dna.visual_quality_floor",
      "cinematic.dna.visual_hierarchy", "cinematic.dna.composition",
      "cinematic.dna.camera_philosophy", "cinematic.dna.place_causality",
      "cinematic.dna.anti_generic_constraints",
      "cinematic.frame_design.contract", "cinematic.visual_state_conditioning.contract",
      "cinematic.visual_state_conditioning.composition_authority",
      "cinematic.physical_world.contract", "cinematic.physical_world.material_physics.contract",
      "cinematic.physical_world.release_blocking",
      "cinematic.visual_journey_state.contract",
      "cinematic.dp_intent.contract", "cinematic.dp_intent.release_blocking",
      "cinematic.dp_intent.provider_authority",
    ],
  };
}

export function buildCreativeShotBible({ shot = {}, task = {} } = {}) {
  const source = sourceData(shot);
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
      performance_direction: object(source.performance_direction),
      transition_in: shot.transition_in || null,
      transition_out: shot.transition_out || null,
      reveal_stage:
        shot.reveal_stage || task.input?.requirements?.reveal_stage || null,
      mystery_function:
        shot.mystery_function || task.input?.requirements?.mystery_function || null,
      inherited_world_state:
        shot.inherited_world_state ||
        task.input?.requirements?.inherited_world_state ||
        null,
    },
    cinematic: {
      dna: object(shot.cinematic_dna || task.input?.requirements?.cinematic_dna),
      dna_gate: object(shot.cinematic_dna_gate || task.input?.requirements?.cinematic_dna_gate),
      frame_design: object(shot.frame_design || task.input?.requirements?.frame_design),
      frame_design_gate: object(shot.frame_design_gate || task.input?.requirements?.frame_design_gate),
      visual_state_conditioning: object(shot.visual_state_conditioning || task.input?.requirements?.visual_state_conditioning),
      physical_world: object(shot.physical_world || task.input?.requirements?.physical_world),
      physical_world_gate: object(shot.physical_world_gate || task.input?.requirements?.physical_world_gate),
      film_visual_journey: object(shot.film_visual_journey || task.input?.requirements?.film_visual_journey),
      film_visual_journey_gate: object(shot.film_visual_journey_gate || task.input?.requirements?.film_visual_journey_gate),
      visual_journey_state: object(shot.visual_journey_state || task.input?.requirements?.visual_journey_state),
      dp_intent: object(shot.dp_intent || task.input?.requirements?.dp_intent),
      dp_intent_gate: object(shot.dp_intent_gate || task.input?.requirements?.dp_intent_gate),
      grammar: object(
        shot.cinematic_grammar || task.input?.requirements?.cinematic_grammar,
      ),
      beauty_system: object(
        shot.beauty_system || task.input?.requirements?.beauty_system,
      ),
      beauty_intent:
        shot.beauty_intent || task.input?.requirements?.beauty_intent || null,
      focal_path:
        shot.focal_path || task.input?.requirements?.focal_path || null,
      depth_layers:
        shot.depth_layers || task.input?.requirements?.depth_layers || null,
      continuity_bible: object(
        shot.continuity_bible || task.input?.requirements?.continuity_bible,
      ),
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
    subject_truth: object(source.subject_truth),
    research_grounding: object(source.research_grounding),
    reference_evidence: list(source.reference_evidence),
    cinematic_beauty_intent: object(source.cinematic_beauty_intent),
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
      exact_graphics_policy: exactGraphicsPolicy(shot),
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
    },
  };
  return {
    ...bible,
    completeness: completeness(shot, bible, task),
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
