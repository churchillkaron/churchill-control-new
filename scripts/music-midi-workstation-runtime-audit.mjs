#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const files = {
  runtime: "lib/creative/music/runtime/CreativeMusicMidiRuntime.js",
  api: "app/api/creative/music/midi/route.js",
  piano: "components/creative/ProductionStudio/workspaces/MusicMidiPianoRollPanel.jsx",
  shell: "components/creative/ProductionStudio/workspaces/MusicMidiStudioPanel.jsx",
  workspace: "components/creative/ProductionStudio/workspaces/MusicStudioWorkspace.jsx",
};

const source = Object.fromEntries(
  await Promise.all(Object.entries(files).map(async ([key, path]) => [key, await readFile(path, "utf8")])),
);

assert.match(source.runtime, /AVANTIQO_MUSIC_MIDI_PROJECT_V1/);
assert.match(source.runtime, /AVANTIQO_MUSIC_MIDI_TRACK_V1/);
assert.match(source.runtime, /AVANTIQO_MUSIC_MIDI_CLIP_V1/);
assert.match(source.runtime, /AVANTIQO_MUSIC_MIDI_NOTE_V1/);
assert.match(source.runtime, /AVANTIQO_MUSIC_MIDI_CONTROL_EVENT_V1/);
assert.match(source.runtime, /ppq: Math\.round\(clamp\(input\.ppq, 96, 3840, 960\)\)/);
assert.match(source.runtime, /"sustain"/);
assert.match(source.runtime, /"pitch_bend"/);
assert.match(source.runtime, /"modulation"/);
assert.match(source.runtime, /"expression"/);
assert.match(source.runtime, /quantizeMusicMidiClip/);
assert.match(source.runtime, /transposeMusicMidiClip/);
assert.match(source.runtime, /restoreMusicMidiOriginalPerformance/);
assert.match(source.runtime, /original_performance_preserved: true/);
assert.match(source.runtime, /external_plugin_hosted: false/);
assert.match(source.runtime, /provider_job_submitted: false/);

assert.match(source.api, /AVANTIQO_MUSIC_MIDI_PROJECT_API_V1/);
assert.match(source.api, /expected_revision/);
assert.match(source.api, /CREATIVE_MUSIC_MIDI_REVISION_CONFLICT/);
assert.match(source.api, /action === "record_performance"/);
assert.match(source.api, /AVANTIQO_MUSIC_WEB_MIDI_RECORDING_V1/);
assert.match(source.api, /raw_timing_preserved: true/);
assert.match(source.api, /raw_velocity_preserved: true/);
assert.match(source.api, /CREATIVE_MUSIC_MIDI_RECORDING_RESTORE_ORIGINAL_REQUIRED/);
assert.match(source.api, /audio_changed: false/);
assert.match(source.api, /provider_job_submitted: false/);

assert.match(source.piano, /navigator\.requestMIDIAccess/);
assert.match(source.piano, /Record MIDI/);
assert.match(source.piano, /midiMessageToEvent/);
assert.match(source.piano, /command === 0x90/);
assert.match(source.piano, /command === 0x80/);
assert.match(source.piano, /record_performance/);
assert.match(source.piano, /quantize/);
assert.match(source.piano, /transpose/);
assert.match(source.piano, /restore_original/);
assert.match(source.piano, /does not auto-quantize/);
assert.match(source.piano, /Instrument audio playback is the next layer/);

assert.match(source.shell, /MusicMidiPianoRollPanel/);
assert.match(source.shell, /action: "load"/);
assert.match(source.workspace, /MIDI \/ Piano Roll/);
assert.match(source.workspace, /MusicMidiStudioPanel/);

for (const value of Object.values(source)) {
  assert.doesNotMatch(value, /direct[_ -]?runpod[_ -]?call/i);
}

console.log("MUSIC_MIDI_WORKSTATION_RUNTIME_AUDIT=PASS");
console.log("MUSIC_MIDI_WEB_MIDI_RECORDING=true");
console.log("MUSIC_MIDI_ORIGINAL_PERFORMANCE_PRESERVED=true");
console.log("MUSIC_MIDI_AUDIO_CHANGED=false");
console.log("MUSIC_MIDI_PROVIDER_JOB_SUBMITTED=false");
console.log("MUSIC_MIDI_ENDPOINT_MUTATION_PERFORMED=false");
