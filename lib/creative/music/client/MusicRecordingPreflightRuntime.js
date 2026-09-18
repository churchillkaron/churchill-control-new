import { startMusicRawPcmCapture } from "./MusicRawPcmCapture.js";

function finite(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function deriveMusicRecordingPreflight(take = {}) {
  const qc = take.capture_qc || {};
  const blockers = [];
  const reviews = [];
  const recommendations = [];
  const peak = finite(take.peak_dbfs);
  const rms = finite(take.rms_dbfs);
  const floor = finite(qc.background_floor_estimate_dbfs);
  const headroom = finite(qc.headroom_db);

  if (take.browser_processing_verification === "PROCESSING_PRESENT") blockers.push("BROWSER_PROCESSING_PRESENT");
  else if (take.browser_processing_verification !== "VERIFIED_DISABLED") reviews.push("BROWSER_PROCESSING_UNVERIFIED");
  if (take.sample_rate_path_verification === "RESAMPLED") reviews.push("SAMPLE_RATE_RESAMPLED");
  else if (take.sample_rate_path_verification !== "MATCHED") reviews.push("SAMPLE_RATE_PATH_UNVERIFIED");
  if (qc.capture_continuity_verified === false) blockers.push("CAPTURE_DISCONTINUITY");
  if (take.clipping === true || qc.warnings?.includes("CLIPPING")) blockers.push("CLIPPING");
  if (Number.isFinite(headroom) && headroom < 6) reviews.push("LOW_HEADROOM");
  if (Number.isFinite(peak) && peak > -6) reviews.push("INPUT_TOO_HOT");
  if (Number.isFinite(peak) && peak < -30) reviews.push("INPUT_TOO_LOW");
  if (Number.isFinite(rms) && rms < -42) reviews.push("PERFORMANCE_LEVEL_TOO_LOW");
  if (Number.isFinite(floor) && floor > -45) reviews.push("ROOM_TOO_NOISY");
  if (qc.hum_warning === true) reviews.push("MAINS_HUM");
  if (qc.channel_imbalance_db > 6) reviews.push("CHANNEL_IMBALANCE");
  if (qc.stereo_phase_risk === true) reviews.push("STEREO_PHASE_RISK");
  if (qc.mono_collapse_risk === true) reviews.push("MONO_COLLAPSE_RISK");
  if (qc.silent_channel_count > 0) reviews.push("SILENT_CHANNEL");

  if (blockers.includes("CLIPPING") || reviews.includes("INPUT_TOO_HOT") || reviews.includes("LOW_HEADROOM")) recommendations.push("Reduce input/preamp gain and rerun preflight.");
  if (reviews.includes("INPUT_TOO_LOW") || reviews.includes("PERFORMANCE_LEVEL_TOO_LOW")) recommendations.push("Increase clean input gain or move the microphone closer, then rerun preflight.");
  if (reviews.includes("ROOM_TOO_NOISY")) recommendations.push("Reduce room/environment noise or improve microphone placement before recording.");
  if (reviews.includes("MAINS_HUM")) recommendations.push("Check power, grounding, cables and nearby electrical interference.");
  if (reviews.includes("CHANNEL_IMBALANCE")) recommendations.push("Check stereo/dual-mic gain and channel routing.");
  if (reviews.includes("STEREO_PHASE_RISK") || reviews.includes("MONO_COLLAPSE_RISK")) recommendations.push("Check microphone spacing/polarity and mono compatibility before committing the take.");
  if (blockers.includes("BROWSER_PROCESSING_PRESENT")) recommendations.push("Disable browser/OS echo cancellation, noise suppression and automatic gain control for raw capture.");

  const status = blockers.length ? "NOT_READY" : reviews.length ? "REVIEW" : "READY";
  return {
    contract: "AVANTIQO_MUSIC_RECORDING_PREFLIGHT_V1",
    status,
    ready_to_record: blockers.length === 0,
    blockers,
    reviews: [...new Set(reviews)],
    recommendations: [...new Set(recommendations)],
    measurements: {
      peak_dbfs: peak,
      rms_dbfs: rms,
      headroom_db: headroom,
      background_floor_estimate_dbfs: floor,
      background_floor_confidence: qc.background_floor_confidence || null,
      hum_warning: qc.hum_warning === true,
      dominant_hum_hz: finite(qc.dominant_hum_hz),
      channel_imbalance_db: finite(qc.channel_imbalance_db),
      stereo_correlation: finite(qc.stereo_correlation),
      mono_fold_down_loss_db: finite(qc.mono_fold_down_loss_db),
      capture_continuity_verified: qc.capture_continuity_verified === true,
      browser_processing_verification: take.browser_processing_verification || "UNVERIFIED",
      sample_rate_path_verification: take.sample_rate_path_verification || "UNVERIFIED",
    },
    automatic_input_gain_change_allowed: false,
    automatic_capture_repair_allowed: false,
  };
}

export async function runMusicRecordingPreflight({ deviceId = null, onLevel = null, onPhase = null, roomToneMs = 1200, performanceMs = 2800 } = {}) {
  const capture = await startMusicRawPcmCapture({ deviceId, onLevel, monitorMode: "off" });
  let take;
  try {
    onPhase?.("ROOM_TONE");
    await sleep(Math.max(500, roomToneMs));
    onPhase?.("PERFORMANCE_LEVEL");
    await sleep(Math.max(1000, performanceMs));
    onPhase?.("ANALYZING");
    take = await capture.stop();
  } catch (error) {
    try { if (!take) await capture.stop({ allowEmpty: true }); } catch {}
    throw error;
  }
  const verdict = deriveMusicRecordingPreflight(take);
  onPhase?.("COMPLETE");
  return {
    ...verdict,
    diagnostic_duration_seconds: take.duration_seconds,
    sample_rate: take.sample_rate,
    channels: take.channels,
    capture_qc_contract: take.capture_qc?.contract || null,
    no_asset_created: true,
    upload_performed: false,
    provider_job_submitted: false,
    gpu_inference_performed: false,
    diagnostic_pcm_retained: false,
  };
}

export const CreativeMusicRecordingPreflightRuntime = Object.freeze({ derive: deriveMusicRecordingPreflight, run: runMusicRecordingPreflight });
