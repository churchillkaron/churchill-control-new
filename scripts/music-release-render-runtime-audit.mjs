import fs from "node:fs";
import assert from "node:assert/strict";

const plan = fs.readFileSync("lib/creative/music/runtime/CreativeMusicReleaseRenderPlanRuntime.js", "utf8");
const offline = fs.readFileSync("lib/creative/music/client/MusicOfflineMixRenderRuntime.js", "utf8");
const wav = fs.readFileSync("lib/creative/music/client/MusicWav24Runtime.js", "utf8");
const stems = fs.readFileSync("lib/creative/music/client/MusicOfflineStemRenderRuntime.js", "utf8");
const releaseRoute = fs.readFileSync("app/api/creative/music/release-render/route.js", "utf8");
const stemRoute = fs.readFileSync("app/api/creative/music/stem-render/route.js", "utf8");
const midiBounceRoute = fs.readFileSync("app/api/creative/music/midi-bounce/route.js", "utf8");
const midiBounceEngine = fs.readFileSync("lib/creative/music/client/MusicMidiBounceEngine.js", "utf8");
const midiFingerprint = fs.readFileSync("lib/creative/music/runtime/CreativeMusicMidiBounceFingerprintRuntime.js", "utf8");
const samplerRoute = fs.readFileSync("app/api/creative/music/sampler/route.js", "utf8");
const releasePanel = fs.readFileSync("components/creative/ProductionStudio/workspaces/MusicReleaseRenderPanel.jsx", "utf8");
const stemPanel = fs.readFileSync("components/creative/ProductionStudio/workspaces/MusicStemExportPanel.jsx", "utf8");
const workstation = fs.readFileSync("components/creative/ProductionStudio/workspaces/MusicMultitrackStudioPanelV2.jsx", "utf8");
const audioContract = fs.readFileSync("lib/creative/audio/runtime/AudioFinishingContractRuntime.js", "utf8");

assert.match(plan, /AVANTIQO_MUSIC_RELEASE_RENDER_PLAN_V4/);
assert.match(plan, /AVANTIQO_MUSIC_OFFLINE_AUDIO_RENDERER_V1/);
assert.match(plan, /SOLO_ACTIVE_RELEASE_BLOCKER/);
assert.match(plan, /LOOP_CLIP_RELEASE_RENDER_PENDING/);
assert.match(plan, /REVERSE_CLIP_RENDER_PARITY_PENDING/);
assert.match(plan, /WARP_RELEASE_RENDER_PENDING/);
assert.match(plan, /MIDI_TRACKS_REQUIRE_AUDIO_BOUNCE_FOR_RELEASE/);
assert.match(plan, /MIDI_RELEASE_BOUNCE_STALE/);
assert.match(plan, /source_midi_core_fingerprint/);
assert.match(plan, /fingerprintMusicMidiBounce/);
assert.match(plan, /stale_midi_bounce_blocks_release: true/);
assert.match(plan, /sampler_mutation_invalidates_bounce: true/);
assert.match(plan, /explicit_bounce_required: true/);
assert.match(plan, /silent_midi_omission_forbidden: true/);
assert.match(plan, /track_stem_render_supported: true/);
assert.match(plan, /group_stem_render_supported: true/);
assert.match(plan, /instrumental_render_supported: true/);
assert.match(plan, /acapella_render_supported: true/);
assert.match(plan, /release_limiter_via_canonical_audio_finish: true/);
assert.match(plan, /active_solo_blocks_release_and_stems: true/);

assert.match(midiFingerprint, /AVANTIQO_MUSIC_MIDI_BOUNCE_FINGERPRINT_V1/);
assert.match(midiFingerprint, /control_events/);
assert.match(midiFingerprint, /tempo_map/);
assert.match(midiFingerprint, /instrument/);
assert.match(midiFingerprint, /sample_asset_ids/);
assert.match(midiBounceEngine, /AVANTIQO_MUSIC_MIDI_OFFLINE_BOUNCE_V3/);
assert.match(midiBounceEngine, /source_midi_core_fingerprint/);
assert.match(midiBounceEngine, /source_midi_fingerprint/);
assert.match(midiBounceRoute, /CREATIVE_MUSIC_MIDI_BOUNCE_SOURCE_CORE_FINGERPRINT_MISMATCH/);
assert.match(midiBounceRoute, /CREATIVE_MUSIC_MIDI_BOUNCE_SOURCE_FINGERPRINT_MISMATCH/);
assert.match(midiBounceRoute, /AVANTIQO_MUSIC_MIDI_RELEASE_BOUNCE_LINK_V2/);
assert.match(samplerRoute, /SAMPLER_STATE_CHANGED/);
assert.match(samplerRoute, /invalidated_midi_bounce_count/);
assert.match(samplerRoute, /invalidateMidiBounces: true/);

assert.match(offline, /AVANTIQO_MUSIC_OFFLINE_MIX_RENDER_V1/);
assert.match(offline, /OfflineAudioContext/);
assert.match(offline, /createMusicGroupBusPreviewGraph/);
assert.match(offline, /createMusicMasterBusPreviewGraph/);
assert.match(offline, /scheduleMusicMixerAutomation/);
assert.match(offline, /CREATIVE_MUSIC_OFFLINE_DYNAMICS_WORKLET_UNAVAILABLE/);
assert.match(offline, /encodeMusicAudioBufferWav24/);
assert.match(offline, /release_limiter_applied: false/);
assert.match(offline, /true_peak_certified: false/);
assert.match(offline, /original_assets_preserved: true/);

assert.match(wav, /AVANTIQO_MUSIC_WAV24_ENCODER_V1/);
assert.match(wav, /setUint16\(34, 24, true\)/);
assert.match(wav, /analyseMusicAudioBuffer/);

assert.match(releaseRoute, /createHash\("sha256"\)/);
assert.match(releaseRoute, /render_plan_fingerprint/);
assert.match(releaseRoute, /music_asset_kind: "MIX_RENDER"/);
assert.match(releaseRoute, /dispatchAudioTask/);
assert.match(releaseRoute, /music_asset_kind: "MASTER"/);
assert.match(releaseRoute, /release_limiter_applied: true/);
assert.match(releaseRoute, /true_peak_certified: true/);
assert.match(releaseRoute, /provider_job_submitted: false/);

assert.match(audioContract, /unwrapAudioOutput/);
assert.match(audioContract, /const next = current\.output \|\| current\.result \|\| current\.data \|\| current\.json/);
assert.match(audioContract, /completedAudioSources/);
assert.match(audioContract, /audioOutputUrl\(candidate\.output\)/);

assert.match(stems, /AVANTIQO_MUSIC_TRACK_STEM_RENDER_V1/);
assert.match(stems, /AVANTIQO_MUSIC_GROUP_STEM_RENDER_V1/);
assert.match(stems, /AVANTIQO_MUSIC_VARIANT_MIX_RENDER_V1/);
assert.match(stems, /post-track-processing-pre-group/);
assert.match(stems, /post-group-processing-pre-master/);
assert.match(stems, /master_processing_applied: false/);
assert.match(stems, /aux_returns_applied: false/);

assert.match(stemRoute, /TRACK_STEM/);
assert.match(stemRoute, /GROUP_STEM/);
assert.match(stemRoute, /INSTRUMENTAL/);
assert.match(stemRoute, /ACAPELLA/);
assert.match(stemRoute, /CREATIVE_MUSIC_STEM_SOURCE_LINEAGE_MISMATCH/);
assert.match(stemRoute, /render_plan_fingerprint/);
assert.match(stemRoute, /release_limiter_applied: false/);
assert.match(stemRoute, /true_peak_certified: false/);

assert.match(releasePanel, /MusicStemExportPanel/);
assert.match(releasePanel, /Render \+ certify release master/);
assert.match(releasePanel, /render_plan_fingerprint/);
assert.match(releasePanel, /Track\/group stems are 24-bit pre-Master engineering exports/);
assert.match(stemPanel, /Track stem/);
assert.match(stemPanel, /Group stem/);
assert.match(stemPanel, /Instrumental/);
assert.match(stemPanel, /Acapella/);
assert.match(stemPanel, /24-bit derived assets/);

assert.match(workstation, /MusicReleaseRenderPanel/);
assert.match(workstation, /disabled=\{recording \|\| dirty \|\| busy\}/);
assert.match(workstation, /Save the Workstation before rendering a release master/);

console.log("AVANTIQO_MUSIC_RELEASE_RENDER_RUNTIME_AUDIT=PASS");
console.log("AVANTIQO_MUSIC_RELEASE_RENDER_PLAN=V4");
console.log("AVANTIQO_MUSIC_RELEASE_MIDI_AUDIO_BOUNCE_REQUIRED=true");
console.log("AVANTIQO_MUSIC_RELEASE_MIDI_STALE_BOUNCE_BLOCKED=true");
