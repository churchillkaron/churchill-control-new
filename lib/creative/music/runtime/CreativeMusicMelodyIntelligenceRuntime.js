export const MUSIC_MELODY_INTELLIGENCE_CONTRACT = "AVANTIQO_MUSIC_MELODY_INTELLIGENCE_V1";

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function rounded(value, digits = 3) {
  const number = finite(value);
  return number === null ? null : Number(number.toFixed(digits));
}

function contourDirection(intervals = []) {
  const rows = list(intervals).map(finite).filter((value) => value !== null);
  if (!rows.length) return null;
  const up = rows.filter((value) => value > 0.5).length;
  const down = rows.filter((value) => value < -0.5).length;
  if (up > down * 1.35) return "RISING";
  if (down > up * 1.35) return "FALLING";
  return "MIXED";
}function normalizedPhrase(row = {}) {
  const start = finite(row.start_seconds);
  const end = finite(row.end_seconds);
  const confidence = finite(row.confidence);
  const notes = list(row.notes).map((note) => ({
    midi: finite(note.midi),
    start_seconds: finite(note.start_seconds),
    end_seconds: finite(note.end_seconds),
  })).filter((note) => note.midi !== null);
  if (start === null || end === null || end <= start || notes.length < 2) return null;
  const intervals = [];
  for (let index = 1; index < notes.length; index += 1) intervals.push(rounded(notes[index].midi - notes[index - 1].midi, 2));
  return {
    start_seconds: start,
    end_seconds: end,
    confidence,
    note_count: notes.length,
    intervals,
    contour_direction: contourDirection(intervals),
    pitch_span_semitones: rounded(Math.max(...notes.map((note) => note.midi)) - Math.min(...notes.map((note) => note.midi)), 2),
  };
}

function motifSimilarity(left = {}, right = {}) {
  const a = list(left.intervals);
  const b = list(right.intervals);
  const count = Math.min(a.length, b.length, 12);
  if (count < 2) return null;
  let error = 0;
  for (let index = 0; index < count; index += 1) error += Math.min(12, Math.abs(a[index] - b[index]));
  return rounded(Math.max(0, 1 - error / (count * 12)), 3);
}export function buildMusicMelodyIntelligence(analysis = {}) {
  const measured = object(analysis.melody_measurement);
  const phrases = list(measured.phrases).map(normalizedPhrase).filter(Boolean).slice(0, 24);
  const coverage = finite(measured.voiced_coverage_ratio);
  const confidence = finite(measured.mean_pitch_confidence);
  const ready = measured.measured_from_audio === true && coverage !== null && confidence !== null && coverage >= 0.12 && confidence >= 0.62 && phrases.length > 0;
  const motifs = [];
  if (ready) {
    for (let left = 0; left < phrases.length; left += 1) {
      for (let right = left + 1; right < phrases.length; right += 1) {
        const similarity = motifSimilarity(phrases[left], phrases[right]);
        if (similarity === null || similarity < 0.78) continue;
        motifs.push({ first_start_seconds: phrases[left].start_seconds, repeat_start_seconds: phrases[right].start_seconds, similarity });
      }
    }
  }
  motifs.sort((a,b) => b.similarity - a.similarity);
  return Object.freeze({
    contract: MUSIC_MELODY_INTELLIGENCE_CONTRACT,
    melody_analysis_ready: ready,
    dominant_pitch_line_claimed: ready,
    voiced_coverage_ratio: coverage,
    mean_pitch_confidence: confidence,
    phrase_candidates: ready ? phrases : [],
    repeated_motif_candidates: ready ? motifs.slice(0, 12) : [],
    polyphonic_uncertainty_preserved: true,
    user_intent_inference_allowed: false,
    mutation_authorized: false,
    publication_authorized: false,
  });
}

export const CreativeMusicMelodyIntelligenceRuntime = Object.freeze({
  contract: MUSIC_MELODY_INTELLIGENCE_CONTRACT,
  build: buildMusicMelodyIntelligence,
});