const CONTRACT = "AVANTIQO_MUSIC_SOURCE_CLEANUP_V1";
const RECOMMENDATION_CONTRACT = "AVANTIQO_MUSIC_SOURCE_CLEANUP_RECOMMENDATION_V1";

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max, fallback = 0) {
  return Math.max(min, Math.min(max, finite(value, fallback)));
}

export function normalizeMusicSourceCleanup(input = {}) {
  const humFrequency = Number(input.hum_notch?.frequency_hz) === 60 ? 60 : 50;
  return {
    contract: CONTRACT,
    enabled: input.enabled !== false,
    destructive_processing_allowed: false,
    dc_blocker: {
      enabled: input.dc_blocker?.enabled === true,
      cutoff_hz: clamp(input.dc_blocker?.cutoff_hz, 5, 35, 15),
    },
    hum_notch: {
      enabled: input.hum_notch?.enabled === true,
      frequency_hz: humFrequency,
      q: clamp(input.hum_notch?.q, 4, 40, 18),
      harmonics: Math.max(1, Math.min(4, Math.round(finite(input.hum_notch?.harmonics, 3)))),
    },
    guidance: {
      diagnostics_first: true,
      auto_enable_forbidden: true,
      original_source_preserved: true,
      render_to_new_asset_only: true,
    },
  };
}

export function recommendMusicSourceCleanup(diagnostics = {}) {
  const available = diagnostics.source_diagnostics_available === true || diagnostics.available === true;
  const floorHistoryWindows = Math.max(0, Math.round(finite(diagnostics.floor_history_windows, 0)));
  const dominantHumHz = Number(diagnostics.dominant_hum_hz) === 60 ? 60 : 50;
  const dominantHumRelativeDb = finite(diagnostics.dominant_hum_relative_db, -Infinity);
  const dcOffset = Math.abs(finite(diagnostics.dc_offset, 0));
  const humWarning = diagnostics.hum_warning === true && Number.isFinite(dominantHumRelativeDb);
  const dcWarning = diagnostics.dc_offset_warning === true || dcOffset > 0.01;
  const floorReady = available
    && floorHistoryWindows >= 4
    && Number.isFinite(Number(diagnostics.background_floor_estimate_dbfs));

  const recommendations = [];
  if (dcWarning) {
    recommendations.push({
      id: "dc-blocker",
      type: "dc_blocker",
      severity: dcOffset > 0.03 ? "HIGH" : "MEDIUM",
      reason: "DC_OFFSET_ELEVATED",
      evidence: { dc_offset: dcOffset },
      suggested: { enabled: true, cutoff_hz: 15 },
      auto_apply: false,
    });
  }
  if (humWarning) {
    recommendations.push({
      id: "mains-hum-notch",
      type: "hum_notch",
      severity: dominantHumRelativeDb > -18 ? "HIGH" : "MEDIUM",
      reason: "MAINS_HUM_ELEVATED",
      evidence: {
        dominant_hum_hz: dominantHumHz,
        dominant_hum_relative_db: dominantHumRelativeDb,
        hum_50_relative_db: finite(diagnostics.hum_50_relative_db, -Infinity),
        hum_60_relative_db: finite(diagnostics.hum_60_relative_db, -Infinity),
      },
      suggested: { enabled: true, frequency_hz: dominantHumHz, q: 18, harmonics: 3 },
      auto_apply: false,
    });
  }

  return {
    contract: RECOMMENDATION_CONTRACT,
    diagnostics_available: available,
    floor_estimate_ready: floorReady,
    floor_is_estimate: diagnostics.floor_is_estimate !== false,
    recommendation_count: recommendations.length,
    recommendations,
    auto_apply_forbidden: true,
    requires_human_enable: true,
    original_source_preserved: true,
  };
}

export function applyMusicSourceCleanup(track = {}, input = {}) {
  const next = structuredClone(track);
  next.source_cleanup = normalizeMusicSourceCleanup(input);
  next.destructive_processing_allowed = false;
  return next;
}

export function validateMusicSourceCleanup(track = {}) {
  const cleanup = normalizeMusicSourceCleanup(track.source_cleanup || {});
  if (cleanup.destructive_processing_allowed === true) {
    throw new Error("CREATIVE_MUSIC_SOURCE_CLEANUP_DESTRUCTIVE_FORBIDDEN");
  }
  return {
    success: true,
    contract: CONTRACT,
    enabled: cleanup.enabled,
    dc_blocker_enabled: cleanup.dc_blocker.enabled,
    hum_notch_enabled: cleanup.hum_notch.enabled,
    diagnostics_first: true,
    auto_enable_forbidden: true,
    non_destructive: true,
  };
}

export const CreativeMusicSourceCleanupRuntime = {
  contract: CONTRACT,
  recommendationContract: RECOMMENDATION_CONTRACT,
  normalize: normalizeMusicSourceCleanup,
  recommend: recommendMusicSourceCleanup,
  apply: applyMusicSourceCleanup,
  validate: validateMusicSourceCleanup,
};
