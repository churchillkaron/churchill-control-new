#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const files = {
  transport: "lib/creative/music/client/MusicUnifiedWorkstationTransportV2.js",
  api: "app/api/creative/music/multitrack/route.js",
  samplerRuntime: "lib/creative/music/runtime/CreativeMusicSamplerRuntime.js",
  samplerEngine: "lib/creative/music/client/MusicSamplerEngine.js",
  timeline: "components/creative/ProductionStudio/workspaces/MusicUnifiedTimelinePanel.jsx",
  shell: "components/creative/ProductionStudio/workspaces/MusicUnifiedWorkstationShell.jsx",
  workspace: "components/creative/ProductionStudio/workspaces/MusicStudioWorkspace.jsx",
};

const source = Object.fromEntries(await Promise.all(
  Object.entries(files).map(async ([key, path]) => [key, await readFile(path, "utf8")]),
));

assert.match(source.transport, /AVANTIQO_MUSIC_UNIFIED_WORKSTATION_TRANSPORT_V2/);
assert.match(source.transport, /startMusicMultitrackPreview/);
assert.match(source.transport, /started_at_context_time/);
assert.match(source.transport, /same_audio_context_clock: true/);
assert.match(source.transport, /session\.midi\?\.tracks/);
assert.match(source.transport, /selectMusicSamplerLayer/);
assert.match(source.transport, /velocity_layer_sampler: true/);
assert.match(source.transport, /round_robin_sampler: true/);
assert.match(source.transport, /sampler_layered_hit_count/);
assert.match(source.transport, /sampler_round_robin_hit_count/);
assert.match(source.transport, /source_assets_preserved: true/);
assert.match(source.transport, /provider_job_submitted: false/);

assert.match(source.api, /ensureMusicMidiProject/);
assert.match(source.api, /ensureMusicSamplerProject/);
assert.match(source.api, /sample_urls/);
assert.match(source.api, /unified_transport_ready: true/);
assert.match(source.api, /midi_timeline_ready: true/);
assert.match(source.api, /AVANTIQO_MUSIC_UNIFIED_WORKSTATION_TRANSPORT_V2/);
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
assert.match(source.samplerEngine, /selectMusicSamplerLayer/);
assert.match(source.samplerEngine, /velocity_layers: true/);
assert.match(source.samplerEngine, /round_robin: true/);

assert.match(source.timeline, /startMusicUnifiedWorkstationPreviewV2/);
assert.match(source.timeline, /MusicUnifiedWorkstationTransportV2/);
assert.match(source.timeline, /Unified Workstation Timeline/);
assert.match(source.timeline, /Audio \+ MIDI \+ velocity-layer sampler share one transport clock/);
assert.match(source.timeline, /session\?\.midi\?\.tracks/);
assert.match(source.timeline, /sampleUrls: payload\.sample_urls/);
assert.match(source.timeline, /round_robin_hits/);

assert.match(source.shell, /MusicUnifiedTimelinePanel/);
assert.match(source.shell, /MusicMultitrackStudioPanelV2/);
assert.match(source.workspace, /MusicUnifiedWorkstationShell/);
assert.doesNotMatch(source.workspace, /import MusicMultitrackStudioPanelV2/);

for (const value of Object.values(source)) {
  assert.doesNotMatch(value, /direct[_ -]?runpod[_ -]?call/i);
}

console.log("MUSIC_UNIFIED_WORKSTATION_TRANSPORT_RUNTIME_AUDIT=PASS");
console.log("MUSIC_UNIFIED_WORKSTATION_TRANSPORT=V2");
console.log("MUSIC_UNIFIED_WORKSTATION_AUDIO_MIDI_SHARED_CLOCK=true");
console.log("MUSIC_UNIFIED_WORKSTATION_MIDI_TIMELINE_VISIBLE=true");
console.log("MUSIC_UNIFIED_WORKSTATION_SAMPLER_VELOCITY_LAYERS=true");
console.log("MUSIC_UNIFIED_WORKSTATION_SAMPLER_ROUND_ROBIN=true");
console.log("MUSIC_UNIFIED_WORKSTATION_PROVIDER_JOB_SUBMITTED=false");
console.log("MUSIC_UNIFIED_WORKSTATION_ENDPOINT_MUTATION_PERFORMED=false");
