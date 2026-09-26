import * as CreativeProjectRepository from "../../projects/repositories/CreativeProjectRepository.js";
import { createCreativeProject } from "../../projects/documents/CreativeProject.js";
import * as AssetGraphRepository from "../../assets/graph/repositories/CreativeAssetGraphRepository.js";
import { CreativeAssetsRuntime } from "../../assets/runtime/CreativeAssetsRuntime.js";
import { createCreativeMissionDocument } from "../../missions/documents/CreativeMission.js";
import { supabaseAdmin } from "../../../shared/supabase/admin.js";
import { CreativeQualityPolicyResolverRuntime } from "../../quality/runtime/CreativeQualityPolicyResolverRuntime.js";

const CONTRACT = "AVANTIQO_MUSIC_VIDEO_HANDOFF_V1";
function text(value) { return String(value ?? "").trim(); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function finite(value) { const n = Number(value); return Number.isFinite(n) && n > 0 ? n : null; }
function assetProjectId(asset = {}) { return text(asset.creative_project_id || asset.metadata?.creative_project_id); }
function durationOf(asset = {}) {
  return finite(asset.analysis?.technical_inspection?.duration_seconds)
    || finite(asset.analysis?.duration_seconds)
    || finite(asset.technical?.duration_seconds)
    || finite(asset.metadata?.duration_seconds);
}
function isAudio(asset = {}) {
  const type = text(asset.asset_type || asset.type).toLowerCase();
  const mime = text(asset.mime_type || asset.metadata?.mime_type || asset.analysis?.technical_inspection?.mime_type).toLowerCase();
  return type.includes("audio") || type.includes("music") || mime.startsWith("audio/");
}

function lyricEvidence(project = {}) {
  const metadata = object(project.metadata);
  const evidence = object(metadata.music_lyric_evidence || metadata.lyric_evidence);
  const transcript = text(
    evidence.transcript ||
    evidence.lyrics ||
    metadata.lyrics ||
    metadata.lyric_text ||
    metadata.music_lyrics,
  );
  const phraseTimings = Array.isArray(evidence.phrase_timings)
    ? evidence.phrase_timings
    : [];
  if (!transcript) return null;
  return {
    contract: text(evidence.contract) || "AVANTIQO_MUSIC_LYRIC_EVIDENCE_V1",
    transcript,
    language: text(evidence.language) || null,
    source: text(evidence.source) || "MUSIC_PROJECT",
    source_asset_id: text(evidence.source_asset_id) || null,
    stt_job_id: text(evidence.stt_job_id) || null,
    phrase_timings: phraseTimings,
    recovered_from_existing_vocal: evidence.recovered_from_existing_vocal === true,
  };
}

function audioAuthorityRank(asset = {}, currentMasterId = "") {
  const kind = text(asset.metadata?.music_asset_kind).toUpperCase();
  return (
    (text(asset.id) === text(currentMasterId) ? 10000 : 0) +
    (kind === "MASTER" ? 5000 : 0) +
    (asset.metadata?.professional_release_ready === true ? 3000 : 0) +
    (asset.metadata?.professional_mastering_passed === true ? 2500 : 0) +
    (kind === "SOURCE" ? 1500 : 0) +
    (kind.includes("STEM") ? -3000 : 0) +
    (durationOf(asset) ? 500 : 0) +
    (Date.parse(asset.updated_at || asset.created_at || 0) || 0) / 1e12
  );
}

async function resolveMusicAudioAuthority({ organizationId, musicProject, explicitAssetId = null }) {
  const currentMasterId = text(musicProject.metadata?.music_conversation_state?.current_master_asset_id);
  const requestedId = text(explicitAssetId || currentMasterId);
  if (requestedId) {
    const requested = await CreativeAssetsRuntime.get(requestedId);
    if (!requested || text(requested.organization_id) !== organizationId || assetProjectId(requested) !== musicProject.id || !isAudio(requested)) {
      throw new Error("MUSIC_VIDEO_HANDOFF_MASTER_SCOPE_MISMATCH");
    }
    return { asset: requested, currentMasterId };
  }

  const assets = await CreativeAssetsRuntime.list({
    organization_id: organizationId,
    creative_project_id: musicProject.id,
    limit: 1000,
  });
  const candidate = [...assets]
    .filter((asset) => assetProjectId(asset) === musicProject.id && isAudio(asset))
    .sort((left, right) => audioAuthorityRank(right, currentMasterId) - audioAuthorityRank(left, currentMasterId))[0] || null;
  if (!candidate) throw new Error("MUSIC_VIDEO_HANDOFF_CURRENT_MASTER_REQUIRED");
  return { asset: candidate, currentMasterId };
}

async function ensureMusicVideoMission({ organizationId, videoProject, musicProject, duration }) {
  if (text(videoProject.creative_mission_id)) {
    const { data: bound, error: boundError } = await supabaseAdmin
      .from("creative_missions")
      .select("*")
      .eq("id", text(videoProject.creative_mission_id))
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (boundError) throw boundError;
    if (bound?.id) return bound;
  }

  const { data: existing, error: lookupError } = await supabaseAdmin
    .from("creative_missions")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("metadata->>source_video_project_id", videoProject.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (existing?.id) return existing;

  const mission = createCreativeMissionDocument({
    organization_id: organizationId,
    title: videoProject.name,
    business_goal: videoProject.objective || videoProject.description || "Create the official music video.",
    objective: videoProject.objective || videoProject.description || "Create the official music video.",
    channels: Array.isArray(videoProject.target_channels) ? videoProject.target_channels : [],
    metadata: {
      source: "music_video_handoff",
      source_video_project_id: videoProject.id,
      source_music_project_id: musicProject.id,
      production_type: "VIDEO",
      target_duration: duration,
      quality_profile: videoProject.quality_profile || { id: "WORLD_CLASS" },
      music_video: true,
      full_song: true,
      duration_mode: "FULL_SOURCE_AUDIO",
    },
  });

  const { data: created, error: createError } = await supabaseAdmin
    .from("creative_missions")
    .insert(mission)
    .select("*")
    .single();
  if (createError) throw createError;
  return created;
}

export async function handoffMusicMasterToVideoProject({
  organization_id,
  music_project_id,
  video_project_id,
  master_asset_id = null,
} = {}) {
  const organizationId = text(organization_id);
  const musicProjectId = text(music_project_id);
  const videoProjectId = text(video_project_id);
  if (!organizationId || !musicProjectId || !videoProjectId) throw new Error("MUSIC_VIDEO_HANDOFF_CONTEXT_REQUIRED");

  const [musicProject, videoProject] = await Promise.all([
    CreativeProjectRepository.getById(musicProjectId),
    CreativeProjectRepository.getById(videoProjectId),
  ]);
  if (!musicProject || text(musicProject.organization_id) !== organizationId) throw new Error("MUSIC_VIDEO_HANDOFF_MUSIC_PROJECT_SCOPE_MISMATCH");
  if (!videoProject || text(videoProject.organization_id) !== organizationId) throw new Error("MUSIC_VIDEO_HANDOFF_VIDEO_PROJECT_SCOPE_MISMATCH");
  if (!/VIDEO|FILM|TEMPORAL/i.test(text(videoProject.production_type || videoProject.metadata?.workflow_kind))) throw new Error("MUSIC_VIDEO_HANDOFF_VIDEO_PROJECT_REQUIRED");

  const authority = await resolveMusicAudioAuthority({
    organizationId,
    musicProject,
    explicitAssetId: master_asset_id,
  });
  const master = authority.asset;
  const resolvedMasterId = text(master.id);
  const audioAuthorityKind = authority.currentMasterId && resolvedMasterId === authority.currentMasterId
    ? "CURRENT_MUSIC_MASTER"
    : "EXPLICIT_MUSIC_SOURCE";
  const duration = durationOf(master);
  if (!duration) throw new Error("MUSIC_VIDEO_HANDOFF_MASTER_DURATION_REQUIRED");

  const lyrics = lyricEvidence(musicProject);
  const instrumental = musicProject.metadata?.music_session?.instrumental === true;
  if (!instrumental && !lyrics?.transcript) {
    throw new Error("MUSIC_VIDEO_LYRIC_EVIDENCE_REQUIRED");
  }

  const mission = await ensureMusicVideoMission({
    organizationId,
    videoProject,
    musicProject,
    duration,
  });
  const missionId = text(mission?.id);
  if (!missionId) throw new Error("MUSIC_VIDEO_HANDOFF_MISSION_REQUIRED");
  const quality = CreativeQualityPolicyResolverRuntime.resolve({
    mission,
    project: { ...videoProject, target_duration: duration },
  });

  const [reference] = await AssetGraphRepository.attachAssetsToProject({
    organization_id: organizationId,
    creative_project_id: videoProjectId,
    creative_asset_ids: [resolvedMasterId],
  });
  if (!reference?.id) throw new Error("MUSIC_VIDEO_HANDOFF_REFERENCE_NODE_REQUIRED");

  const lockedNode = await AssetGraphRepository.update(reference.id, {
    metadata: {
      ...object(reference.metadata),
      include_in_master: true,
      render_role: "PRIMARY_SOUNDTRACK",
      primary_soundtrack: true,
      full_song: true,
      timing_authority: true,
      duration_seconds: duration,
      source_in_seconds: 0,
      timeline_in_seconds: 0,
      gain: 1,
      music_video_handoff_contract: CONTRACT,
      source_music_project_id: musicProjectId,
      source_music_master_asset_id: resolvedMasterId,
      audio_authority_kind: audioAuthorityKind,
    },
  });

  const metadata = object(videoProject.metadata);
  const updatedProject = await CreativeProjectRepository.update(videoProjectId, {
    creative_mission_id: missionId,
    target_duration: duration,
    quality_profile: quality.profile_id,
    metadata: {
      ...metadata,
      creative_quality_policy: quality.creative_quality_policy,
      semantic_quality_policy: quality.semantic_quality_policy,
      creative_quality_policy_source: quality.creative_policy_source,
      semantic_quality_policy_source: quality.semantic_policy_source,
      creative_quality_profile_id: quality.profile_id,
      creative_quality_context: quality.context,
      quality_policy_resolver_version: quality.resolver_version,
      quality_policy_resolved_at: new Date().toISOString(),
      workflow_kind: "TEMPORAL",
      music_video: true,
      full_song: true,
      duration_mode: "FULL_SOURCE_AUDIO",
      primary_soundtrack_asset_id: resolvedMasterId,
      primary_soundtrack_asset_node_id: lockedNode.id,
      source_music_project_id: musicProjectId,
      source_music_master_asset_id: resolvedMasterId,
      music_video_handoff: {
        contract: CONTRACT,
        source_music_project_id: musicProjectId,
        source_music_master_asset_id: resolvedMasterId,
        audio_authority_kind: audioAuthorityKind,
        primary_soundtrack_asset_node_id: lockedNode.id,
        duration_seconds: duration,
        audio_owner: "MUSIC_STUDIO",
        visual_owner: "VIDEO_STUDIO",
        preserve_master_exactly: true,
        music_intelligence: {
          bpm: finite(musicProject.metadata?.music_bpm || musicProject.metadata?.music_session?.bpm),
          time_signature: text(musicProject.metadata?.music_time_signature || musicProject.metadata?.music_session?.time_signature) || null,
          keyscale: text(musicProject.metadata?.music_session?.keyscale) || null,
          instrumental: musicProject.metadata?.music_session?.instrumental ?? null,
          lyric_evidence: lyrics,
          lyrics_required_for_direction: !instrumental,
          stem_asset_ids: Array.isArray(master.metadata?.professional_local_stem_evidence?.stem_asset_ids)
            ? master.metadata.professional_local_stem_evidence.stem_asset_ids
            : [],
          vocal_preparation: object(master.metadata?.professional_vocal_preparation),
        },
      },
      temporal_contract: {
        ...object(metadata.temporal_contract),
        version: "FULL_SOURCE_AUDIO_V1",
        mode: "FULL_SOURCE_AUDIO",
        timing_authority: "PRIMARY_SOUNDTRACK",
        source_asset_id: resolvedMasterId,
        source_asset_node_id: lockedNode.id,
        duration_seconds: duration,
        exact_duration_required: true,
        no_truncation: true,
        no_time_compression: true,
        no_audio_looping: true,
        preserve_source_audio: true,
        scene_duration_sum_must_equal_source: true,
        shot_duration_sum_must_equal_scene: true,
      },
      music_video_production_profile: {
        version: "MARKETING_RELEASE_FAST_V1",
        quality_floor: "MARKETING_RELEASE",
        require_music_structure_alignment: true,
        require_lyric_or_vocal_intent_alignment: true,
        require_energy_arc_alignment: true,
        require_identity_continuity: true,
        require_lip_sync_for_visible_singing: true,
        parallel_shot_generation: true,
        independent_shot_qc: true,
        assemble_only_verified_shots: true,
      },
    },
  });

  return {
    success: true,
    contract: CONTRACT,
    music_project_id: musicProjectId,
    video_project_id: videoProjectId,
    master_asset_id: resolvedMasterId,
    primary_soundtrack_asset_node_id: lockedNode.id,
    duration_seconds: duration,
    audio_authority_kind: audioAuthorityKind,
    creative_mission_id: missionId,
    project: updatedProject,
  };
}

export async function createOrReuseMusicVideoProject({
  organization_id,
  music_project_id,
  master_asset_id = null,
  force_new = false,
} = {}) {
  const organizationId = text(organization_id);
  const musicProjectId = text(music_project_id);
  if (!organizationId || !musicProjectId) throw new Error("MUSIC_VIDEO_CREATE_CONTEXT_REQUIRED");

  const musicProject = await CreativeProjectRepository.getById(musicProjectId);
  if (!musicProject || text(musicProject.organization_id) !== organizationId) {
    throw new Error("MUSIC_VIDEO_HANDOFF_MUSIC_PROJECT_SCOPE_MISMATCH");
  }
  const authority = await resolveMusicAudioAuthority({
    organizationId,
    musicProject,
    explicitAssetId: master_asset_id,
  });
  const sourceAssetId = text(authority.asset.id);
  const duration = durationOf(authority.asset);
  if (!duration) throw new Error("MUSIC_VIDEO_HANDOFF_MASTER_DURATION_REQUIRED");

  let videoProject = null;
  if (force_new !== true) {
    const projects = await CreativeProjectRepository.listByOrganization(organizationId);
    videoProject = projects.find((project) =>
      project.archived !== true &&
      /VIDEO/i.test(text(project.production_type)) &&
      project.metadata?.music_video === true &&
      text(project.metadata?.source_music_project_id) === musicProjectId &&
      text(project.metadata?.source_music_master_asset_id) === sourceAssetId
    ) || null;
  }

  if (!videoProject) {
    videoProject = await CreativeProjectRepository.create(createCreativeProject({
      organization_id: organizationId,
      production_type: "VIDEO",
      status: "DRAFT",
      name: `${text(musicProject.name) || "Music"} — Official Music Video`,
      description: `Official full-song music video for ${text(musicProject.name) || "the Music Studio project"}.`,
      objective: "Create a marketing-release-quality official music video aligned to the full song, vocal intent, musical structure and energy arc.",
      target_channels: ["YouTube", "Instagram", "Facebook", "TikTok"],
      target_duration: duration,
      quality_profile: { id: "WORLD_CLASS" },
      metadata: {
        source: "MUSIC_STUDIO_MUSIC_VIDEO_HANDOFF",
        source_music_project_id: musicProjectId,
        source_music_master_asset_id: sourceAssetId,
        music_video: true,
        marketing_release: true,
      },
    }));
  }

  return handoffMusicMasterToVideoProject({
    organization_id: organizationId,
    music_project_id: musicProjectId,
    video_project_id: videoProject.id,
    master_asset_id: sourceAssetId,
  });
}

export const CreativeMusicVideoHandoffRuntime = Object.freeze({
  contract: CONTRACT,
  handoff: handoffMusicMasterToVideoProject,
  createOrReuse: createOrReuseMusicVideoProject,
});
