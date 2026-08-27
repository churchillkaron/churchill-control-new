#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const files = {
  transport: "lib/creative/music/client/MusicUnifiedWorkstationTransportV3.js",
  api: "app/api/creative/music/multitrack/route.js",
  samplerRuntime: "lib/creative/music/runtime/CreativeMusicSamplerRuntime.js",
  samplerEngine: "lib/creative/music/client/MusicSamplerEngine.js",
  tempoRuntime: "lib/creative/music/runtime/CreativeMusicTempoMapRuntime.js",
  timeline: "components/creative/ProductionStudio/workspaces/MusicUnifiedTimelinePanel.jsx",
  shell: "components/creative/ProductionStudio/workspaces/MusicUnifiedWorkstationShell.jsx",
  workspace: "components/creative/ProductionStudio/workspaces/MusicStudioWorkspace.jsx",
};

const source = Object.fromEntries(await Promise.all(
  Object.entries(files).map(async ([key, path]) => [key, await readFile(path, "utf8")]),
));

assert.match(source.transport, /AVANTIQO_MUSIC_UNIFIED_WORKSTATION_TRANSPORT_V3/);
assert.match(source.transport, /startMusicMultitrackPreview/);
assert.match(source.transport, /started_at_context_time/);
assert.match(source.transport, /same_audio_context_clock:true/);
assert.match(source.transport, /tempo_map_aware:true/);
assert.match(source.transport, /ensureMusicTempoMap/);
assert.match(source.transport, /musicBeatToSeconds/);
assert.match(source.transport, /musicSecondsToBeat/);
assert.match(source.transport, /session\.midi\?\.tracks/);
assert.match(source.transport, /layerFor/);
assert.match(source.transport, /source_assets_preserved:true/);
assert.match(source.transport, /provider_job_submitted:false/);

assert.match(source.api, /ensureMusicMidiProject/);
assert.match(source.api, /ensureMusicSamplerProject/);
assert.match(source.api, /ensureMusicTempoMap/);
assert.match(source.api, /sample_urls/);
assert.match(source.api, /unified_transport_ready: true/);
assert.match(source.api, /midi_timeline_ready: true/);
assert.match(source.api, /AVANTIQO_MUSIC_UNIFIED_WORKSTATION_TRANSPORT_V3/);
assert.match(source.api, /tempo_map_ready: true/);
assert.match(source.api, /sampler_velocity_layers_ready/);
assert.match(source.api, /sampler_round_robin_ready/);
assert.match(source.api, /pad\.layers/);
assert.match(source.api, /provider_job_submitted: false/);

assert.match(source.samplerRuntime, /AVANTIQO_MUSIC_SAMPLER_PROJECT_V2/);
assert.match(source.samplerRuntime, /AVANTIQO_MUSIC_SAMPLER_LAYER_V1/);
assert.match(source.samplerRuntime, /assignMusicSamplerLayer/);
assert.match(source.samplerRuntime, /selectMusicSamplerLayer/);
assert.match(source.samplerRuntime, /velocity_layers_supported: true/);
assert.match(source.samplerRuntime, /round_robin_supported: true/);
assert.match(source.samplerEngine, /AVANTIQO_MUSIC_BROWSER_SAMPLER_ENGINE_V2/);
assert.match(source.tempoRuntime, /AVANTIQO_MUSIC_TEMPO_MAP_V1/);
assert.match(source.tempoRuntime, /musicBeatToSeconds/);
assert.match(source.tempoRuntime, /musicSecondsToBeat/);

assert.match(source.timeline, /startMusicUnifiedWorkstationPreviewV3/);
assert.match(source.timeline, /MusicUnifiedWorkstationTransportV3/);
assert.match(source.timeline, /Unified Workstation Timeline/);
assert.match(source.timeline, /Audio \+ MIDI \+ sampler \+ tempo map share one transport clock/);
assert.match(source.timeline, /session\?\.midi\?\.tracks/);
assert.match(source.timeline, /sampleUrls: payload\.sample_urls/);
assert.match(source.timeline, /tempo_map_aware/);

assert.match(source.shell, /MusicUnifiedTimelinePanel/);
assert.match(source.shell, /MusicMultitrackStudioPanelV2/);
assert.match(source.workspace, /MusicUnifiedWorkstationShell/);
assert.doesNotMatch(source.workspace, /import MusicMultitrackStudioPanelV2/);

for (const value of Object.values(source)) assert.doesNotMatch(value, /direct[_ -]?runpod[_ -]?call/i);

console.log("MUSIC_UNIFIED_WORKSTATION_TRANSPORT_RUNTIME_AUDIT=PASS");
console.log("MUSIC_UNIFIED_WORKSTATION_TRANSPORT=V3");
console.log("MUSIC_UNIFIED_WORKSTATION_AUDIO_MIDI_SHARED_CLOCK=true");
console.log("MUSIC_UNIFIED_WORKSTATION_TEMPO_MAP_AWARE=true");
console.log("MUSIC_UNIFIED_WORKSTATION_MIDI_TIMELINE_VISIBLE=true");
console.log("MUSIC_UNIFIED_WORKSTATION_SAMPLER_VELOCITY_LAYERS=true");
console.log("MUSIC_UNIFIED_WORKSTATION_SAMPLER_ROUND_ROBIN=true");
console.log("MUSIC_UNIFIED_WORKSTATION_PROVIDER_JOB_SUBMITTED=false");
console.log("MUSIC_UNIFIED_WORKSTATION_ENDPOINT_MUTATION_PERFORMED=false");
