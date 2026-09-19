const CONTRACT = "CREATIVE_SHOT_DP_INTENT_V1";

function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function text(value) { return String(value ?? "").trim(); }
function finite(value, fallback = null) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function lower(value) { return text(value).toLowerCase(); }

function lensRole(shot = {}) {
  const framing = lower(shot.camera?.framing);
  const purpose = lower(shot.purpose);
  const lens = lower(shot.camera?.lens_intent);
  if (/hero|reveal|payoff|signature/.test(purpose)) return "HERO_GEOMETRY";
  if (/macro|detail|insert|extreme close/.test(`${framing} ${lens}`)) return "MICRO_DETAIL";
  if (/portrait|close/.test(framing)) return "HUMAN_INTIMACY";
  if (/wide|establish|environment|architecture|landscape/.test(`${framing} ${purpose}`)) return "SPATIAL_CONTEXT";
  return "NARRATIVE_NORMAL";
}

function cameraMotionReason(shot = {}) {
  const camera = object(shot.camera);
  const explicit = text(camera.movement_motivation);
  if (explicit) return explicit;
  const path = lower(camera.movement_path || camera.movement);
  if (/locked|static|fixed|tripod/.test(path)) return "No camera travel: subject action, sound or environmental change carries the beat.";
  return text(shot.action)
    ? `Camera movement exists only to reveal or stay relationally attached to the authored action: ${text(shot.action)}`
    : "Camera movement must reveal new story information; decorative motion is forbidden.";
}

function lightingDesign(shot = {}, physicalWorld = {}) {
  const lighting = object(shot.lighting);
  const production = object(physicalWorld.production_design);
  return {
    key_source: text(lighting.key_source || lighting.source) || "Primary motivated environmental source",
    key_direction: text(lighting.key_direction || lighting.direction) || "Direction must follow visible environmental source geometry.",
    fill_strategy: text(lighting.fill_strategy) || "Natural bounce or controlled negative fill only; no unmotivated beauty fill.",
    practicals: text(lighting.practicals || lighting.practical_strategy) || text(production.practical_lights) || "Visible practicals must be physically motivated by the environment.",
    contrast_ratio: text(lighting.contrast) || "Maintain authored contrast with readable shadows and protected highlights.",
    highlight_target: text(lighting.highlight_target) || `Place primary specular attention on ${text(shot.subject) || "the authored subject"} or its story-relevant material edge.`,
    shadow_intent: text(lighting.shadow_intent) || "Shadows must reveal form and depth, not hide missing generation detail.",
    atmosphere_policy: text(lighting.atmosphere_policy) || "No artificial haze unless physically motivated by the authored environment.",
    exposure_relationship: text(lighting.exposure_relationship || lighting.exposure_intent) || "Protect highlights while retaining dimensional blacks and subject readability.",
  };
}
function lensGrammar(shot = {}, acquisition = {}, craft = {}) {
  const camera = object(shot.camera);
  return {
    role: lensRole(shot),
    focal_length_mm: finite(acquisition.camera?.focal_length_mm, null),
    aperture_t_stop: finite(acquisition.camera?.aperture_t_stop, null),
    projection: text(craft.lens_character?.projection),
    character: text(craft.lens_character?.character),
    distortion: text(craft.lens_character?.distortion),
    depth_of_field: text(acquisition.camera?.depth_of_field),
    continuity_rule: text(craft.spatial_continuity?.lens_continuity) || "Lens choice must preserve the film's spatial grammar across coverage.",
    arbitrary_lens_change_forbidden: true,
  };
}

export function buildShotDpIntent({ shot = {}, physical_world = {}, cinematography_acquisition = {}, professional_filmcraft = {} } = {}) {
  const movement = object(professional_filmcraft.movement_choreography);
  const design = {
    contract: CONTRACT,
    version: 1,
    release_blocking: true,
    lens_grammar: lensGrammar(shot, cinematography_acquisition, professional_filmcraft),
    camera_choreography: {
      reason_to_move: cameraMotionReason(shot),
      start_position: text(movement.start_anchor),
      path: text(movement.path),
      speed_curve: text(movement.speed_profile),
      acceleration_profile: text(movement.acceleration_profile),
      parallax_layers: text(movement.parallax_strategy),
      subject_relationship: text(movement.subject_relative_motion),
      focus_movement: object(professional_filmcraft.focus_choreography),
      settle_position: text(movement.end_anchor),
      camera_must_remain_still_if_motion_has_no_story_reason: true,
    },
    lighting_design: lightingDesign(shot, physical_world),
    look_linkage: object(professional_filmcraft.look_development),
    provider_may_replace_lens_or_light_plan: false,
  };
  return Object.freeze(design);
}

export function evaluateShotDpIntent(value = {}) {
  const failures = [];
  if (value.contract !== CONTRACT) failures.push("SHOT_DP_INTENT_CONTRACT_REQUIRED");
  if (value.release_blocking !== true) failures.push("SHOT_DP_INTENT_RELEASE_BLOCKING_REQUIRED");
  if (!text(value.lens_grammar?.role)) failures.push("SHOT_DP_LENS_ROLE_REQUIRED");
  if (finite(value.lens_grammar?.focal_length_mm) === null) failures.push("SHOT_DP_FOCAL_LENGTH_REQUIRED");
  for (const field of ["reason_to_move","start_position","path","speed_curve","subject_relationship","settle_position"]) {
    if (!text(value.camera_choreography?.[field])) failures.push(`SHOT_DP_CAMERA_FIELD_REQUIRED:${field}`);
  }
  for (const field of ["key_source","key_direction","fill_strategy","practicals","contrast_ratio","highlight_target","shadow_intent","atmosphere_policy","exposure_relationship"]) {
    if (!text(value.lighting_design?.[field])) failures.push(`SHOT_DP_LIGHT_FIELD_REQUIRED:${field}`);
  }
  if (value.provider_may_replace_lens_or_light_plan !== false) failures.push("SHOT_DP_PROVIDER_AUTHORITY_INVALID");
  return Object.freeze({ contract: "CREATIVE_SHOT_DP_INTENT_GATE_V1", passed: failures.length === 0, failures });
}

export const CreativeShotDpIntentRuntime = Object.freeze({ contract: CONTRACT, build: buildShotDpIntent, evaluate: evaluateShotDpIntent });
