import { renderMusicTrackStemOffline } from "./MusicOfflineStemRenderRuntime";
import { encodeMusicChannelsWav24 } from "./MusicWav24Runtime.js";
import { createMusicSpatialAudioConfig } from "../runtime/CreativeMusicSpatialAudioRuntime.js";
import { analyseMusicDiscreteChannels, applyMusicSpatialSendGainAutomation, downmixMusicSpatialChannelsToStereo, mixMusicTrackIntoSpatialChannels, mixMusicTrackIntoSpatialChannelsAutomated, sumMusicStereoSendPair } from "./MusicSpatialMixMathRuntime.js";
import { applyMusicLinkedMultichannelSidechain, applyMusicMultichannelBusProcessing, sumMusicMultichannelBuffers } from "./MusicMultichannelDspRuntime.js";
import { normalizeAudioPostMixPolicy } from "../runtime/CreativeAudioPostMixRuntime.js";
import { renderMusicPreFaderSendSource, renderMusicSurroundAuxEffect } from "./MusicSurroundAuxRuntime.js";
import { applyMusicObjectMotionAcoustics } from "./MusicObjectMotionAcousticsRuntime.js";

function clone(value) { return structuredClone(value); }
function finite(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }

function surroundBlockers(session = {}) {
  const blockers = [];
  for (const group of (session.buses || []).filter((bus) => bus.type === "group")) {
    if (Math.abs(finite(group.pan, 0)) > 1e-9) blockers.push(`SURROUND_GROUP_STEREO_PAN_UNSUPPORTED:${group.id}`);
  }
  for (const lane of session.automation_lanes || []) {
    if (lane.enabled === false || !(lane.points || []).length) continue;
    if (["group", "master"].includes(String(lane.target_type || "").toLowerCase())) blockers.push(`SURROUND_BUS_AUTOMATION_NOT_CERTIFIED:${lane.id || lane.parameter || "lane"}`);
  }
  return [...new Set(blockers)];
}

function sourceSessionForSpatialTrack(session, track) {
  const next = clone(session);
  const target = (next.tracks || []).find((entry) => entry.id === track.id);
  if (target && ["POINT", "WIDE"].includes(String(target.spatial?.mode || "BED").toUpperCase())) target.pan = 0;
  next.automation_lanes = (next.automation_lanes || []).filter((lane) => !(lane.target_type === "track" && lane.target_id === track.id && lane.parameter === "pan"));
  next.spatial_audio = createMusicSpatialAudioConfig({ layout_id: "stereo" });
  return next;
}

function emptySpatialChannels(count, frames = 0) { return Array.from({ length: count }, () => new Float32Array(frames)); }

function groupProcessingOrder(session = {}) {
  const groups=(session.buses||[]).filter(bus=>bus.type==="group"),byId=new Map(groups.map(group=>[group.id,group])),memo=new Map();
  function depth(id,stack=new Set()){if(memo.has(id))return memo.get(id);if(stack.has(id))throw new Error(`CREATIVE_MUSIC_SURROUND_GROUP_CYCLE:${id}`);const group=byId.get(id);if(!group)return 0;const next=new Set(stack);next.add(id);const output=String(group.output_bus_id||"bus-master");const value=output==="bus-master"?0:depth(output,next)+1;memo.set(id,value);return value;}
  for(const group of groups)depth(group.id);return [...groups].sort((a,b)=>(memo.get(b.id)||0)-(memo.get(a.id)||0));
}

export async function renderMusicSurroundPremasterOffline({ session, assetUrls, expectedDurationSeconds = null, renderWindow = null } = {}) {
  if (!session) throw new Error("CREATIVE_MUSIC_SURROUND_SESSION_REQUIRED");
  const spatial = createMusicSpatialAudioConfig(session.spatial_audio || {});
  if (!spatial.surround_enabled) throw new Error("CREATIVE_MUSIC_SURROUND_LAYOUT_REQUIRED");
  const blockers = surroundBlockers(session);
  if (blockers.length) throw new Error(`CREATIVE_MUSIC_SURROUND_RENDER_BLOCKED:${blockers.join(",")}`);
  const audibleTracks = (session.tracks || []).filter((track) => track.mute !== true);
  if (!audibleTracks.length) throw new Error("CREATIVE_MUSIC_SURROUND_AUDIBLE_TRACK_REQUIRED");

  let outputChannels = emptySpatialChannels(spatial.channel_count);
  let sampleRate = Math.round(finite(session.sample_rate, 48000));
  let renderDurationSeconds = 0;
  const trackRenders = [];
  const auxBuses=(session.buses||[]).filter(bus=>bus.type==="aux"),auxById=new Map(auxBuses.map(bus=>[bus.id,bus])),auxInputs=new Map(auxBuses.map(bus=>[bus.id,{left:new Float32Array(0),right:new Float32Array(0)}]));
  const groups=(session.buses||[]).filter(bus=>bus.type==="group"),groupIds=new Set(groups.map(group=>group.id)),groupInputs=new Map(groups.map(group=>[group.id,emptySpatialChannels(spatial.channel_count)]));
  for (const track of audibleTracks) {
    const sourceSession = sourceSessionForSpatialTrack(session, track);
    const rendered = await renderMusicTrackStemOffline({ session: sourceSession, assetUrls, trackId: track.id, expectedDurationSeconds, renderWindow });
    sampleRate = rendered.sample_rate;
    renderDurationSeconds = Math.max(renderDurationSeconds, finite(rendered.render_duration_seconds, 0));
    const buffer = rendered.audio_buffer;
    const left = buffer.getChannelData(0);
    const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : left;
    const spatialLanes=(session.automation_lanes||[]).filter(lane=>lane.enabled!==false&&lane.target_type==="track"&&lane.target_id===track.id&&String(lane.parameter||"").startsWith("spatial:"));
    const timelineOffset=Math.max(0,finite(renderWindow?.start_seconds,0)),motion=track.sound_object_binding?applyMusicObjectMotionAcoustics({left,right,sample_rate:sampleRate,spatial:track.spatial||{},automation_lanes:spatialLanes,timeline_offset_seconds:timelineOffset}):{direct:{left,right},reflections:{enabled:false,left:new Float32Array(left.length),right:new Float32Array(right.length),taps:[]},metadata:{doppler_applied:false,reflections_applied:false}};
    let spatialized = spatialLanes.length
      ? mixMusicTrackIntoSpatialChannelsAutomated({ output_channels: emptySpatialChannels(spatial.channel_count), layout: spatial.layout_id, left:motion.direct.left, right:motion.direct.right, spatial: track.spatial || {}, sample_rate: sampleRate, lfe_low_pass_hz: spatial.lfe.low_pass_hz, automation_lanes: spatialLanes, timeline_offset_seconds: timelineOffset })
      : mixMusicTrackIntoSpatialChannels({ output_channels: emptySpatialChannels(spatial.channel_count), layout: spatial.layout_id, left:motion.direct.left, right:motion.direct.right, spatial: track.spatial || {}, sample_rate: sampleRate, lfe_low_pass_hz: spatial.lfe.low_pass_hz });
    if(motion.reflections.enabled){const reflectionSpatial={...(track.spatial||{}),mode:"WIDE",width_percent:180,divergence_percent:90,distance_meters:1,lfe_send_db:-120,center_send_db:-120,surround_send_db:-120,elevation_degrees:spatial.layout_id==="7.1.4"?finite(track.spatial?.elevation_degrees,0)*.5:0};const reflected=mixMusicTrackIntoSpatialChannels({output_channels:emptySpatialChannels(spatial.channel_count),layout:spatial.layout_id,left:motion.reflections.left,right:motion.reflections.right,spatial:reflectionSpatial,sample_rate:sampleRate,lfe_low_pass_hz:spatial.lfe.low_pass_hz});spatialized=sumMusicMultichannelBuffers(spatialized,reflected);}
    for(const send of track.sends||[]){
      if(send.enabled===false)continue;const aux=auxById.get(send.bus_id);if(!aux)throw new Error(`CREATIVE_MUSIC_SURROUND_SEND_AUX_NOT_FOUND:${track.id}:${send.bus_id}`);
      let sendLeft=left,sendRight=right,sourceContract=rendered.contract;
      if(send.pre_fader===true){const pre=await renderMusicPreFaderSendSource({session:sourceSession,assetUrls,trackId:track.id,expectedDurationSeconds,renderWindow});const preBuffer=pre.audio_buffer;sendLeft=preBuffer.getChannelData(0);sendRight=preBuffer.numberOfChannels>1?preBuffer.getChannelData(1):sendLeft;sourceContract=pre.contract;}
      const lane=(session.automation_lanes||[]).find(l=>l.enabled!==false&&l.target_type==="track"&&l.target_id===track.id&&l.parameter===`send_db:${send.bus_id}`)||null;
      const gained=applyMusicSpatialSendGainAutomation(sendLeft,sendRight,sampleRate,send,lane,Math.max(0,finite(renderWindow?.start_seconds,0)));auxInputs.set(send.bus_id,sumMusicStereoSendPair(auxInputs.get(send.bus_id),gained));
      trackRenders.push({track_id:track.id,aux_send_bus_id:send.bus_id,aux_send_pre_fader:send.pre_fader===true,aux_send_source_contract:sourceContract,aux_send_automation:Boolean(lane)});
    }
    const destination=String(track.output_bus_id||"bus-master");
    if(destination!=="bus-master"&&!groupIds.has(destination))throw new Error(`CREATIVE_MUSIC_SURROUND_TRACK_OUTPUT_NOT_FOUND:${track.id}:${destination}`);
    if(destination==="bus-master")outputChannels=sumMusicMultichannelBuffers(outputChannels,spatialized);
    else groupInputs.set(destination,sumMusicMultichannelBuffers(groupInputs.get(destination),spatialized));
    trackRenders.push({ track_id: track.id, source_contract: rendered.contract, spatial: clone(track.spatial || {}), spatial_automation_lane_count: spatialLanes.length, sound_object_binding: track.sound_object_binding || null, motion_acoustics: motion.metadata, output_bus_id: destination, render_duration_seconds: rendered.render_duration_seconds });
  }

  const groupRenders=[],processedGroups=new Map();
  for(const group of groupProcessingOrder(session)){
    const input=groupInputs.get(group.id)||emptySpatialChannels(spatial.channel_count);
    const processed=applyMusicMultichannelBusProcessing(input,sampleRate,{processing:group.processing||{},gain_db:group.gain_db,mute:group.mute===true});
    processedGroups.set(group.id,processed.channels);
    groupRenders.push({group_id:group.id,output_bus_id:String(group.output_bus_id||"bus-master"),gain_reduction_db_min:processed.gain_reduction_db_min,linked_compression:true,dialogue_ducking_gain_reduction_db_min:0});
    const destination=String(group.output_bus_id||"bus-master");
    if(destination!=="bus-master"){if(groupInputs.has(destination))groupInputs.set(destination,sumMusicMultichannelBuffers(groupInputs.get(destination),processed.channels));else throw new Error(`CREATIVE_MUSIC_SURROUND_GROUP_OUTPUT_NOT_FOUND:${group.id}:${destination}`);}
  }
  let dialogueDuckingApplied=false,dialogueDuckingReductionDbMin=0;
  const postPolicy=session.audio_post_mix?normalizeAudioPostMixPolicy(session.audio_post_mix):null;
  if(postPolicy?.dialogue_priority===true&&postPolicy.dialogue_ducking?.enabled===true){
    const languageIds=["bus-post-dx","bus-post-vo","bus-post-adr"],targetIds=["bus-post-mx","bus-post-fx","bus-post-fol","bus-post-amb"];
    let key=emptySpatialChannels(spatial.channel_count);for(const id of languageIds){if(processedGroups.has(id))key=sumMusicMultichannelBuffers(key,processedGroups.get(id));}
    const keyHasSignal=key.some(channel=>channel.some(sample=>Math.abs(sample)>1e-8));
    if(keyHasSignal){for(const id of targetIds){const target=processedGroups.get(id);if(!target)continue;const ducked=applyMusicLinkedMultichannelSidechain(target,key,sampleRate,postPolicy.dialogue_ducking);processedGroups.set(id,ducked.channels);dialogueDuckingApplied=dialogueDuckingApplied||ducked.sidechain_applied===true;dialogueDuckingReductionDbMin=Math.min(dialogueDuckingReductionDbMin,ducked.gain_reduction_db_min);const row=groupRenders.find(item=>item.group_id===id);if(row)row.dialogue_ducking_gain_reduction_db_min=ducked.gain_reduction_db_min;}}
  }
  for(const group of groupProcessingOrder(session)){if(String(group.output_bus_id||"bus-master")!=="bus-master")continue;const channels=processedGroups.get(group.id)||emptySpatialChannels(spatial.channel_count);outputChannels=sumMusicMultichannelBuffers(outputChannels,channels);}


  const auxRenders=[];
  for(const aux of auxBuses){
    const input=auxInputs.get(aux.id)||{left:new Float32Array(0),right:new Float32Array(0)};
    const hasSignal=(input.left?.length||0)>0||(input.right?.length||0)>0;if(!hasSignal)continue;
    const wet=await renderMusicSurroundAuxEffect({bus:aux,input,sampleRate});
    renderDurationSeconds=Math.max(renderDurationSeconds,wet.left.length/sampleRate,wet.right.length/sampleRate);
    const spatialized=mixMusicTrackIntoSpatialChannels({output_channels:emptySpatialChannels(spatial.channel_count),layout:spatial.layout_id,left:wet.left,right:wet.right,spatial:aux.spatial||{mode:"BED",center_send_db:-120,lfe_send_db:-120,surround_send_db:-120},sample_rate:sampleRate,lfe_low_pass_hz:spatial.lfe.low_pass_hz});
    outputChannels=sumMusicMultichannelBuffers(outputChannels,spatialized);
    auxRenders.push({bus_id:aux.id,effect_type:aux.effect_type,spatial:clone(aux.spatial||{}),tail_seconds:wet.tail_seconds,contract:wet.contract,impulse_response:wet.impulse_response||null});
  }

  const master=(session.buses||[]).find(bus=>bus.id==="bus-master")||{};
  const masterProcessed=applyMusicMultichannelBusProcessing(outputChannels,sampleRate,{processing:master.processing||{},gain_db:master.gain_db,mute:master.mute===true});
  outputChannels=masterProcessed.channels;
  const levels = analyseMusicDiscreteChannels(outputChannels, spatial.speaker_order);
  const downmix = downmixMusicSpatialChannelsToStereo(outputChannels, spatial.layout_id);
  const downmixLevels = analyseMusicDiscreteChannels([downmix.left, downmix.right], ["L", "R"]);
  const elevationAutomationPresent=(session.automation_lanes||[]).some(lane=>lane.enabled!==false&&lane.parameter==="spatial:elevation_degrees"&&(lane.points||[]).length);
  const staticElevationPresent=(session.tracks||[]).some(track=>Math.abs(finite(track.spatial?.elevation_degrees,0))>0.001);
  const distanceAutomationPresent=(session.automation_lanes||[]).some(lane=>lane.enabled!==false&&lane.parameter==="spatial:distance_meters"&&(lane.points||[]).length);
  const wav = encodeMusicChannelsWav24(outputChannels, sampleRate, { channel_layout: spatial.layout_id, bwf: session.picture_lock?.picture_lock_digest ? { enabled: true, start_timecode: session.picture_lock.start_timecode || "00:00:00:00", frame_rate: session.picture_lock.frame_rate || 24, picture_lock_digest: session.picture_lock.picture_lock_digest, description: `${session.title || "Avantiqo"} professional surround render`, originator: "Avantiqo Professional Audio Engine" } : null });
  return {
    contract: "AVANTIQO_MUSIC_OFFLINE_SURROUND_PREMASTER_V1",
    renderer: "AVANTIQO_MUSIC_OFFLINE_SPATIAL_RENDERER_V1",
    blob: wav.blob,
    sample_rate: wav.sample_rate,
    channels: wav.channels,
    bit_depth: wav.bit_depth,
    bwf_enabled: wav.bwf_enabled,
    bext_present: wav.bext_present,
    time_reference_samples: wav.time_reference_samples,
    start_timecode: wav.start_timecode,
    channel_layout: spatial.layout_id,
    speaker_order: [...spatial.speaker_order],
    program_duration_seconds: renderWindow && Number.isFinite(renderWindow.end_seconds) ? Math.max(0,renderWindow.end_seconds-Math.max(0,finite(renderWindow.start_seconds,0))) : (Number.isFinite(expectedDurationSeconds) ? expectedDurationSeconds : renderDurationSeconds),
    render_window: renderWindow ? { start_seconds: Math.max(0,finite(renderWindow.start_seconds,0)), end_seconds: renderWindow.end_seconds, absolute_timeline: true } : null,
    render_duration_seconds: wav.duration_seconds,
    levels,
    per_speaker_levels: levels.per_speaker,
    immersive_object_rendering: { distance_attenuation_applied: distanceAutomationPresent || (session.tracks||[]).some(track=>Number.isFinite(Number(track.spatial?.distance_meters))), elevation_present: elevationAutomationPresent || staticElevationPresent, elevation_rendering: (elevationAutomationPresent || staticElevationPresent) ? (spatial.layout_id === "7.1.4" ? "NATIVE_HEIGHT_CHANNELS" : "BINAURAL_HRTF_REQUIRED_FOR_TRUE_ELEVATION") : "NOT_USED", horizontal_bed_elevation_collapsed: Boolean((elevationAutomationPresent || staticElevationPresent) && spatial.layout_id !== "7.1.4"), native_height_channels: spatial.layout_id === "7.1.4", dolby_branded: false },
    stereo_downmix_qc: { ...downmixLevels, matrix: downmix.matrix, delivery_master: false },
    lfe: { explicit_send_only: true, low_pass_hz: spatial.lfe.low_pass_hz, automatic_full_range_routing: false },
    track_renders: trackRenders,
    group_renders: groupRenders,
    aux_renders: auxRenders,
    aux_send_processing_applied: auxRenders.length > 0,
    pre_post_fader_send_semantics_preserved: true,
    send_automation_supported: true,
    spatial_movement_automation_supported: true,
    spatial_automation_interpolation: "64_FRAME_GAIN_INTERPOLATION",
    group_processing_applied: groupRenders.length > 0,
    nested_group_routing_applied: groupRenders.length > 0,
    master_processing_applied: true,
    master_linked_compression: true,
    master_gain_reduction_db_min: masterProcessed.gain_reduction_db_min,
    audio_post_dialogue_priority: postPolicy?.dialogue_priority === true,
    dialogue_ducking_applied: dialogueDuckingApplied,
    dialogue_ducking_gain_reduction_db_min: Number(dialogueDuckingReductionDbMin.toFixed(3)),
    release_limiter_applied: false,
    true_peak_certified: false,
    dolby_branded: false,
    original_assets_preserved: true,
    destructive_processing: false,
  };
}

export const CreativeMusicOfflineSurroundRenderRuntime = Object.freeze({ contract: "AVANTIQO_MUSIC_OFFLINE_SURROUND_PREMASTER_V1", render: renderMusicSurroundPremasterOffline });
