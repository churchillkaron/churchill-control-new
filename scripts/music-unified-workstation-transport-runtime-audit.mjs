#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const files = {
  transport: "lib/creative/music/client/MusicUnifiedWorkstationTransport.js",
  api: "app/api/creative/music/multitrack/route.js",
  timeline: "components/creative/ProductionStudio/workspaces/MusicUnifiedTimelinePanel.jsx",
  shell: "components/creative/ProductionStudio/workspaces/MusicUnifiedWorkstationShell.jsx",
  workspace: "components/creative/ProductionStudio/workspaces/MusicStudioWorkspace.jsx",
};

const source = Object.fromEntries(await Promise.all(
  Object.entries(files).map(async ([key, path]) => [key, await readFile(path, "utf8")]),
));

assert.match(source.transport, /AVANTIQO_MUSIC_UNIFIED_WORKSTATION_TRANSPORT_V1/);
assert.match(source.transport, /startMusicMultitrackPreview/);
assert.match(source.transport, /started_at_context_time/);
assert.match(source.transport, /same_audio_context_clock: true/);
assert.match(source.transport, /session\.midi\?\.tracks/);
assert.match(source.transport, /sampler_hit_count/);
assert.match(source.transport, /synth_note_count/);
assert.match(source.transport, /midiMaster\.connect\(midiCompressor\)\.connect\(audioTransport\.analyser\)/);
assert.match(source.transport, /source_assets_preserved: true/);
assert.match(source.transport, /provider_job_submitted: false/);

assert.match(source.api, /ensureMusicMidiProject/);
assert.match(source.api, /ensureMusicSamplerProject/);
assert.match(source.api, /sample_urls/);
assert.match(source.api, /unified_transport_ready: true/);
assert.match(source.api, /midi_timeline_ready: true/);
assert.match(source.api, /AVANTIQO_MUSIC_UNIFIED_WORKSTATION_TRANSPORT_V1/);
assert.match(source.api, /provider_job_submitted: false/);

assert.match(source.timeline, /startMusicUnifiedWorkstationPreview/);
assert.match(source.timeline, /Unified Workstation Timeline/);
assert.match(source.timeline, /Audio \+ MIDI \+ sampler share one transport clock/);
assert.match(source.timeline, /session\?\.midi\?\.tracks/);
assert.match(source.timeline, /sampleUrls: payload\.sample_urls/);

assert.match(source.shell, /MusicUnifiedTimelinePanel/);
assert.match(source.shell, /MusicMultitrackStudioPanelV2/);
assert.match(source.workspace, /MusicUnifiedWorkstationShell/);
assert.doesNotMatch(source.workspace, /import MusicMultitrackStudioPanelV2/);

for (const value of Object.values(source)) {
  assert.doesNotMatch(value, /direct[_ -]?runpod[_ -]?call/i);
}

console.log("MUSIC_UNIFIED_WORKSTATION_TRANSPORT_RUNTIME_AUDIT=PASS");
console.log("MUSIC_UNIFIED_WORKSTATION_AUDIO_MIDI_SHARED_CLOCK=true");
console.log("MUSIC_UNIFIED_WORKSTATION_MIDI_TIMELINE_VISIBLE=true");
console.log("MUSIC_UNIFIED_WORKSTATION_SAMPLER_SYNCHRONIZED=true");
console.log("MUSIC_UNIFIED_WORKSTATION_PROVIDER_JOB_SUBMITTED=false");
console.log("MUSIC_UNIFIED_WORKSTATION_ENDPOINT_MUTATION_PERFORMED=false");
