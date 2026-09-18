import { renderMusicMultitrackOffline } from "./MusicOfflineMixRenderRuntime";
import { tracksForProfessionalAudioStem } from "../runtime/CreativeProfessionalAudioEngineRuntime.js";
import { filterTrackForAudioPostLanguage, isLanguageScopedPostStem, normalizeAudioPostLanguage } from "../runtime/CreativeAudioPostVersionRuntime.js";

function text(value) { return String(value ?? "").trim(); }
function clone(value) { return structuredClone(value); }

function neutralMaster() {
  return {
    id: "bus-master",
    type: "master",
    name: "Stem Master",
    gain_db: 0,
    pan: 0,
    mute: false,
    solo: false,
    processing: {
      enabled: true,
      eq: {
        high_pass_hz: 20,
        low_shelf_hz: 100,
        low_shelf_db: 0,
        presence_hz: 3200,
        presence_db: 0,
        presence_q: 0.7,
        high_shelf_hz: 9000,
        high_shelf_db: 0,
      },
      compressor: {
        enabled: false,
        threshold_db: -12,
        ratio: 1.8,
        attack_ms: 30,
        release_ms: 250,
        knee_db: 4,
        makeup_db: 0,
      },
      preview_ceiling: { enabled: false, target_true_peak_dbtp: -1 },
      release_limiter_enabled: false,
      true_peak_certification: false,
    },
  };
}

function activeLane(lane) {
  return lane?.enabled !== false && Array.isArray(lane?.points) && lane.points.length > 0;
}

function durationOfSession(session) {
  return Math.max(0, ...(session.tracks || []).flatMap((track) => (track.clips || []).map((clip) => Number(clip.start_seconds || 0) + Number(clip.duration_seconds || 0))));
}

function groupPathTo(groupId, groupsById, targetId) {
  let current = text(groupId || "bus-master");
  const seen = new Set();
  while (current && current !== "bus-master") {
    if (current === targetId) return true;
    if (seen.has(current)) return false;
    seen.add(current);
    const group = groupsById.get(current);
    if (!group) return false;
    current = text(group.output_bus_id || "bus-master");
  }
  return false;
}

export function buildMusicTrackStemSession(sessionInput, trackId) {
  const session = clone(sessionInput);
  const id = text(trackId);
  const track = (session.tracks || []).find((entry) => entry.id === id);
  if (!track) throw new Error(`CREATIVE_MUSIC_TRACK_STEM_TRACK_NOT_FOUND:${id}`);
  const stemTrack = clone(track);
  stemTrack.mute = false;
  stemTrack.solo = false;
  stemTrack.output_bus_id = "bus-master";
  stemTrack.sends = [];
  session.tracks = [stemTrack];
  session.buses = [neutralMaster()];
  session.automation_lanes = (session.automation_lanes || []).filter((lane) => activeLane(lane) && lane.target_type === "track" && lane.target_id === id);
  return session;
}

export function buildMusicTrackPreFaderSendSession(sessionInput, trackId) {
  const session = clone(sessionInput);
  const id = text(trackId);
  const track = (session.tracks || []).find((entry) => entry.id === id);
  if (!track) throw new Error(`CREATIVE_MUSIC_TRACK_PREFADER_TRACK_NOT_FOUND:${id}`);
  const sendTrack = clone(track);
  sendTrack.mute = false;
  sendTrack.solo = false;
  sendTrack.gain_db = 0;
  sendTrack.pan = 0;
  sendTrack.output_bus_id = "bus-master";
  sendTrack.sends = [];
  session.tracks = [sendTrack];
  session.buses = [neutralMaster()];
  session.automation_lanes = (session.automation_lanes || []).filter((lane) => activeLane(lane) && lane.target_type === "track" && lane.target_id === id && !["gain_db", "pan"].includes(lane.parameter) && !String(lane.parameter || "").startsWith("send_db:"));
  return session;
}

export function buildMusicTrackEvidenceSession(sessionInput, trackId) {
  const session = clone(sessionInput);
  const id = text(trackId);
  const track = (session.tracks || []).find((entry) => entry.id === id);
  if (!track) throw new Error(`CREATIVE_MUSIC_TRACK_EVIDENCE_TRACK_NOT_FOUND:${id}`);
  const evidenceTrack = clone(track);
  evidenceTrack.mute = false;
  evidenceTrack.solo = false;
  evidenceTrack.gain_db = 0;
  evidenceTrack.pan = 0;
  evidenceTrack.output_bus_id = "bus-master";
  evidenceTrack.sends = [];
  evidenceTrack.inserts = [];
  evidenceTrack.evidence_render_bypass_processing = true;
  session.tracks = [evidenceTrack];
  session.buses = [neutralMaster()];
  session.automation_lanes = [];
  return session;
}

export function buildMusicGroupStemSession(sessionInput, groupId) {
  const session = clone(sessionInput);
  const id = text(groupId);
  const groups = (session.buses || []).filter((bus) => bus.type === "group");
  const groupsById = new Map(groups.map((group) => [group.id, group]));
  const target = groupsById.get(id);
  if (!target) throw new Error(`CREATIVE_MUSIC_GROUP_STEM_GROUP_NOT_FOUND:${id}`);

  const includedGroupIds = new Set(groups.filter((group) => group.id === id || groupPathTo(group.id, groupsById, id)).map((group) => group.id));
  const includedTrackIds = new Set((session.tracks || []).filter((track) => includedGroupIds.has(text(track.output_bus_id || "bus-master"))).map((track) => track.id));
  session.tracks = (session.tracks || []).filter((track) => includedTrackIds.has(track.id)).map((track) => ({ ...track, solo: false }));
  const stemGroups = groups.filter((group) => includedGroupIds.has(group.id)).map((group) => ({ ...group }));
  const stemTarget = stemGroups.find((group) => group.id === id);
  stemTarget.output_bus_id = "bus-master";
  session.buses = [neutralMaster(), ...stemGroups];
  session.automation_lanes = (session.automation_lanes || []).filter((lane) => {
    if (!activeLane(lane)) return false;
    return (lane.target_type === "track" && includedTrackIds.has(lane.target_id)) ||
      (lane.target_type === "group" && includedGroupIds.has(lane.target_id));
  });
  return session;
}

export function buildProfessionalAudioStemSession(sessionInput, stemId, options = {}) {
  const session = clone(sessionInput);
  const language = isLanguageScopedPostStem(stemId) ? normalizeAudioPostLanguage(options.language) : null;
  const selected = tracksForProfessionalAudioStem(session.tracks || [], stemId).map((track) => language ? filterTrackForAudioPostLanguage(track, language) : track).filter((track) => (track.clips || []).length > 0 || (track.takes || []).length > 0);
  if (!selected.length) throw new Error(`CREATIVE_PRO_AUDIO_STEM_EMPTY:${text(stemId).toUpperCase()}`);
  const selectedIds = new Set(selected.map((track) => track.id));
  session.tracks = (session.tracks || []).filter((track) => selectedIds.has(track.id)).map((track) => ({ ...track, mute: false, solo: false }));
  session.automation_lanes = (session.automation_lanes || []).filter((lane) => lane.target_type !== "track" || selectedIds.has(lane.target_id));
  return session;
}

export async function renderProfessionalAudioStemOffline({ session, assetUrls, stemId, language = null, expectedDurationSeconds = null } = {}) {
  const stemSession = buildProfessionalAudioStemSession(session, stemId, { language });
  const rendered = await renderMusicMultitrackOffline({ session: stemSession, assetUrls, expectedDurationSeconds: Number.isFinite(expectedDurationSeconds) ? expectedDurationSeconds : durationOfSession(session) });
  return { ...rendered, contract: "AVANTIQO_PROFESSIONAL_AUDIO_STEM_RENDER_V1", render_kind: "POST_STEM", post_stem_id: text(stemId).toUpperCase(), delivery_language: language, language_scoped: Boolean(language), master_processing_applied: true, aux_returns_applied: true, destructive_processing: false };
}

export function buildMusicVariantMixSession(sessionInput, variant) {
  const session = clone(sessionInput);
  const kind = text(variant).toLowerCase();
  if (!["instrumental", "acapella"].includes(kind)) throw new Error(`CREATIVE_MUSIC_VARIANT_INVALID:${kind}`);
  for (const track of session.tracks || []) {
    const isVocal = String(track.type || "").toLowerCase() === "vocal";
    const include = kind === "acapella" ? isVocal : !isVocal;
    if (!include) track.mute = true;
    track.solo = false;
  }
  return session;
}

export async function renderMusicTrackStemOffline({ session, assetUrls, trackId, expectedDurationSeconds = null } = {}) {
  const stemSession = buildMusicTrackStemSession(session, trackId);
  const rendered = await renderMusicMultitrackOffline({
    session: stemSession,
    assetUrls,
    expectedDurationSeconds: Number.isFinite(expectedDurationSeconds) ? expectedDurationSeconds : durationOfSession(session),
  });
  return {
    ...rendered,
    contract: "AVANTIQO_MUSIC_TRACK_STEM_RENDER_V1",
    render_kind: "TRACK_STEM",
    track_id: text(trackId),
    stem_stage: "post-track-processing-pre-group",
    master_processing_applied: false,
    aux_returns_applied: false,
    destructive_processing: false,
  };
}

export async function renderMusicTrackPreFaderSendOffline({ session, assetUrls, trackId, expectedDurationSeconds = null } = {}) {
  const sendSession = buildMusicTrackPreFaderSendSession(session, trackId);
  const rendered = await renderMusicMultitrackOffline({ session: sendSession, assetUrls, expectedDurationSeconds: Number.isFinite(expectedDurationSeconds) ? expectedDurationSeconds : durationOfSession(session) });
  return { ...rendered, contract: "AVANTIQO_MUSIC_TRACK_PREFADER_SEND_RENDER_V1", render_kind: "TRACK_PREFADER_SEND", track_id: text(trackId), stem_stage: "post-track-processing-pre-fader-pan", master_processing_applied: false, aux_returns_applied: false, destructive_processing: false };
}

export async function renderMusicTrackEvidenceOffline({ session, assetUrls, trackId, expectedDurationSeconds = null } = {}) {
  const evidenceSession = buildMusicTrackEvidenceSession(session, trackId);
  const rendered = await renderMusicMultitrackOffline({
    session: evidenceSession,
    assetUrls,
    expectedDurationSeconds: Number.isFinite(expectedDurationSeconds) ? expectedDurationSeconds : durationOfSession(session),
  });
  return {
    ...rendered,
    contract: "AVANTIQO_MUSIC_TRACK_EVIDENCE_RENDER_V1",
    render_kind: "TRACK_EVIDENCE",
    track_id: text(trackId),
    stem_stage: "post-source-cleanup-pre-track-processing",
    track_processing_applied: false,
    master_processing_applied: false,
    aux_returns_applied: false,
    destructive_processing: false,
  };
}

export async function renderMusicGroupStemOffline({ session, assetUrls, groupId, expectedDurationSeconds = null } = {}) {
  const stemSession = buildMusicGroupStemSession(session, groupId);
  const rendered = await renderMusicMultitrackOffline({
    session: stemSession,
    assetUrls,
    expectedDurationSeconds: Number.isFinite(expectedDurationSeconds) ? expectedDurationSeconds : durationOfSession(session),
  });
  return {
    ...rendered,
    contract: "AVANTIQO_MUSIC_GROUP_STEM_RENDER_V1",
    render_kind: "GROUP_STEM",
    group_id: text(groupId),
    stem_stage: "post-group-processing-pre-master",
    master_processing_applied: false,
    aux_returns_applied: false,
    destructive_processing: false,
  };
}

export async function renderMusicVariantMixOffline({ session, assetUrls, variant, expectedDurationSeconds = null } = {}) {
  const variantSession = buildMusicVariantMixSession(session, variant);
  const rendered = await renderMusicMultitrackOffline({
    session: variantSession,
    assetUrls,
    expectedDurationSeconds: Number.isFinite(expectedDurationSeconds) ? expectedDurationSeconds : durationOfSession(session),
  });
  return {
    ...rendered,
    contract: "AVANTIQO_MUSIC_VARIANT_MIX_RENDER_V1",
    render_kind: text(variant).toUpperCase(),
    variant: text(variant).toLowerCase(),
    master_processing_applied: true,
    aux_returns_applied: true,
    destructive_processing: false,
  };
}
