import crypto from "node:crypto";

export const AVANTIQO_MULTICAMERA_STEREO_VIRTUAL_PRODUCTION_CONTRACT =
  "AVANTIQO_MULTICAMERA_STEREO_VIRTUAL_PRODUCTION_V1";

function text(value) { return String(value ?? "").trim(); }
function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
function vec(value, fallback = [0,0,0]) {
  return Array.isArray(value) && value.length >= 3 ? value.slice(0,3).map((item, i) => finite(item, fallback[i])) : fallback;
}
function hash(value) { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
export function authorMultiCameraStereoVirtualProduction(input = {}) {
  const cameras = list(input.cameras).map((camera, index) => ({
    id: text(camera.id) || "camera-" + (index + 1),
    name: text(camera.name) || "Camera " + (index + 1),
    location: vec(camera.location),
    look_at: vec(camera.look_at, [0,0,1]),
    lens_mm: finite(camera.lens_mm, 50),
    sensor_width_mm: finite(camera.sensor_width_mm, 36),
    focus_distance_m: finite(camera.focus_distance_m, 6),
    t_stop: finite(camera.t_stop, 4),
    timecode_offset_frames: Math.round(finite(camera.timecode_offset_frames, 0)),
    tracking_stream_id: text(camera.tracking_stream_id) || null,
    lens_profile_hash: text(camera.lens_profile_hash) || null,
  }));
  const blockers = [];
  if (cameras.length < 2) blockers.push("MULTICAMERA_AT_LEAST_TWO_CAMERAS_REQUIRED");
  if (new Set(cameras.map((camera) => camera.id)).size !== cameras.length) {
    blockers.push("MULTICAMERA_CAMERA_IDS_MUST_BE_UNIQUE");
  }
  const sync = input.sync || {};
  if (!text(sync.timecode_format)) blockers.push("MULTICAMERA_TIMECODE_FORMAT_REQUIRED");
  if (sync.genlock_verified !== true) blockers.push("MULTICAMERA_GENLOCK_VERIFICATION_REQUIRED");
  const stereoInput = input.stereo || {};
  const stereoEnabled = stereoInput.enabled === true;
  const stereo = {
    enabled: stereoEnabled,
    camera_id: text(stereoInput.camera_id) || cameras[0]?.id || null,
    interocular_distance_m: finite(stereoInput.interocular_distance_m, 0.065),
    convergence_distance_m: finite(stereoInput.convergence_distance_m, 10),
    convergence_mode: text(stereoInput.convergence_mode || "OFFAXIS").toUpperCase(),
  };
  if (stereoEnabled) {
    if (!cameras.some((camera) => camera.id === stereo.camera_id)) blockers.push("STEREO_BASE_CAMERA_REQUIRED");
    if (!(stereo.interocular_distance_m > 0 && stereo.interocular_distance_m <= 0.5)) blockers.push("STEREO_INTEROCULAR_DISTANCE_INVALID");
    if (!(stereo.convergence_distance_m > 0)) blockers.push("STEREO_CONVERGENCE_DISTANCE_INVALID");
    if (!["OFFAXIS", "PARALLEL", "TOE_IN"].includes(stereo.convergence_mode)) blockers.push("STEREO_CONVERGENCE_MODE_UNSUPPORTED");
  }
  const vpInput = input.virtual_production || {};
  const vpEnabled = vpInput.enabled === true;
  const trackingSamples = list(vpInput.tracking_samples).map((sample, index) => ({
    frame: Math.round(finite(sample.frame, index + 1)),
    timecode: text(sample.timecode) || null,
    camera_id: text(sample.camera_id || vpInput.frustum_camera_id) || null,
    transform_matrix: Array.isArray(sample.transform_matrix) ? sample.transform_matrix.slice(0,16).map(Number) : [],
  }));
  const displayGeometry = {
    width_m: finite(vpInput.display_geometry?.width_m, null),
    height_m: finite(vpInput.display_geometry?.height_m, null),
    resolution_x: Math.round(finite(vpInput.display_geometry?.resolution_x, null)),
    resolution_y: Math.round(finite(vpInput.display_geometry?.resolution_y, null)),
  };
  const virtualProduction = {
    enabled: vpEnabled,
    led_wall_id: text(vpInput.led_wall_id) || null,
    frustum_camera_id: text(vpInput.frustum_camera_id) || null,
    camera_tracking_latency_ms: finite(vpInput.camera_tracking_latency_ms, null),
    tracking_calibration_hash: text(vpInput.tracking_calibration_hash) || null,
    display_calibration_hash: text(vpInput.display_calibration_hash) || null,
    color_pipeline_hash: text(vpInput.color_pipeline_hash) || null,
    wall_refresh_hz: finite(vpInput.wall_refresh_hz, null),
    display_geometry: displayGeometry,
    tracking_samples: trackingSamples,
  };
  if (vpEnabled) {
    if (!virtualProduction.led_wall_id) blockers.push("VIRTUAL_PRODUCTION_LED_WALL_REQUIRED");
    if (!cameras.some((camera) => camera.id === virtualProduction.frustum_camera_id)) blockers.push("VIRTUAL_PRODUCTION_FRUSTUM_CAMERA_REQUIRED");
    if (!(virtualProduction.camera_tracking_latency_ms >= 0 && virtualProduction.camera_tracking_latency_ms <= 50)) blockers.push("VIRTUAL_PRODUCTION_TRACKING_LATENCY_TOO_HIGH");
    if (!virtualProduction.tracking_calibration_hash) blockers.push("VIRTUAL_PRODUCTION_TRACKING_CALIBRATION_REQUIRED");
    if (!virtualProduction.display_calibration_hash) blockers.push("VIRTUAL_PRODUCTION_DISPLAY_CALIBRATION_REQUIRED");
    if (!virtualProduction.color_pipeline_hash) blockers.push("VIRTUAL_PRODUCTION_COLOR_PIPELINE_REQUIRED");
    if (!(virtualProduction.wall_refresh_hz >= 24)) blockers.push("VIRTUAL_PRODUCTION_WALL_REFRESH_REQUIRED");
    if (!(displayGeometry.width_m > 0 && displayGeometry.height_m > 0 &&
          displayGeometry.resolution_x >= 1920 && displayGeometry.resolution_y >= 1080)) {
      blockers.push("VIRTUAL_PRODUCTION_DISPLAY_GEOMETRY_REQUIRED");
    }
    if (!trackingSamples.length) blockers.push("VIRTUAL_PRODUCTION_TRACKING_SAMPLES_REQUIRED");
    if (trackingSamples.some((sample) =>
      sample.camera_id !== virtualProduction.frustum_camera_id ||
      sample.transform_matrix.length !== 16 ||
      sample.transform_matrix.some((value) => !Number.isFinite(value)))) {
      blockers.push("VIRTUAL_PRODUCTION_TRACKING_SAMPLE_INVALID");
    }
  }
  const body = {
    contract: AVANTIQO_MULTICAMERA_STEREO_VIRTUAL_PRODUCTION_CONTRACT,
    cameras,
    sync: {
      timecode_format: text(sync.timecode_format) || null,
      start_timecode: text(sync.start_timecode) || null,
      genlock_verified: sync.genlock_verified === true,
      sync_reference_id: text(sync.sync_reference_id) || null,
    },
    stereo,
    virtual_production: virtualProduction,
    render_plan: cameras.map((camera) => ({
      camera_id: camera.id,
      stereo_views: stereoEnabled && stereo.camera_id === camera.id ? ["LEFT", "RIGHT"] : ["MONO"],
      frustum_driver: vpEnabled && virtualProduction.frustum_camera_id === camera.id,
      tracking_sample_count: vpEnabled && virtualProduction.frustum_camera_id === camera.id
        ? trackingSamples.filter((sample) => sample.camera_id === camera.id).length
        : 0,
    })),
    policy: {
      camera_outputs_must_share_timecode_and_genlock: true,
      stereo_pair_uses_native_multiview: true,
      virtual_production_requires_tracking_and_display_calibration: true,
      frustum_camera_must_be_explicit: true,
    },
  };
  return {
    ...body,
    status: blockers.length ? "BLOCKED" : "READY",
    blockers,
    workflow_hash: hash(body),
  };
}

export const CreativeMultiCameraStereoVirtualProductionRuntime = Object.freeze({
  contract: AVANTIQO_MULTICAMERA_STEREO_VIRTUAL_PRODUCTION_CONTRACT,
  author: authorMultiCameraStereoVirtualProduction,
});
