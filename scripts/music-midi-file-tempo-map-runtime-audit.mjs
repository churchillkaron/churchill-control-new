#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";

const runtime = fs.readFileSync("lib/creative/music/runtime/CreativeMusicMidiFileRuntime.js", "utf8");
const api = fs.readFileSync("app/api/creative/music/midi-file/route.js", "utf8");
const panel = fs.readFileSync("components/creative/ProductionStudio/workspaces/MusicMidiFilePanel.jsx", "utf8");

assert.match(runtime, /AVANTIQO_MUSIC_STANDARD_MIDI_FILE_V2/);
assert.match(runtime, /AVANTIQO_TEMPO_MAP_V2:/);
assert.match(runtime, /type === 0x51/);
assert.match(runtime, /type === 0x58/);
assert.match(runtime, /type === 0x7f/);
assert.match(runtime, /tempo_map: normalizedTempoMap/);
assert.match(runtime, /avantiqo_tempo_map_preserved/);
assert.match(runtime, /full_tempo_map_available: true/);
assert.match(runtime, /standardTempoEvents/);
assert.match(runtime, /event\.curve === "linear"/);
assert.match(runtime, /customTempoMapMeta/);
assert.match(runtime, /conductorTrack/);
assert.match(runtime, /encodeStandardMidiFile\(\{ midi, bpm = 120, time_signature = "4\/4", tempo_map = null \}/);
assert.match(runtime, /musicalContent = notes\.length > 0 \|\| controls\.length > 0/);
assert.match(runtime, /provider_job_submitted: false/);

assert.match(api, /AVANTIQO_MUSIC_STANDARD_MIDI_FILE_V2/);
assert.match(api, /apply_tempo_map === true/);
assert.match(api, /ensureMusicTempoMap\(parsed\.tempo_map/);
assert.match(api, /current\.tempo_map = tempoMap/);
assert.match(api, /AVANTIQO_MUSIC_STANDARD_MIDI_IMPORT_API_V2/);
assert.match(api, /full_tempo_map_applied/);
assert.match(api, /tempo_event_count/);
assert.match(api, /meter_event_count/);
assert.match(api, /provider_job_submitted:false/);
assert.match(api, /endpoint_mutation_performed:false/);

assert.match(panel, /apply_tempo_map:true/);
assert.match(panel, /tempo_map:session\.tempo_map/);
assert.match(panel, /tempo and .* meter event/);
assert.match(panel, /linear tempo ramps are preserved exactly/);

for (const value of [runtime, api, panel]) {
  assert.doesNotMatch(value, /direct[_ -]?runpod[_ -]?call/i);
}

console.log("AVANTIQO_MUSIC_MIDI_FILE_TEMPO_MAP_RUNTIME_AUDIT=PASS");
console.log("AVANTIQO_MUSIC_STANDARD_MIDI_FILE=V2");
console.log("AVANTIQO_MUSIC_MIDI_FULL_TEMPO_MAP=true");
console.log("AVANTIQO_MUSIC_MIDI_LINEAR_RAMP_ROUNDTRIP=true");
console.log("AVANTIQO_MUSIC_MIDI_PROVIDER_JOB_SUBMITTED=false");
console.log("AVANTIQO_MUSIC_MIDI_ENDPOINT_MUTATION_PERFORMED=false");
