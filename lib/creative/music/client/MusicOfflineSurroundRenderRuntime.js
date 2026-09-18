import { renderMusicTrackStemOffline } from "./MusicOfflineStemRenderRuntime";
import { encodeMusicChannelsWav24 } from "./MusicWav24Runtime.js";
import { createMusicSpatialAudioConfig } from "../runtime/CreativeMusicSpatialAudioRuntime.js";
import { analyseMusicDiscreteChannels, downmixMusicSpatialChannelsToStereo, mixMusicTrackIntoSpatialChannels } from "./MusicSpatialMixMathRuntime.js";

function clone(value) { return structuredClone(value); }
function finite(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }

function surroundBlockers(session = {}) {
  const blockers = [];
  const groups = (session.buses || []).filter((bus) => bus.type === "group");
  const aux = (session.buses || []).filter((bus) => bus.type === "aux");
  if (groups.length) blockers.push("SURROUND_GROUP_BUS_GRAPH_NOT_CERTIFIED");
  if (aux.length || (session.tracks || []).some((track) => (track.sends || []).some((send) => send.enabled !== false))) blockers.push("SURROUND_AUX_SEND_GRAPH_NOT_CERTIFIED");
  if ((session.tracks || []).some((track) => (track.spatial?.automation_lane_ids || []).length)) blockers.push("SURROUND_SPATIAL_AUTOMATION_NOT_CERTIFIED");
  const master = (session.buses || []).find((bus) => bus.id === "bus-master");
  const processing = master?.processing || {};
  const eq = processing.eq || {};
  const masterAltered = processing.compressor?.enabled === true || [eq.low_shelf_db, eq.presence_db, eq.high_shelf_db].some((value) => Math.abs(finite(value, 0)) > 1e-9) || Math.abs(finite(master?.gain_db, 0)) > 1e-9;
  if (masterAltered) blockers.push("SURROUND_MASTER_PROCESSING_NOT_CERTIFIED");
  return blockers;
}

function sourceSessionForSpatialTrack(session, track) {
  const next = clone(session);
  const target = (next.tracks || []).find((entry) => entry.id === track.id);
  if (target && ["POINT", "WIDE"].includes(String(target.spatial?.mode || "BED").toUpperCase())) target.pan = 0;
  next.automation_lanes = (next.automation_lanes || []).filter((lane) => !(lane.target_type === "track" && lane.target_id === track.id && lane.parameter === "pan"));
  next.spatial_audio = createMusicSpatialAudioConfig({ layout_id: "stereo" });
  return next;
}

export async function renderMusicSurroundPremasterOffline({ session, assetUrls, expectedDurationSeconds = null } = {}) {
  if (!session) throw new Error("CREATIVE_MUSIC_SURROUND_SESSION_REQUIRED");
  const spatial = createMusicSpatialAudioConfig(session.spatial_audio || {});
  if (!spatial.surround_enabled) throw new Error("CREATIVE_MUSIC_SURROUND_LAYOUT_REQUIRED");
  const blockers = surroundBlockers(session);
  if (blockers.length) throw new Error(`CREATIVE_MUSIC_SURROUND_RENDER_BLOCKED:${blockers.join(",")}`);
  const audibleTracks = (session.tracks || []).filter((track) => track.mute !== true);
  if (!audibleTracks.length) throw new Error("CREATIVE_MUSIC_SURROUND_AUDIBLE_TRACK_REQUIRED");

  let outputChannels = Array.from({ length: spatial.channel_count }, () => new Float32Array(0));
  let sampleRate = Math.round(finite(session.sample_rate, 48000));
  let renderDurationSeconds = 0;
  const trackRenders = [];
  for (const track of audibleTracks) {
    const sourceSession = sourceSessionForSpatialTrack(session, track);
    const rendered = await renderMusicTrackStemOffline({ session: sourceSession, assetUrls, trackId: track.id, expectedDurationSeconds });
    sampleRate = rendered.sample_rate;
    renderDurationSeconds = Math.max(renderDurationSeconds, finite(rendered.render_duration_seconds, 0));
    const buffer = rendered.audio_buffer;
    const left = buffer.getChannelData(0);
    const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : left;
    outputChannels = mixMusicTrackIntoSpatialChannels({ output_channels: outputChannels, layout: spatial.layout_id, left, right, spatial: track.spatial || {}, sample_rate: sampleRate, lfe_low_pass_hz: spatial.lfe.low_pass_hz });
    trackRenders.push({ track_id: track.id, source_contract: rendered.contract, spatial: clone(track.spatial || {}), render_duration_seconds: rendered.render_duration_seconds });
  }

  const levels = analyseMusicDiscreteChannels(outputChannels, spatial.speaker_order);
  const downmix = downmixMusicSpatialChannelsToStereo(outputChannels, spatial.layout_id);
  const downmixLevels = analyseMusicDiscreteChannels([downmix.left, downmix.right], ["L", "R"]);
  const wav = encodeMusicChannelsWav24(outputChannels, sampleRate, { channel_layout: spatial.layout_id });
  return {
    contract: "AVANTIQO_MUSIC_OFFLINE_SURROUND_PREMASTER_V1",
    renderer: "AVANTIQO_MUSIC_OFFLINE_SPATIAL_RENDERER_V1",
    blob: wav.blob,
    sample_rate: wav.sample_rate,
    channels: wav.channels,
    bit_depth: wav.bit_depth,
    channel_layout: spatial.layout_id,
    speaker_order: [...spatial.speaker_order],
    program_duration_seconds: Number.isFinite(expectedDurationSeconds) ? expectedDurationSeconds : renderDurationSeconds,
    render_duration_seconds: wav.duration_seconds,
    levels,
    per_speaker_levels: levels.per_speaker,
    stereo_downmix_qc: { ...downmixLevels, matrix: downmix.matrix, delivery_master: false },
    lfe: { explicit_send_only: true, low_pass_hz: spatial.lfe.low_pass_hz, automatic_full_range_routing: false },
    track_renders: trackRenders,
    master_processing_applied: false,
    release_limiter_applied: false,
    true_peak_certified: false,
    dolby_branded: false,
    original_assets_preserved: true,
    destructive_processing: false,
  };
}

export const CreativeMusicOfflineSurroundRenderRuntime = Object.freeze({ contract: "AVANTIQO_MUSIC_OFFLINE_SURROUND_PREMASTER_V1", render: renderMusicSurroundPremasterOffline });
