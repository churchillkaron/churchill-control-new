export const CREATIVE_SHOT_GENERATION_STRATEGY_CONTRACT = "CREATIVE_SHOT_GENERATION_STRATEGY_V1";

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}
function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function text(value) {
  return String(value ?? "").trim();
}
function lower(value) {
  return text(value).toLowerCase();
}

function hasHuman(shot = {}) {
  return Boolean(
    list(shot.actors).length ||
    Object.keys(object(shot.performance_direction)).length ||
    Object.keys(object(shot.pursuit_performance_choreography)).length ||
    /man|woman|person|human|runner|performer|actor|face|hand|feet/i.test(
      [shot.subject, shot.action, shot.purpose].map(text).join(" "),
    )
  );
}
function hasThreat(shot = {}) {
  return Boolean(
    Object.keys(object(shot.pursuit_spatial_choreography)).length ||
    /drone|pursu|hunt|chase|threat|search beam|predator/i.test(
      [shot.subject, shot.action, shot.purpose].map(text).join(" "),
    )
  );
}
function hasWeatherComplexity(shot = {}) {
  const state = object(shot.environmental_continuity_state);
  const source = lower([
    state.precipitation_state,
    state.atmosphere_density,
    state.lightning_state,
    shot.cinematic_beauty_intent?.atmosphere,
    shot.signature_frame_design?.atmosphere_physics,
  ].map(text).join(" "));
  return /rain|storm|fog|mist|smoke|lightning|snow|spray|volumetric/.test(source);
}
function hasContactPhysics(shot = {}) {
  const performance = object(shot.pursuit_performance_choreography);
  const source = lower([
    performance.contact_or_obstacle_response,
    performance.body_mechanics,
    shot.action,
    shot.subject_motion_choreography?.path,
  ].map(text).join(" "));
  return /slip|stumble|impact|contact|branch|mud|grab|collision|fall|duck|jump|land|water|debris/.test(source);
}
function hasTransformation(shot = {}) {
  return Boolean(
    list(object(shot.graphics).cinematic_motion_events).length ||
    list(object(shot.cinematic_motion_design).events).length ||
    /transform|lightning|energy|neural|logo|material shift|morph/i.test(
      [shot.purpose, shot.action, shot.transition_out].map(text).join(" "),
    )
  );
}
function hasIdentityContinuity(shot = {}) {
  return Boolean(
    text(shot.subject_identity_key) ||
    shot.inherits_subject_identity === true ||
    shot.keyframe_contract?.required === true ||
    shot.generation?.identity_lock ||
    object(shot.persistent_subject_lock).required === true
  );
}

export function buildShotGenerationStrategy({ shot = {}, scene = {} } = {}) {
  const factors = {
    human_performance: hasHuman(shot),
    moving_threat: hasThreat(shot),
    weather_atmosphere: hasWeatherComplexity(shot),
    contact_physics: hasContactPhysics(shot),
    transformation_vfx: hasTransformation(shot),
    identity_continuity: hasIdentityContinuity(shot),
    reconstruction: Boolean(shot.scene_reconstruction_contract),
    existing_multipass: Boolean(shot.multipass_contract),
  };
  const score = Object.values(factors).filter(Boolean).length;
  const complex = score >= 4 || factors.transformation_vfx || factors.reconstruction;
  const continuitySensitive = factors.human_performance || factors.identity_continuity || factors.moving_threat;
  const mode = complex
    ? "MULTIPASS_COMPLEX"
    : continuitySensitive
      ? "SHARED_KEYFRAME_SEQUENCE"
      : "CONTROLLED_SINGLE_PASS";

  const sceneKey = text(scene.id || shot.scene_id || "scene");
  return Object.freeze({
    contract: CREATIVE_SHOT_GENERATION_STRATEGY_CONTRACT,
    mode,
    complexity_score: score,
    complexity_factors: factors,
    shot_independence: continuitySensitive ? "CONTINUITY_LINKED" : "INDEPENDENT",
    shared_state_group_id: continuitySensitive ? "continuity:" + sceneKey : null,
    keyframe_policy: {
      approved_signature_frame_required_before_motion: true,
      shared_identity_world_state_required: continuitySensitive,
      closing_to_next_opening_handoff_required: continuitySensitive,
      independent_reinvention_between_neighboring_shots_forbidden: continuitySensitive,
    },
    pass_policy: {
      multipass_required: complex,
      separate_base_plate_required: complex && (factors.weather_atmosphere || factors.transformation_vfx || factors.reconstruction),
      separate_threat_or_hero_layer_required: complex && factors.moving_threat,
      separate_atmosphere_layer_required: complex && factors.weather_atmosphere,
      separate_physical_interaction_pass_required: complex && factors.contact_physics,
      separate_vfx_or_transformation_pass_required: complex && factors.transformation_vfx,
      final_composite_required: complex,
    },
    candidate_policy: {
      initial_candidate_count: 1,
      alternate_generation_requires_failed_review: true,
      maximum_paid_candidates: complex ? 3 : 2,
      shotgun_candidate_generation_forbidden: true,
      repair_existing_candidate_before_new_candidate_when_localized: true,
      full_regeneration_only_for_structural_failure: true,
    },
    provider_policy: {
      creative_layer_may_not_select_provider_or_model: true,
      service_runtime_selects_only_certified_owned_execution: true,
      unsupported_required_control_must_block: true,
    },
  });
}

export const CreativeShotGenerationStrategyRuntime = Object.freeze({
  contract: CREATIVE_SHOT_GENERATION_STRATEGY_CONTRACT,
  build: buildShotGenerationStrategy,
});
