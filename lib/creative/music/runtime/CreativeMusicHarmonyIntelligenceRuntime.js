export const MUSIC_HARMONY_INTELLIGENCE_CONTRACT = "AVANTIQO_MUSIC_HARMONY_INTELLIGENCE_V1";

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const CHORD_QUALITIES = Object.freeze([
  { quality: "major", intervals: [0, 4, 7] },
  { quality: "minor", intervals: [0, 3, 7] },
]);
const MIN_KEY_CONFIDENCE = 0.42;
const MIN_CHORD_SCORE = 0.5;
const MIN_CHORD_MARGIN = 0.08;
const MAX_WINDOWS = 40;

function finite(value) { const number = Number(value); return Number.isFinite(number) ? number : null; }
function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function rounded(value, digits = 3) { const number = finite(value); return number === null ? null : Number(number.toFixed(digits)); }
function normalize(values = []) {
  const rows = Array.from({ length: 12 }, (_, index) => Math.max(0, finite(values[index]) ?? 0));
  const sum = rows.reduce((total, value) => total + value, 0) || 1;
  return rows.map((value) => value / sum);
}
function chordCandidates(chroma = []) {
  const measured = normalize(chroma);
  const candidates = [];
  for (let root = 0; root < 12; root += 1) {
    for (const definition of CHORD_QUALITIES) {
      const tones = new Set(definition.intervals.map((interval) => (root + interval) % 12));
      const chordEnergy = measured.reduce((sum, value, index) => sum + (tones.has(index) ? value : 0), 0);
      const rootEnergy = measured[root];
      const nonChordEnergy = 1 - chordEnergy;
      const score = chordEnergy * 0.82 + rootEnergy * 0.22 - nonChordEnergy * 0.18;
      candidates.push({
        root: NOTE_NAMES[root],
        quality: definition.quality,
        label: `${NOTE_NAMES[root]}${definition.quality === "minor" ? "m" : ""}`,
        score,
      });
    }
  }
  return candidates.sort((left, right) => right.score - left.score);
}

function interpretWindow(window = {}) {
  const chroma = list(window.chroma);
  if (chroma.length !== 12) return null;
  const candidates = chordCandidates(chroma);
  const best = candidates[0];
  const second = candidates[1];
  if (!best || !second) return null;
  const margin = best.score - second.score;
  const accepted = best.score >= MIN_CHORD_SCORE && margin >= MIN_CHORD_MARGIN;
  return {
    start_seconds: finite(window.start_seconds),
    end_seconds: finite(window.end_seconds),
    chord_label: accepted ? best.label : null,
    root: accepted ? best.root : null,
    quality: accepted ? best.quality : null,
    confidence: rounded(Math.max(0, Math.min(1, best.score)), 3),
    candidate_margin: rounded(margin, 3),
    ambiguous: !accepted,
    measured_from_chroma: true,
  };
}
export function buildMusicHarmonyIntelligence(analysis = {}) {
  const key = object(analysis.key);
  const accepted = object(analysis.accepted);
  const harmonic = object(analysis.harmonic_movement);
  const windows = list(harmonic.windows).slice(0, MAX_WINDOWS).map(interpretWindow).filter(Boolean);
  const acceptedWindows = windows.filter((window) => window.chord_label);
  const keyConfidence = finite(key.confidence);
  const keyAccepted = Boolean(accepted.key_label && keyConfidence !== null && keyConfidence >= MIN_KEY_CONFIDENCE);
  return Object.freeze({
    contract: MUSIC_HARMONY_INTELLIGENCE_CONTRACT,
    tonal_center: keyAccepted ? {
      key: accepted.key || key.key || null,
      mode: accepted.mode || key.mode || null,
      label: accepted.key_label || key.label || null,
      confidence: rounded(keyConfidence, 3),
    } : null,
    chord_windows: windows,
    labelled_window_count: acceptedWindows.length,
    ambiguous_window_count: windows.length - acceptedWindows.length,
    chord_names_available: acceptedWindows.length > 0,
    chord_analysis_ready: windows.length > 0,
    confidence_policy: {
      minimum_key_confidence: MIN_KEY_CONFIDENCE,
      minimum_chord_score: MIN_CHORD_SCORE,
      minimum_chord_margin: MIN_CHORD_MARGIN,
      ambiguity_is_preserved: true,
    },
    source_audio_measured: analysis.source_audio_measured === true,
    metadata_guessing_forbidden: true,
    user_intent_inference_allowed: false,
    mutation_authorized: false,
    publication_authorized: false,
  });
}

export const CreativeMusicHarmonyIntelligenceRuntime = Object.freeze({
  contract: MUSIC_HARMONY_INTELLIGENCE_CONTRACT,
  build: buildMusicHarmonyIntelligence,
});
