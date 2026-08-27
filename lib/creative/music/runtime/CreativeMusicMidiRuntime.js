const CONTRACT = "AVANTIQO_MUSIC_MIDI_PROJECT_V1";
const TRACK_CONTRACT = "AVANTIQO_MUSIC_MIDI_TRACK_V1";
const CLIP_CONTRACT = "AVANTIQO_MUSIC_MIDI_CLIP_V1";
const NOTE_CONTRACT = "AVANTIQO_MUSIC_MIDI_NOTE_V1";
const EVENT_CONTRACT = "AVANTIQO_MUSIC_MIDI_CONTROL_EVENT_V1";

const EVENT_TYPES = Object.freeze([
  "sustain",
  "pitch_bend",
  "modulation",
  "expression",
  "channel_pressure",
  "control_change",
]);
const QUANTIZE_DIVISIONS = Object.freeze(["off", "1/1", "1/2", "1/4", "1/8", "1/16", "1/32"]);

function text(value) { return String(value ?? "").trim(); }
function finite(value, fallback = 0) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }
function clamp(value, min, max, fallback = 0) { return Math.max(min, Math.min(max, finite(value, fallback))); }
function id(value, prefix) { return text(value) || `${prefix}-${crypto.randomUUID()}`; }

function beatsPerBar(timeSignature = "4/4") {
  const [numeratorRaw, denominatorRaw] = text(timeSignature || "4/4").split("/");
  const numerator = finite(numeratorRaw, 4);
  const denominator = finite(denominatorRaw, 4);
  return numerator * (4 / denominator);
}

function beatSeconds(bpm) {
  return 60 / clamp(bpm, 30, 300, 120);
}

function quantizeStepBeats(division) {
  const value = text(division || "off").toLowerCase();
  if (value === "off") return null;
  const match = value.match(/^1\/(1|2|4|8|16|32)$/);
  if (!match) throw new Error("CREATIVE_MUSIC_MIDI_QUANTIZE_DIVISION_INVALID");
  return 4 / Number(match[1]);
}

function noteName(midi) {
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const pitch = Math.round(clamp(midi, 0, 127, 60));
  return `${names[pitch % 12]}${Math.floor(pitch / 12) - 1}`;
}

export function createMusicMidiProject(input = {}) {
  return {
    contract: CONTRACT,
    ppq: Math.round(clamp(input.ppq, 96, 3840, 960)),
    tracks: [],
    input: {
      web_midi_supported: input.web_midi_supported === true,
      selected_input_id: text(input.selected_input_id) || null,
      input_channel: Math.round(clamp(input.input_channel, 1, 16, 1)),
      record_velocity: input.record_velocity !== false,
      record_sustain: input.record_sustain !== false,
      record_pitch_bend: input.record_pitch_bend !== false,
      record_modulation: input.record_modulation !== false,
    },
    editor: {
      quantize_division: QUANTIZE_DIVISIONS.includes(text(input.quantize_division)) ? text(input.quantize_division) : "1/16",
      quantize_strength: clamp(input.quantize_strength, 0, 1, 1),
      default_note_length_beats: clamp(input.default_note_length_beats, 0.03125, 16, 1),
      velocity_default: Math.round(clamp(input.velocity_default, 1, 127, 100)),
      scale_lock: null,
    },
    non_destructive_editing: true,
    original_performance_preserved: true,
    provider_job_submitted: false,
  };
}

export function ensureMusicMidiProject(value = {}) {
  const source = value?.contract === CONTRACT ? structuredClone(value) : createMusicMidiProject(value);
  if (!Array.isArray(source.tracks)) source.tracks = [];
  source.non_destructive_editing = true;
  source.original_performance_preserved = true;
  source.provider_job_submitted = false;
  return source;
}

export function createMusicMidiTrack(input = {}) {
  return {
    contract: TRACK_CONTRACT,
    id: id(input.id, "midi-track"),
    name: text(input.name || "MIDI Instrument").slice(0, 120),
    midi_channel: Math.round(clamp(input.midi_channel, 1, 16, 1)),
    armed: input.armed === true,
    mute: input.mute === true,
    solo: input.solo === true,
    gain_db: clamp(input.gain_db, -60, 12, 0),
    pan: clamp(input.pan, -1, 1, 0),
    instrument: {
      kind: text(input.instrument?.kind || "unassigned"),
      instrument_id: text(input.instrument?.instrument_id) || null,
      preset_id: text(input.instrument?.preset_id) || null,
      owned_instrument_required: true,
      external_plugin_hosted: false,
    },
    clips: [],
    automation_lane_ids: [],
  };
}

export function createMusicMidiClip(input = {}) {
  const durationBeats = clamp(input.duration_beats, 0.03125, 100000, 4);
  return {
    contract: CLIP_CONTRACT,
    id: id(input.id, "midi-clip"),
    name: text(input.name || "MIDI Clip").slice(0, 120),
    start_beat: Math.max(0, finite(input.start_beat, 0)),
    duration_beats: durationBeats,
    loop_enabled: input.loop_enabled === true,
    loop_length_beats: input.loop_enabled === true ? clamp(input.loop_length_beats, 0.03125, durationBeats, durationBeats) : null,
    notes: [],
    control_events: [],
    original_performance: {
      notes: [],
      control_events: [],
      immutable: true,
    },
    destructive_edit: false,
  };
}

export function createMusicMidiNote(input = {}) {
  const pitch = Math.round(clamp(input.pitch, 0, 127, 60));
  const startBeat = Math.max(0, finite(input.start_beat, 0));
  const durationBeats = clamp(input.duration_beats, 0.001, 1024, 1);
  return {
    contract: NOTE_CONTRACT,
    id: id(input.id, "midi-note"),
    pitch,
    note_name: noteName(pitch),
    start_beat: startBeat,
    duration_beats: durationBeats,
    velocity: Math.round(clamp(input.velocity, 1, 127, 100)),
    release_velocity: Math.round(clamp(input.release_velocity, 0, 127, 64)),
    muted: input.muted === true,
    source_start_beat: finite(input.source_start_beat, startBeat),
    source_duration_beats: finite(input.source_duration_beats, durationBeats),
  };
}

export function createMusicMidiControlEvent(input = {}) {
  const type = text(input.type).toLowerCase();
  if (!EVENT_TYPES.includes(type)) throw new Error(`CREATIVE_MUSIC_MIDI_EVENT_TYPE_INVALID:${type}`);
  return {
    contract: EVENT_CONTRACT,
    id: id(input.id, "midi-event"),
    type,
    beat: Math.max(0, finite(input.beat, 0)),
    value: type === "pitch_bend"
      ? Math.round(clamp(input.value, -8192, 8191, 0))
      : Math.round(clamp(input.value, 0, 127, 0)),
    controller: type === "control_change" ? Math.round(clamp(input.controller, 0, 127, 1)) : null,
    source_beat: Math.max(0, finite(input.source_beat, input.beat)),
  };
}

export function quantizeMusicMidiClip(clip = {}, input = {}) {
  if (clip.contract !== CLIP_CONTRACT) throw new Error("CREATIVE_MUSIC_MIDI_CLIP_CONTRACT_INVALID");
  const division = text(input.division || "1/16").toLowerCase();
  if (!QUANTIZE_DIVISIONS.includes(division)) throw new Error("CREATIVE_MUSIC_MIDI_QUANTIZE_DIVISION_INVALID");
  const step = quantizeStepBeats(division);
  if (step === null) return structuredClone(clip);
  const strength = clamp(input.strength, 0, 1, 1);
  const quantizeDuration = input.quantize_duration === true;
  const next = structuredClone(clip);
  next.notes = (next.notes || []).map((note) => {
    const sourceStart = finite(note.start_beat, 0);
    const targetStart = Math.round(sourceStart / step) * step;
    const startBeat = sourceStart + (targetStart - sourceStart) * strength;
    const sourceDuration = finite(note.duration_beats, step);
    const targetDuration = Math.max(step, Math.round(sourceDuration / step) * step);
    return {
      ...note,
      source_start_beat: finite(note.source_start_beat, sourceStart),
      source_duration_beats: finite(note.source_duration_beats, sourceDuration),
      start_beat: Math.round(startBeat * 1e6) / 1e6,
      duration_beats: quantizeDuration
        ? Math.round((sourceDuration + (targetDuration - sourceDuration) * strength) * 1e6) / 1e6
        : sourceDuration,
    };
  });
  next.quantization = {
    division,
    strength,
    quantize_duration: quantizeDuration,
    reversible: true,
    original_performance_preserved: true,
  };
  return next;
}

export function transposeMusicMidiClip(clip = {}, semitones = 0) {
  if (clip.contract !== CLIP_CONTRACT) throw new Error("CREATIVE_MUSIC_MIDI_CLIP_CONTRACT_INVALID");
  const shift = Math.round(clamp(semitones, -48, 48, 0));
  const next = structuredClone(clip);
  next.notes = (next.notes || []).map((note) => {
    const pitch = Math.round(clamp(finite(note.pitch, 60) + shift, 0, 127, 60));
    return { ...note, pitch, note_name: noteName(pitch) };
  });
  next.transpose_semitones = Math.round(finite(next.transpose_semitones, 0)) + shift;
  return next;
}

export function restoreMusicMidiOriginalPerformance(clip = {}) {
  if (clip.contract !== CLIP_CONTRACT) throw new Error("CREATIVE_MUSIC_MIDI_CLIP_CONTRACT_INVALID");
  const original = objectOriginal(clip.original_performance);
  const next = structuredClone(clip);
  next.notes = structuredClone(original.notes);
  next.control_events = structuredClone(original.control_events);
  delete next.quantization;
  next.transpose_semitones = 0;
  return next;
}

function objectOriginal(value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    notes: Array.isArray(source.notes) ? source.notes : [],
    control_events: Array.isArray(source.control_events) ? source.control_events : [],
  };
}

export function captureMusicMidiOriginalPerformance(clip = {}) {
  if (clip.contract !== CLIP_CONTRACT) throw new Error("CREATIVE_MUSIC_MIDI_CLIP_CONTRACT_INVALID");
  const next = structuredClone(clip);
  const original = objectOriginal(next.original_performance);
  if (original.notes.length || original.control_events.length) return next;
  next.original_performance = {
    notes: structuredClone(next.notes || []),
    control_events: structuredClone(next.control_events || []),
    immutable: true,
    captured_at: new Date().toISOString(),
  };
  return next;
}

export function musicMidiBeatToSeconds(beat, bpm) {
  return Math.max(0, finite(beat, 0)) * beatSeconds(bpm);
}

export function musicMidiBarBeat({ beat = 0, timeSignature = "4/4" } = {}) {
  const perBar = beatsPerBar(timeSignature);
  const value = Math.max(0, finite(beat, 0));
  return {
    bar: Math.floor(value / perBar) + 1,
    beat: Math.floor(value % perBar) + 1,
    beat_fraction: value % 1,
  };
}

export function validateMusicMidiProject(project = {}) {
  if (project.contract !== CONTRACT) throw new Error("CREATIVE_MUSIC_MIDI_PROJECT_CONTRACT_INVALID");
  if (project.non_destructive_editing !== true || project.original_performance_preserved !== true) throw new Error("CREATIVE_MUSIC_MIDI_NON_DESTRUCTIVE_REQUIRED");
  if (!Array.isArray(project.tracks) || project.tracks.length > 128) throw new Error("CREATIVE_MUSIC_MIDI_TRACK_LIMIT_INVALID");
  let clipCount = 0;
  let noteCount = 0;
  const trackIds = new Set();
  for (const track of project.tracks) {
    if (track.contract !== TRACK_CONTRACT || !track.id || trackIds.has(track.id)) throw new Error("CREATIVE_MUSIC_MIDI_TRACK_INVALID");
    trackIds.add(track.id);
    for (const clip of track.clips || []) {
      clipCount += 1;
      if (clipCount > 2048 || clip.contract !== CLIP_CONTRACT || clip.destructive_edit === true) throw new Error("CREATIVE_MUSIC_MIDI_CLIP_INVALID");
      if (clip.original_performance?.immutable !== true) throw new Error("CREATIVE_MUSIC_MIDI_ORIGINAL_PERFORMANCE_REQUIRED");
      for (const note of clip.notes || []) {
        noteCount += 1;
        if (noteCount > 100000 || note.contract !== NOTE_CONTRACT || finite(note.duration_beats, 0) <= 0) throw new Error("CREATIVE_MUSIC_MIDI_NOTE_INVALID");
      }
      for (const event of clip.control_events || []) {
        if (event.contract !== EVENT_CONTRACT || !EVENT_TYPES.includes(text(event.type))) throw new Error("CREATIVE_MUSIC_MIDI_CONTROL_EVENT_INVALID");
      }
    }
  }
  return {
    success: true,
    contract: "AVANTIQO_MUSIC_MIDI_VALIDATION_V1",
    track_count: trackIds.size,
    clip_count: clipCount,
    note_count: noteCount,
    original_performance_preserved: true,
    provider_job_submitted: false,
  };
}

export const CreativeMusicMidiRuntime = {
  contract: CONTRACT,
  trackContract: TRACK_CONTRACT,
  clipContract: CLIP_CONTRACT,
  noteContract: NOTE_CONTRACT,
  eventContract: EVENT_CONTRACT,
  eventTypes: EVENT_TYPES,
  quantizeDivisions: QUANTIZE_DIVISIONS,
  createProject: createMusicMidiProject,
  ensureProject: ensureMusicMidiProject,
  createTrack: createMusicMidiTrack,
  createClip: createMusicMidiClip,
  createNote: createMusicMidiNote,
  createControlEvent: createMusicMidiControlEvent,
  quantizeClip: quantizeMusicMidiClip,
  transposeClip: transposeMusicMidiClip,
  captureOriginalPerformance: captureMusicMidiOriginalPerformance,
  restoreOriginalPerformance: restoreMusicMidiOriginalPerformance,
  beatToSeconds: musicMidiBeatToSeconds,
  barBeat: musicMidiBarBeat,
  validate: validateMusicMidiProject,
};
