import crypto from "node:crypto";

const CONTRACT = "AVANTIQO_DIRECTING_INTELLIGENCE_V1";
const PROJECT_CONTRACT = "AVANTIQO_DIRECTOR_PROJECT_DECISION_V1";
const SCENE_CONTRACT = "AVANTIQO_DIRECTOR_SCENE_DECISION_V1";
const SHOT_CONTRACT = "AVANTIQO_DIRECTOR_SHOT_DECISION_V1";

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

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .filter((key) => !["decision_hash", "contract_hash"].includes(key))
      .sort()
      .map((key) => [key, canonical(value[key])]),
  );
}

function digest(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}

function requiredText(value, code) {
  const normalized = text(value);
  if (!normalized) throw new Error(code);
  return normalized;
}

function normalizedPurpose(value) {
  return text(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function shotSceneId(shot = {}, sceneId = null) {
  return text(
    shot.scene_id ||
    shot.sceneId ||
    shot.metadata?.scene_id ||
    shot.metadata?.sceneId ||
    sceneId,
  ) || null;
}

function containedShots(scene = {}) {
  return list(scene.shots);
}

function sourceScenes(input = {}) {
  const plan = object(input.creative_plan);
  return list(input.scenes).length
    ? list(input.scenes)
    : list(plan.scenes);
}

function flattenShots(input = {}, scenes = []) {
  if (list(input.shots).length) {
    return list(input.shots).map((shot) => ({
      ...shot,
      __director_scene_id: shotSceneId(shot),
    }));
  }
  return scenes.flatMap((scene) =>
    containedShots(scene).map((shot) => ({
      ...shot,
      __director_scene_id: shotSceneId(shot, scene.id),
    })),
  );
}

function graphicsOnlyShot(shot = {}) {
  const graphics = object(shot.graphics);
  const hasGraphics =
    list(graphics.titles).length > 0 ||
    list(graphics.overlays).length > 0 ||
    list(graphics.subtitles).length > 0 ||
    Object.keys(object(graphics.logo)).length > 0 ||
    Boolean(text(graphics.type_behaviour));
  const hasVisibleSubject = Boolean(text(shot.subject) || text(shot.action));
  return hasGraphics && !hasVisibleSubject;
}

function specializedContracts(shot = {}) {
  const entries = [
    ["human_performance", shot.human_performance],
    ["world_consistency", shot.world_consistency],
    ["vfx", shot.vfx_contract || shot.vfx?.contract ? shot.vfx_contract || shot.vfx : null],
    ["simulation", shot.simulation_contract || shot.simulation],
    ["compositing", shot.compositing_contract || shot.compositing],
    ["identity", shot.identity_requirements || shot.identity_contract],
    ["keyframe", shot.keyframe_contract],
    ["continuity", shot.continuity_contract],
  ];
  return entries
    .map(([discipline, value]) => {
      const contract = object(value);
      if (!Object.keys(contract).length) return null;
      return {
        discipline,
        contract: text(contract.contract) || null,
        contract_hash:
          text(contract.contract_hash || contract.hash || contract.seal_hash) || null,
      };
    })
    .filter(Boolean);
}

function frameAuthority(shot = {}) {
  const framePlan = object(shot.frame_plan);
  const opening =
    text(framePlan.opening_frame) ||
    text(shot.opening_frame?.description || shot.opening_frame?.composition || shot.opening_frame);
  const progression =
    text(framePlan.progression) ||
    list(shot.progression_frames)
      .map((entry) => text(entry?.description || entry?.composition || entry))
      .filter(Boolean)
      .join(" | ");
  const closing =
    text(framePlan.closing_frame) ||
    text(shot.closing_frame?.description || shot.closing_frame?.composition || shot.closing_frame);
  if (!opening || !progression || !closing) {
    throw new Error(`DIRECTING_INTELLIGENCE_FRAME_AUTHORITY_REQUIRED:${text(shot.id) || "UNKNOWN"}`);
  }
  return { opening, progression, closing };
}

function cameraAuthority(shot = {}) {
  const graphicsOnly = graphicsOnlyShot(shot);
  const camera = object(shot.camera);
  if (graphicsOnly && !Object.keys(camera).length) {
    return {
      applicable: false,
      reason: "Graphics-led shot; visual direction is governed by deterministic graphics rather than a camera system.",
    };
  }
  const framing = requiredText(
    camera.framing,
    `DIRECTING_INTELLIGENCE_CAMERA_FRAMING_REQUIRED:${text(shot.id) || "UNKNOWN"}`,
  );
  const angle = requiredText(
    camera.angle,
    `DIRECTING_INTELLIGENCE_CAMERA_ANGLE_REQUIRED:${text(shot.id) || "UNKNOWN"}`,
  );
  const movement = requiredText(
    camera.movement_path,
    `DIRECTING_INTELLIGENCE_CAMERA_MOVEMENT_REQUIRED:${text(shot.id) || "UNKNOWN"}`,
  );
  const motivation = requiredText(
    camera.movement_motivation,
    `DIRECTING_INTELLIGENCE_CAMERA_MOTIVATION_REQUIRED:${text(shot.id) || "UNKNOWN"}`,
  );
  const focusTarget = requiredText(
    camera.focus_target,
    `DIRECTING_INTELLIGENCE_CAMERA_FOCUS_REQUIRED:${text(shot.id) || "UNKNOWN"}`,
  );
  return {
    applicable: true,
    framing,
    angle,
    camera_distance: text(camera.camera_distance) || null,
    lens_intent: text(camera.lens_intent) || null,
    movement_path: movement,
    movement_speed: text(camera.movement_speed) || null,
    stabilization: text(camera.stabilization) || null,
    movement_motivation: motivation,
    focus_target: focusTarget,
    focus_transition: text(camera.focus_transition) || null,
  };
}

function audioAuthority(shot = {}) {
  const audio = object(shot.audio);
  const soundDesign = object(shot.sound_design);
  const mixIntent = text(audio.mix_intent || soundDesign.mix_intent || soundDesign.mix);
  if (!mixIntent) {
    throw new Error(`DIRECTING_INTELLIGENCE_AUDIO_HIERARCHY_REQUIRED:${text(shot.id) || "UNKNOWN"}`);
  }
  return {
    mix_intent: mixIntent,
    source_sound: text(audio.source_sound || soundDesign.source_sound) || null,
    silence: text(audio.silence || soundDesign.silence) || null,
    music: object(Object.keys(object(shot.music)).length ? shot.music : audio.music),
    sound_effects: [
      ...list(shot.sound_effects),
      ...list(audio.sound_effects),
      ...list(soundDesign.sound_effects),
      ...list(soundDesign.effects),
    ],
    dialogue_present: list(shot.dialogue).length > 0,
    narration_present: Boolean(text(shot.narration?.text || shot.narration)),
  };
}

function editorialAuthority(shot = {}) {
  return {
    transition_in: requiredText(
      shot.transition_in,
      `DIRECTING_INTELLIGENCE_TRANSITION_IN_REQUIRED:${text(shot.id) || "UNKNOWN"}`,
    ),
    transition_out: requiredText(
      shot.transition_out,
      `DIRECTING_INTELLIGENCE_TRANSITION_OUT_REQUIRED:${text(shot.id) || "UNKNOWN"}`,
    ),
  };
}

function performanceAuthority(shot = {}) {
  const performance = text(shot.performance);
  const performanceDirection = object(shot.performance_direction);
  const humanPerformance = object(shot.human_performance);
  const humanApplicable =
    Object.keys(humanPerformance).length > 0 ||
    list(shot.actors).length > 0 ||
    /\b(person|people|human|man|woman|child|actor|performer|artist|staff|employee|founder|owner|face)\b/i
      .test(`${text(shot.subject)} ${text(shot.action)}`);
  if (humanApplicable && !performance && !Object.keys(performanceDirection).length && !Object.keys(humanPerformance).length) {
    throw new Error(`DIRECTING_INTELLIGENCE_PERFORMANCE_DIRECTION_REQUIRED:${text(shot.id) || "UNKNOWN"}`);
  }
  return {
    applicable: humanApplicable,
    performance: performance || null,
    performance_direction: performanceDirection,
    human_performance_contract: text(humanPerformance.contract) || null,
  };
}

function sourceAuthority(shot = {}) {
  const references = list(shot.reference_assets);
  const primary = text(shot.primary_source_asset_id) || null;
  const primaryEntries = references.filter((entry) =>
    text(entry?.role).toUpperCase() === "PRIMARY_SOURCE",
  );
  if (primary && primaryEntries.length !== 1) {
    throw new Error(`DIRECTING_INTELLIGENCE_PRIMARY_SOURCE_AUTHORITY_INVALID:${text(shot.id) || "UNKNOWN"}`);
  }
  if (primaryEntries.length === 1 && text(primaryEntries[0]?.asset_id) !== primary) {
    throw new Error(`DIRECTING_INTELLIGENCE_PRIMARY_SOURCE_MISMATCH:${text(shot.id) || "UNKNOWN"}`);
  }
  return {
    primary_source_asset_id: primary,
    reference_assets: references,
    source_free: !primary && references.length === 0,
  };
}


function agencyCraftAuthority(shot = {}) {
  const coverage = object(shot.coverage);
  const id = text(shot.id) || "UNKNOWN";
  const required = [
    "story_delta",
    "sensory_delta",
    "material_detail",
    "causal_link_in",
    "causal_link_out",
    "sound_sync_point",
    "brand_visibility_reason",
    "generative_risk",
    "reject_if",
  ];
  for (const field of required) {
    requiredText(
      coverage[field],
      `DIRECTING_INTELLIGENCE_AGENCY_CRAFT_REQUIRED:${id}:${field}`,
    );
  }
  return {
    contract: "AVANTIQO_REFERENCE_CALIBRATED_AGENCY_CRAFT_V1",
    story_delta: text(coverage.story_delta),
    sensory_delta: text(coverage.sensory_delta),
    material_detail: text(coverage.material_detail),
    causal_link_in: text(coverage.causal_link_in),
    causal_link_out: text(coverage.causal_link_out),
    sound_sync_point: text(coverage.sound_sync_point),
    brand_visibility_reason: text(coverage.brand_visibility_reason),
    generative_risk: text(coverage.generative_risk),
    reject_if: text(coverage.reject_if),
    beautiful_but_disconnected_shot_forbidden: true,
    generated_feel_forbidden: true,
  };
}

function sceneAgencyCraftAuthority(scene = {}) {
  const coverage = object(scene.coverage_plan);
  const id = text(scene.id) || "UNKNOWN";
  const required = [
    "dramatic_function",
    "contrast_from_previous",
    "material_anchor",
    "sound_transition",
    "brand_state",
  ];
  for (const field of required) {
    requiredText(
      coverage[field],
      `DIRECTING_INTELLIGENCE_SCENE_AGENCY_CRAFT_REQUIRED:${id}:${field}`,
    );
  }
  return {
    contract: "AVANTIQO_REFERENCE_CALIBRATED_AGENCY_CRAFT_V1",
    ...Object.fromEntries(required.map((field) => [field, text(coverage[field])])),
  };
}

function shotDecision({ shot, scene, shotIndex, shotCount }) {
  const id = requiredText(shot.id, "DIRECTING_INTELLIGENCE_SHOT_ID_REQUIRED");
  const sceneId = requiredText(
    shotSceneId(shot, scene?.id),
    `DIRECTING_INTELLIGENCE_SHOT_SCENE_ID_REQUIRED:${id}`,
  );
  const purpose = requiredText(
    shot.purpose,
    `DIRECTING_INTELLIGENCE_SHOT_PURPOSE_REQUIRED:${id}`,
  );
  const subject = requiredText(
    shot.subject,
    `DIRECTING_INTELLIGENCE_SHOT_SUBJECT_REQUIRED:${id}`,
  );
  const action = requiredText(
    shot.action,
    `DIRECTING_INTELLIGENCE_SHOT_ACTION_REQUIRED:${id}`,
  );
  const duration = finite(shot.duration_seconds);
  if (!duration || duration <= 0) {
    throw new Error(`DIRECTING_INTELLIGENCE_SHOT_DURATION_REQUIRED:${id}`);
  }
  const frames = frameAuthority(shot);
  const camera = cameraAuthority(shot);
  const audio = audioAuthority(shot);
  const editorial = editorialAuthority(shot);
  const performance = performanceAuthority(shot);
  const source = sourceAuthority(shot);
  const agencyCraft = agencyCraftAuthority(shot);
  const continuity = object(shot.continuity);
  if (!Object.keys(continuity).length && !graphicsOnlyShot(shot)) {
    throw new Error(`DIRECTING_INTELLIGENCE_CONTINUITY_REQUIRED:${id}`);
  }
  const device = requiredText(
    shot.device,
    `DIRECTING_INTELLIGENCE_DEVICE_DECISION_REQUIRED:${id}`,
  );
  const risks = list(shot.known_failure_modes).map(text).filter(Boolean);
  const repairs = list(shot.repair_instructions).map(text).filter(Boolean);
  if (!risks.length || !repairs.length) {
    throw new Error(`DIRECTING_INTELLIGENCE_REPAIR_AUTHORITY_REQUIRED:${id}`);
  }

  const decision = {
    contract: SHOT_CONTRACT,
    shot_id: id,
    scene_id: sceneId,
    shot_index: shotIndex,
    shot_count_in_scene: shotCount,
    dramatic_objective: purpose,
    audience_attention: {
      primary_subject: subject,
      focus_target: camera.applicable ? camera.focus_target : subject,
      opening_information: frames.opening,
      progression_information: frames.progression,
      closing_information: frames.closing,
    },
    action_direction: action,
    signature_device_decision: device,
    performance_direction: performance,
    camera_direction: camera,
    audio_direction: audio,
    editorial_direction: editorial,
    continuity_direction: continuity,
    source_authority: source,
    agency_craft: agencyCraft,
    specialized_contracts: specializedContracts(shot),
    failure_modes: risks,
    repair_authority: repairs,
    negative_constraints: list(shot.negative_constraints).map(text).filter(Boolean),
    renderer_must_not_invent_direction: true,
    renderer_must_not_change_story_information: true,
    specialist_contracts_may_refine_but_not_override_director_intent: true,
    provider_neutral: true,
    promptless_execution: true,
    provider_calls_executed: 0,
  };
  return {
    ...decision,
    decision_hash: digest(decision),
  };
}

function sceneDecision({ scene, sceneIndex, sceneCount, shots, plan }) {
  const id = requiredText(scene.id, "DIRECTING_INTELLIGENCE_SCENE_ID_REQUIRED");
  const objective = requiredText(
    scene.objective,
    `DIRECTING_INTELLIGENCE_SCENE_OBJECTIVE_REQUIRED:${id}`,
  );
  const before = requiredText(
    scene.story_state_before,
    `DIRECTING_INTELLIGENCE_SCENE_STATE_BEFORE_REQUIRED:${id}`,
  );
  const change = requiredText(
    scene.state_change,
    `DIRECTING_INTELLIGENCE_SCENE_STATE_CHANGE_REQUIRED:${id}`,
  );
  const after = requiredText(
    scene.story_state_after,
    `DIRECTING_INTELLIGENCE_SCENE_STATE_AFTER_REQUIRED:${id}`,
  );
  const transition = requiredText(
    scene.transition_logic,
    `DIRECTING_INTELLIGENCE_SCENE_TRANSITION_REQUIRED:${id}`,
  );
  const duration = finite(scene.duration_seconds);
  if (!duration || duration <= 0) {
    throw new Error(`DIRECTING_INTELLIGENCE_SCENE_DURATION_REQUIRED:${id}`);
  }
  if (!shots.length) {
    throw new Error(`DIRECTING_INTELLIGENCE_SCENE_SHOTS_REQUIRED:${id}`);
  }
  const purposeKeys = shots.map((shot) => normalizedPurpose(shot.purpose)).filter(Boolean);
  if (new Set(purposeKeys).size !== purposeKeys.length) {
    throw new Error(`DIRECTING_INTELLIGENCE_DUPLICATE_SHOT_PURPOSE:${id}`);
  }
  const shotDuration = shots.reduce((sum, shot) => sum + (finite(shot.duration_seconds) || 0), 0);
  if (Math.abs(shotDuration - duration) > 0.05) {
    throw new Error(`DIRECTING_INTELLIGENCE_SCENE_SHOT_DURATION_MISMATCH:${id}`);
  }

  const agencyCraft = sceneAgencyCraftAuthority(scene);
  const decision = {
    contract: SCENE_CONTRACT,
    scene_id: id,
    scene_index: sceneIndex,
    scene_count: sceneCount,
    objective,
    emotion: requiredText(
      scene.emotion,
      `DIRECTING_INTELLIGENCE_SCENE_EMOTION_REQUIRED:${id}`,
    ),
    audience_state: {
      before,
      change,
      after,
    },
    transition_logic: transition,
    duration_seconds: duration,
    shot_ids: shots.map((shot) => shot.id),
    visual_strategy: object(scene.visual_style),
    camera_strategy: object(scene.camera_style),
    audio_strategy: object(scene.audio_style),
    location_authority: object(scene.location),
    actor_authority: list(scene.actors),
    product_authority: list(scene.products),
    brand_rules: list(scene.brand_rules),
    agency_craft: agencyCraft,
    master_thesis: text(plan.concept?.creative_thesis) || null,
    renderer_must_not_reinterpret_scene_objective: true,
    provider_neutral: true,
    promptless_execution: true,
    provider_calls_executed: 0,
  };
  return {
    ...decision,
    decision_hash: digest(decision),
  };
}

function projectDecision(plan = {}, sceneDecisions = [], shotDecisions = []) {
  const concept = object(plan.concept);
  const story = object(plan.story);
  const thesis = requiredText(
    concept.creative_thesis,
    "DIRECTING_INTELLIGENCE_CREATIVE_THESIS_REQUIRED",
  );
  const message = requiredText(
    concept.message,
    "DIRECTING_INTELLIGENCE_MESSAGE_REQUIRED",
  );
  const storyHook = requiredText(
    story.hook,
    "DIRECTING_INTELLIGENCE_STORY_HOOK_REQUIRED",
  );
  const storyResolution = requiredText(
    story.resolution,
    "DIRECTING_INTELLIGENCE_STORY_RESOLUTION_REQUIRED",
  );
  const filmCraft = object(plan.cinematic_coverage);
  if (text(filmCraft.agency_craft_contract) !== "AVANTIQO_REFERENCE_CALIBRATED_AGENCY_CRAFT_V1") {
    throw new Error("DIRECTING_INTELLIGENCE_AGENCY_CRAFT_CONTRACT_REQUIRED");
  }
  const decision = {
    contract: PROJECT_CONTRACT,
    hierarchy: "PROJECT_SCENE_SHOT",
    creative_thesis: thesis,
    message,
    story_hook: storyHook,
    story_resolution: storyResolution,
    emotional_arc: text(story.emotional_arc) || null,
    signature_device: text(concept.signature_device) || null,
    refused_devices: concept.refused_devices || null,
    agency_craft_contract: filmCraft.agency_craft_contract,
    agency_craft_reference_calibration: object(filmCraft.reference_calibration),
    scene_decision_hashes: sceneDecisions.map((entry) => entry.decision_hash),
    shot_decision_hashes: shotDecisions.map((entry) => entry.decision_hash),
    scene_count: sceneDecisions.length,
    shot_count: shotDecisions.length,
    director_is_semantic_authority: true,
    renderer_is_execution_engine_not_director: true,
    hierarchical_planning_required: true,
    cross_discipline_alignment_required: true,
    provider_neutral: true,
    promptless_execution: true,
    provider_calls_executed: 0,
    narrative_escalation_scoring_deferred_to_phase_15: true,
    automatic_candidate_selection_deferred_to_phase_16: true,
    budget_quality_optimization_deferred_to_phase_17: true,
    multi_version_audience_output_deferred_to_phase_18: true,
  };
  return {
    ...decision,
    decision_hash: digest(decision),
  };
}

function rebuildScenes(scenes, shotDecisionsById, sceneDecisionsById) {
  return scenes.map((scene) => ({
    ...scene,
    directing_intelligence: sceneDecisionsById.get(text(scene.id)),
    shots: containedShots(scene).map((shot) => ({
      ...shot,
      directing_intelligence: shotDecisionsById.get(text(shot.id)),
    })),
  }));
}

function rebuildShots(shots, shotDecisionsById) {
  return shots.map((shot) => {
    const { __director_scene_id: _ignored, ...source } = shot;
    return {
      ...source,
      directing_intelligence: shotDecisionsById.get(text(shot.id)),
    };
  });
}

export const CreativeDirectingIntelligenceRuntime = Object.freeze({
  contract: CONTRACT,
  project_contract: PROJECT_CONTRACT,
  scene_contract: SCENE_CONTRACT,
  shot_contract: SHOT_CONTRACT,
  provider_neutral: true,
  promptless_execution: true,
  renderer_is_execution_engine_not_director: true,

  build(input = {}) {
    const plan = object(input.creative_plan);
    if (text(plan.workflow_kind).toUpperCase() !== "TEMPORAL") {
      return {
        ...input,
        metadata: {
          contract: CONTRACT,
          applicable: false,
          reason: "Directing intelligence V1 is scoped to temporal productions.",
        },
      };
    }
    const scenes = sourceScenes(input);
    if (!scenes.length) {
      throw new Error("DIRECTING_INTELLIGENCE_SCENES_REQUIRED");
    }
    const shots = flattenShots(input, scenes);
    if (!shots.length) {
      throw new Error("DIRECTING_INTELLIGENCE_SHOTS_REQUIRED");
    }

    const sceneById = new Map(scenes.map((scene) => [text(scene.id), scene]));
    const shotsByScene = new Map();
    for (const shot of shots) {
      const sceneId = shotSceneId(shot);
      if (!sceneId || !sceneById.has(sceneId)) {
        throw new Error(`DIRECTING_INTELLIGENCE_SHOT_SCENE_UNRESOLVED:${text(shot.id) || "UNKNOWN"}`);
      }
      const values = shotsByScene.get(sceneId) || [];
      values.push(shot);
      shotsByScene.set(sceneId, values);
    }

    const shotDecisions = [];
    const sceneDecisions = [];
    for (let sceneIndex = 0; sceneIndex < scenes.length; sceneIndex += 1) {
      const scene = scenes[sceneIndex];
      const sceneShots = shotsByScene.get(text(scene.id)) || [];
      sceneShots.forEach((shot, shotIndex) => {
        shotDecisions.push(shotDecision({
          shot,
          scene,
          shotIndex,
          shotCount: sceneShots.length,
        }));
      });
      sceneDecisions.push(sceneDecision({
        scene,
        sceneIndex,
        sceneCount: scenes.length,
        shots: sceneShots,
        plan,
      }));
    }

    const project = projectDecision(plan, sceneDecisions, shotDecisions);
    const shotDecisionsById = new Map(
      shotDecisions.map((entry) => [text(entry.shot_id), entry]),
    );
    const sceneDecisionsById = new Map(
      sceneDecisions.map((entry) => [text(entry.scene_id), entry]),
    );
    const enrichedScenes = rebuildScenes(
      scenes,
      shotDecisionsById,
      sceneDecisionsById,
    );
    const enrichedShots = rebuildShots(shots, shotDecisionsById);
    const metadata = {
      contract: CONTRACT,
      applicable: true,
      project_decision: project,
      project_decision_hash: project.decision_hash,
      scene_decision_count: sceneDecisions.length,
      shot_decision_count: shotDecisions.length,
      scene_decision_hashes: sceneDecisions.map((entry) => entry.decision_hash),
      shot_decision_hashes: shotDecisions.map((entry) => entry.decision_hash),
      hierarchical_planning: "PROJECT_SCENE_SHOT",
      renderer_is_execution_engine_not_director: true,
      provider_neutral: true,
      promptless_execution: true,
      provider_calls_executed: 0,
    };

    return {
      ...input,
      scenes: enrichedScenes,
      shots: enrichedShots,
      creative_plan: {
        ...plan,
        scenes: enrichedScenes,
        directing_intelligence: {
          contract: CONTRACT,
          project,
          scene_decisions: sceneDecisions,
          shot_decisions: shotDecisions,
          manifest_hash: digest({ project, sceneDecisions, shotDecisions }),
        },
      },
      metadata,
    };
  },

  verifyShotDecision(value = {}) {
    const decision = object(value);
    if (decision.contract !== SHOT_CONTRACT) {
      throw new Error("DIRECTING_INTELLIGENCE_SHOT_CONTRACT_REQUIRED");
    }
    if (!text(decision.shot_id) || !text(decision.scene_id)) {
      throw new Error("DIRECTING_INTELLIGENCE_SHOT_IDENTITY_REQUIRED");
    }
    if (decision.renderer_must_not_invent_direction !== true) {
      throw new Error("DIRECTING_INTELLIGENCE_RENDERER_AUTHORITY_INVALID");
    }
    const expected = digest(decision);
    if (text(decision.decision_hash) !== expected) {
      throw new Error("DIRECTING_INTELLIGENCE_SHOT_HASH_MISMATCH");
    }
    return decision;
  },

  hash: digest,
});

export const AVANTIQO_DIRECTING_INTELLIGENCE_CONTRACT = CONTRACT;
export const AVANTIQO_DIRECTOR_PROJECT_DECISION_CONTRACT = PROJECT_CONTRACT;
export const AVANTIQO_DIRECTOR_SCENE_DECISION_CONTRACT = SCENE_CONTRACT;
export const AVANTIQO_DIRECTOR_SHOT_DECISION_CONTRACT = SHOT_CONTRACT;
