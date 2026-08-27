const CONTRACT = "AVANTIQO_MUSIC_GROUP_BUS_PROCESSING_V1";

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max, fallback = 0) {
  return Math.max(min, Math.min(max, finite(value, fallback)));
}

export function normalizeMusicGroupProcessing(input = {}) {
  return {
    contract: CONTRACT,
    enabled: input.enabled !== false,
    eq: {
      high_pass_hz: clamp(input.eq?.high_pass_hz, 20, 400, 20),
      low_shelf_db: clamp(input.eq?.low_shelf_db, -12, 12, 0),
      low_shelf_hz: clamp(input.eq?.low_shelf_hz, 40, 500, 120),
      presence_db: clamp(input.eq?.presence_db, -12, 12, 0),
      presence_hz: clamp(input.eq?.presence_hz, 500, 8000, 3000),
      presence_q: clamp(input.eq?.presence_q, 0.2, 8, 0.8),
      high_shelf_db: clamp(input.eq?.high_shelf_db, -12, 12, 0),
      high_shelf_hz: clamp(input.eq?.high_shelf_hz, 3000, 18000, 8000),
    },
    compressor: {
      enabled: input.compressor?.enabled === true,
      threshold_db: clamp(input.compressor?.threshold_db, -60, 0, -18),
      ratio: clamp(input.compressor?.ratio, 1, 20, 2.5),
      attack_ms: clamp(input.compressor?.attack_ms, 0.1, 200, 20),
      release_ms: clamp(input.compressor?.release_ms, 10, 2000, 180),
      knee_db: clamp(input.compressor?.knee_db, 0, 40, 6),
      makeup_db: clamp(input.compressor?.makeup_db, -12, 18, 0),
    },
    destructive_processing_allowed: false,
  };
}

export function applyMusicGroupProcessing(bus = {}, input = {}) {
  if (bus.type !== "group") throw new Error(`CREATIVE_MUSIC_GROUP_PROCESSING_TARGET_INVALID:${bus.id || "unknown"}`);
  const next = structuredClone(bus);
  next.processing = normalizeMusicGroupProcessing(input);
  next.destructive_processing_allowed = false;
  return next;
}

export function validateMusicGroupProcessing(session = {}) {
  let processed = 0;
  for (const bus of session.buses || []) {
    if (bus.type !== "group") continue;
    if (bus.processing) {
      const processing = normalizeMusicGroupProcessing(bus.processing);
      if (processing.destructive_processing_allowed === true) throw new Error("CREATIVE_MUSIC_GROUP_PROCESSING_DESTRUCTIVE_FORBIDDEN");
      processed += 1;
    }
  }
  return {
    success: true,
    contract: CONTRACT,
    processed_group_count: processed,
    non_destructive: true,
    release_render_required: true,
  };
}

export const CreativeMusicBusProcessingRuntime = {
  contract: CONTRACT,
  normalize: normalizeMusicGroupProcessing,
  apply: applyMusicGroupProcessing,
  validate: validateMusicGroupProcessing,
};
