const CONTRACT = "AVANTIQO_MUSIC_PREMASTER_SIGNAL_REVIEW_V1";
function finite(value, fallback = null) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }
export function buildProfessionalPremasterSignalReview(translation = {}, metadata = {}) {
  const m = translation.metrics || {};
  const headroom = finite(metadata.headroom_db, Number.isFinite(Number(metadata.peak_dbfs)) ? -Number(metadata.peak_dbfs) : null);
  const checks = {
    headroom_preserved: Number.isFinite(headroom) && headroom >= 3,
    dynamic_life: Number.isFinite(m.crest_factor_db) && m.crest_factor_db >= 6 && m.crest_factor_db <= 24,
    stereo_stability: Number.isFinite(m.stereo_correlation) && m.stereo_correlation >= -0.15,
    mono_compatibility: Number.isFinite(m.mono_fold_down_loss_db) && m.mono_fold_down_loss_db >= -4,
    low_end_balance: Number.isFinite(m.low_end_vs_body_db) && m.low_end_vs_body_db >= -18 && m.low_end_vs_body_db <= 5,
    upper_mid_control: Number.isFinite(m.harshness_vs_body_db) && m.harshness_vs_body_db <= 8,
  };
  const repairs = [];
  if (!checks.headroom_preserved) repairs.push({ code: "RESTORE_PREMASTER_HEADROOM", target: "MASTER_GAIN", direction: "DOWN", max_change_db: 3, reason: `Pre-master headroom ${headroom ?? "unknown"} dB; preserve at least 3 dB before mastering.` });
  if (!checks.dynamic_life) repairs.push({ code: "RESTORE_DYNAMIC_LIFE", target: "TRACK_COMPRESSION", direction: m.crest_factor_db < 6 ? "LESS_COMPRESSION" : "REVIEW_TRANSIENTS", reason: `Combined crest factor ${m.crest_factor_db ?? "unknown"} dB is outside the pre-master window.` });
  if (!checks.low_end_balance) repairs.push({ code: "REBALANCE_LOW_END", target: "BASS_DRUM_RELATIONSHIP", direction: m.low_end_vs_body_db > 5 ? "REDUCE_LOW_END" : "INCREASE_LOW_END", max_change_db: 1.5, reason: `Combined low/body balance ${m.low_end_vs_body_db ?? "unknown"} dB is outside the pre-master window.` });
  if (!checks.upper_mid_control) repairs.push({ code: "REDUCE_UPPER_MID_HARSHNESS", target: "PRESENCE_BANDS", direction: "DOWN", max_change_db: 1.5, reason: `Combined upper-mid/body balance ${m.harshness_vs_body_db ?? "unknown"} dB is excessive.` });
  if (!checks.stereo_stability || !checks.mono_compatibility) repairs.push({ code: "REPAIR_STEREO_COMPATIBILITY", target: "PAN_WIDTH", direction: "NARROW", max_change: 0.15, reason: `Correlation ${m.stereo_correlation ?? "unknown"}; mono fold-down ${m.mono_fold_down_loss_db ?? "unknown"} dB.` });
  return Object.freeze({ contract: CONTRACT, measured: true, checks, failures: Object.entries(checks).filter(([, passed]) => passed !== true).map(([name]) => name), repair_targets: repairs, metrics: m, headroom_db: headroom, artistic_listening_review_required: true, automatic_mastering_authorized: false });
}
export const CreativeMusicPremasterSignalReviewRuntime = Object.freeze({ contract: CONTRACT, review: buildProfessionalPremasterSignalReview });
