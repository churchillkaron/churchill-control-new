const CONTRACT = "AVANTIQO_PROFESSIONAL_FILMCRAFT_V1";

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
function text(value) { return String(value ?? "").trim(); }
function lower(value) { return text(value).toLowerCase(); }
function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
function firstText(...values) {
  for (const value of values) {
    const candidate = text(value);
    if (candidate) return candidate;
  }
  return "";
}
function assetId(value) {
  if (!value) return null;
  if (typeof value === "string") return text(value) || null;
  if (typeof value !== "object") return null;
  return firstText(
    value.asset_id,
    value.assetId,
    value.id,
    value.storage_reference,
    value.storageReference,
    value.url,
    value.file_url,
    value.fileUrl,
  ) || null;
}
function source(shot = {}) { return object(shot.metadata?.shot_bible_source); }
function camera(shot = {}) { return object(shot.camera); }
function lighting(shot = {}) { return object(shot.lighting); }
function acquisition(input = {}) { return object(input.cinematography_acquisition); }
function graphicOnly(shot = {}, task = {}) {
  const corpus = [shot.type, shot.kind, shot.shot_type, shot.media_type, task.type, task.capability, task.service_code]
    .map(lower).join(" ");
  return /(^|[._\s-])(graphic|graphics|title|title-card|typography|motion-graphics)([._\s-]|$)/.test(corpus);
}
function lensCharacter(shot = {}, input = {}) {
  const cam = camera(shot);
  const explicit = object(cam.lens_character || source(shot).lens_character);
  const lensIntent = lower(cam.lens_intent);
  const focal = finite(acquisition(input).camera?.focal_length_mm, 50);
  const anamorphic = /anamorphic/.test(lensIntent) || lower(explicit.projection) === "anamorphic";
  const vintage = /vintage|classic|legacy/.test(lensIntent) || lower(explicit.character) === "vintage";
  return {
    projection: firstText(explicit.projection, anamorphic ? "ANAMORPHIC" : "SPHERICAL"),
    squeeze_ratio: finite(explicit.squeeze_ratio, anamorphic ? 2 : 1),
    distortion: firstText(explicit.distortion, focal <= 28 ? "CONTROLLED_WIDE_ANGLE" : "MINIMAL_NARRATIVE"),
    breathing: firstText(explicit.breathing, "MINIMIZED_UNLESS_STORY_MOTIVATED"),
    flare_response: firstText(explicit.flare_response, anamorphic ? "CONTROLLED_HORIZONTAL" : "CONTROLLED_ORGANIC"),
    bokeh_character: firstText(explicit.bokeh_character, anamorphic ? "OVAL_SOFT" : "ROUND_NATURAL"),
    edge_falloff: firstText(explicit.edge_falloff, vintage ? "GENTLE_CHARACTER" : "CONTROLLED_CLEAN"),
    highlight_behavior: firstText(explicit.highlight_behavior, vintage ? "SOFT_BLOOM" : "SMOOTH_ROLLOFF"),
    diffusion: firstText(explicit.diffusion, vintage ? "SUBTLE" : "NONE_UNLESS_MOTIVATED"),
    close_focus_behavior: firstText(explicit.close_focus_behavior, focal >= 85 ? "CONTROLLED_COMPRESSION" : "NATURAL_PERSPECTIVE"),
    character: firstText(explicit.character, vintage ? "VINTAGE_CHARACTER" : "MODERN_CINEMATIC"),
  };
}
function movementChoreography(shot = {}, input = {}) {
  const cam = camera(shot);
  const explicit = object(cam.movement_choreography || source(shot).movement_choreography);
  const movement = lower(firstText(cam.movement_path, cam.movement, explicit.path));
  const rig = firstText(acquisition(input).camera?.rig_type, "VIRTUAL_CAMERA");
  const primitives = [];
  const mapping = [
    ["pan", /\bpan\b/], ["tilt", /\btilt\b/], ["roll", /\broll\b/],
    ["dolly", /\bdolly|push|pull\b/], ["truck", /\btruck|track|tracking\b/],
    ["pedestal", /\bpedestal|vertical\b/], ["orbit", /\borbit|arc\b/],
    ["crane", /\bcrane|jib|technocrane\b/], ["aerial", /\bdrone|aerial|flyover|fpv\b/],
    ["zoom", /\bzoom\b/], ["handheld", /\bhandheld|hand-held\b/],
  ];
  for (const [name, pattern] of mapping) if (pattern.test(movement)) primitives.push(name.toUpperCase());
  if (!primitives.length && !/static|locked|fixed/.test(movement)) primitives.push("SUBJECT_RELATIVE_MOVE");
  const compound = list(explicit.compound_move).length
    ? list(explicit.compound_move).map((v) => text(v).toUpperCase())
    : primitives;
  const motionReference = assetId(
    explicit.motion_reference || explicit.motion_reference_asset || explicit.motion_reference_asset_id ||
    cam.motion_reference || cam.motion_reference_asset || cam.motion_reference_asset_id ||
    acquisition(input).camera?.motion_reference_asset_id,
  );
  return {
    rig_type: rig,
    primitives,
    compound_move: compound,
    path: firstText(explicit.path, cam.movement_path, cam.movement, "LOCKED_COMPOSITION"),
    subject_relative_motion: firstText(explicit.subject_relative_motion, cam.movement_motivation, "MAINTAIN_NARRATIVE_SUBJECT_RELATION"),
    parallax_strategy: firstText(explicit.parallax_strategy, /dolly|track|orbit|drone|crane/.test(movement) ? "LAYERED_FOREGROUND_MIDGROUND_BACKGROUND" : "NATURAL"),
    foreground_reveal: firstText(explicit.foreground_reveal, /reveal|push|crane|drone/.test(movement) ? "MOTIVATED_IF_COMPOSITION_SUPPORTS" : "NONE_REQUIRED"),
    speed_profile: firstText(explicit.speed_profile, acquisition(input).camera?.motion_curve, "EASE_IN_OUT"),
    acceleration_profile: firstText(explicit.acceleration_profile, acquisition(input).camera?.movement_acceleration, "SMOOTH_LOW_JERK"),
    start_anchor: firstText(explicit.start_anchor, acquisition(input).camera?.start_anchor),
    end_anchor: firstText(explicit.end_anchor, acquisition(input).camera?.end_anchor),
    motion_reference_asset_id: motionReference,
    motion_reference_required: Boolean(motionReference),
    motion_reference_role: motionReference ? "CAMERA_MOTION_REFERENCE" : null,
  };
}
function performanceControl(shot = {}) {
  const src = source(shot);
  const explicit = object(src.performance_control || shot.performance_control);
  const reference = assetId(
    explicit.performance_reference || explicit.performance_reference_asset || explicit.performance_reference_asset_id ||
    shot.performance_reference || shot.performance_reference_asset || shot.performance_reference_asset_id ||
    src.performance_reference || src.performance_reference_asset || src.performance_reference_asset_id,
  );
  const hasPeople = list(shot.actors).length > 0 || Boolean(text(shot.performance)) || list(shot.dialogue).length > 0;
  return {
    applicable: hasPeople,
    performance_reference_asset_id: reference,
    performance_reference_required: Boolean(reference),
    performance_reference_role: reference ? "PERFORMANCE_REFERENCE" : null,
    body_action: firstText(explicit.body_action, shot.performance, shot.action, hasPeople ? "NATURAL_AUTHORED_BLOCKING" : "NOT_APPLICABLE"),
    gesture_timing: firstText(explicit.gesture_timing, hasPeople ? "BEAT_ALIGNED" : "NOT_APPLICABLE"),
    facial_expression: firstText(explicit.facial_expression, src.performance_direction?.expression, hasPeople ? "SUBTEXT_ALIGNED" : "NOT_APPLICABLE"),
    gaze: firstText(explicit.gaze, src.performance_direction?.gaze, hasPeople ? "MOTIVATED_EYELINE" : "NOT_APPLICABLE"),
    dialogue_timing: firstText(explicit.dialogue_timing, list(shot.dialogue).length ? "SYNC_TO_AUTHORED_BEATS" : "NOT_APPLICABLE"),
    emotion_arc: firstText(explicit.emotion_arc, src.performance_direction?.emotion_arc, hasPeople ? "CONTINUOUS_WITH_SCENE_INTENT" : "NOT_APPLICABLE"),
    blocking: firstText(explicit.blocking, src.performance_direction?.blocking, hasPeople ? "SPATIALLY_CONTINUOUS" : "NOT_APPLICABLE"),
    interaction_beats: list(explicit.interaction_beats),
  };
}
function editorialMicroRhythm(shot = {}) {
  const explicit = object(source(shot).editorial_micro_rhythm || shot.editorial_micro_rhythm);
  const duration = finite(shot.duration_seconds, 5);
  const movement = lower(firstText(camera(shot).movement, camera(shot).movement_path));
  return {
    entry_handle_frames: Math.max(0, Math.round(finite(explicit.entry_handle_frames, 8))),
    exit_handle_frames: Math.max(0, Math.round(finite(explicit.exit_handle_frames, 8))),
    cut_motivation: firstText(explicit.cut_motivation, shot.purpose, "STORY_BEAT_COMPLETION"),
    cut_on_motion: explicit.cut_on_motion ?? /move|track|dolly|pan|tilt|action/.test(`${movement} ${lower(shot.action)}`),
    reaction_allowance: firstText(explicit.reaction_allowance, list(shot.actors).length ? "PRESERVE_HUMAN_REACTION_BEAT" : "NOT_APPLICABLE"),
    j_cut_intent: firstText(explicit.j_cut_intent, "AS_MOTIVATED_BY_NEXT_SCENE_AUDIO"),
    l_cut_intent: firstText(explicit.l_cut_intent, "AS_MOTIVATED_BY_EMOTIONAL_CONTINUITY"),
    match_action: firstText(explicit.match_action, "PRESERVE_WHEN_CROSSING_SHOTS"),
    visual_rhyme: firstText(explicit.visual_rhyme, "USE_ONLY_WHEN_STORY_MOTIVATED"),
    intentional_silence: firstText(explicit.intentional_silence, "ALLOW_IF_DRAMATIC_BEAT_REQUIRES"),
    pace: firstText(explicit.pace, duration <= 2.5 ? "ACCELERATED" : duration >= 7 ? "CONTEMPLATIVE" : "CONTROLLED_CINEMATIC"),
  };
}
function soundPerspective(shot = {}) {
  const explicit = object(source(shot).sound_perspective || shot.audio?.sound_perspective || shot.sound_perspective);
  const location = object(shot.location);
  return {
    listener_pov: firstText(explicit.listener_pov, "CAMERA_ALIGNED_WITH_NARRATIVE_ATTENTION"),
    proximity: firstText(explicit.proximity, "TRACK_SUBJECT_DISTANCE"),
    room_perspective: firstText(explicit.room_perspective, text(location.type) ? `MATCH_${text(location.type).toUpperCase().replace(/[^A-Z0-9]+/g, "_")}` : "MATCH_AUTHORED_ENVIRONMENT"),
    occlusion: firstText(explicit.occlusion, "PHYSICALLY_MOTIVATED"),
    reverb_distance: firstText(explicit.reverb_distance, "FOLLOW_CAMERA_AND_SUBJECT_DISTANCE"),
    foreground_background_hierarchy: firstText(explicit.foreground_background_hierarchy, "NARRATIVE_PRIORITY"),
    movement_perspective: firstText(explicit.movement_perspective, "FOLLOW_SOURCE_AND_CAMERA_MOTION"),
    transition_sound: firstText(explicit.transition_sound, "SUPPORT_EDIT_WITHOUT_TELEGRAPHING"),
    impact_accents: list(explicit.impact_accents),
    silence_is_design_element: explicit.silence_is_design_element !== false,
  };
}
function lookDevelopment(shot = {}, input = {}) {
  const explicit = object(source(shot).look_development || shot.look_development);
  const light = lighting(shot);
  const kelvin = finite(acquisition(input).lighting?.color_temperature_kelvin, 4300);
  return {
    exposure_philosophy: firstText(explicit.exposure_philosophy, light.exposure_intent, "PROTECT_HIGHLIGHTS_PRESERVE_FACES"),
    contrast_curve: firstText(explicit.contrast_curve, light.contrast, "CINEMATIC_S_CURVE_WITH_DETAIL"),
    highlight_rolloff: firstText(explicit.highlight_rolloff, "SMOOTH_FILMIC"),
    skin_rendering: firstText(explicit.skin_rendering, "NATURAL_PROTECTED_SKIN_TONES"),
    saturation_hierarchy: firstText(explicit.saturation_hierarchy, "SUBJECT_AND_BRAND_PRIORITY"),
    palette: list(explicit.palette).length ? list(explicit.palette) : [kelvin <= 3800 ? "WARM_MOTIVATED" : kelvin >= 6000 ? "COOL_MOTIVATED" : "BALANCED_CINEMATIC"],
    black_level: firstText(explicit.black_level, "RICH_NOT_CRUSHED"),
    grain_texture: firstText(explicit.grain_texture, "SUBTLE_ORGANIC_UNIFIED"),
    scene_evolution: firstText(explicit.scene_evolution, "FOLLOW_STORY_EMOTIONAL_ARC"),
    delivery_linkage: firstText(explicit.delivery_linkage, "MAP_INTENT_TO_GOVERNED_SDR_HDR_FINISHING"),
  };
}
function opticalPracticalFx(shot = {}) {
  const explicit = object(source(shot).optical_practical_fx || shot.optical_practical_fx);
  const vfx = object(shot.vfx);
  const corpus = `${JSON.stringify(vfx)} ${JSON.stringify(explicit)}`.toLowerCase();
  const effects = [];
  const table = [
    ["HALATION", /halation/], ["BLOOM", /bloom/], ["LENS_FLARE", /flare/], ["DIFFUSION", /diffusion/],
    ["RAIN", /rain/], ["MIST", /mist/], ["SMOKE", /smoke/], ["HAZE", /haze/], ["DUST", /dust/],
    ["SPARKS", /spark/], ["REFLECTIONS", /reflection/], ["WATER", /water/], ["LIGHT_RAYS", /light rays|god rays|volumetric/],
    ["PRACTICAL_FLICKER", /flicker/], ["SHUTTER_EFFECT", /shutter/], ["RACK_FOCUS", /rack focus/], ["SPEED_RAMP", /speed ramp/],
  ];
  for (const [name, pattern] of table) if (pattern.test(corpus)) effects.push(name);
  return {
    effects,
    story_motivation: firstText(explicit.story_motivation, effects.length ? shot.purpose : "NONE_REQUIRED"),
    generative_bake_in_allowed: explicit.generative_bake_in_allowed === true,
    finishing_owned_when_precision_matters: true,
    must_match_plate_and_lens_physics: true,
    must_not_be_added_for_spectacle_only: true,
  };
}
function focusChoreography(shot = {}, input = {}) {
  const explicit = object(camera(shot).focus_choreography || source(shot).focus_choreography);
  return {
    start_target: firstText(explicit.start_target, camera(shot).focus_target, acquisition(input).camera?.subject_lock),
    end_target: firstText(explicit.end_target, camera(shot).focus_target, acquisition(input).camera?.subject_lock),
    rack_focus: explicit.rack_focus === true || /rack focus/.test(lower(camera(shot).movement)),
    pull_speed: firstText(explicit.pull_speed, "MOTIVATED_NOT_MECHANICAL"),
    depth_transition: firstText(explicit.depth_transition, acquisition(input).camera?.depth_of_field, "CONTROLLED_NARRATIVE"),
    motivation: firstText(explicit.motivation, "DIRECT_ATTENTION_TO_STORY_BEAT"),
  };
}
function spatialContinuity(shot = {}) {
  const explicit = object(source(shot).spatial_continuity || shot.continuity?.spatial || shot.spatial_continuity);
  return {
    screen_direction: firstText(explicit.screen_direction, "PRESERVE_ACROSS_CUTS_UNLESS_INTENTIONALLY_REVERSED"),
    eyeline: firstText(explicit.eyeline, "MATCH_ADJACENT_SHOTS"),
    axis_180: firstText(explicit.axis_180, "MAINTAIN_OR_CROSS_WITH_VISIBLE_MOTIVATION"),
    subject_position: firstText(explicit.subject_position, "PRESERVE_BLOCKING_RELATIONSHIPS"),
    entrance_exit_direction: firstText(explicit.entrance_exit_direction, "MATCH_CONTIGUOUS_ACTION"),
    camera_height_continuity: firstText(explicit.camera_height_continuity, "MOTIVATED_VARIATION_ONLY"),
    lens_continuity: firstText(explicit.lens_continuity, "PRESERVE_SPATIAL_LOGIC_ACROSS_COVERAGE"),
  };
}
function transitionChoreography(shot = {}) {
  const explicit = object(source(shot).transition_choreography || shot.transition_choreography);
  return {
    transition_in: firstText(explicit.transition_in, shot.transition_in, "CUT"),
    transition_out: firstText(explicit.transition_out, shot.transition_out, "CUT"),
    match_strategy: firstText(explicit.match_strategy, "ACTION_SHAPE_LIGHT_OR_MEANING_WHEN_MOTIVATED"),
    audio_prelap: firstText(explicit.audio_prelap, "OPTIONAL_J_CUT"),
    audio_postlap: firstText(explicit.audio_postlap, "OPTIONAL_L_CUT"),
    transition_must_be_story_motivated: true,
    novelty_transition_forbidden_without_motivation: true,
  };
}
function validatePhysicalCraft(value = {}) {
  const issues = [];
  const required = [
    ["lens_character.projection", value.lens_character?.projection],
    ["movement_choreography.path", value.movement_choreography?.path],
    ["movement_choreography.start_anchor", value.movement_choreography?.start_anchor],
    ["movement_choreography.end_anchor", value.movement_choreography?.end_anchor],
    ["editorial_micro_rhythm.cut_motivation", value.editorial_micro_rhythm?.cut_motivation],
    ["sound_perspective.listener_pov", value.sound_perspective?.listener_pov],
    ["look_development.exposure_philosophy", value.look_development?.exposure_philosophy],
    ["focus_choreography.start_target", value.focus_choreography?.start_target],
    ["spatial_continuity.axis_180", value.spatial_continuity?.axis_180],
  ];
  for (const [field, candidate] of required) if (!text(candidate)) issues.push({ code: "PROFESSIONAL_FILMCRAFT_FIELD_MISSING", field });
  const squeeze = finite(value.lens_character?.squeeze_ratio);
  if (squeeze === null || squeeze < 1 || squeeze > 2.5) issues.push({ code: "PROFESSIONAL_FILMCRAFT_LENS_SQUEEZE_INVALID", field: "lens_character.squeeze_ratio" });
  if (value.optical_practical_fx?.effects?.length && !text(value.optical_practical_fx?.story_motivation)) {
    issues.push({ code: "PROFESSIONAL_FILMCRAFT_EFFECT_MOTIVATION_REQUIRED", field: "optical_practical_fx.story_motivation" });
  }
  return issues;
}
export function compileCreativeProfessionalFilmCraft({ shot = {}, task = {}, cinematography_acquisition = {} } = {}) {
  if (graphicOnly(shot, task)) {
    return {
      contract: CONTRACT, version: 1, status: "NOT_APPLICABLE", applicability: "GRAPHIC_ONLY",
      blocking_issues: [], evidence: { professional_physical_filmcraft_required: false },
    };
  }
  const input = { cinematography_acquisition };
  const value = {
    contract: CONTRACT,
    version: 1,
    status: "READY",
    applicability: "PHYSICAL_VIDEO",
    lens_character: lensCharacter(shot, input),
    movement_choreography: movementChoreography(shot, input),
    performance_control: performanceControl(shot),
    editorial_micro_rhythm: editorialMicroRhythm(shot),
    sound_perspective: soundPerspective(shot),
    look_development: lookDevelopment(shot, input),
    optical_practical_fx: opticalPracticalFx(shot),
    focus_choreography: focusChoreography(shot, input),
    spatial_continuity: spatialContinuity(shot),
    transition_choreography: transitionChoreography(shot),
  };
  const blocking = validatePhysicalCraft(value);
  const cameraMotionReferenceRequired = value.movement_choreography.motion_reference_required === true;
  const performanceReferenceRequired = value.performance_control.performance_reference_required === true;
  return {
    ...value,
    status: blocking.length ? "BLOCKED" : "READY",
    blocking_issues: blocking,
    craft_qc: {
      passed: blocking.length === 0,
      no_spectacle_only_fx: true,
      spatial_continuity_governed: true,
      focus_choreography_governed: true,
      editorial_micro_rhythm_governed: true,
      sound_perspective_governed: true,
      look_development_governed: true,
    },
    evidence: {
      professional_physical_filmcraft_required: true,
      camera_motion_reference_required: cameraMotionReferenceRequired,
      performance_reference_required: performanceReferenceRequired,
      lens_projection: value.lens_character.projection,
      compound_camera_move: value.movement_choreography.compound_move,
      effects: value.optical_practical_fx.effects,
      effects_story_motivated: value.optical_practical_fx.effects.length === 0 || Boolean(text(value.optical_practical_fx.story_motivation)),
      focus_choreography_governed: true,
      spatial_continuity_governed: true,
      transition_choreography_governed: true,
    },
  };
}
export function assertCreativeProfessionalFilmCraft(value = {}) {
  if (value.contract !== CONTRACT) throw new Error("PROFESSIONAL_FILMCRAFT_CONTRACT_REQUIRED");
  if (value.status === "BLOCKED") {
    const codes = list(value.blocking_issues).map((issue) => text(issue?.code)).filter(Boolean);
    throw new Error(`PROFESSIONAL_FILMCRAFT_BLOCKED:${codes.join(",")}`);
  }
  return value;
}
export const CreativeProfessionalFilmCraftRuntime = Object.freeze({
  contract: CONTRACT,
  compile: compileCreativeProfessionalFilmCraft,
  assert: assertCreativeProfessionalFilmCraft,
});
