const CONTRACT = "AVANTIQO_MUSIC_MULTITRACK_PROJECT_V1";

const TRACK_TYPES = Object.freeze([
  "audio",
  "vocal",
  "guitar",
  "bass",
  "keys",
  "drums",
  "instrument",
  "backing",
  "stem",
  "bus",
  "master",
]);

const CLIP_EDIT_MODES = Object.freeze([
  "trim",
  "split",
  "move",
  "duplicate",
  "loop",
  "fade",
  "crossfade",
  "gain",
  "mute",
  "reverse",
]);

const CHANNEL_STRIP_CONTRACT = "AVANTIQO_MUSIC_ENGINEER_CHANNEL_STRIP_V1";

function text(value) {
  return String(value ?? "").trim();
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max, fallback = 0) {
  return Math.max(min, Math.min(max, finite(value, fallback)));
}

function id(value, prefix) {
  return text(value) || `${prefix}-${crypto.randomUUID()}`;
}

export function normalizeMusicChannelStrip(input = {}) {
  const compressor = input.compressor || {};
  return {
    contract: CHANNEL_STRIP_CONTRACT,
    input_trim_db: clamp(input.input_trim_db, -24, 24, 0),
    polarity_invert: input.polarity_invert === true,
    high_pass_hz: clamp(input.high_pass_hz, 20, 400, 20),
    low_shelf_db: clamp(input.low_shelf_db, -12, 12, 0),
    presence_db: clamp(input.presence_db, -12, 12, 0),
    high_shelf_db: clamp(input.high_shelf_db, -12, 12, 0),
    compressor: {
      enabled: compressor.enabled === true,
      threshold_db: clamp(compressor.threshold_db, -60, 0, -18),
      ratio: clamp(compressor.ratio, 1, 20, 3),
      attack_ms: clamp(compressor.attack_ms, 0.1, 200, 15),
      release_ms: clamp(compressor.release_ms, 10, 2000, 150),
      knee_db: clamp(compressor.knee_db, 0, 40, 6),
      makeup_db: clamp(compressor.makeup_db, -12, 18, 0),
    },
    engineering_order: [
      "input_trim",
      "polarity",
      "high_pass",
      "low_shelf",
      "presence",
      "high_shelf",
      "compressor",
      "fader",
      "pan",
      "bus",
    ],
  };
}

export function createMusicMultitrackProject(input = {}) {
  const bpm = Math.round(clamp(input.bpm, 30, 300, 96));
  const sampleRate = Math.round(clamp(input.sample_rate, 8000, 192000, 48000));
  const timeSignature = text(input.time_signature || input.timesignature || "4/4");
  if (!["2/4", "3/4", "4/4", "6/8"].includes(timeSignature)) {
    throw new Error("CREATIVE_MUSIC_MULTITRACK_TIME_SIGNATURE_INVALID");
  }

  return {
    contract: CONTRACT,
    id: id(input.id, "music-project"),
    title: text(input.title || "Untitled Music Project").slice(0, 160),
    bpm,
    time_signature: timeSignature,
    sample_rate: sampleRate,
    bit_depth: 24,
    revision: Math.max(0, Math.round(finite(input.revision, 0))),
    non_destructive_editing: true,
    preserve_original_sources: true,
    timeline: {
      snap: text(input.snap || "beat"),
      start_seconds: 0,
      loop_enabled: false,
      loop_start_seconds: 0,
      loop_end_seconds: 0,
      playhead_seconds: 0,
    },
    tracks: [],
    buses: [
      {
        id: "bus-master",
        type: "master",
        name: "Master",
        gain_db: 0,
        pan: 0,
        mute: false,
        solo: false,
        true_peak_ceiling_dbtp: -1,
      },
    ],
    automation_lanes: [],
    versions: [],
    engineering: {
      headroom_target_db: 6,
      master_true_peak_ceiling_dbtp: -1,
      pre_master_loudness_target_lufs: null,
      clip_gain_before_track_processing: true,
      input_trim_before_track_processing: true,
      track_gain_before_bus_processing: true,
      master_limiter_only_at_release_stage: true,
      browser_preview_is_not_release_master: true,
    },
    capabilities: {
      recording: true,
      overdub: true,
      take_lanes: true,
      comping: true,
      punch_in_out: true,
      loop_recording: true,
      clip_editing: [...CLIP_EDIT_MODES],
      mute_solo_arm: true,
      gain_pan: true,
      engineer_channel_strip: true,
      buses_sends: true,
      automation: true,
      waveform_rendering: true,
      stem_import: true,
      backing_track_import: true,
      ai_track_processing: true,
      ai_project_processing: true,
    },
  };
}

export function createMusicTrack(input = {}) {
  const type = text(input.type || "audio").toLowerCase();
  if (!TRACK_TYPES.includes(type)) throw new Error(`CREATIVE_MUSIC_TRACK_TYPE_INVALID:${type}`);
  return {
    id: id(input.id, "track"),
    type,
    name: text(input.name || "Audio Track").slice(0, 120),
    armed: input.armed === true,
    input_device_id: text(input.input_device_id) || null,
    input_channel: Math.max(1, Math.round(finite(input.input_channel, 1))),
    monitor: text(input.monitor || "off"),
    mute: input.mute === true,
    solo: input.solo === true,
    gain_db: clamp(input.gain_db, -60, 12, 0),
    pan: clamp(input.pan, -1, 1, 0),
    output_bus_id: text(input.output_bus_id || "bus-master"),
    color_token: text(input.color_token) || null,
    channel_strip: normalizeMusicChannelStrip(input.channel_strip || input.channelStrip || {}),
    clips: [],
    takes: [],
    comp: null,
    inserts: [],
    sends: [],
    automation_lane_ids: [],
    destructive_processing_allowed: false,
  };
}

export function createMusicClip(input = {}) {
  const sourceAssetId = text(input.source_asset_id);
  if (!sourceAssetId) throw new Error("CREATIVE_MUSIC_CLIP_SOURCE_ASSET_REQUIRED");
  const duration = Math.max(0, finite(input.duration_seconds, 0));
  if (duration <= 0) throw new Error("CREATIVE_MUSIC_CLIP_DURATION_REQUIRED");
  const sourceOffset = Math.max(0, finite(input.source_offset_seconds, 0));
  const start = Math.max(0, finite(input.start_seconds, 0));
  const fadeIn = clamp(input.fade_in_seconds, 0, duration / 2, 0);
  const fadeOut = clamp(input.fade_out_seconds, 0, duration / 2, 0);
  return {
    id: id(input.id, "clip"),
    source_asset_id: sourceAssetId,
    source_version: Math.max(0, Math.round(finite(input.source_version, 0))),
    start_seconds: start,
    duration_seconds: duration,
    source_offset_seconds: sourceOffset,
    gain_db: clamp(input.gain_db, -60, 24, 0),
    fade_in_seconds: fadeIn,
    fade_out_seconds: fadeOut,
    muted: input.muted === true,
    loop_enabled: input.loop_enabled === true,
    loop_length_seconds: input.loop_enabled === true ? Math.max(0.001, finite(input.loop_length_seconds, duration)) : null,
    reversed: input.reversed === true,
    warp_mode: text(input.warp_mode || "off"),
    preserve_source_asset: true,
    destructive_edit: false,
  };
}

export function createMusicTake(input = {}) {
  const sourceAssetId = text(input.source_asset_id);
  if (!sourceAssetId) throw new Error("CREATIVE_MUSIC_TAKE_SOURCE_ASSET_REQUIRED");
  return {
    id: id(input.id, "take"),
    source_asset_id: sourceAssetId,
    recorded_at: text(input.recorded_at || new Date().toISOString()),
    start_seconds: Math.max(0, finite(input.start_seconds, 0)),
    duration_seconds: Math.max(0, finite(input.duration_seconds, 0)),
    rating: clamp(input.rating, 0, 5, 0),
    selected_for_comp: input.selected_for_comp === true,
    original_take: true,
    immutable_source: true,
  };
}

export function createMusicAutomationLane(input = {}) {
  const parameter = text(input.parameter);
  if (!parameter) throw new Error("CREATIVE_MUSIC_AUTOMATION_PARAMETER_REQUIRED");
  const points = Array.isArray(input.points) ? input.points : [];
  return {
    id: id(input.id, "automation"),
    target_type: text(input.target_type || "track"),
    target_id: text(input.target_id),
    parameter,
    interpolation: text(input.interpolation || "linear"),
    points: points.map((point) => ({
      time_seconds: Math.max(0, finite(point.time_seconds, 0)),
      value: finite(point.value, 0),
    })).sort((a, b) => a.time_seconds - b.time_seconds),
  };
}

export function validateMusicMultitrackProject(project = {}) {
  if (project.contract !== CONTRACT) throw new Error("CREATIVE_MUSIC_MULTITRACK_CONTRACT_INVALID");
  if (project.non_destructive_editing !== true || project.preserve_original_sources !== true) {
    throw new Error("CREATIVE_MUSIC_MULTITRACK_NON_DESTRUCTIVE_REQUIRED");
  }
  if (!Array.isArray(project.tracks) || project.tracks.length > 128) {
    throw new Error("CREATIVE_MUSIC_MULTITRACK_TRACK_LIMIT_INVALID");
  }
  const trackIds = new Set();
  let clipCount = 0;
  for (const track of project.tracks || []) {
    if (!track.id || trackIds.has(track.id)) throw new Error("CREATIVE_MUSIC_MULTITRACK_TRACK_ID_INVALID");
    trackIds.add(track.id);
    if (track.destructive_processing_allowed === true) {
      throw new Error("CREATIVE_MUSIC_MULTITRACK_DESTRUCTIVE_TRACK_PROCESSING_FORBIDDEN");
    }
    if (track.channel_strip?.contract && track.channel_strip.contract !== CHANNEL_STRIP_CONTRACT) {
      throw new Error("CREATIVE_MUSIC_MULTITRACK_CHANNEL_STRIP_INVALID");
    }
    for (const clip of track.clips || []) {
      clipCount += 1;
      if (clipCount > 2048) throw new Error("CREATIVE_MUSIC_MULTITRACK_CLIP_LIMIT_INVALID");
      if (!clip.source_asset_id || clip.destructive_edit === true || clip.preserve_source_asset !== true) {
        throw new Error("CREATIVE_MUSIC_MULTITRACK_CLIP_SOURCE_PRESERVATION_REQUIRED");
      }
    }
  }
  return {
    success: true,
    contract: "AVANTIQO_MUSIC_MULTITRACK_VALIDATION_V1",
    track_count: trackIds.size,
    clip_count: clipCount,
    non_destructive_editing: true,
    original_sources_preserved: true,
    engineer_channel_strip_supported: true,
  };
}

export const CreativeMusicMultitrackRuntime = {
  contract: CONTRACT,
  channelStripContract: CHANNEL_STRIP_CONTRACT,
  trackTypes: TRACK_TYPES,
  clipEditModes: CLIP_EDIT_MODES,
  createProject: createMusicMultitrackProject,
  createTrack: createMusicTrack,
  createClip: createMusicClip,
  createTake: createMusicTake,
  createAutomationLane: createMusicAutomationLane,
  normalizeChannelStrip: normalizeMusicChannelStrip,
  validate: validateMusicMultitrackProject,
};
