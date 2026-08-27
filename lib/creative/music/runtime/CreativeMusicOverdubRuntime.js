const CONTRACT = "AVANTIQO_MUSIC_OVERDUB_RECORDING_V1";

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

export function buildMusicOverdubPlan(input = {}) {
  const trackId = text(input.track_id);
  if (!trackId) throw new Error("CREATIVE_MUSIC_OVERDUB_TRACK_REQUIRED");
  if (input.track_armed !== true) throw new Error("CREATIVE_MUSIC_OVERDUB_TRACK_NOT_ARMED");

  const playhead = Math.max(0, finite(input.playhead_seconds, 0));
  const countInBars = Math.round(clamp(input.count_in_bars, 0, 8, 1));
  const bpm = clamp(input.bpm, 30, 300, 96);
  const beatsPerBar = Math.round(clamp(input.beats_per_bar, 1, 12, 4));
  const countInSeconds = countInBars * beatsPerBar * (60 / bpm);

  const punchEnabled = input.punch_enabled === true;
  const punchStart = punchEnabled ? Math.max(0, finite(input.punch_start_seconds, playhead)) : playhead;
  const punchEnd = punchEnabled ? Math.max(punchStart, finite(input.punch_end_seconds, punchStart)) : null;
  if (punchEnabled && punchEnd <= punchStart) throw new Error("CREATIVE_MUSIC_OVERDUB_PUNCH_RANGE_INVALID");

  const loopEnabled = input.loop_enabled === true;
  const loopStart = loopEnabled ? Math.max(0, finite(input.loop_start_seconds, punchStart)) : null;
  const loopEnd = loopEnabled ? Math.max(loopStart, finite(input.loop_end_seconds, punchEnd ?? loopStart)) : null;
  if (loopEnabled && loopEnd <= loopStart) throw new Error("CREATIVE_MUSIC_OVERDUB_LOOP_RANGE_INVALID");
  if (punchEnabled && loopEnabled && (punchStart < loopStart || punchEnd > loopEnd)) {
    throw new Error("CREATIVE_MUSIC_OVERDUB_PUNCH_OUTSIDE_LOOP");
  }

  return {
    contract: CONTRACT,
    track_id: trackId,
    mode: loopEnabled ? "LOOP_TAKES" : punchEnabled ? "PUNCH_IN_OUT" : "OVERDUB",
    transport: {
      playhead_seconds: playhead,
      pre_roll_seconds: countInSeconds,
      record_start_seconds: punchEnabled ? punchStart : playhead,
      record_end_seconds: punchEnabled ? punchEnd : null,
      punch_enabled: punchEnabled,
      punch_start_seconds: punchStart,
      punch_end_seconds: punchEnd,
      loop_enabled: loopEnabled,
      loop_start_seconds: loopStart,
      loop_end_seconds: loopEnd,
    },
    metronome: {
      enabled: input.metronome_enabled !== false,
      bpm,
      beats_per_bar: beatsPerBar,
      count_in_bars: countInBars,
      accent_downbeat: true,
    },
    capture: {
      raw_pcm_required: true,
      browser_processing_disabled: true,
      destructive_processing_during_capture: false,
      preserve_each_pass_as_immutable_take: true,
      create_new_take_per_loop_pass: loopEnabled,
      replace_previous_take_allowed: false,
    },
    monitoring: {
      backing_project_playback: true,
      armed_track_input_monitoring: text(input.monitor || "auto"),
      avoid_double_monitoring: true,
      latency_compensation_required: true,
    },
    result_policy: {
      append_to_track_take_lane: true,
      create_non_destructive_clip: true,
      auto_select_first_take_for_comp: true,
      comping_available_after_two_takes: true,
      original_sources_immutable: true,
    },
  };
}

export function validateMusicOverdubResult(input = {}) {
  const passes = Array.isArray(input.passes) ? input.passes : [];
  if (!passes.length) throw new Error("CREATIVE_MUSIC_OVERDUB_TAKES_REQUIRED");
  const takeIds = new Set();
  const assetIds = new Set();
  for (const pass of passes) {
    const takeId = text(pass.take_id);
    const assetId = text(pass.source_asset_id);
    if (!takeId || !assetId) throw new Error("CREATIVE_MUSIC_OVERDUB_TAKE_IDENTITY_REQUIRED");
    if (takeIds.has(takeId) || assetIds.has(assetId)) throw new Error("CREATIVE_MUSIC_OVERDUB_TAKE_REUSE_FORBIDDEN");
    if (pass.immutable_source !== true || pass.destructive_edit === true) throw new Error("CREATIVE_MUSIC_OVERDUB_IMMUTABLE_SOURCE_REQUIRED");
    takeIds.add(takeId);
    assetIds.add(assetId);
  }
  return {
    success: true,
    contract: "AVANTIQO_MUSIC_OVERDUB_RESULT_V1",
    pass_count: passes.length,
    immutable_take_count: takeIds.size,
    original_sources_preserved: true,
    destructive_edit: false,
  };
}

export const CreativeMusicOverdubRuntime = {
  contract: CONTRACT,
  plan: buildMusicOverdubPlan,
  validateResult: validateMusicOverdubResult,
};
