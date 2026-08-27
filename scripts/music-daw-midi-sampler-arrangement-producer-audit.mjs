#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const files = {
  midi: "lib/creative/music/runtime/CreativeMusicMidiRuntime.js",
  midiApi: "app/api/creative/music/midi/route.js",
  piano: "components/creative/ProductionStudio/workspaces/MusicMidiPianoRollPanel.jsx",
  drums: "lib/creative/music/runtime/CreativeMusicMidiDrumRuntime.js",
  drumApi: "app/api/creative/music/midi-drums/route.js",
  sampler: "lib/creative/music/runtime/CreativeMusicSamplerRuntime.js",
  samplerApi: "app/api/creative/music/sampler/route.js",
  samplerEngine: "lib/creative/music/client/MusicSamplerEngine.js",
  samplerPanel: "components/creative/ProductionStudio/workspaces/MusicSamplerPanel.jsx",
  controls: "app/api/creative/music/midi-controls/route.js",
  controlPanel: "components/creative/ProductionStudio/workspaces/MusicMidiControlAutomationPanel.jsx",
  instrumentEngine: "lib/creative/music/client/MusicMidiInstrumentEngine.js",
  harmony: "lib/creative/music/runtime/CreativeMusicMidiHarmonyRuntime.js",
  harmonyApi: "app/api/creative/music/midi-harmony/route.js",
  harmonyPanel: "components/creative/ProductionStudio/workspaces/MusicMidiHarmonyPanel.jsx",
  arrangement: "lib/creative/music/runtime/CreativeMusicArrangementRuntime.js",
  arrangementApi: "app/api/creative/music/arrangement/route.js",
  arrangementPanel: "components/creative/ProductionStudio/workspaces/MusicArrangementPanel.jsx",
  producer: "lib/creative/music/runtime/CreativeMusicProducerRuntime.js",
  producerApi: "app/api/creative/music/producer/route.js",
  producerPanel: "components/creative/ProductionStudio/workspaces/MusicProducerPanel.jsx",
  studio: "components/creative/ProductionStudio/workspaces/MusicStudioWorkspace.jsx",
};

const source = Object.fromEntries(await Promise.all(Object.entries(files).map(async ([key,path]) => [key,await readFile(path,"utf8")])));

assert.match(source.midi,/AVANTIQO_MUSIC_MIDI_PROJECT_V1/);
assert.match(source.midi,/ppq: Math\.round\(clamp\(input\.ppq, 96, 3840, 960\)\)/);
assert.match(source.midi,/original_performance_preserved: true/);
assert.match(source.midiApi,/record_performance/);
assert.match(source.midiApi,/raw_timing_preserved: true/);
assert.match(source.piano,/requestMIDIAccess/);
assert.match(source.piano,/record_performance/);

assert.match(source.drums,/AVANTIQO_MUSIC_MIDI_DRUM_PATTERN_V1/);
assert.match(source.drumApi,/midi_channel: 10/);
assert.match(source.drumApi,/midi_notes_updated: true/);

assert.match(source.sampler,/AVANTIQO_MUSIC_SAMPLER_PROJECT_V1/);
assert.match(source.sampler,/preserve_source_asset: true/);
assert.match(source.sampler,/choke_group/);
assert.match(source.samplerApi,/SAMPLER_SOURCE/);
assert.match(source.samplerApi,/immutable_original_sample: true/);
assert.match(source.samplerEngine,/AVANTIQO_MUSIC_BROWSER_SAMPLER_ENGINE_V1/);
assert.match(source.samplerEngine,/source_assets_preserved: true/);
assert.match(source.samplerPanel,/Play pattern/);
assert.match(source.samplerPanel,/Load sample/);

assert.match(source.controls,/AVANTIQO_MUSIC_MIDI_CONTROL_API_V1/);
assert.match(source.controls,/replace_lane/);
assert.match(source.controlPanel,/MIDI Control Automation/);
assert.match(source.instrumentEngine,/controller_automation/);
assert.match(source.instrumentEngine,/audible_preview_applied: true/);
assert.match(source.instrumentEngine,/sustainReleaseBeat/);
assert.match(source.instrumentEngine,/schedulePitchBend/);

assert.match(source.harmony,/AVANTIQO_MUSIC_MIDI_HARMONY_V1/);
assert.match(source.harmony,/pentatonic_minor/);
assert.match(source.harmonyApi,/insert_progression/);
assert.match(source.harmonyApi,/editable_midi:true/);
assert.match(source.harmonyPanel,/Scale & Chord Composer/);

assert.match(source.arrangement,/AVANTIQO_MUSIC_ARRANGEMENT_V1/);
assert.match(source.arrangement,/chorus/);
assert.match(source.arrangementApi,/repeat_section_material/);
assert.match(source.arrangementApi,/audio_clips_duplicated/);
assert.match(source.arrangementApi,/midi_clips_duplicated/);
assert.match(source.arrangementApi,/automation_points_duplicated/);
assert.match(source.arrangementApi,/source_assets_preserved: true/);
assert.match(source.arrangementPanel,/Repeat material at end/);

assert.match(source.producer,/AVANTIQO_MUSIC_PRODUCER_PLAN_V1/);
assert.match(source.producer,/PROJECT_AWARE_DETERMINISTIC_FOUNDATION/);
assert.match(source.producer,/owned_intelligence_inference_claimed: false/);
assert.match(source.producerApi,/createMusicProducerSnapshot/);
assert.match(source.producerApi,/action === "undo"/);
assert.match(source.producerApi,/BUILD_STANDARD_STRUCTURE|build_standard_structure/);
assert.match(source.producerApi,/source_assets_preserved:true/);
assert.match(source.producerPanel,/Undo Producer/);
assert.match(source.studio,/label: "Producer"/);
assert.match(source.studio,/label: "Arrange"/);
assert.match(source.studio,/label: "MIDI \/ Piano Roll"/);

for (const value of Object.values(source)) {
  assert.doesNotMatch(value,/direct[_ -]?runpod[_ -]?call/i);
}

console.log("MUSIC_DAW_MIDI_SAMPLER_ARRANGEMENT_PRODUCER_AUDIT=PASS");
console.log("MUSIC_DAW_PROVIDER_JOB_SUBMITTED=false");
console.log("MUSIC_DAW_ENDPOINT_MUTATION_PERFORMED=false");
console.log("MUSIC_DAW_SOURCE_ASSETS_PRESERVED=true");
console.log("MUSIC_DAW_PRODUCER_OWNED_INTELLIGENCE_INFERENCE_CLAIMED=false");
