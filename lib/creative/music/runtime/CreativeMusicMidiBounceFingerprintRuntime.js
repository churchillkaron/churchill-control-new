const CONTRACT = "AVANTIQO_MUSIC_MIDI_BOUNCE_FINGERPRINT_V1";

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function text(value) {
  return String(value ?? "").trim();
}

function ordered(value) {
  if (Array.isArray(value)) return value.map(ordered);
  if (!value || typeof value !== "object") return value;
  const result = {};
  for (const key of Object.keys(value).sort()) {
    const next = value[key];
    if (next === undefined || typeof next === "function") continue;
    result[key] = ordered(next);
  }
  return result;
}

function hashString(value) {
  let left = 0x811c9dc5;
  let right = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    left ^= code;
    left = Math.imul(left, 0x01000193) >>> 0;
    right ^= code + index;
    right = Math.imul(right, 0x85ebca6b) >>> 0;
    right ^= right >>> 13;
  }
  return `${left.toString(16).padStart(8, "0")}${right.toString(16).padStart(8, "0")}`;
}

function normalizeTempoMap(session = {}) {
  const map = session.tempo_map || {};
  return {
    contract: text(map.contract),
    bpm: finite(session.bpm, 120),
    time_signature: text(session.time_signature || "4/4"),
    tempo_events: Array.isArray(map.tempo_events) ? map.tempo_events.map((event) => ordered(event)) : [],
    meter_events: Array.isArray(map.meter_events) ? map.meter_events.map((event) => ordered(event)) : [],
  };
}

function normalizeMidiTrack(track = {}) {
  return {
    id: text(track.id),
    instrument: ordered(track.instrument || {}),
    clips: (track.clips || []).map((clip) => ({
      id: text(clip.id),
      start_beat: finite(clip.start_beat, 0),
      duration_beats: finite(clip.duration_beats, 0),
      notes: (clip.notes || []).map((note) => ({
        id: text(note.id),
        pitch: finite(note.pitch, 60),
        start_beat: finite(note.start_beat, 0),
        duration_beats: finite(note.duration_beats, 0.25),
        velocity: finite(note.velocity, 100),
        muted: note.muted === true,
      })),
      control_events: (clip.control_events || []).map((event) => ordered(event)),
    })),
  };
}

function normalizeSampler(sampler = null) {
  if (!sampler) return null;
  return ordered({
    contract: sampler.contract,
    selected_kit_id: sampler.selected_kit_id,
    kits: sampler.kits || [],
    sample_asset_ids: sampler.sample_asset_ids || [],
  });
}

export function buildMusicMidiBounceFingerprintPayload({ session = {}, track = {}, sampler = null } = {}) {
  return {
    contract: CONTRACT,
    midi_track: normalizeMidiTrack(track),
    tempo_map: normalizeTempoMap(session),
    sample_rate: Math.round(finite(session.sample_rate, 48000)),
    sampler: normalizeSampler(sampler),
  };
}

export function fingerprintMusicMidiBounce(input = {}) {
  const payload = buildMusicMidiBounceFingerprintPayload(input);
  return `${CONTRACT}:${hashString(JSON.stringify(ordered(payload)))}`;
}

export const CreativeMusicMidiBounceFingerprintRuntime = {
  contract: CONTRACT,
  buildPayload: buildMusicMidiBounceFingerprintPayload,
  fingerprint: fingerprintMusicMidiBounce,
};
