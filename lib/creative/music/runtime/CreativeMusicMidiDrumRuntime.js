const CONTRACT = "AVANTIQO_MUSIC_MIDI_DRUM_PATTERN_V1";

export const MUSIC_MIDI_DRUM_LANES = Object.freeze([
  { id: "kick", label: "Kick", midi: 36 },
  { id: "snare", label: "Snare", midi: 38 },
  { id: "clap", label: "Clap", midi: 39 },
  { id: "closed_hat", label: "Closed Hat", midi: 42 },
  { id: "open_hat", label: "Open Hat", midi: 46 },
  { id: "low_tom", label: "Low Tom", midi: 45 },
  { id: "mid_tom", label: "Mid Tom", midi: 47 },
  { id: "high_tom", label: "High Tom", midi: 50 },
  { id: "crash", label: "Crash", midi: 49 },
  { id: "ride", label: "Ride", midi: 51 },
]);

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max, fallback = min) {
  return Math.max(min, Math.min(max, finite(value, fallback)));
}

function laneById(id) {
  return MUSIC_MIDI_DRUM_LANES.find((lane) => lane.id === String(id || "").trim()) || null;
}

export function createMusicMidiDrumPattern(input = {}) {
  const steps = Math.round(clamp(input.steps, 4, 64, 16));
  const beatsPerBar = clamp(input.beats_per_bar, 1, 16, 4);
  return {
    contract: CONTRACT,
    steps,
    bars: clamp(input.bars, 1, 8, 1),
    beats_per_bar: beatsPerBar,
    step_beats: beatsPerBar / steps,
    swing: clamp(input.swing, 0, 0.75, 0),
    default_velocity: Math.round(clamp(input.default_velocity, 1, 127, 104)),
    hits: [],
    non_destructive: true,
    midi_output: true,
    provider_job_submitted: false,
  };
}

export function normalizeMusicMidiDrumPattern(input = {}) {
  const pattern = input?.contract === CONTRACT ? structuredClone(input) : createMusicMidiDrumPattern(input);
  pattern.steps = Math.round(clamp(pattern.steps, 4, 64, 16));
  pattern.bars = Math.round(clamp(pattern.bars, 1, 8, 1));
  pattern.beats_per_bar = clamp(pattern.beats_per_bar, 1, 16, 4);
  pattern.step_beats = pattern.beats_per_bar / pattern.steps;
  pattern.swing = clamp(pattern.swing, 0, 0.75, 0);
  pattern.default_velocity = Math.round(clamp(pattern.default_velocity, 1, 127, 104));
  pattern.hits = Array.isArray(pattern.hits) ? pattern.hits : [];
  pattern.non_destructive = true;
  pattern.midi_output = true;
  pattern.provider_job_submitted = false;
  validateMusicMidiDrumPattern(pattern);
  return pattern;
}

export function toggleMusicMidiDrumHit(patternInput, { lane_id, step, velocity } = {}) {
  const pattern = normalizeMusicMidiDrumPattern(patternInput);
  const lane = laneById(lane_id);
  if (!lane) throw new Error("CREATIVE_MUSIC_MIDI_DRUM_LANE_INVALID");
  const stepIndex = Math.round(finite(step, -1));
  if (stepIndex < 0 || stepIndex >= pattern.steps * pattern.bars) throw new Error("CREATIVE_MUSIC_MIDI_DRUM_STEP_INVALID");
  const existing = pattern.hits.findIndex((hit) => hit.lane_id === lane.id && hit.step === stepIndex);
  if (existing >= 0) {
    pattern.hits.splice(existing, 1);
  } else {
    pattern.hits.push({
      lane_id: lane.id,
      midi: lane.midi,
      step: stepIndex,
      velocity: Math.round(clamp(velocity, 1, 127, pattern.default_velocity)),
      probability: 1,
    });
  }
  pattern.hits.sort((a, b) => a.step - b.step || a.midi - b.midi);
  return pattern;
}

export function musicMidiDrumPatternToNotes(patternInput) {
  const pattern = normalizeMusicMidiDrumPattern(patternInput);
  const barSteps = pattern.steps;
  return pattern.hits.map((hit, index) => {
    const lane = laneById(hit.lane_id);
    if (!lane) throw new Error("CREATIVE_MUSIC_MIDI_DRUM_HIT_LANE_INVALID");
    const stepInBar = hit.step % barSteps;
    const barIndex = Math.floor(hit.step / barSteps);
    const swingOffset = stepInBar % 2 === 1 ? pattern.step_beats * pattern.swing : 0;
    const startBeat = barIndex * pattern.beats_per_bar + stepInBar * pattern.step_beats + swingOffset;
    return {
      id: `drum-${lane.id}-${hit.step}-${index}`,
      pitch: lane.midi,
      start_beat: Math.round(startBeat * 1e6) / 1e6,
      duration_beats: Math.max(0.03125, pattern.step_beats * 0.8),
      velocity: Math.round(clamp(hit.velocity, 1, 127, pattern.default_velocity)),
      release_velocity: 64,
      muted: false,
      drum_lane_id: lane.id,
      generated_from_drum_pattern: true,
    };
  });
}

export function validateMusicMidiDrumPattern(pattern = {}) {
  if (pattern.contract !== CONTRACT) throw new Error("CREATIVE_MUSIC_MIDI_DRUM_PATTERN_CONTRACT_INVALID");
  if (pattern.non_destructive !== true || pattern.midi_output !== true) throw new Error("CREATIVE_MUSIC_MIDI_DRUM_PATTERN_GOVERNANCE_INVALID");
  if (!Array.isArray(pattern.hits) || pattern.hits.length > 2048) throw new Error("CREATIVE_MUSIC_MIDI_DRUM_HIT_LIMIT_INVALID");
  const maxStep = Math.round(clamp(pattern.steps, 4, 64, 16)) * Math.round(clamp(pattern.bars, 1, 8, 1));
  const seen = new Set();
  for (const hit of pattern.hits) {
    const lane = laneById(hit.lane_id);
    if (!lane || lane.midi !== Math.round(finite(hit.midi, -1))) throw new Error("CREATIVE_MUSIC_MIDI_DRUM_HIT_LANE_INVALID");
    const step = Math.round(finite(hit.step, -1));
    if (step < 0 || step >= maxStep) throw new Error("CREATIVE_MUSIC_MIDI_DRUM_HIT_STEP_INVALID");
    const key = `${lane.id}:${step}`;
    if (seen.has(key)) throw new Error("CREATIVE_MUSIC_MIDI_DRUM_DUPLICATE_HIT");
    seen.add(key);
  }
  return {
    success: true,
    contract: "AVANTIQO_MUSIC_MIDI_DRUM_PATTERN_VALIDATION_V1",
    hit_count: pattern.hits.length,
    midi_output: true,
    provider_job_submitted: false,
  };
}

export const CreativeMusicMidiDrumRuntime = {
  contract: CONTRACT,
  lanes: MUSIC_MIDI_DRUM_LANES,
  create: createMusicMidiDrumPattern,
  normalize: normalizeMusicMidiDrumPattern,
  toggleHit: toggleMusicMidiDrumHit,
  toNotes: musicMidiDrumPatternToNotes,
  validate: validateMusicMidiDrumPattern,
};
