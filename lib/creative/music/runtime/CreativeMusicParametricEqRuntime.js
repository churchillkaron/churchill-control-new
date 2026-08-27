const CONTRACT = "AVANTIQO_MUSIC_PARAMETRIC_EQ_V1";
const BAND_TYPES = Object.freeze(["bell", "lowshelf", "highshelf", "lowpass", "highpass", "notch"]);

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

export function createMusicEqBand(input = {}) {
  const type = text(input.type || "bell").toLowerCase();
  if (!BAND_TYPES.includes(type)) throw new Error(`CREATIVE_MUSIC_EQ_BAND_TYPE_INVALID:${type}`);
  return {
    contract: CONTRACT,
    id: text(input.id || `eq-${crypto.randomUUID()}`),
    type,
    enabled: input.enabled !== false,
    frequency_hz: clamp(input.frequency_hz, 20, 20000, 1000),
    gain_db: ["lowpass", "highpass", "notch"].includes(type) ? 0 : clamp(input.gain_db, -18, 18, 0),
    q: clamp(input.q, 0.1, 18, 1),
    destructive_processing_allowed: false,
  };
}

export function defaultMusicParametricEqBands() {
  return [
    createMusicEqBand({ id: "eq-low", type: "bell", frequency_hz: 180, gain_db: 0, q: 0.8, enabled: false }),
    createMusicEqBand({ id: "eq-low-mid", type: "bell", frequency_hz: 500, gain_db: 0, q: 1.1, enabled: false }),
    createMusicEqBand({ id: "eq-high-mid", type: "bell", frequency_hz: 2800, gain_db: 0, q: 1, enabled: false }),
    createMusicEqBand({ id: "eq-air", type: "highshelf", frequency_hz: 10500, gain_db: 0, q: 0.7, enabled: false }),
  ];
}

export function ensureMusicParametricEq(track = {}) {
  const next = structuredClone(track);
  const existing = Array.isArray(next.channel_strip?.eq_bands) ? next.channel_strip.eq_bands : [];
  next.channel_strip = next.channel_strip || {};
  next.channel_strip.eq_bands = existing.length
    ? existing.map((band) => createMusicEqBand(band))
    : defaultMusicParametricEqBands();
  next.destructive_processing_allowed = false;
  return next;
}

export function updateMusicEqBand(track = {}, bandId, values = {}) {
  const next = ensureMusicParametricEq(track);
  const index = next.channel_strip.eq_bands.findIndex((band) => band.id === bandId);
  if (index < 0) throw new Error("CREATIVE_MUSIC_EQ_BAND_NOT_FOUND");
  next.channel_strip.eq_bands[index] = createMusicEqBand({
    ...next.channel_strip.eq_bands[index],
    ...values,
    id: bandId,
  });
  return next;
}

export function validateMusicParametricEq(track = {}) {
  const bands = Array.isArray(track.channel_strip?.eq_bands) ? track.channel_strip.eq_bands : [];
  if (bands.length > 12) throw new Error("CREATIVE_MUSIC_EQ_BAND_LIMIT_EXCEEDED");
  const ids = new Set();
  for (const band of bands) {
    const normalized = createMusicEqBand(band);
    if (ids.has(normalized.id)) throw new Error("CREATIVE_MUSIC_EQ_BAND_ID_DUPLICATE");
    ids.add(normalized.id);
    if (band.destructive_processing_allowed === true) throw new Error("CREATIVE_MUSIC_EQ_DESTRUCTIVE_FORBIDDEN");
  }
  return {
    success: true,
    contract: CONTRACT,
    band_count: bands.length,
    non_destructive: true,
  };
}

export const CreativeMusicParametricEqRuntime = {
  contract: CONTRACT,
  bandTypes: BAND_TYPES,
  createBand: createMusicEqBand,
  defaults: defaultMusicParametricEqBands,
  ensure: ensureMusicParametricEq,
  updateBand: updateMusicEqBand,
  validate: validateMusicParametricEq,
};
