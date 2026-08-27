const CONTRACT = "AVANTIQO_MUSIC_RECORDING_STUDIO_V1";

const RAW_CAPTURE_CONSTRAINTS = Object.freeze({
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
});

const RECORDING_QC = Object.freeze({
  clip_peak_dbfs: -0.1,
  preferred_max_peak_dbfs: -6,
  preferred_min_peak_dbfs: -24,
  preferred_rms_min_dbfs: -36,
  preferred_rms_max_dbfs: -12,
  headroom_warning_db: 3,
});

const ENGINEERING_DOMAINS = Object.freeze([
  "input_gain",
  "headroom",
  "clipping",
  "noise_floor",
  "hum",
  "dc_offset",
  "phase",
  "tonal_balance",
  "resonance",
  "transients",
  "dynamics",
  "sibilance",
  "stereo_image",
  "loudness",
  "true_peak",
]);

function text(value) {
  return String(value ?? "").trim();
}

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function buildMusicRecordingSession(input = {}) {
  const title = text(input.title || "New recording").slice(0, 160);
  const trackRole = text(input.track_role || input.role || "vocal").toLowerCase();
  const allowedRoles = new Set(["vocal", "guitar", "bass", "keys", "drums", "instrument", "room", "other"]);
  if (!allowedRoles.has(trackRole)) {
    const error = new Error(`CREATIVE_MUSIC_RECORDING_TRACK_ROLE_INVALID:${trackRole || "MISSING"}`);
    error.code = "CREATIVE_MUSIC_RECORDING_TRACK_ROLE_INVALID";
    throw error;
  }

  const countInBars = Math.max(0, Math.min(8, Math.round(finite(input.count_in_bars, 1))));
  const bpm = Math.max(30, Math.min(300, Math.round(finite(input.bpm, 96))));
  const sampleRate = Math.max(8000, Math.min(192000, Math.round(finite(input.sample_rate, 48000))));
  const channels = Math.max(1, Math.min(2, Math.round(finite(input.channels, 1))));

  return {
    contract: CONTRACT,
    title,
    track_role: trackRole,
    capture: {
      mode: "RAW_PCM_AUDIO_WORKLET",
      browser_processing_disabled: true,
      constraints: { ...RAW_CAPTURE_CONSTRAINTS },
      requested_sample_rate: sampleRate,
      preserve_device_sample_rate: true,
      requested_channels: channels,
      export_format: "wav",
      export_bit_depth: 24,
      immutable_original_take: true,
      destructive_processing_during_capture: false,
    },
    transport: {
      bpm,
      count_in_bars: countInBars,
      metronome_supported: true,
      punch_in_out_target: true,
      overdub_target: true,
      loop_recording_target: true,
    },
    monitoring: {
      input_metering: true,
      peak_metering: true,
      rms_metering: true,
      clipping_detection: true,
      input_device_selection: true,
      latency_measurement_target: true,
      software_monitoring_default: false,
    },
    qc: { ...RECORDING_QC },
    engineering_domains: [...ENGINEERING_DOMAINS],
    post_capture: {
      secure_upload: true,
      original_take_preserved: true,
      create_new_version_for_processing: true,
      auto_studio_eligible: true,
      backing_track_eligible: true,
      stem_separation_eligible: true,
      vocal_engineering_eligible: trackRole === "vocal",
    },
  };
}

export function evaluateMusicRecordingLevels(input = {}) {
  const peakDbfs = finite(input.peak_dbfs, -Infinity);
  const rmsDbfs = finite(input.rms_dbfs, -Infinity);
  const clipping = input.clipping === true || peakDbfs >= RECORDING_QC.clip_peak_dbfs;
  const peakTooHot = clipping || peakDbfs > RECORDING_QC.preferred_max_peak_dbfs;
  const peakTooLow = Number.isFinite(peakDbfs) && peakDbfs < RECORDING_QC.preferred_min_peak_dbfs;
  const rmsTooLow = Number.isFinite(rmsDbfs) && rmsDbfs < RECORDING_QC.preferred_rms_min_dbfs;
  const rmsTooHot = Number.isFinite(rmsDbfs) && rmsDbfs > RECORDING_QC.preferred_rms_max_dbfs;
  return {
    contract: "AVANTIQO_MUSIC_RECORDING_LEVEL_QC_V1",
    peak_dbfs: peakDbfs,
    rms_dbfs: rmsDbfs,
    clipping,
    status: clipping ? "CLIPPING" : peakTooHot || rmsTooHot ? "TOO_HOT" : peakTooLow || rmsTooLow ? "TOO_LOW" : "HEALTHY",
    recommended_action: clipping || peakTooHot || rmsTooHot
      ? "REDUCE_INPUT_GAIN"
      : peakTooLow || rmsTooLow
        ? "INCREASE_INPUT_GAIN_OR_MOVE_CLOSER"
        : "KEEP_CURRENT_GAIN",
  };
}

export const CreativeMusicRecordingRuntime = {
  contract: CONTRACT,
  rawCaptureConstraints: RAW_CAPTURE_CONSTRAINTS,
  qc: RECORDING_QC,
  engineeringDomains: ENGINEERING_DOMAINS,
  session: buildMusicRecordingSession,
  evaluateLevels: evaluateMusicRecordingLevels,
};
