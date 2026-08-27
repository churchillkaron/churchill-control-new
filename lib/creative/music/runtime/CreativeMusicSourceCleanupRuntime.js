const CONTRACT = "AVANTIQO_MUSIC_SOURCE_CLEANUP_V1";

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
  normalize: normalizeMusicSourceCleanup,
  apply: applyMusicSourceCleanup,
  validate: validateMusicSourceCleanup,
};
