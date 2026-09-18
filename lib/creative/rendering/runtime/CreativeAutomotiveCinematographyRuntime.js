import crypto from "node:crypto";

export const AVANTIQO_AUTOMOTIVE_CINEMATOGRAPHY_CONTRACT =
  "AVANTIQO_AUTOMOTIVE_CINEMATOGRAPHY_V1";

const MODES = new Set([
  "STUDIO_HERO", "TRACKING_PURSUIT", "STATIC_ROADSIDE",
  "LOW_RIG", "AERIAL_REVEAL", "DETAIL_MACRO",
]);
const REFLECTION_STRATEGIES = new Set([
  "HDRI_PLUS_LIGHT_CARDS", "STUDIO_STRIPS", "LOCATION_IBL_PLUS_CARDS",
]);

function text(value) { return String(value ?? "").trim(); }
function finite(value, fallback = null, min = -Infinity, max = Infinity) {
  const number = Number(value);
  return Math.max(min, Math.min(max, Number.isFinite(number) ? number : fallback));
}
function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
function vec(value, fallback = [0, 0, 0]) {
  return Array.isArray(value) && value.length >= 3
    ? value.slice(0, 3).map((item, index) => finite(item, fallback[index]))
    : fallback;
}
function hash(value) { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
export function authorAutomotiveCinematography(input = {}) {
  const mode = text(input.mode).toUpperCase();
  const strategy = text(input.reflection_strategy).toUpperCase();
  const blockers = [];
  if (!MODES.has(mode)) blockers.push("AUTOMOTIVE_CAMERA_MODE_REQUIRED");
  if (!REFLECTION_STRATEGIES.has(strategy)) blockers.push("AUTOMOTIVE_REFLECTION_STRATEGY_REQUIRED");
  if (!text(input.environment_asset_node_id)) blockers.push("AUTOMOTIVE_HDR_ENVIRONMENT_REQUIRED");
  const focalLength = finite(input.focal_length_mm, null, 8, 300);
  const sensorWidth = finite(input.sensor_width_mm, null, 1, 100);
  const shutterAngle = finite(input.shutter_angle_degrees, null, 1, 360);
  const focusDistance = finite(input.focus_distance_m, null, 0.05, 10000);
  const tStop = finite(input.t_stop, null, 0.7, 64);
  if (!focalLength) blockers.push("AUTOMOTIVE_FOCAL_LENGTH_REQUIRED");
  if (!sensorWidth) blockers.push("AUTOMOTIVE_SENSOR_WIDTH_REQUIRED");
  if (!shutterAngle) blockers.push("AUTOMOTIVE_SHUTTER_ANGLE_REQUIRED");
  if (!focusDistance) blockers.push("AUTOMOTIVE_FOCUS_DISTANCE_REQUIRED");
  if (!tStop) blockers.push("AUTOMOTIVE_T_STOP_REQUIRED");
  const cards = list(input.reflection_cards);
  if (cards.length < 2) blockers.push("AUTOMOTIVE_REFLECTION_CARDS_REQUIRED");
  if (input.ground_contact_shadow !== true) blockers.push("AUTOMOTIVE_GROUND_CONTACT_SHADOW_REQUIRED");
  if (input.body_line_readability_validated !== true) blockers.push("AUTOMOTIVE_BODY_LINE_READABILITY_REQUIRED");
  if (input.highlight_sweep_validated !== true) blockers.push("AUTOMOTIVE_HIGHLIGHT_SWEEP_REQUIRED");

  const camera = {
    location: vec(input.camera?.location, [0, -7, 1.4]),
    look_at: vec(input.camera?.look_at, [0, 0, 0.7]),
    lens: focalLength || 50,
    sensor_width_mm: sensorWidth || 36,
    focus_distance_m: focusDistance || 6,
    t_stop: tStop || 4,
  };
  const lights = cards.map((card, index) => ({
    name: text(card.name) || "Reflection Card " + (index + 1),
    type: "AREA",
    location: vec(card.location, [index % 2 ? 4 : -4, -1, 3]),
    rotation: vec(card.rotation, [0, 0, 0]),
    energy: finite(card.energy, 900, 0, 100000),
    size: finite(card.size, 3, 0.05, 100),
    color: Array.isArray(card.color) ? card.color.slice(0, 3) : [1, 1, 1],
    automotive_reflection_card: true,
  }));

  const rigs = list(input.camera_path).length >= 2 ? [{
    kind: "CAMERA_PATH",
    points: list(input.camera_path),
    frame_start: finite(input.frame_start, 1, 1, 100000),
    frame_end: finite(input.frame_end, 48, 2, 100000),
  }] : [];

  const body = {
    contract: AVANTIQO_AUTOMOTIVE_CINEMATOGRAPHY_CONTRACT,
    mode: mode || null,
    reflection_strategy: strategy || null,
    environment_asset_node_id: text(input.environment_asset_node_id) || null,
    environment_rotation_degrees: finite(input.environment_rotation_degrees, 0, -360, 360),
    camera,
    lights,
    rigs,
    shutter_angle_degrees: shutterAngle,
    t_stop: tStop,
    ground_contact_shadow: input.ground_contact_shadow === true,
    body_line_readability_validated: input.body_line_readability_validated === true,
    highlight_sweep_validated: input.highlight_sweep_validated === true,
  };  return {
    ...body,
    status: blockers.length ? "BLOCKED" : "READY",
    blockers,
    contract_hash: hash(body),
    policy: {
      physical_camera_required: true,
      hdri_or_equivalent_environment_required: true,
      reflection_lighting_must_be_authored: true,
      body_line_readability_is_release_critical: true,
      ground_contact_must_survive_render_and_composite: true,
      wheel_motion_must_use_mechanical_rig_authority: true,
      generic_three_point_lighting_is_not_sufficient_for_automotive_hero_work: true,
    },
  };
}

export const CreativeAutomotiveCinematographyRuntime = Object.freeze({
  contract: AVANTIQO_AUTOMOTIVE_CINEMATOGRAPHY_CONTRACT,
  modes: Object.freeze([...MODES]),
  reflection_strategies: Object.freeze([...REFLECTION_STRATEGIES]),
  author: authorAutomotiveCinematography,
});
