const CONTRACT = "AVANTIQO_MUSIC_SPATIAL_AUDIO_V1";

const LAYOUTS = Object.freeze({
  stereo: Object.freeze({
    id: "stereo",
    label: "Stereo",
    channel_count: 2,
    speaker_order: ["L", "R"],
    ffmpeg_channel_layout: "stereo",
    surround: false,
  }),
  "5.1": Object.freeze({
    id: "5.1",
    label: "5.1 Surround",
    channel_count: 6,
    speaker_order: ["L", "R", "C", "LFE", "Ls", "Rs"],
    ffmpeg_channel_layout: "5.1(side)",
    surround: true,
  }),
  "7.1": Object.freeze({
    id: "7.1",
    label: "7.1 Surround",
    channel_count: 8,
    speaker_order: ["L", "R", "C", "LFE", "Lrs", "Rrs", "Ls", "Rs"],
    ffmpeg_channel_layout: "7.1",
    surround: true,
  }),
});

function text(value) { return String(value ?? "").trim(); }
function finite(value, fallback = 0) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }
function clamp(value, min, max, fallback = 0) { return Math.max(min, Math.min(max, finite(value, fallback))); }

export function normalizeMusicSpatialLayout(value = "stereo") {
  const key = text(value || "stereo").toLowerCase();
  return LAYOUTS[key] || LAYOUTS.stereo;
}

export function normalizeMusicSpatialTrack(input = {}) {
  return {
    contract: "AVANTIQO_MUSIC_SPATIAL_TRACK_V1",
    mode: ["BED", "POINT", "WIDE"].includes(text(input.mode).toUpperCase()) ? text(input.mode).toUpperCase() : "BED",
    azimuth_degrees: clamp(input.azimuth_degrees, -180, 180, 0),
    elevation_degrees: clamp(input.elevation_degrees, -90, 90, 0),
    distance_meters: clamp(input.distance_meters, 0.1, 500, 1),
    distance_model: ["inverse", "linear", "exponential"].includes(text(input.distance_model).toLowerCase()) ? text(input.distance_model).toLowerCase() : "inverse",
    ref_distance_meters: clamp(input.ref_distance_meters, 0.1, 100, 1),
    max_distance_meters: clamp(input.max_distance_meters, 1, 1000, 100),
    rolloff_factor: clamp(input.rolloff_factor, 0, 10, 1),
    width_percent: clamp(input.width_percent, 0, 200, 100),
    divergence_percent: clamp(input.divergence_percent, 0, 100, 50),
    center_send_db: clamp(input.center_send_db, -120, 12, -120),
    lfe_send_db: clamp(input.lfe_send_db, -120, 12, -120),
    surround_send_db: clamp(input.surround_send_db, -120, 12, -120),
    follows_picture_object: text(input.follows_picture_object) || null,
    automation_lane_ids: Array.isArray(input.automation_lane_ids) ? [...new Set(input.automation_lane_ids.map(text).filter(Boolean))] : [],
    destructive_processing_allowed: false,
  };
}

export function createMusicSpatialAudioConfig(input = {}) {
  const layout = normalizeMusicSpatialLayout(input.layout_id || input.layout || "stereo");
  const monitorLayout = normalizeMusicSpatialLayout(input.monitor_layout_id || layout.id);
  const deliveryLayout = normalizeMusicSpatialLayout(input.delivery_layout_id || layout.id);
  return {
    contract: CONTRACT,
    layout_id: layout.id,
    channel_count: layout.channel_count,
    speaker_order: [...layout.speaker_order],
    ffmpeg_channel_layout: layout.ffmpeg_channel_layout,
    monitor_layout_id: monitorLayout.id,
    delivery_layout_id: deliveryLayout.id,
    surround_enabled: layout.surround,
    lfe: {
      enabled: layout.speaker_order.includes("LFE"),
      low_pass_hz: clamp(input.lfe?.low_pass_hz, 40, 200, 120),
      automatic_full_range_routing_forbidden: true,
      explicit_send_required: true,
    },
    downmix: {
      stereo_required_for_qc: layout.surround,
      mono_required_for_qc: true,
      center_to_lr_db: -3,
      surround_to_lr_db: -3,
      lfe_to_stereo_default: false,
      automatic_phase_inversion_forbidden: true,
    },
    monitoring: {
      speaker_calibration_required_for_surround: layout.surround,
      per_speaker_trim_supported: true,
      per_speaker_delay_supported: true,
      bass_management_monitor_only: true,
      monitor_processing_must_not_print_into_master: true,
    },
    dolby: {
      branded_delivery_enabled: false,
      licensed_renderer_present: input.dolby?.licensed_renderer_present === true,
      licensed_encoder_present: input.dolby?.licensed_encoder_present === true,
      atmos_adm_bwf_authoring_enabled: false,
      dolby_mastering_suite_required_for_dolby_atmos_master: true,
      never_label_unlicensed_multichannel_as_dolby: true,
    },
    browser_preview: {
      multichannel_speaker_output_certified: false,
      stereo_fold_down_preview_allowed: true,
      surround_monitor_claim_allowed: false,
    },
  };
}

export function deriveMusicStereoDownmixMatrix(layoutInput = "stereo", options = {}) {
  const layout = normalizeMusicSpatialLayout(layoutInput);
  const includeLfe = options.include_lfe === true;
  const m3 = 10 ** (-3 / 20);
  const lfe = includeLfe ? m3 : 0;
  const zero = Object.fromEntries(layout.speaker_order.map((speaker) => [speaker, 0]));
  const left = { ...zero };
  const right = { ...zero };
  if (left.L !== undefined) left.L = 1;
  if (right.R !== undefined) right.R = 1;
  if (left.C !== undefined) left.C = m3;
  if (right.C !== undefined) right.C = m3;
  for (const speaker of ["Ls", "Lrs"]) if (left[speaker] !== undefined) left[speaker] = m3;
  for (const speaker of ["Rs", "Rrs"]) if (right[speaker] !== undefined) right[speaker] = m3;
  if (left.LFE !== undefined) left.LFE = lfe;
  if (right.LFE !== undefined) right.LFE = lfe;
  return {
    contract: "AVANTIQO_MUSIC_STEREO_DOWNMIX_MATRIX_V1",
    source_layout_id: layout.id,
    target_layout_id: "stereo",
    lfe_included: includeLfe,
    left,
    right,
  };
}

export function validateMusicSpatialAudio(config = {}) {
  const normalized = createMusicSpatialAudioConfig(config);
  if (config.contract && config.contract !== CONTRACT) throw new Error("CREATIVE_MUSIC_SPATIAL_AUDIO_CONTRACT_INVALID");
  if (config.layout_id && normalized.layout_id !== text(config.layout_id).toLowerCase()) throw new Error("CREATIVE_MUSIC_SPATIAL_AUDIO_LAYOUT_INVALID");
  if (config.channel_count != null && Number(config.channel_count) !== normalized.channel_count) throw new Error("CREATIVE_MUSIC_SPATIAL_AUDIO_CHANNEL_COUNT_MISMATCH");
  if (normalized.dolby.branded_delivery_enabled === true && (!normalized.dolby.licensed_renderer_present || !normalized.dolby.licensed_encoder_present)) {
    throw new Error("CREATIVE_MUSIC_DOLBY_LICENSED_TOOLCHAIN_REQUIRED");
  }
  return {
    success: true,
    contract: "AVANTIQO_MUSIC_SPATIAL_AUDIO_VALIDATION_V1",
    layout_id: normalized.layout_id,
    channel_count: normalized.channel_count,
    surround_enabled: normalized.surround_enabled,
    dolby_branded_delivery_enabled: normalized.dolby.branded_delivery_enabled,
  };
}

export const CreativeMusicSpatialAudioRuntime = Object.freeze({
  contract: CONTRACT,
  layouts: LAYOUTS,
  create: createMusicSpatialAudioConfig,
  normalizeLayout: normalizeMusicSpatialLayout,
  normalizeTrack: normalizeMusicSpatialTrack,
  stereoDownmixMatrix: deriveMusicStereoDownmixMatrix,
  validate: validateMusicSpatialAudio,
});
