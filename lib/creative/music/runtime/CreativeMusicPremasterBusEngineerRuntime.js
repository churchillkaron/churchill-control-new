const CONTRACT = "AVANTIQO_MUSIC_PREMASTER_BUS_ENGINEER_V1";

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
function clamp(value, min, max, fallback = 0) {
  const number = finite(value, fallback);
  return Math.max(min, Math.min(max, number));
}
function clone(value) { return structuredClone(value || {}); }

export function buildMusicPremasterBusDecision(signalReview = {}, currentProcessing = {}) {
  const metrics = signalReview.metrics || {};
  const failures = new Set(signalReview.failures || []);
  const next = clone(currentProcessing);
  next.eq = { ...(next.eq || {}) };
  next.compressor = { ...(next.compressor || {}) };
  const changes = [];

  if (failures.has("low_end_balance") && Number.isFinite(finite(metrics.low_end_vs_body_db))) {
    const excessive = finite(metrics.low_end_vs_body_db) > 5;
    const delta = excessive ? -0.5 : 0.35;
    next.eq.low_shelf_db = clamp(finite(next.eq.low_shelf_db, 0) + delta, -1.5, 1.5);
    next.eq.low_shelf_hz = clamp(finite(next.eq.low_shelf_hz, 100), 70, 140, 100);
    changes.push({ code: "MASTER_LOW_END_TRIM", change_db: delta, reason: excessive ? "combined low end exceeds pre-master balance window" : "combined low end is underweight" });
  }

  if (failures.has("upper_mid_control")) {
    next.eq.presence_db = clamp(finite(next.eq.presence_db, 0) - 0.5, -1.5, 1.5);
    next.eq.presence_hz = clamp(finite(next.eq.presence_hz, 3200), 2600, 4200, 3200);
    next.eq.presence_q = clamp(finite(next.eq.presence_q, 0.7), 0.5, 1.1, 0.7);
    changes.push({ code: "MASTER_UPPER_MID_TRIM", change_db: -0.5, reason: "combined upper-mid energy exceeds pre-master control window" });
  }

  if (failures.has("dynamic_life")) {
    const crest = finite(metrics.crest_factor_db);
    if (Number.isFinite(crest) && crest < 6) {
      next.compressor.enabled = false;
      next.compressor.makeup_db = 0;
      changes.push({ code: "MASTER_GLUE_BYPASS", reason: "combined crest factor is already too low; additional bus compression is forbidden" });
    }
  }

  const crest = finite(metrics.crest_factor_db);
  const healthyForAudition = (signalReview.failures || []).length === 0 && Number.isFinite(crest) && crest >= 9 && crest <= 18 && finite(signalReview.headroom_db, 0) >= 4;
  const glueAudition = healthyForAudition ? {
    automatic_apply: false,
    audition_required: true,
    compressor: { enabled: true, threshold_db: -10, ratio: 1.35, attack_ms: 35, release_ms: 220, knee_db: 4, makeup_db: 0 },
    rationale: "Healthy combined dynamics leave room to audition subtle cohesion, but technical evidence alone does not prove the mix sounds better compressed.",
  } : null;

  return Object.freeze({
    contract: CONTRACT,
    status: changes.length ? "TECHNICAL_BUS_REPAIR_READY" : glueAudition ? "GLUE_AUDITION_OPTIONAL" : "NO_SAFE_BUS_CHANGE",
    processing: next,
    changes,
    glue_audition: glueAudition,
    automatic_glue_forbidden: true,
    release_limiter_forbidden: true,
    loudness_gain_compensation_forbidden: true,
    artistic_listening_review_required: true,
    mutation_authorized: false,
  });
}

export const CreativeMusicPremasterBusEngineerRuntime = Object.freeze({ contract: CONTRACT, build: buildMusicPremasterBusDecision });
