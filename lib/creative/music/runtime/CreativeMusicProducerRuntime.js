const CONTRACT = "AVANTIQO_MUSIC_PRODUCER_PLAN_V1";
const SNAPSHOT_CONTRACT = "AVANTIQO_MUSIC_PRODUCER_SNAPSHOT_V1";

function finite(value, fallback = 0) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }
function text(value) { return String(value ?? "").trim(); }

function countAudioClips(session = {}) {
  return (session.tracks || []).reduce((sum, track) => sum + (track.clips || []).length, 0);
}

function countMidiClips(session = {}) {
  return (session.midi?.tracks || []).reduce((sum, track) => sum + (track.clips || []).length, 0);
}

function countMidiNotes(session = {}) {
  return (session.midi?.tracks || []).reduce((sum, track) => sum + (track.clips || []).reduce((clipSum, clip) => clipSum + (clip.notes || []).length, 0), 0);
}

function hasMelodicMidi(session = {}) {
  return (session.midi?.tracks || []).some((track) => track.midi_channel !== 10 && track.instrument?.kind !== "drum_machine");
}

function hasDrumMidi(session = {}) {
  return (session.midi?.tracks || []).some((track) => track.midi_channel === 10 || track.instrument?.kind === "drum_machine");
}

export function analyzeMusicProducerProject({ session = {}, arrangement = {}, sampler = {} } = {}) {
  const sections = arrangement.sections || [];
  const audioTrackCount = (session.tracks || []).length;
  const audioClipCount = countAudioClips(session);
  const midiTrackCount = (session.midi?.tracks || []).length;
  const midiClipCount = countMidiClips(session);
  const midiNoteCount = countMidiNotes(session);
  const issues = [];
  const proposals = [];

  if (!sections.length) {
    issues.push({ code: "SONG_STRUCTURE_MISSING", severity: "HIGH", message: "The project has no explicit song sections." });
    proposals.push({ id: "build_structure", action: "BUILD_STANDARD_STRUCTURE", label: "Build song structure", reversible: true });
  }
  if (!hasMelodicMidi(session)) {
    issues.push({ code: "MELODIC_MIDI_FOUNDATION_MISSING", severity: "MEDIUM", message: "No melodic MIDI instrument track exists yet." });
    proposals.push({ id: "create_harmony_track", action: "CREATE_HARMONY_MIDI_FOUNDATION", label: "Create harmony MIDI track", reversible: true });
  }
  if (!hasDrumMidi(session)) {
    issues.push({ code: "DRUM_MIDI_FOUNDATION_MISSING", severity: "MEDIUM", message: "No MIDI drum-machine track exists yet." });
    proposals.push({ id: "create_drum_track", action: "CREATE_DRUM_MIDI_FOUNDATION", label: "Create drum MIDI track", reversible: true });
  }
  if (!audioClipCount && !midiNoteCount) {
    issues.push({ code: "PROJECT_HAS_NO_MUSICAL_MATERIAL", severity: "HIGH", message: "No recorded/audio clips or MIDI notes are present." });
  }
  if (audioTrackCount && (session.tracks || []).some((track) => track.solo === true)) {
    issues.push({ code: "SOLO_STATE_ACTIVE", severity: "LOW", message: "One or more tracks remain soloed; release rendering should be checked intentionally." });
  }
  const assignedSamples = new Set((sampler.kits || []).flatMap((kit) => (kit.pads || []).map((pad) => pad.sample_asset_id).filter(Boolean))).size;
  if (hasDrumMidi(session) && assignedSamples === 0) {
    issues.push({ code: "DRUM_SAMPLES_UNASSIGNED", severity: "MEDIUM", message: "A drum MIDI foundation exists but the owned sampler has no real samples assigned." });
  }

  return {
    contract: CONTRACT,
    generated_at: new Date().toISOString(),
    planner_kind: "PROJECT_AWARE_DETERMINISTIC_FOUNDATION",
    owned_intelligence_inference_claimed: false,
    project_state: {
      bpm: finite(session.bpm, 0),
      time_signature: text(session.time_signature || "4/4"),
      audio_track_count: audioTrackCount,
      audio_clip_count: audioClipCount,
      midi_track_count: midiTrackCount,
      midi_clip_count: midiClipCount,
      midi_note_count: midiNoteCount,
      arrangement_section_count: sections.length,
      assigned_sampler_asset_count: assignedSamples,
    },
    issues,
    proposals,
    proposed_action_count: proposals.length,
    automatic_audio_render_forbidden: true,
    provider_job_submitted: false,
  };
}

export function createMusicProducerSnapshot({ session, arrangement, sampler, action } = {}) {
  return {
    contract: SNAPSHOT_CONTRACT,
    id: `music-producer-snapshot-${crypto.randomUUID()}`,
    created_at: new Date().toISOString(),
    action: text(action),
    session: structuredClone(session || null),
    arrangement: structuredClone(arrangement || null),
    sampler: structuredClone(sampler || null),
    immutable: true,
    reversible: true,
  };
}

export function validateMusicProducerSnapshot(snapshot = {}) {
  if (snapshot.contract !== SNAPSHOT_CONTRACT || snapshot.immutable !== true || snapshot.reversible !== true || !snapshot.id) {
    throw new Error("CREATIVE_MUSIC_PRODUCER_SNAPSHOT_INVALID");
  }
  return { success: true, contract: "AVANTIQO_MUSIC_PRODUCER_SNAPSHOT_VALIDATION_V1" };
}

export const CreativeMusicProducerRuntime = {
  contract: CONTRACT,
  snapshotContract: SNAPSHOT_CONTRACT,
  analyze: analyzeMusicProducerProject,
  snapshot: createMusicProducerSnapshot,
  validateSnapshot: validateMusicProducerSnapshot,
};
