import {
  reason,
} from "@/lib/creative/reasoning/CreativeReasoningService";

import {
  resolveCreativeFreedomPolicy,
} from "./CreativeFreedomPolicyRuntime";

function list(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value || "").trim();
}

function positiveNumber(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0
    ? number
    : fallback;
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean).map(String))];
}

function directorError(code, details = {}) {
  const error = new Error(code);
  error.code = code;
  error.details = details;
  return error;
}

function assetRoles(asset = {}) {
  return unique([
    ...list(asset.reference_roles),
    ...list(asset.reference_role),
    ...list(asset.roles),
    ...list(asset.role),
    ...list(asset.metadata?.reference_roles),
    ...list(asset.metadata?.reference_role),
    ...list(asset.analysis?.reference_roles),
    ...list(asset.analysis?.reference_role),
  ]);
}

function compactAsset(asset = {}) {
  return {
    id: asset.id || asset.asset_id || null,
    name:
      asset.name ||
      asset.title ||
      asset.file_name ||
      null,
    asset_type: asset.asset_type || asset.type || null,
    roles: assetRoles(asset),
    tags: list(asset.tags).slice(0, 30),
    description:
      asset.description ||
      asset.caption ||
      asset.analysis?.summary ||
      null,
    analysis: object(asset.analysis),
    approved_reference:
      asset.approved_reference === true ||
      String(asset.status || "").toUpperCase() === "APPROVED" ||
      null,
    rights: asset.rights || asset.metadata?.rights || null,
  };
}

function compactAssets(assets = []) {
  return assets
    .filter((asset) => asset?.id || asset?.asset_id)
    .slice(0, 120)
    .map(compactAsset);
}

function normalizeReferenceIds(value, availableIds, context) {
  const requested = unique(list(value));
  const unknown = requested.filter((id) => !availableIds.has(String(id)));

  if (unknown.length) {
    throw directorError("CREATIVE_DIRECTOR_UNKNOWN_REFERENCE_ASSET", {
      context,
      unknown_asset_ids: unknown,
    });
  }

  return requested;
}

function normalizeActor(actor = {}) {
  const source = typeof actor === "string"
    ? { role: actor }
    : object(actor);

  return {
    ...source,
    role:
      source.role ||
      source.character ||
      source.name ||
      null,
    count: positiveNumber(source.count || source.quantity, 1),
    identity_reference_asset_ids: unique(list(
      source.identity_reference_asset_ids ||
      source.reference_asset_ids ||
      source.identity_reference_asset_id ||
      source.reference_asset_id,
    )),
  };
}

function normalizeShot({
  shot,
  sceneNumber,
  shotNumber,
  availableIds,
  freedom,
}) {
  const source = object(shot);
  const duration = positiveNumber(source.duration_seconds);

  if (!duration) {
    throw directorError("CREATIVE_DIRECTOR_SHOT_DURATION_REQUIRED", {
      scene_number: sceneNumber,
      shot_number: shotNumber,
    });
  }

  const referenceIds = normalizeReferenceIds(
    source.reference_asset_ids || source.assets,
    availableIds,
    {
      scene_number: sceneNumber,
      shot_number: shotNumber,
    },
  );

  return {
    ...source,
    shot_number: shotNumber,
    title: text(source.title) || null,
    purpose: text(source.purpose) || null,
    duration_seconds: duration,
    opening_frame: text(source.opening_frame) || null,
    closing_frame: text(source.closing_frame) || null,
    action_beats: list(source.action_beats),
    performance_direction:
      source.performance_direction || null,
    camera: object(source.camera),
    lighting: object(source.lighting),
    actors: list(source.actors).map(normalizeActor),
    products: list(source.products),
    dialogue: list(source.dialogue),
    narration: object(source.narration),
    music: object(source.music),
    sound_effects: list(source.sound_effects),
    subtitles: list(source.subtitles),
    reference_asset_ids: referenceIds,
    assets: referenceIds,
    reference_pack: object(source.reference_pack),
    continuity: object(source.continuity),
    reality_rules: object(source.reality_rules),
    negative_constraints: list(source.negative_constraints),
    quality_requirements: object(source.quality_requirements),
    transition_in: object(source.transition_in),
    transition_out: object(source.transition_out),
    creative_policy: resolveCreativeFreedomPolicy(
      freedom,
      source.creative_policy,
    ),
  };
}

function normalizeScene({
  scene,
  sceneNumber,
  availableIds,
  freedom,
}) {
  const source = object(scene);
  const shots = list(source.shots);

  if (!shots.length) {
    throw directorError("CREATIVE_DIRECTOR_SCENE_SHOTS_REQUIRED", {
      scene_number: sceneNumber,
    });
  }

  const normalizedShots = shots.map((shot, index) => normalizeShot({
    shot,
    sceneNumber,
    shotNumber: index + 1,
    availableIds,
    freedom,
  }));
  const shotDuration = normalizedShots.reduce(
    (total, shot) => total + Number(shot.duration_seconds || 0),
    0,
  );
  const sceneDuration = positiveNumber(
    source.duration_seconds,
    shotDuration,
  );

  return {
    ...source,
    scene_number: sceneNumber,
    title: text(source.title) || null,
    objective: text(source.objective) || null,
    emotion: source.emotion || null,
    duration_seconds: sceneDuration,
    location: object(source.location),
    actors: list(source.actors).map(normalizeActor),
    products: list(source.products),
    brand_rules: list(source.brand_rules),
    visual_style: object(source.visual_style),
    camera_style: object(source.camera_style),
    audio_style: object(source.audio_style),
    humor: object(source.humor),
    creative_policy: resolveCreativeFreedomPolicy(
      freedom,
      source.creative_policy,
    ),
    shots: normalizedShots,
  };
}

function normalizePlan({
  result,
  reasoning,
  objective,
  brief,
  assets,
  durationSeconds,
  freedom,
}) {
  if (reasoning?.fallback || reasoning?.recovery) {
    throw directorError("CREATIVE_DIRECTOR_REASONING_UNAVAILABLE", {
      fallback_reason: reasoning.fallback_reason || null,
      recovery_source: reasoning.recovery_source || null,
    });
  }

  const source = object(result);
  const sourceScenes = list(source.scenes);

  if (!sourceScenes.length) {
    throw directorError("CREATIVE_DIRECTOR_SCENES_REQUIRED", {
      received_keys: Object.keys(source),
    });
  }

  const availableIds = new Set(
    assets.map((asset) => String(asset.id)).filter(Boolean),
  );
  const scenes = sourceScenes.map((scene, index) => normalizeScene({
    scene,
    sceneNumber: index + 1,
    availableIds,
    freedom,
  }));
  const plannedDuration = scenes.reduce(
    (total, scene) => total + Number(scene.duration_seconds || 0),
    0,
  );

  if (!plannedDuration) {
    throw directorError("CREATIVE_DIRECTOR_DURATION_REQUIRED");
  }

  return {
    ...source,
    production_version: "dynamic-evidence-shot-director-v2",
    title: text(source.title) || null,
    logline: text(source.logline) || null,
    objective: text(source.objective) || text(objective) || null,
    audience_truth: source.audience_truth || null,
    story_thesis: source.story_thesis || null,
    brand_promise: source.brand_promise || null,
    emotional_arc: list(source.emotional_arc),
    humor_strategy: object(source.humor_strategy),
    visual_motif: source.visual_motif || null,
    sound_motif: source.sound_motif || null,
    concepts: list(source.concepts),
    selected_concept: object(source.selected_concept),
    research_summary: source.research_summary || null,
    scenes,
    final_quality_standard: {
      ...object(brief.quality_policy),
      ...object(source.final_quality_standard),
    },
    creative_policy: freedom,
    metadata: {
      ...object(source.metadata),
      director_contract: "DYNAMIC_EVIDENCE_LED_PRODUCTION_BIBLE_V2",
      target_duration_seconds: Number(durationSeconds),
      planned_duration_seconds: plannedDuration,
      available_reference_asset_ids: [...availableIds],
      unspecified_fields_are_open: true,
    },
  };
}

export const CreativeShotDirectorRuntime = {
  async direct({
    organization_id,
    organization = {},
    brand = {},
    industry = null,
    objective = "",
    brief = {},
    assets = [],
    requestedOutputs = [],
    durationSeconds = 30,
    platform = "multi-channel",
    budgetMode = "quality-first",
  } = {}) {
    if (!organization_id) {
      throw directorError("organization_id required");
    }

    const targetDuration = positiveNumber(durationSeconds, 30);
    const evidenceAssets = compactAssets(assets);
    const freedom = resolveCreativeFreedomPolicy(
      organization,
      brand,
      brief,
      brief.quality_policy,
      brief.creative_policy,
    );
    const input = {
      organization_id,
      organization,
      brand,
      industry,
      objective,
      brief,
      assets: evidenceAssets,
      requested_outputs: requestedOutputs,
      target_duration_seconds: targetDuration,
      platform,
      budget_mode: budgetMode,
      creative_policy: freedom,
    };
    const reasoning = await reason({
      task: [
        "Create a complete production bible from the supplied business truth, mission, references and creative policy.",
        "Choose the narrative form, genre, concept, pacing, number of scenes, number of shots, camera language, performance, sound and use of humor dynamically from the evidence.",
        "Do not import a generic campaign template or invent factual brand, venue, product or identity claims.",
        "Use only reference asset IDs present in the supplied asset manifest.",
        "Every scene must contain at least one independently directed shot with a positive duration.",
        "Design each visual shot for an approved master still before motion generation.",
        "Return strict JSON matching the requested structure.",
      ].join(" "),
      input,
      constraints: {
        original_work_only: true,
        no_living_artist_identity_or_style_imitation: true,
        preserve_declared_factual_truth: true,
        preserve_declared_reference_identity: true,
        target_duration_seconds: targetDuration,
        master_still_before_video: true,
        creative_policy: freedom,
      },
      outputShape: {
        result: {
          title: "string",
          logline: "string",
          objective: "string",
          audience_truth: "string",
          story_thesis: "string",
          brand_promise: "string",
          emotional_arc: ["string"],
          humor_strategy: "object",
          visual_motif: "string",
          sound_motif: "string",
          concepts: ["object"],
          selected_concept: "object",
          research_summary: "string",
          scenes: [
            {
              scene_number: "number",
              title: "string",
              objective: "string",
              emotion: "string",
              duration_seconds: "number",
              location: "object",
              actors: ["object"],
              products: ["object"],
              brand_rules: ["string"],
              visual_style: "object",
              camera_style: "object",
              audio_style: "object",
              humor: "object",
              shots: [
                {
                  shot_number: "number",
                  title: "string",
                  purpose: "string",
                  duration_seconds: "number",
                  opening_frame: "string",
                  closing_frame: "string",
                  action_beats: ["object"],
                  performance_direction: "string",
                  camera: "object",
                  lighting: "object",
                  actors: ["object"],
                  products: ["object"],
                  dialogue: ["object"],
                  narration: "object",
                  music: "object",
                  sound_effects: ["string"],
                  subtitles: ["object"],
                  reference_asset_ids: ["string"],
                  reference_pack: "object",
                  continuity: "object",
                  reality_rules: "object",
                  negative_constraints: ["string"],
                  quality_requirements: "object",
                  transition_in: "object",
                  transition_out: "object",
                },
              ],
            },
          ],
          final_quality_standard: "object",
          metadata: "object",
        },
      },
      temperature: Number(
        freedom.provider_controls?.temperature ?? 0.9,
      ),
    });

    return normalizePlan({
      result: reasoning?.result,
      reasoning,
      objective,
      brief,
      assets: evidenceAssets,
      durationSeconds: targetDuration,
      freedom,
    });
  },
};
