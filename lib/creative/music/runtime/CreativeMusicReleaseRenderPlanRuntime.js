import { validateMusicAutomation } from "./CreativeMusicAutomationRuntime";
import { normalizeMusicGroupProcessing, validateMusicGroupProcessing } from "./CreativeMusicBusProcessingRuntime";
import { validateMusicComp } from "./CreativeMusicCompingRuntime";
import { validateMusicInserts } from "./CreativeMusicInsertRuntime";
import { normalizeMusicMasterProcessing, validateMusicMasterProcessing } from "./CreativeMusicMasterBusRuntime";
import { ensureMusicMixerRouting, validateMusicMixerRouting } from "./CreativeMusicMixerRoutingRuntime";
import { normalizeMusicChannelStrip, validateMusicMultitrackProject } from "./CreativeMusicMultitrackRuntime";
import { normalizeMusicSourceCleanup, validateMusicSourceCleanup } from "./CreativeMusicSourceCleanupRuntime";

const CONTRACT = "AVANTIQO_MUSIC_RELEASE_RENDER_PLAN_V3";
const RENDERER = "AVANTIQO_MUSIC_OFFLINE_AUDIO_RENDERER_V1";

const MASTERING_PROFILES = Object.freeze({
  streaming: { target_lufs: -14, true_peak_dbtp: -1, loudness_range_lu: 11 },
  club: { target_lufs: -9, true_peak_dbtp: -0.8, loudness_range_lu: 8 },
  broadcast: { target_lufs: -16, true_peak_dbtp: -1, loudness_range_lu: 10 },
});

function text(value) { return String(value ?? "").trim(); }
function finite(value, fallback = 0) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }
function clone(value) { return structuredClone(value); }

function compPlaybackClips(track = {}) {
  const regions = Array.isArray(track.comp?.regions) ? track.comp.regions : [];
  if (!regions.length) return null;
  return regions.map((region, index) => ({
    id: region.id || `release-comp-${track.id}-${index}`,
    source_asset_id: text(region.source_asset_id),
    start_seconds: Math.max(0, finite(region.start_seconds, 0)),
    duration_seconds: Math.max(0, finite(region.end_seconds, 0) - finite(region.start_seconds, 0)),
    source_offset_seconds: Math.max(0, finite(region.source_offset_seconds, 0)),
    gain_db: finite(region.gain_db, 0),
    fade_in_seconds: Math.max(0, finite(region.fade_in_seconds, track.comp?.crossfade_default_seconds || 0.015)),
    fade_out_seconds: Math.max(0, finite(region.fade_out_seconds, track.comp?.crossfade_default_seconds || 0.015)),
    muted: false, loop_enabled: false, reversed: false, warp_mode: "off", comp_region: true, destructive_edit: false,
  }));
}

function selectedTakePlaybackClips(track = {}) {
  const takes = Array.isArray(track.takes) ? track.takes : [];
  const clips = Array.isArray(track.clips) ? track.clips : [];
  if (takes.length <= 1) return clips;
  const selected = takes.find((take) => take.selected_for_comp === true) || takes[0];
  if (!selected?.source_asset_id) return clips.slice(0, 1);
  const matching = clips.filter((clip) => clip.source_asset_id === selected.source_asset_id);
  if (matching.length) return matching;
  return [{
    id: `release-take-${selected.id}`, source_asset_id: selected.source_asset_id,
    start_seconds: Math.max(0, finite(selected.start_seconds, 0)), duration_seconds: Math.max(0, finite(selected.duration_seconds, 0)),
    source_offset_seconds: 0, gain_db: 0, fade_in_seconds: 0, fade_out_seconds: 0,
    muted: false, loop_enabled: false, reversed: false, warp_mode: "off", selected_take: true, destructive_edit: false,
  }];
}

export function resolveMusicReleaseTrackClips(track = {}) {
  return (compPlaybackClips(track) || selectedTakePlaybackClips(track))
    .filter((clip) => clip && clip.muted !== true && finite(clip.duration_seconds, 0) > 0)
    .map((clip) => ({
      id: text(clip.id), source_asset_id: text(clip.source_asset_id),
      start_seconds: Math.max(0, finite(clip.start_seconds, 0)), duration_seconds: Math.max(0, finite(clip.duration_seconds, 0)),
      source_offset_seconds: Math.max(0, finite(clip.source_offset_seconds, 0)), gain_db: finite(clip.gain_db, 0),
      fade_in_seconds: Math.max(0, finite(clip.fade_in_seconds, 0)), fade_out_seconds: Math.max(0, finite(clip.fade_out_seconds, 0)),
      loop_enabled: clip.loop_enabled === true,
      loop_length_seconds: clip.loop_length_seconds == null ? null : Math.max(0, finite(clip.loop_length_seconds, 0)),
      reversed: clip.reversed === true, warp_mode: text(clip.warp_mode || "off").toLowerCase(),
      comp_region: clip.comp_region === true, selected_take: clip.selected_take === true, destructive_edit: false,
    }));
}

function masteringProfile(input = {}, masterProcessing = {}) {
  const profileName = text(input.profile || input.mastering_profile || "streaming").toLowerCase();
  const base = MASTERING_PROFILES[profileName] || MASTERING_PROFILES.streaming;
  return {
    profile: MASTERING_PROFILES[profileName] ? profileName : "streaming",
    target_lufs: finite(input.target_lufs, base.target_lufs),
    true_peak_dbtp: finite(input.true_peak_dbtp, masterProcessing.preview_ceiling?.target_true_peak_dbtp ?? base.true_peak_dbtp),
    loudness_range_lu: finite(input.loudness_range_lu, base.loudness_range_lu),
    tolerance_lu: 0.5, true_peak_tolerance_db: 0.1, release_limiter_required: true,
  };
}

function groupRenderOrder(groups = []) {
  const byId = new Map(groups.map((group) => [group.id, group]));
  const depth = new Map();
  function resolve(id, stack = new Set()) {
    if (depth.has(id)) return depth.get(id);
    if (stack.has(id)) throw new Error(`CREATIVE_MUSIC_RELEASE_GROUP_CYCLE:${id}`);
    const group = byId.get(id); if (!group) return 0;
    const next = new Set(stack); next.add(id);
    const output = text(group.output_bus_id || "bus-master");
    const value = output === "bus-master" ? 0 : resolve(output, next) + 1;
    depth.set(id, value); return value;
  }
  for (const group of groups) resolve(group.id);
  return [...groups].sort((left, right) => (depth.get(right.id) || 0) - (depth.get(left.id) || 0));
}

function blocker(code, message, detail = {}) { return { code, message, ...detail }; }

function audibleMidiTracks(session = {}) {
  return (session.midi?.tracks || []).filter((track) => {
    if (track.mute === true) return false;
    return (track.clips || []).some((clip) => (clip.notes || []).some((note) => note.muted !== true));
  });
}

function midiReleaseBlockers(session = {}) {
  const blockers = [];
  const audioTracksById = new Map((session.tracks || []).map((track) => [track.id, track]));
  for (const midiTrack of audibleMidiTracks(session)) {
    const link = midiTrack.release_bounce;
    const audioTrack = link?.audio_track_id ? audioTracksById.get(link.audio_track_id) : null;
    const linkedClip = audioTrack?.clips?.find((clip) => clip.source_asset_id === link?.asset_id);
    const valid = link?.contract === "AVANTIQO_MUSIC_MIDI_RELEASE_BOUNCE_LINK_V1"
      && Boolean(link.asset_id)
      && Boolean(audioTrack)
      && Boolean(linkedClip)
      && audioTrack.mute !== true;
    if (!valid) {
      blockers.push(blocker(
        "MIDI_TRACKS_REQUIRE_AUDIO_BOUNCE_FOR_RELEASE",
        "Bounce every audible MIDI/instrument track to a linked 24-bit audio track before release rendering.",
        { midi_track_id: midiTrack.id, midi_track_name: midiTrack.name || "MIDI Track" },
      ));
    }
  }
  return blockers;
}

function releaseBlockers(session, tracks) {
  const blockers = [...midiReleaseBlockers(session)];
  const soloTrackIds = tracks.filter((track) => track.solo === true).map((track) => track.id);
  if (soloTrackIds.length) {
    blockers.push(blocker(
      "SOLO_ACTIVE_RELEASE_BLOCKER",
      "Clear track Solo before release or stem rendering. Use mute or an explicit alternate export for intentional exclusions.",
      { track_ids: soloTrackIds },
    ));
  }
  for (const track of tracks) {
    for (const clip of track.clips) {
      if (clip.loop_enabled) blockers.push(blocker("LOOP_CLIP_RELEASE_RENDER_PENDING", "Loop-expanded clips are not yet offline-render certified.", { track_id: track.id, clip_id: clip.id }));
      if (clip.reversed) blockers.push(blocker("REVERSE_CLIP_RENDER_PARITY_PENDING", "Reverse clip playback is not yet proven identical between preview and offline release rendering.", { track_id: track.id, clip_id: clip.id }));
      if (clip.warp_mode && clip.warp_mode !== "off") blockers.push(blocker("WARP_RELEASE_RENDER_PENDING", "Warp/time-stretch is not yet offline-render certified.", { track_id: track.id, clip_id: clip.id, warp_mode: clip.warp_mode }));
    }
  }
  return blockers;
}

function trackPlan(track = {}) {
  validateMusicComp(track); validateMusicInserts(track); validateMusicSourceCleanup(track);
  return {
    id: track.id, name: track.name || "Track", type: track.type || "audio",
    mute: track.mute === true, solo: track.solo === true, gain_db: finite(track.gain_db, 0), pan: finite(track.pan, 0),
    output_bus_id: text(track.output_bus_id || "bus-master"), source_cleanup: normalizeMusicSourceCleanup(track.source_cleanup || {}),
    channel_strip: normalizeMusicChannelStrip(track.channel_strip || {}), inserts: clone(track.inserts || []), sends: clone(track.sends || []),
    clips: resolveMusicReleaseTrackClips(track), take_count: (track.takes || []).length, comp_active: Boolean(track.comp?.regions?.length),
    source_midi_track_id: text(track.source_midi_track_id) || null,
    midi_bounce_contract: text(track.midi_bounce_contract) || null,
    destructive_processing_allowed: false,
  };
}

export function buildMusicReleaseRenderPlan(sessionInput = {}, input = {}) {
  const session = ensureMusicMixerRouting(sessionInput);
  validateMusicMultitrackProject(session); validateMusicMixerRouting(session); validateMusicGroupProcessing(session);
  validateMusicMasterProcessing(session); validateMusicAutomation(session);
  const tracks = (session.tracks || []).map(trackPlan);
  const sourceAssetIds = [...new Set(tracks.flatMap((track) => track.clips.map((clip) => clip.source_asset_id)).filter(Boolean))];
  const groups = (session.buses || []).filter((bus) => bus.type === "group").map((bus) => ({
    id: bus.id, name: bus.name || "Group", output_bus_id: text(bus.output_bus_id || "bus-master"),
    gain_db: finite(bus.gain_db, 0), pan: finite(bus.pan, 0), mute: bus.mute === true,
    processing: normalizeMusicGroupProcessing(bus.processing || {}), destructive_processing_allowed: false,
  }));
  const masterBus = session.buses.find((bus) => bus.id === "bus-master") || {};
  const masterProcessing = normalizeMusicMasterProcessing(masterBus.processing || {});
  const blockers = releaseBlockers(session, tracks);
  const songEnd = Math.max(0, ...tracks.flatMap((track) => track.clips.map((clip) => clip.start_seconds + clip.duration_seconds)));
  const audibleTrackIds = tracks.filter((track) => track.mute !== true).map((track) => track.id);
  const vocalTrackIds = tracks.filter((track) => track.type === "vocal" && track.mute !== true).map((track) => track.id);
  const nonVocalTrackIds = tracks.filter((track) => track.type !== "vocal" && track.mute !== true).map((track) => track.id);
  return {
    contract: CONTRACT, renderer: RENDERER, project_id: session.id,
    project_revision: Math.max(0, Math.round(finite(session.revision, 0))), title: text(session.title || "Music Project"),
    sample_rate: Math.round(finite(session.sample_rate, 48000)), bit_depth: 24, channels: 2, duration_seconds: songEnd,
    bpm: finite(session.bpm, 96), time_signature: session.time_signature || "4/4", source_asset_ids: sourceAssetIds,
    midi_release_policy: {
      audible_midi_track_count: audibleMidiTracks(session).length,
      explicit_bounce_required: true,
      silent_midi_omission_forbidden: true,
    },
    tracks, groups, group_render_order: groupRenderOrder(groups).map((group) => group.id), automation_lanes: clone(session.automation_lanes || []),
    aux_buses: clone((session.buses || []).filter((bus) => bus.type === "aux")),
    master: { id: "bus-master", gain_db: finite(masterBus.gain_db, 0), mute: masterBus.mute === true, processing: masterProcessing, mastering: masteringProfile(input.mastering || input, masterProcessing) },
    exports: {
      mix_pre_master: { enabled: true, format: "wav", codec: "pcm_s24le", stage: "post-master-processing-pre-release-limiter" },
      release_wav: { enabled: true, format: "wav", codec: "pcm_s24le" },
      release_mp3: { enabled: input.release_mp3 !== false, format: "mp3", bitrate: "320k" },
      track_stems: { enabled: input.track_stems !== false, track_ids: audibleTrackIds, stage: "post-track-processing-pre-group" },
      group_stems: { enabled: input.group_stems !== false, group_ids: groups.filter((group) => group.mute !== true).map((group) => group.id), stage: "post-group-processing-pre-master" },
      instrumental: { enabled: input.instrumental === true, track_ids: nonVocalTrackIds }, acapella: { enabled: input.acapella === true, track_ids: vocalTrackIds },
    },
    readiness: {
      release_render_ready: blockers.length === 0 && sourceAssetIds.length > 0 && songEnd > 0,
      blocker_count: blockers.length, blockers, source_assets_required: sourceAssetIds.length,
      midi_audio_bounce_required: audibleMidiTracks(session).length > 0,
      offline_audio_context_required: true, audio_worklet_required_when_dynamics_inserts_enabled: true,
      preview_graph_parity_required: true, static_pan_supported: true, clip_reverse_supported: false,
      track_cleanup_supported: true, track_eq_compression_supported: true, engineering_inserts_supported: true,
      nested_groups_supported: true, group_eq_compression_supported: true, master_eq_compression_supported: true,
      aux_send_render_supported: true, mixer_automation_render_supported: true,
      track_stem_render_supported: true, group_stem_render_supported: true,
      instrumental_render_supported: true, acapella_render_supported: true,
      loop_clip_render_supported: false, warp_render_supported: false,
      release_limiter_via_canonical_audio_finish: true,
    },
    safety: {
      original_assets_immutable: true, destructive_processing: false, render_creates_new_assets_only: true,
      browser_preview_is_not_release_master: true, release_blocked_on_unsupported_mix_state: true,
      active_solo_blocks_release_and_stems: true,
      silent_midi_omission_forbidden: true,
      release_finish_stage_separate: true, provider_job_submitted: false, endpoint_mutation_performed: false,
    },
  };
}

export const CreativeMusicReleaseRenderPlanRuntime = {
  contract: CONTRACT, renderer: RENDERER, masteringProfiles: MASTERING_PROFILES,
  resolveTrackClips: resolveMusicReleaseTrackClips, build: buildMusicReleaseRenderPlan,
};
