const CONTRACT = "AVANTIQO_MUSIC_VOCAL_TUNING_PLAN_V1";

const PITCH_CLASS = Object.freeze({
  C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5,
  "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11,
});
const MAJOR_INTERVALS = Object.freeze([0, 2, 4, 5, 7, 9, 11]);
const MINOR_INTERVALS = Object.freeze([0, 2, 3, 5, 7, 8, 10]);
const NOTE_NAMES = Object.freeze(["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]);

function text(value) { return String(value ?? "").trim(); }
function finite(value, fallback = 0) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }
function clamp(value, min, max, fallback = 0) { return Math.max(min, Math.min(max, finite(value, fallback))); }

function scalePitchClasses(key, mode) {
  const root = PITCH_CLASS[text(key)];
  if (!Number.isInteger(root)) throw new Error("CREATIVE_MUSIC_VOCAL_TUNING_KEY_INVALID");
  const normalizedMode = text(mode).toLowerCase();
  const intervals = normalizedMode === "minor" ? MINOR_INTERVALS : normalizedMode === "major" ? MAJOR_INTERVALS : null;
  if (!intervals) throw new Error("CREATIVE_MUSIC_VOCAL_TUNING_MODE_INVALID");
  return intervals.map((interval) => (root + interval) % 12);
}

function midiName(midi) {
  const rounded = Math.round(midi);
  const pitchClass = ((rounded % 12) + 12) % 12;
  const octave = Math.floor(rounded / 12) - 1;
  return `${NOTE_NAMES[pitchClass]}${octave}`;
}

function nearestScaleMidi(sourceMidiFloat, allowedPitchClasses) {
  let best = null;
  for (let midi = Math.floor(sourceMidiFloat) - 12; midi <= Math.ceil(sourceMidiFloat) + 12; midi += 1) {
    const pitchClass = ((midi % 12) + 12) % 12;
    if (!allowedPitchClasses.includes(pitchClass)) continue;
    const distance = Math.abs(midi - sourceMidiFloat);
    if (!best || distance < best.distance || (distance === best.distance && midi < best.midi)) best = { midi, distance };
  }
  return best?.midi ?? Math.round(sourceMidiFloat);
}

function sourceMidiFromSegment(segment = {}) {
  const midi = finite(segment.midi, NaN);
  const cents = finite(segment.mean_cents_deviation, 0);
  if (!Number.isFinite(midi)) throw new Error("CREATIVE_MUSIC_VOCAL_TUNING_SEGMENT_MIDI_REQUIRED");
  return midi + cents / 100;
}

export function buildMusicVocalTuningPlan({
  pitch_analysis,
  musical_key,
  correction_strength = 0.8,
  preserve_within_cents = 10,
  max_correction_cents = 200,
  minimum_segment_confidence = 0.5,
} = {}) {
  if (pitch_analysis?.contract !== "AVANTIQO_MUSIC_VOCAL_PITCH_ANALYSIS_V1") {
    throw new Error("CREATIVE_MUSIC_VOCAL_TUNING_PITCH_ANALYSIS_REQUIRED");
  }
  if (pitch_analysis.pitch_evidence_only !== true || pitch_analysis.auto_tune_applied === true) {
    throw new Error("CREATIVE_MUSIC_VOCAL_TUNING_PITCH_EVIDENCE_INVALID");
  }
  const key = text(musical_key?.key);
  const mode = text(musical_key?.mode).toLowerCase();
  const allowedPitchClasses = scalePitchClasses(key, mode);
  const strength = clamp(correction_strength, 0, 1, 0.8);
  const preserve = clamp(preserve_within_cents, 0, 50, 10);
  const maxCorrection = clamp(max_correction_cents, 0, 600, 200);
  const minimumConfidence = clamp(minimum_segment_confidence, 0.2, 1, 0.5);
  const segments = [];

  for (const source of pitch_analysis.note_segments || []) {
    const confidence = clamp(source.confidence, 0, 1, 0);
    const sourceMidiFloat = sourceMidiFromSegment(source);
    const nearestMidi = nearestScaleMidi(sourceMidiFloat, allowedPitchClasses);
    const rawCorrectionCents = (nearestMidi - sourceMidiFloat) * 100;
    const withinTolerance = Math.abs(rawCorrectionCents) <= preserve;
    const eligible = confidence >= minimumConfidence && !withinTolerance;
    const limitedCorrectionCents = clamp(rawCorrectionCents, -maxCorrection, maxCorrection, 0);
    const proposedCorrectionCents = eligible ? limitedCorrectionCents * strength : 0;
    segments.push({
      id: `tune-${segments.length + 1}`,
      start_seconds: Math.max(0, finite(source.start_seconds, 0)),
      end_seconds: Math.max(finite(source.start_seconds, 0), finite(source.end_seconds, 0)),
      duration_seconds: Math.max(0, finite(source.duration_seconds, finite(source.end_seconds, 0) - finite(source.start_seconds, 0))),
      source_note: text(source.note) || midiName(source.midi),
      source_midi: finite(source.midi, 0),
      source_mean_cents_deviation: Math.round(finite(source.mean_cents_deviation, 0) * 10) / 10,
      source_pitch_midi_float: Math.round(sourceMidiFloat * 10000) / 10000,
      target_note: midiName(nearestMidi),
      target_midi: nearestMidi,
      raw_correction_cents: Math.round(rawCorrectionCents * 10) / 10,
      proposed_correction_cents: Math.round(proposedCorrectionCents * 10) / 10,
      correction_ratio: 2 ** (proposedCorrectionCents / 1200),
      confidence,
      eligible,
      preserved_within_tolerance: withinTolerance,
      limited_by_max_correction: Math.abs(rawCorrectionCents) > maxCorrection,
      approved: false,
      musician_target_override: false,
    });
  }

  return {
    contract: CONTRACT,
    source_pitch_contract: pitch_analysis.contract,
    source_checksum: pitch_analysis.source_checksum || null,
    musical_key: { key, mode, label: musical_key?.label || `${key} ${mode}` },
    allowed_pitch_classes: allowedPitchClasses.map((pitchClass) => NOTE_NAMES[pitchClass]),
    settings: {
      correction_strength: strength,
      preserve_within_cents: preserve,
      max_correction_cents: maxCorrection,
      minimum_segment_confidence: minimumConfidence,
    },
    segments,
    correction_segment_count: segments.filter((segment) => Math.abs(segment.proposed_correction_cents) > 0.01).length,
    review_required: true,
    musician_approval_required: true,
    auto_apply_forbidden: true,
    render_ready: false,
    render_blocker: "FORMANT_PRESERVING_TUNING_ENGINE_NOT_CERTIFIED",
    required_render_capability: "creative.music.vocal_tune.render",
    formant_preservation_required: true,
    dynamic_pitch_consistency_required: true,
    original_source_must_be_preserved: true,
    correction_applied: false,
    provider_job_submitted: false,
  };
}

export function approveMusicVocalTuningSegment(plan = {}, segmentId, input = {}) {
  if (plan.contract !== CONTRACT || plan.auto_apply_forbidden !== true) throw new Error("CREATIVE_MUSIC_VOCAL_TUNING_PLAN_INVALID");
  const next = structuredClone(plan);
  const segment = next.segments.find((entry) => entry.id === segmentId);
  if (!segment) throw new Error("CREATIVE_MUSIC_VOCAL_TUNING_SEGMENT_NOT_FOUND");
  if (input.target_midi !== undefined && input.target_midi !== null) {
    const targetMidi = Math.round(clamp(input.target_midi, 12, 120, segment.target_midi));
    const sourceMidi = finite(segment.source_pitch_midi_float, segment.source_midi);
    const rawCents = (targetMidi - sourceMidi) * 100;
    const limited = clamp(rawCents, -next.settings.max_correction_cents, next.settings.max_correction_cents, 0);
    segment.target_midi = targetMidi;
    segment.target_note = midiName(targetMidi);
    segment.raw_correction_cents = Math.round(rawCents * 10) / 10;
    segment.proposed_correction_cents = Math.round((limited * next.settings.correction_strength) * 10) / 10;
    segment.correction_ratio = 2 ** (segment.proposed_correction_cents / 1200);
    segment.musician_target_override = true;
  }
  segment.approved = input.approved !== false;
  next.reviewed_segment_count = next.segments.filter((entry) => entry.approved).length;
  next.all_segments_reviewed = next.segments.every((entry) => entry.approved || Math.abs(entry.proposed_correction_cents) <= 0.01);
  next.render_ready = false;
  next.correction_applied = false;
  return next;
}

export const CreativeMusicVocalTuningPlanRuntime = {
  contract: CONTRACT,
  build: buildMusicVocalTuningPlan,
  approveSegment: approveMusicVocalTuningSegment,
};
