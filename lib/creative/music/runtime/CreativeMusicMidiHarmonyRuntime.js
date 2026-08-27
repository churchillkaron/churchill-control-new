const CONTRACT = "AVANTIQO_MUSIC_MIDI_HARMONY_V1";

const NOTE_NAMES = Object.freeze(["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]);
const NOTE_INDEX = Object.freeze({ C:0, "C#":1, DB:1, D:2, "D#":3, EB:3, E:4, F:5, "F#":6, GB:6, G:7, "G#":8, AB:8, A:9, "A#":10, BB:10, B:11 });
const MODES = Object.freeze({
  major: [0,2,4,5,7,9,11],
  minor: [0,2,3,5,7,8,10],
  dorian: [0,2,3,5,7,9,10],
  mixolydian: [0,2,4,5,7,9,10],
  pentatonic_major: [0,2,4,7,9],
  pentatonic_minor: [0,3,5,7,10],
});

function text(value) { return String(value ?? "").trim(); }
function finite(value, fallback = 0) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }
function clamp(value, min, max, fallback = min) { return Math.max(min, Math.min(max, finite(value, fallback))); }

function rootIndex(root) {
  const key = text(root || "C").toUpperCase();
  if (NOTE_INDEX[key] === undefined) throw new Error("CREATIVE_MUSIC_MIDI_HARMONY_ROOT_INVALID");
  return NOTE_INDEX[key];
}

export function musicMidiScale({ root = "C", mode = "major" } = {}) {
  const normalizedMode = text(mode).toLowerCase();
  const intervals = MODES[normalizedMode];
  if (!intervals) throw new Error("CREATIVE_MUSIC_MIDI_HARMONY_MODE_INVALID");
  const rootPc = rootIndex(root);
  return {
    contract: CONTRACT,
    root: NOTE_NAMES[rootPc],
    root_pitch_class: rootPc,
    mode: normalizedMode,
    intervals: [...intervals],
    pitch_classes: intervals.map((interval) => (rootPc + interval) % 12),
    note_names: intervals.map((interval) => NOTE_NAMES[(rootPc + interval) % 12]),
  };
}

function degreePitchClass(scale, degree) {
  const index = Math.max(0, Math.min(scale.pitch_classes.length - 1, Math.round(finite(degree, 1)) - 1));
  return scale.pitch_classes[index];
}

function scaleStepPitch(scale, degreeIndex, octave = 4) {
  const length = scale.pitch_classes.length;
  const wrapped = ((degreeIndex % length) + length) % length;
  const octaveOffset = Math.floor(degreeIndex / length);
  const pitchClass = scale.pitch_classes[wrapped];
  const base = 12 * (Math.round(clamp(octave, -1, 9, 4)) + 1);
  let midi = base + pitchClass + octaveOffset * 12;
  while (midi < 0) midi += 12;
  while (midi > 127) midi -= 12;
  return midi;
}

export function musicMidiChord({ root = "C", mode = "major", degree = 1, octave = 4, extension = "triad", inversion = 0, spread = 0 } = {}) {
  const scale = musicMidiScale({ root, mode });
  const degreeIndex = Math.max(0, Math.round(finite(degree, 1)) - 1);
  const chordSteps = text(extension).toLowerCase() === "seventh" ? [0,2,4,6] : [0,2,4];
  let pitches = chordSteps.map((step) => scaleStepPitch(scale, degreeIndex + step, octave));
  const inversions = Math.max(0, Math.min(pitches.length - 1, Math.round(finite(inversion, 0))));
  for (let index = 0; index < inversions; index += 1) pitches[index] += 12;
  pitches.sort((a,b) => a-b);
  const spreadValue = Math.max(0, Math.min(2, Math.round(finite(spread,0))));
  if (spreadValue >= 1 && pitches.length >= 3) pitches[pitches.length - 1] = Math.min(127,pitches[pitches.length - 1]+12);
  if (spreadValue >= 2 && pitches.length >= 4) pitches[pitches.length - 2] = Math.min(127,pitches[pitches.length - 2]+12);
  pitches.sort((a,b) => a-b);
  const chordRootPc = degreePitchClass(scale, degree);
  return {
    contract: CONTRACT,
    scale,
    degree: degreeIndex + 1,
    root_pitch_class: chordRootPc,
    root_note: NOTE_NAMES[chordRootPc],
    extension: chordSteps.length === 4 ? "seventh" : "triad",
    inversion: inversions,
    spread: spreadValue,
    pitches,
    note_names: pitches.map((pitch) => `${NOTE_NAMES[pitch % 12]}${Math.floor(pitch / 12) - 1}`),
  };
}

export function buildMusicMidiProgression(input = {}) {
  const degrees = Array.isArray(input.degrees) && input.degrees.length ? input.degrees : [1,5,6,4];
  if (degrees.length > 64) throw new Error("CREATIVE_MUSIC_MIDI_HARMONY_PROGRESSION_LIMIT_EXCEEDED");
  const chordBeats = clamp(input.chord_beats, 0.125, 32, 4);
  const startBeat = Math.max(0, finite(input.start_beat,0));
  const velocity = Math.round(clamp(input.velocity,1,127,96));
  const chords = degrees.map((degree,index) => ({
    ...musicMidiChord({ root:input.root, mode:input.mode, degree, octave:input.octave, extension:input.extension, inversion:input.inversion, spread:input.spread }),
    start_beat: startBeat + index * chordBeats,
    duration_beats: chordBeats,
    velocity,
  }));
  return {
    contract: CONTRACT,
    type: "PROGRESSION",
    chords,
    degrees: degrees.map((value) => Math.round(finite(value,1))),
    start_beat: startBeat,
    chord_beats: chordBeats,
    duration_beats: chordBeats * chords.length,
    editable_midi: true,
    provider_job_submitted: false,
  };
}

export function snapMidiPitchToScale(pitch, scaleInput = {}) {
  const scale = musicMidiScale(scaleInput);
  const midi = Math.round(clamp(pitch,0,127,60));
  if (scale.pitch_classes.includes(midi % 12)) return midi;
  for (let distance = 1; distance <= 6; distance += 1) {
    const down = midi - distance;
    const up = midi + distance;
    if (down >= 0 && scale.pitch_classes.includes(down % 12)) return down;
    if (up <= 127 && scale.pitch_classes.includes(up % 12)) return up;
  }
  return midi;
}

export const CreativeMusicMidiHarmonyRuntime = {
  contract: CONTRACT,
  modes: Object.keys(MODES),
  scale: musicMidiScale,
  chord: musicMidiChord,
  progression: buildMusicMidiProgression,
  snapPitchToScale: snapMidiPitchToScale,
};
