import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createMusicSpatialAudioConfig, deriveMusicStereoDownmixMatrix, normalizeMusicSpatialTrack, validateMusicSpatialAudio } from "../lib/creative/music/runtime/CreativeMusicSpatialAudioRuntime.js";
import { createMusicMultitrackProject, createMusicTrack, validateMusicMultitrackProject } from "../lib/creative/music/runtime/CreativeMusicMultitrackRuntime.js";

test("Music Studio models real stereo 5.1 and 7.1 speaker layouts",()=>{
  const s=createMusicSpatialAudioConfig({layout_id:"5.1"});
  assert.deepEqual(s.speaker_order,["L","R","C","LFE","Ls","Rs"]);
  assert.equal(s.channel_count,6);
  assert.equal(s.ffmpeg_channel_layout,"5.1(side)");
  const x=createMusicSpatialAudioConfig({layout_id:"7.1"});
  assert.deepEqual(x.speaker_order,["L","R","C","LFE","Lrs","Rrs","Ls","Rs"]);
  assert.equal(x.channel_count,8);
  assert.equal(x.surround_enabled,true);
});

test("surround config requires explicit LFE routing and honest Dolby boundary",()=>{
  const s=createMusicSpatialAudioConfig({layout_id:"7.1"});
  assert.equal(s.lfe.explicit_send_required,true);
  assert.equal(s.lfe.automatic_full_range_routing_forbidden,true);
  assert.equal(s.dolby.branded_delivery_enabled,false);
  assert.equal(s.dolby.atmos_adm_bwf_authoring_enabled,false);
  assert.equal(s.dolby.never_label_unlicensed_multichannel_as_dolby,true);
  assert.equal(s.browser_preview.multichannel_speaker_output_certified,false);
  assert.doesNotThrow(()=>validateMusicSpatialAudio(s));
});

test("stereo downmix matrix preserves fronts and folds center/surrounds at minus 3 dB without LFE by default",()=>{
  const m=deriveMusicStereoDownmixMatrix("5.1");
  assert.equal(m.left.L,1); assert.equal(m.right.R,1);
  assert.ok(m.left.C>0.7&&m.left.C<0.71);
  assert.ok(m.right.Rs>0.7&&m.right.Rs<0.71);
  assert.equal(m.left.LFE,0); assert.equal(m.right.LFE,0);
});

test("tracks carry non-destructive spatial placement and multitrack sessions preserve it",()=>{
  const spatial=normalizeMusicSpatialTrack({mode:"POINT",azimuth_degrees:110,elevation_degrees:15,lfe_send_db:-12,follows_picture_object:"car-01"});
  assert.equal(spatial.mode,"POINT"); assert.equal(spatial.azimuth_degrees,110); assert.equal(spatial.follows_picture_object,"car-01");
  const session=createMusicMultitrackProject({spatial_audio:{layout_id:"5.1"}});
  session.tracks.push(createMusicTrack({type:"audio",spatial}));
  const v=validateMusicMultitrackProject(session);
  assert.equal(v.spatial_layout_id,"5.1");
  assert.equal(session.capabilities.browser_surround_monitoring_certified,false);
});


test("release plan carries exact surround layout and refuses stereo renderer substitution",()=>{
  const source=fs.readFileSync("lib/creative/music/runtime/CreativeMusicReleaseRenderPlanRuntime.js","utf8");
  assert.match(source,/AVANTIQO_MUSIC_RELEASE_RENDER_PLAN_V6/);
  assert.match(source,/channels: spatial.channel_count/);
  assert.match(source,/channel_layout: spatial.layout_id/);
  assert.match(source,/multichannel_renderer_required: spatial.surround_enabled/);
  assert.match(source,/stereo_offline_renderer_allowed: !spatial.surround_enabled/);
  assert.match(source,/surround_premaster_wav/);
  assert.match(source,/stereo_renderer_for_surround_forbidden: spatial.surround_enabled/);
});


test("24-bit WAV encoder preserves discrete 5.1 and 7.1 channel counts",async()=>{
  const { encodeMusicChannelsWav24 }=await import("../lib/creative/music/client/MusicWav24Runtime.js");
  for(const count of [6,8]){
    const channels=Array.from({length:count},(_,channel)=>new Float32Array([channel/10,0,-channel/10]));
    const wav=encodeMusicChannelsWav24(channels,48000);
    assert.equal(wav.contract,"AVANTIQO_MUSIC_WAV24_ENCODER_V3");
    assert.equal(wav.channels,count);
    const view=new DataView(wav.array_buffer);
    assert.equal(view.getUint16(20,true),0xfffe);
    assert.equal(view.getUint16(22,true),count);
    assert.equal(view.getUint16(32,true),count*3);
    assert.equal(view.getUint32(40,true),count===6?0x060f:0x063f);
    assert.equal(wav.wave_format_extensible,true);
  }
});


test("spatial mix math places point sources and explicit LFE into discrete channels",async()=>{
  const { deriveMusicPointSpeakerGains, mixMusicTrackIntoSpatialChannels, downmixMusicSpatialChannelsToStereo }=await import("../lib/creative/music/client/MusicSpatialMixMathRuntime.js");
  const gains=deriveMusicPointSpeakerGains("5.1",0,0);
  assert.ok(gains.C>.99);
  const source=new Float32Array([1,.5,-.5,-1]);
  const out=mixMusicTrackIntoSpatialChannels({layout:"5.1",left:source,right:source,spatial:{mode:"POINT",azimuth_degrees:0,lfe_send_db:-6},sample_rate:48000});
  assert.equal(out.length,6);
  assert.ok(Math.abs(out[2][0])>.9);
  assert.ok(Math.abs(out[3][0])>0);
  const fold=downmixMusicSpatialChannelsToStereo(out,"5.1");
  assert.equal(fold.left.length,source.length); assert.equal(fold.right.length,source.length);
});

test("surround renderer is a separate exact path and Release UI selects it",()=>{
  const renderer=fs.readFileSync("lib/creative/music/client/MusicOfflineSurroundRenderRuntime.js","utf8");
  const panel=fs.readFileSync("components/creative/ProductionStudio/workspaces/MusicReleaseRenderPanel.jsx","utf8");
  assert.match(renderer,/AVANTIQO_MUSIC_OFFLINE_SURROUND_PREMASTER_V1/);
  assert.match(renderer,/renderMusicTrackStemOffline/);
  assert.doesNotMatch(renderer,/SURROUND_GROUP_BUS_GRAPH_NOT_CERTIFIED/);
  assert.match(renderer,/explicit_send_only: true/);
  assert.match(renderer,/dolby_branded: false/);
  assert.match(panel,/renderMusicSurroundPremasterOffline/);
  assert.match(panel,/SURROUND MASTER · QC PASS/);
});


test("Workstation exposes persisted surround layout and per-track spatial controls without claiming browser surround",()=>{
  const panel=fs.readFileSync("components/creative/ProductionStudio/workspaces/MusicMultitrackStudioPanelV2.jsx","utf8");
  assert.match(panel,/createMusicSpatialAudioConfig/);
  assert.match(panel,/<option value="5.1">5.1<\/option>/);
  assert.match(panel,/<option value="7.1">7.1<\/option>/);
  assert.match(panel,/Spatial placement/);
  assert.match(panel,/Azimuth/);
  assert.match(panel,/LFE send dB/);
  assert.match(panel,/Picture object/);
  assert.match(panel,/Browser monitoring remains stereo fold-down only/);
});


test("surround validation re-probes rendered file and verifies channel/LFE/downmix evidence",()=>{
  const runtime=fs.readFileSync("lib/creative/music/runtime/CreativeMusicSurroundValidationRuntime.js","utf8");
  const route=fs.readFileSync("app/api/creative/music/surround-validate/route.js","utf8");
  const release=fs.readFileSync("app/api/creative/music/release-render/route.js","utf8");
  const panel=fs.readFileSync("components/creative/ProductionStudio/workspaces/MusicReleaseRenderPanel.jsx","utf8");
  assert.match(runtime,/AVANTIQO_MUSIC_SURROUND_TECHNICAL_VALIDATION_V1/);
  assert.match(runtime,/SURROUND_CHANNEL_LAYOUT_MISMATCH/);
  assert.match(runtime,/SURROUND_CHANNEL_TRUE_PEAK_EXCEEDED/);
  assert.match(runtime,/SURROUND_LFE_HIGH_BAND_EXCESS/);
  assert.match(runtime,/SURROUND_STEREO_DOWNMIX_TRUE_PEAK_EXCEEDED/);
  assert.match(runtime,/actual_rendered_audio_is_authority:true/);
  assert.match(route,/SURROUND_PREMASTER/);
  assert.match(release,/SURROUND_PREMASTER/);
  assert.match(panel,/surroundValidationRequest/);
  assert.match(panel,/SURROUND MASTER · QC PASS/);
});


test("linked multichannel compression preserves inter-channel image ratios",async()=>{
  const { applyMusicLinkedMultichannelCompression }=await import("../lib/creative/music/client/MusicMultichannelDspRuntime.js");
  const a=Float32Array.from({length:2000},(_,i)=>Math.sin(i*.1)*.7);
  const b=Float32Array.from(a,v=>v*.25);
  const r=applyMusicLinkedMultichannelCompression([a,b],48000,{enabled:true,threshold_db:-18,ratio:4,attack_ms:1,release_ms:80,knee_db:3,makeup_db:0});
  assert.equal(r.linked_detector,true);
  let checked=0;for(let i=100;i<a.length;i++){if(Math.abs(a[i])<1e-4||Math.abs(r.channels[0][i])<1e-6)continue;assert.ok(Math.abs((r.channels[1][i]/r.channels[0][i])-.25)<1e-5);checked++;}
  assert.ok(checked>500);
  assert.ok(r.gain_reduction_db_min<0);
});

test("surround renderer processes nested groups and master with linked multichannel DSP",()=>{
  const renderer=fs.readFileSync("lib/creative/music/client/MusicOfflineSurroundRenderRuntime.js","utf8");
  const dsp=fs.readFileSync("lib/creative/music/client/MusicMultichannelDspRuntime.js","utf8");
  assert.match(renderer,/groupProcessingOrder/);
  assert.match(renderer,/applyMusicMultichannelBusProcessing/);
  assert.match(renderer,/nested_group_routing_applied/);
  assert.match(renderer,/master_linked_compression: true/);
  assert.doesNotMatch(renderer,/SURROUND_GROUP_BUS_GRAPH_NOT_CERTIFIED/);
  assert.doesNotMatch(renderer,/SURROUND_MASTER_PROCESSING_NOT_CERTIFIED/);
  assert.match(dsp,/linked_detector:true/);
});


test("surround aux path preserves pre/post-fader sends, automation and explicit return placement",()=>{
  const renderer=fs.readFileSync("lib/creative/music/client/MusicOfflineSurroundRenderRuntime.js","utf8");
  const aux=fs.readFileSync("lib/creative/music/client/MusicSurroundAuxRuntime.js","utf8");
  const mixer=fs.readFileSync("lib/creative/music/runtime/CreativeMusicMixerRoutingRuntime.js","utf8");
  const ui=fs.readFileSync("components/creative/ProductionStudio/workspaces/MusicMixerSendsPanel.jsx","utf8");
  assert.doesNotMatch(renderer,/SURROUND_AUX_SEND_GRAPH_NOT_CERTIFIED/);
  assert.match(renderer,/renderMusicPreFaderSendSource/);
  assert.match(renderer,/send_db:\$\{send.bus_id\}/);
  assert.match(renderer,/renderMusicSurroundAuxEffect/);
  assert.match(renderer,/pre_post_fader_send_semantics_preserved: true/);
  assert.match(aux,/AVANTIQO_MUSIC_SURROUND_AUX_EFFECT_V1/);
  assert.match(mixer,/spatial: normalizeMusicSpatialTrack/);
  assert.match(ui,/Return spatial/);
  assert.match(ui,/updateAuxSpatial/);
});

test("send automation applies deterministic dB gain over time",async()=>{
  const { applyMusicSpatialSendGainAutomation }=await import("../lib/creative/music/client/MusicSpatialMixMathRuntime.js");
  const src=new Float32Array(100).fill(1),lane={enabled:true,interpolation:"linear",points:[{time_seconds:0,value:-20},{time_seconds:.099,value:0}]};
  const r=applyMusicSpatialSendGainAutomation(src,src,1000,{level_db:-40},lane);
  assert.ok(r.left[0]>.09&&r.left[0]<.11);
  assert.ok(r.left[99]>.99);
});
