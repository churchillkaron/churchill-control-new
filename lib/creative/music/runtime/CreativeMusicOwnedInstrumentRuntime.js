export const MUSIC_OWNED_INSTRUMENT_CONTRACT = "AVANTIQO_MUSIC_OWNED_INSTRUMENT_V1";

const WAVEFORMS = new Set(["sine", "triangle", "sawtooth", "square"]);

function text(value) { return String(value ?? "").trim(); }
function finite(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function clamp(value, min, max, fallback = min) { return Math.max(min, Math.min(max, finite(value, fallback))); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function words(value) { return new Set(text(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").split(/\s+/).filter(Boolean)); }
function hash(value) { let h = 2166136261; for (const c of JSON.stringify(value)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16).padStart(8, "0"); }

const FACTORY = Object.freeze({
  studio_keys: { label: "Studio Keys", oscillators: [["triangle", 0, 0.70], ["sine", 12, 0.18]], attack_seconds: 0.008, decay_seconds: 0.18, sustain_level: 0.58, release_seconds: 0.45, filter_cutoff_hz: 5200, filter_q: 0.35, vibrato_rate_hz: 5.2, vibrato_depth_cents: 35 },
  warm_pad: { label: "Warm Pad", oscillators: [["sawtooth", 0, 0.35], ["triangle", -12, 0.28], ["sine", 12, 0.12]], attack_seconds: 0.35, decay_seconds: 0.70, sustain_level: 0.70, release_seconds: 1.40, filter_cutoff_hz: 2400, filter_q: 0.45, vibrato_rate_hz: 4.8, vibrato_depth_cents: 24 },
  mono_bass: { label: "Mono Bass", oscillators: [["square", -12, 0.38], ["sine", -12, 0.55]], attack_seconds: 0.005, decay_seconds: 0.12, sustain_level: 0.72, release_seconds: 0.18, filter_cutoff_hz: 1200, filter_q: 0.70, vibrato_rate_hz: 5.0, vibrato_depth_cents: 18 },
  bright_lead: { label: "Bright Lead", oscillators: [["sawtooth", 0, 0.45], ["square", 0, 0.20], ["sine", 12, 0.08]], attack_seconds: 0.004, decay_seconds: 0.10, sustain_level: 0.68, release_seconds: 0.20, filter_cutoff_hz: 4600, filter_q: 0.85, vibrato_rate_hz: 5.6, vibrato_depth_cents: 42 },
});

function factoryBase(id) {
  const key = text(id).toLowerCase();
  if (FACTORY[key]) return { ...clone(FACTORY[key]), preset_id: key };
  return { ...clone(FACTORY.studio_keys), preset_id: "studio_keys" };
}

function normalizeOscillators(value, fallback) {
  const source = Array.isArray(value) && value.length ? value : fallback;
  return source.slice(0, 4).map((row) => {
    const tuple = Array.isArray(row) ? row : [row?.waveform, row?.semitones, row?.level];
    const waveform = WAVEFORMS.has(text(tuple[0]).toLowerCase()) ? text(tuple[0]).toLowerCase() : "sine";
    return [waveform, Math.round(clamp(tuple[1], -36, 36, 0)), clamp(tuple[2], 0, 1, 0.25)];
  }).filter((row) => row[2] > 0);
}

export function normalizeMusicOwnedInstrument(input = {}, fallbackPreset = "studio_keys") {
  const fallback = factoryBase(fallbackPreset);
  const source = input?.contract === MUSIC_OWNED_INSTRUMENT_CONTRACT ? input : { ...fallback, ...input };
  const oscillators = normalizeOscillators(source.oscillators, fallback.oscillators);
  const core = {
    contract: MUSIC_OWNED_INSTRUMENT_CONTRACT,
    preset_id: text(source.preset_id || fallback.preset_id).toLowerCase(),
    label: text(source.label || fallback.label || "Owned Instrument").slice(0, 100),
    synthesis: "WEB_AUDIO_PARAMETRIC_SUBTRACTIVE",
    oscillators: oscillators.length ? oscillators : clone(fallback.oscillators),
    attack_seconds: clamp(source.attack_seconds, 0.001, 8, fallback.attack_seconds),
    decay_seconds: clamp(source.decay_seconds, 0.001, 8, fallback.decay_seconds),
    sustain_level: clamp(source.sustain_level, 0.001, 1, fallback.sustain_level),
    release_seconds: clamp(source.release_seconds, 0.01, 12, fallback.release_seconds),
    filter_type: "lowpass",
    filter_cutoff_hz: clamp(source.filter_cutoff_hz, 80, 18000, fallback.filter_cutoff_hz),
    filter_q: clamp(source.filter_q, 0.0001, 18, fallback.filter_q),
    vibrato_rate_hz: clamp(source.vibrato_rate_hz, 0.1, 12, fallback.vibrato_rate_hz),
    vibrato_depth_cents: clamp(source.vibrato_depth_cents, 0, 100, fallback.vibrato_depth_cents),
    velocity_sensitive: source.velocity_sensitive !== false,
    expression_sensitive: source.expression_sensitive !== false,
    pitch_bend_range_semitones: clamp(source.pitch_bend_range_semitones, 1, 12, 2),
    provider_job_submitted: false,
    external_plugin_required: false,
    non_destructive: true,
  };
  return { ...core, fingerprint: `instrument_${hash(core)}` };
}

function descriptorAmount(tokens, positive, negative, fallback = 0.5) {
  let amount = fallback;
  if (positive.some((word) => tokens.has(word))) amount += 0.25;
  if (negative.some((word) => tokens.has(word))) amount -= 0.25;
  return clamp(amount, 0, 1, fallback);
}

function basePresetForIntent(tokens) {
  if (["bass", "sub", "low"].some((word) => tokens.has(word))) return "mono_bass";
  if (["pad", "ambient", "cinematic", "atmospheric", "lush"].some((word) => tokens.has(word))) return "warm_pad";
  if (["lead", "solo", "hook", "piercing"].some((word) => tokens.has(word))) return "bright_lead";
  return "studio_keys";
}
export function designMusicOwnedInstrument(input = {}) {
  const intent = text(input.intent || input.description || input.objective || input.sound || "studio keys");
  const tokens = words(intent);
  const preset = text(input.preset_id || basePresetForIntent(tokens));
  const base = factoryBase(preset);
  const brightness = descriptorAmount(tokens, ["bright", "crisp", "air", "open", "sparkle"], ["dark", "warm", "soft", "muted"], 0.5);
  const softness = descriptorAmount(tokens, ["soft", "gentle", "smooth", "slow"], ["hard", "punchy", "sharp", "pluck"], 0.45);
  const movement = descriptorAmount(tokens, ["moving", "vibrato", "alive", "wobble", "motion"], ["stable", "still", "pure"], 0.35);
  const weight = descriptorAmount(tokens, ["heavy", "fat", "warm", "thick", "deep"], ["thin", "light", "airy"], 0.5);
  const attack = clamp(0.003 + softness * softness * 0.65, 0.002, 1.5, base.attack_seconds);
  const release = clamp(0.12 + softness * 1.9 + (tokens.has("pad") ? 0.7 : 0), 0.05, 4, base.release_seconds);
  const cutoff = clamp(700 + brightness * 10500 - weight * 1200, 180, 14000, base.filter_cutoff_hz);
  const vibratoDepth = clamp(movement * 52, 0, 70, base.vibrato_depth_cents);
  const design = normalizeMusicOwnedInstrument({
    ...base,
    label: text(input.label || intent || base.label).slice(0, 100),
    attack_seconds: input.attack_seconds ?? attack,
    decay_seconds: input.decay_seconds ?? base.decay_seconds,
    sustain_level: input.sustain_level ?? base.sustain_level,
    release_seconds: input.release_seconds ?? release,
    filter_cutoff_hz: input.filter_cutoff_hz ?? cutoff,
    filter_q: input.filter_q ?? (0.25 + brightness * 1.2),
    vibrato_rate_hz: input.vibrato_rate_hz ?? (4.2 + movement * 2.2),
    vibrato_depth_cents: input.vibrato_depth_cents ?? vibratoDepth,
    oscillators: input.oscillators || base.oscillators,
  }, preset);
  return { ...design, intent, design_source: "DETERMINISTIC_MUSICAL_INTENT", artistic_intent_inferred: false };
}
export function resolveMusicOwnedInstrumentDefinition(trackOrInstrument = {}, explicitPreset = null) {
  const instrument = trackOrInstrument?.instrument || trackOrInstrument || {};
  if (instrument.design && typeof instrument.design === "object") {
    return normalizeMusicOwnedInstrument(instrument.design, instrument.preset_id || explicitPreset || "studio_keys");
  }
  return normalizeMusicOwnedInstrument(factoryBase(instrument.preset_id || instrument.instrument_id || explicitPreset || "studio_keys"));
}

export function listMusicOwnedInstrumentPresets() {
  return Object.entries(FACTORY).map(([id, value]) => ({ id, label: value.label }));
}

export const CreativeMusicOwnedInstrumentRuntime = Object.freeze({
  contract: MUSIC_OWNED_INSTRUMENT_CONTRACT,
  design: designMusicOwnedInstrument,
  normalize: normalizeMusicOwnedInstrument,
  resolve: resolveMusicOwnedInstrumentDefinition,
  presets: listMusicOwnedInstrumentPresets,
});
