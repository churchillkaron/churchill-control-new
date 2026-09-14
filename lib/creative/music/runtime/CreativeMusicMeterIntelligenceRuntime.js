export const MUSIC_METER_INTELLIGENCE_CONTRACT = "AVANTIQO_MUSIC_METER_INTELLIGENCE_V1";

const CANDIDATES = Object.freeze([
  { beats_per_bar: 3, label: "3/4" },
  { beats_per_bar: 4, label: "4/4" },
  { beats_per_bar: 6, label: "6/8" },
]);

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function rounded(value, digits = 3) {
  const number = finite(value);
  return number === null ? null : Number(number.toFixed(digits));
}
function accentValues(profile = []) {
  return list(profile).map((row) => finite(row.accent)).filter((value) => value !== null && value >= 0);
}
function scoreCandidate(accents = [], candidate = {}) {
  const size = candidate.beats_per_bar;
  if (accents.length < size * 3) return null;
  const phaseTotals = Array(size).fill(0);
  const phaseCounts = Array(size).fill(0);
  for (let index = 0; index < accents.length; index += 1) {
    const phase = index % size;
    phaseTotals[phase] += accents[index];
    phaseCounts[phase] += 1;
  }
  const means = phaseTotals.map((total, index) => total / Math.max(1, phaseCounts[index]));
  let strongestPhase = 0;
  for (let index = 1; index < means.length; index += 1) if (means[index] > means[strongestPhase]) strongestPhase = index;
  const overall = means.reduce((sum, value) => sum + value, 0) / Math.max(1, means.length);
  const others = means.filter((_, index) => index !== strongestPhase);
  const otherMean = others.reduce((sum, value) => sum + value, 0) / Math.max(1, others.length);
  const contrast = Math.max(0, (means[strongestPhase] - otherMean) / Math.max(1e-9, overall));
  return {
    ...candidate,
    strongest_phase: strongestPhase,
    phase_means: means.map((value) => rounded(value, 4)),
    score: rounded(Math.min(1, contrast / 1.5), 4),
  };
}
function barStarts({ bpm, pulsePhase, beatsPerBar, downbeatPhase, duration }) {
  if (!bpm || bpm <= 0 || pulsePhase === null || duration === null || duration <= 0) return [];
  const beatSeconds = 60 / bpm;
  const first = pulsePhase + downbeatPhase * beatSeconds;
  const barSeconds = beatSeconds * beatsPerBar;
  const starts = [];
  for (let at = first; at < duration && starts.length < 64; at += barSeconds) {
    if (at >= 0) starts.push(rounded(at, 4));
  }
  return starts;
}

export function buildMusicMeterIntelligence(analysis = {}) {
  const rhythm = object(analysis.rhythm);
  const accents = accentValues(rhythm.beat_accent_profile);
  const bpm = finite(rhythm.bpm);
  const pulsePhase = finite(rhythm.pulse_phase_seconds);
  const pulseConfidence = finite(rhythm.pulse_phase_confidence);
  const candidates = CANDIDATES.map((candidate) => scoreCandidate(accents, candidate)).filter(Boolean).sort((a, b) => b.score - a.score);
  const best = candidates[0] || null;
  const second = candidates[1] || null;
  const margin = best ? Math.max(0, best.score - (second?.score || 0)) : 0;
  const enoughEvidence = accents.length >= 12 && (pulseConfidence || 0) >= 0.12;
  const accepted = Boolean(enoughEvidence && best && best.score >= 0.18 && margin >= 0.06);
  const duration = finite(analysis.duration_seconds);
  const starts = accepted ? barStarts({
    bpm,
    pulsePhase,
    beatsPerBar: best.beats_per_bar,
    downbeatPhase: best.strongest_phase,
    duration,
  }) : [];
  return Object.freeze({
    contract: MUSIC_METER_INTELLIGENCE_CONTRACT,
    meter_analysis_ready: accepted,
    time_signature_candidate: accepted ? best.label : null,
    beats_per_bar_candidate: accepted ? best.beats_per_bar : null,
    downbeat_phase_in_beats: accepted ? best.strongest_phase : null,
    downbeat_confidence: accepted ? rounded(Math.min(1, (best.score * 0.65) + (margin * 1.8) + ((pulseConfidence || 0) * 0.2))) : null,
    candidate_margin: rounded(margin, 4),
    candidate_scores: candidates,
    bar_start_seconds: starts,
    ambiguity_preserved: !accepted,
    measured_from_audio: rhythm.measured_from_audio === true,
    user_intent_inference_allowed: false,
    mutation_authorized: false,
    publication_authorized: false,
  });
}

export const CreativeMusicMeterIntelligenceRuntime = Object.freeze({
  contract: MUSIC_METER_INTELLIGENCE_CONTRACT,
  build: buildMusicMeterIntelligence,
});
