const CONTRACT = "AVANTIQO_MUSIC_MASTER_BUS_PROCESSING_V1";

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max, fallback = 0) {
  return Math.max(min, Math.min(max, finite(value, fallback)));
}

export function normalizeMusicMasterProcessing(input = {}) {
  return {
    contract: CONTRACT,
    enabled: input.enabled !== false,
    eq: {
      high_pass_hz: clamp(input.eq?.high_pass_hz, 20, 120, 20),
      low_shelf_db: clamp(input.eq?.low_shelf_db, -6, 6, 0),
      low_shelf_hz: clamp(input.eq?.low_shelf_hz, 40, 300, 100),
      presence_db: clamp(input.eq?.presence_db, -6, 6, 0),
      presence_hz: clamp(input.eq?.presence_hz, 1000, 7000, 3200),
      presence_q: clamp(input.eq?.presence_q, 0.2, 4, 0.7),
      high_shelf_db: clamp(input.eq?.high_shelf_db, -6, 6, 0),
      high_shelf_hz: clamp(input.eq?.high_shelf_hz, 4000, 18000, 9000),
    },
    compressor: {
      enabled: input.compressor?.enabled === true,
      threshold_db: clamp(input.compressor?.threshold_db, -40, 0, -12),
      ratio: clamp(input.compressor?.ratio, 1, 8, 1.8),
      attack_ms: clamp(input.compressor?.attack_ms, 1, 200, 30),
      release_ms: clamp(input.compressor?.release_ms, 20, 2000, 250),
      knee_db: clamp(input.compressor?.knee_db, 0, 20, 4),
      makeup_db: clamp(input.compressor?.makeup_db, -6, 6, 0),
    },
    preview_ceiling: {
      limiter_enabled: false,
      release_limiter_required: true,
      target_true_peak_dbtp: clamp(input.preview_ceiling?.target_true_peak_dbtp, -6, -0.1, -1),
    },
    headroom_target_db: clamp(input.headroom_target_db, 3, 12, 6),
    destructive_processing_allowed: false,
  };
}

export function applyMusicMasterProcessing(session = {}, input = {}) {
  const next = structuredClone(session);
  next.buses = Array.isArray(next.buses) ? next.buses : [];
  const master = next.buses.find((bus) => bus.id === "bus-master");
  if (!master) throw new Error("CREATIVE_MUSIC_MASTER_BUS_REQUIRED");
  master.processing = normalizeMusicMasterProcessing(input);
  master.true_peak_ceiling_dbtp = master.processing.preview_ceiling.target_true_peak_dbtp;
  return next;
}

export function validateMusicMasterProcessing(session = {}) {
  const master = (session.buses || []).find((bus) => bus.id === "bus-master");
  if (!master) throw new Error("CREATIVE_MUSIC_MASTER_BUS_REQUIRED");
  const processing = normalizeMusicMasterProcessing(master.processing || {});
  if (processing.preview_ceiling.limiter_enabled === true) throw new Error("CREATIVE_MUSIC_WORKSTATION_MASTER_LIMITER_FORBIDDEN");
  if (processing.destructive_processing_allowed === true) throw new Error("CREATIVE_MUSIC_MASTER_PROCESSING_DESTRUCTIVE_FORBIDDEN");
  return {
    success: true,
    contract: CONTRACT,
    compressor_enabled: processing.compressor.enabled,
    headroom_target_db: processing.headroom_target_db,
    release_limiter_required: true,
    browser_limiter_enabled: false,
    non_destructive: true,
  };
}

export const CreativeMusicMasterBusRuntime = {
  contract: CONTRACT,
  normalize: normalizeMusicMasterProcessing,
  apply: applyMusicMasterProcessing,
  validate: validateMusicMasterProcessing,
};
