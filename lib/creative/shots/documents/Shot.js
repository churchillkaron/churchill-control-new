export const SHOT_STATUS = {
  PLANNING: "PLANNING",
  READY: "READY",
  GENERATING: "GENERATING",
  REVIEW: "REVIEW",
  APPROVED: "APPROVED",
};

const PROMPT_FIELDS = new Set([
  "prompt",
  "provider_prompt",
  "negative_prompt",
  "visual_prompt",
  "video_prompt",
  "image_prompt",
  "generation_prompt",
]);

function array(value) {
  return Array.isArray(value) ? value : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function normalizedKey(value) {
  return text(value)
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replaceAll("-", "_")
    .toLowerCase();
}

function promptless(value) {
  if (Array.isArray(value)) return value.map(promptless);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !PROMPT_FIELDS.has(normalizedKey(key)))
      .map(([key, child]) => [key, promptless(child)]),
  );
}

function framePlan(data = {}) {
  const canonical = object(data.frame_plan);
  if (Object.keys(canonical).length) return canonical;
  return {
    opening_frame: data.opening_frame || null,
    progression:
      data.progression ??
      data.progression_frames ??
      null,
    closing_frame: data.closing_frame || null,
  };
}

function audioPlan(data = {}) {
  const canonical = object(data.audio);
  if (Object.keys(canonical).length) return canonical;
  const legacy = object(data.sound_design);
  return {
    source_sound: legacy.source_sound || legacy.ambience || null,
    sound_effects: array(data.sound_effects || legacy.sound_effects),
    music: object(data.music || legacy.music),
    silence: legacy.silence || null,
    mix_intent: legacy.mix_intent || legacy.mix || null,
  };
}

function repairInstructions(data = {}, generation = {}) {
  const direct = array(data.repair_instructions);
  if (direct.length) return direct;
  const generated = array(generation.repair_instructions);
  if (generated.length) return generated;
  const contract = object(data.repair_contract || generation.repair_contract);
  return array(contract.instructions || contract.repairs || contract.actions);
}

function referenceAssets(data = {}) {
  const canonical = array(data.reference_assets);
  if (canonical.length) return canonical;
  return array(data.reference_asset_ids).map((assetId) => ({
    asset_id: assetId,
    role: "REFERENCE",
  }));
}

function coveragePlan(data = {}) {
  const direct = object(data.coverage);
  if (Object.keys(direct).length) return promptless(direct);
  return promptless(object(data.metadata?.coverage));
}

function shotBibleSource(data = {}, generation = {}) {
  return promptless({
    performance_direction: data.performance_direction || {},
    coverage: coveragePlan(data),
    scene_coverage_plan:
      object(data.scene_coverage_plan).length
        ? object(data.scene_coverage_plan)
        : object(data.metadata?.scene_coverage_plan),
    cinematic_coverage:
      object(data.cinematic_coverage).length
        ? object(data.cinematic_coverage)
        : object(data.metadata?.cinematic_coverage),
    wardrobe: array(data.wardrobe),
    hair_makeup: array(data.hair_makeup),
    props: array(data.props),
    identity_requirements: object(data.identity_requirements),
    product_requirements: object(data.product_requirements),
    rights_requirements: object(data.rights_requirements),
    sound_design: object(data.sound_design),
    primary_source_asset_id: data.primary_source_asset_id || null,
    output_spec: object(data.output_spec || generation.output_spec),
    provider_parameters: object(
      data.provider_parameters || generation.provider_parameters,
    ),
    repair_contract: object(data.repair_contract),
    reuse_policy: object(data.reuse_policy),
  });
}

export function createShot(data = {}) {
  const now = new Date().toISOString();
  const generation = promptless(object(data.generation || data.metadata?.generation));
  const status = data.status || SHOT_STATUS.PLANNING;
  if (!Object.values(SHOT_STATUS).includes(status)) {
    throw new Error(`SHOT_STATUS_INVALID:${status}`);
  }

  const subject = text(data.subject) || text(data.metadata?.subject);
  if (!subject) {
    throw new Error("CREATIVE_SHOT_SUBJECT_REQUIRED");
  }

  const coverage = coveragePlan(data);
  const sceneCoveragePlan = promptless(
    Object.keys(object(data.scene_coverage_plan)).length
      ? object(data.scene_coverage_plan)
      : object(data.metadata?.scene_coverage_plan),
  );
  const cinematicCoverage = promptless(
    Object.keys(object(data.cinematic_coverage)).length
      ? object(data.cinematic_coverage)
      : object(data.metadata?.cinematic_coverage),
  );

  return {
    id: data.id || crypto.randomUUID(),
    organization_id: data.organization_id,
    creative_project_id:
      data.creative_project_id || data.project_id || null,
    scene_id: data.scene_id || null,
    storyboard_id: data.storyboard_id || null,
    production_graph_id: data.production_graph_id || null,
    scene_number: Number(data.scene_number ?? 1),
    shot_number: Number(data.shot_number ?? 1),
    title: data.title || "",
    purpose: data.purpose || "",
    subject,
    action: data.action || "",
    performance:
      text(data.performance) ||
      text(data.performance_direction) ||
      text(data.metadata?.performance),
    duration_seconds: Number(data.duration_seconds ?? 0),
    medium: data.medium || null,
    frame_plan: framePlan(data),
    camera: object(data.camera),
    lighting: object(data.lighting),
    production_design: object(data.production_design),
    continuity: object(data.continuity),
    actors: array(data.actors),
    products: array(data.products),
    location: data.location || {},
    dialogue: array(data.dialogue),
    narration: data.narration || {},
    audio: audioPlan(data),
    music: data.music || {},
    sound_effects: array(data.sound_effects),
    subtitles: array(data.subtitles),
    graphics: object(data.graphics),
    vfx: object(data.vfx),
    transition_in: data.transition_in || "",
    transition_out: data.transition_out || "",
    reference_assets: referenceAssets(data),
    negative_constraints: array(data.negative_constraints),
    known_failure_modes: array(data.known_failure_modes),
    repair_instructions: repairInstructions(data, generation),
    assets: array(data.assets),
    generation: {
      ...generation,
      provider_parameters:
        generation.provider_parameters ||
        data.provider_parameters ||
        {},
      output_spec:
        generation.output_spec ||
        data.output_spec ||
        {},
      provider_prompt_persisted: false,
    },
    ai_generation: {
      image_required:
        data.ai_generation?.image_required ??
        generation.capability === "ai.image.generate",
      video_required:
        data.ai_generation?.video_required ??
        generation.capability === "ai.video.generate",
      voice_required:
        data.ai_generation?.voice_required ??
        generation.capability === "ai.voice.generate",
      music_required:
        data.ai_generation?.music_required ??
        generation.capability === "ai.music.generate",
      ...(data.ai_generation || {}),
    },
    service_id: data.service_id || data.service_code || generation.service || null,
    service_code: data.service_code || data.service_id || generation.service || null,
    capability: data.capability || generation.capability || null,
    metadata: {
      ...(data.metadata || {}),
      subject,
      coverage,
      scene_coverage_plan: sceneCoveragePlan,
      cinematic_coverage: cinematicCoverage,
      coverage_contract:
        text(cinematicCoverage.contract) ||
        text(data.metadata?.coverage_contract) ||
        null,
      shot_bible_source: shotBibleSource({
        ...data,
        coverage,
        scene_coverage_plan: sceneCoveragePlan,
        cinematic_coverage: cinematicCoverage,
      }, generation),
      canonical_direction_preserved: true,
      shot_bible_fields_preserved: true,
      cinematic_coverage_preserved: Boolean(Object.keys(coverage).length),
      provider_prompts_persisted: false,
    },
    status,
    archived_at: data.archived_at || null,
    created_at: data.created_at || now,
    updated_at: now,
  };
}