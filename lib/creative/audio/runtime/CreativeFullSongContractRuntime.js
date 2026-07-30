import * as CreativeProjectRepository
from "@/lib/creative/projects/repositories/CreativeProjectRepository";
import * as AssetGraphRepository
from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function positive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function normalizedDuration(value) {
  const duration = positive(value);
  return duration === null ? null : Math.round(duration * 1000) / 1000;
}

function requestedByProject(project = {}, assetType = "") {
  const metadata = object(project.metadata);
  const durationMode = text(
    metadata.duration_mode ||
    metadata.durationMode ||
    metadata.temporal_contract?.mode ||
    metadata.temporalContract?.mode,
  ).toUpperCase();

  if ([
    "FULL_SOURCE_AUDIO",
    "FULL_SONG",
    "MATCH_SOURCE_AUDIO",
    "SOURCE_AUDIO",
  ].includes(durationMode)) {
    return true;
  }

  if (
    metadata.music_video === true ||
    metadata.musicVideo === true ||
    metadata.full_song === true ||
    metadata.fullSong === true ||
    metadata.use_full_song === true ||
    metadata.useFullSong === true
  ) {
    return true;
  }

  const requestText = [
    project.name,
    project.description,
    project.objective,
    metadata.request,
    metadata.request_text,
    metadata.creative_request,
    metadata.production_intent,
    assetType,
  ].map(text).filter(Boolean).join(" ").toLowerCase();

  return /\b(music video|official video|full song|entire song|whole song|complete song|song-length|full-length song)\b/i.test(requestText);
}

function isVideoProject(project = {}) {
  const productionType = text(project.production_type).toUpperCase();
  const workflow = text(
    project.metadata?.workflow_kind ||
    project.metadata?.creative_medium,
  ).toUpperCase();

  return ["VIDEO", "FILM", "ANIMATION", "TEMPORAL"].includes(
    workflow || productionType,
  );
}

function isAudioAsset({ technical = {}, assetType = "" } = {}) {
  const mediaKind = text(technical.media_kind).toLowerCase();
  const mimeType = text(technical.mime_type).toLowerCase();
  const type = text(assetType).toLowerCase();

  return (
    mediaKind === "audio" ||
    mimeType.startsWith("audio/") ||
    /\b(audio|music|song|soundtrack|master track|vocal track)\b/i.test(type)
  );
}

function mergeProjectMetadata({ project, asset, assetNode, duration }) {
  const metadata = object(project.metadata);
  const postProduction = object(metadata.post_production);
  const timeline = object(postProduction.timeline);
  const temporalContract = {
    ...object(metadata.temporal_contract || metadata.temporalContract),
    version: "FULL_SOURCE_AUDIO_V1",
    mode: "FULL_SOURCE_AUDIO",
    timing_authority: "PRIMARY_SOUNDTRACK",
    source_asset_id: asset.id,
    source_asset_node_id: assetNode.id,
    duration_seconds: duration,
    exact_duration_required: true,
    no_truncation: true,
    no_time_compression: true,
    no_audio_looping: true,
    preserve_source_audio: true,
    scene_duration_sum_must_equal_source: true,
    shot_duration_sum_must_equal_scene: true,
  };

  return {
    ...metadata,
    workflow_kind: metadata.workflow_kind || "TEMPORAL",
    music_video: true,
    full_song: true,
    duration_mode: "FULL_SOURCE_AUDIO",
    primary_soundtrack_asset_id: asset.id,
    primary_soundtrack_asset_node_id: assetNode.id,
    temporal_contract: temporalContract,
    creative_direction_constraints: {
      ...object(metadata.creative_direction_constraints),
      full_song_duration_seconds: duration,
      full_song_required: true,
      compress_story_into_short_clip: false,
      require_complete_song_structure: true,
      require_scene_and_shot_timeline_coverage: true,
    },
    post_production: {
      ...postProduction,
      timeline: {
        ...timeline,
        minimum_duration_seconds: duration,
        maximum_duration_seconds: duration,
        required_exact_duration_seconds: duration,
      },
    },
  };
}

export const CreativeFullSongContractRuntime = {
  async apply({
    organization_id,
    creative_project_id,
    asset,
    asset_node,
    technical = {},
    asset_type = "",
  } = {}) {
    if (!organization_id || !creative_project_id || !asset?.id || !asset_node?.id) {
      return { applied: false, reason: "PROJECT_AUDIO_CONTEXT_INCOMPLETE" };
    }

    if (!isAudioAsset({ technical, assetType: asset_type })) {
      return { applied: false, reason: "ASSET_IS_NOT_AUDIO" };
    }

    const duration = normalizedDuration(technical.duration_seconds);
    if (duration === null) {
      throw new Error("CREATIVE_FULL_SONG_DURATION_REQUIRED");
    }

    const project = await CreativeProjectRepository.getById(creative_project_id);
    if (!project || String(project.organization_id) !== String(organization_id)) {
      throw new Error("Creative project not found in organization scope");
    }

    if (!isVideoProject(project) || !requestedByProject(project, asset_type)) {
      return { applied: false, reason: "FULL_SONG_VIDEO_NOT_REQUESTED" };
    }

    const metadata = mergeProjectMetadata({
      project,
      asset,
      assetNode: asset_node,
      duration,
    });

    const updatedProject = await CreativeProjectRepository.update(project.id, {
      target_duration: duration,
      metadata,
    });

    const updatedNode = await AssetGraphRepository.update(asset_node.id, {
      metadata: {
        ...object(asset_node.metadata),
        include_in_master: true,
        render_role: "PRIMARY_SOUNDTRACK",
        duration_seconds: duration,
        source_in_seconds: 0,
        timeline_in_seconds: 0,
        gain: 1,
        timing_authority: true,
        full_song: true,
      },
    });

    return {
      applied: true,
      duration_seconds: duration,
      project: updatedProject,
      asset_node: updatedNode,
      temporal_contract: metadata.temporal_contract,
    };
  },
};
