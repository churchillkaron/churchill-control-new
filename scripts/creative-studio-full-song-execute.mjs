#!/usr/bin/env node

import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

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

function requiredEnvironment(...names) {
  for (const name of names) {
    const value = text(process.env[name]);
    if (value) return value;
  }
  throw new Error(`${names.join(" or ")} required`);
}

function optionalEnvironment(...names) {
  for (const name of names) {
    const value = text(process.env[name]);
    if (value) return value;
  }
  return null;
}

function isAudioNode(node = {}) {
  const type = text(node.type).toUpperCase();
  const mimeType = text(node.technical?.mime_type).toLowerCase();
  const mediaKind = text(node.technical?.media_kind).toLowerCase();
  return ["AUDIO", "MUSIC", "VOICE"].includes(type) ||
    mimeType.startsWith("audio/") ||
    mediaKind === "audio";
}

function nodeDuration(node = {}) {
  return positive(
    node.technical?.duration_seconds ??
    node.metadata?.duration_seconds ??
    node.metadata?.timing?.duration_seconds,
  );
}

function projectDuration(project = {}) {
  const metadata = object(project.metadata);
  return positive(
    metadata.temporal_contract?.duration_seconds ??
    metadata.temporalContract?.duration_seconds ??
    metadata.full_master_duration ??
    metadata.full_song_duration_seconds ??
    metadata.creative_direction_constraints?.full_song_duration_seconds ??
    project.target_duration,
  );
}

const organizationId = requiredEnvironment(
  "CREATIVE_ORGANIZATION_ID",
  "CREATIVE_SMOKE_ORGANIZATION_ID",
);
const projectId = requiredEnvironment(
  "CREATIVE_PROJECT_ID",
  "COLE_LEY_PROJECT_ID",
);
const configuredMissionId = optionalEnvironment(
  "CREATIVE_MISSION_ID",
  "COLE_LEY_MISSION_ID",
);

const [{ CreativeDirectorRuntime }, CreativeProjectRepository, AssetGraphRepository] =
  await Promise.all([
    import("@/lib/creative/director/runtime/CreativeDirectorRuntime"),
    import("@/lib/creative/projects/repositories/CreativeProjectRepository"),
    import("@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository"),
  ]);

const project = await CreativeProjectRepository.getById(projectId);
if (!project || String(project.organization_id) !== String(organizationId)) {
  throw new Error("Creative project not found in organization scope");
}

const missionId = configuredMissionId || text(project.creative_mission_id);
if (!missionId) throw new Error("CREATIVE_MISSION_ID or project creative_mission_id required");

const nodes = await AssetGraphRepository.listByProject({
  organization_id: organizationId,
  creative_project_id: projectId,
});
const audioNodes = nodes
  .filter(isAudioNode)
  .sort((left, right) => Number(nodeDuration(right) || 0) - Number(nodeDuration(left) || 0));

const configuredSoundtrackId = text(
  project.metadata?.primary_soundtrack_asset_node_id ||
  project.metadata?.temporal_contract?.source_asset_node_id,
);
const soundtrack = audioNodes.find((node) => node.id === configuredSoundtrackId) || audioNodes[0];
if (!soundtrack) throw new Error("CREATIVE_PRIMARY_SOUNDTRACK_REQUIRED");

const duration = projectDuration(project) || nodeDuration(soundtrack);
if (!duration) throw new Error("CREATIVE_FULL_SONG_DURATION_REQUIRED");

const soundtrackDuration = nodeDuration(soundtrack);
if (soundtrackDuration && Math.abs(soundtrackDuration - duration) > 0.25) {
  throw new Error(
    `CREATIVE_FULL_SONG_DURATION_MISMATCH:project=${duration};soundtrack=${soundtrackDuration}`,
  );
}

const currentMetadata = object(project.metadata);
const temporalContract = {
  ...object(currentMetadata.temporal_contract),
  version: "FULL_SOURCE_AUDIO_V1",
  mode: "FULL_SOURCE_AUDIO",
  timing_authority: "PRIMARY_SOUNDTRACK",
  source_asset_node_id: soundtrack.id,
  duration_seconds: duration,
  exact_duration_required: true,
  no_truncation: true,
  no_time_compression: true,
  no_audio_looping: true,
  preserve_source_audio: true,
  scene_duration_sum_must_equal_source: true,
  shot_duration_sum_must_equal_scene: true,
};

await CreativeProjectRepository.update(projectId, {
  target_duration: duration,
  metadata: {
    ...currentMetadata,
    workflow_kind: "TEMPORAL",
    music_video: true,
    full_song: true,
    duration_mode: "FULL_SOURCE_AUDIO",
    primary_soundtrack_asset_node_id: soundtrack.id,
    temporal_contract: temporalContract,
    creative_direction_constraints: {
      ...object(currentMetadata.creative_direction_constraints),
      full_song_duration_seconds: duration,
      full_song_required: true,
      compress_story_into_short_clip: false,
      require_complete_song_structure: true,
      require_scene_and_shot_timeline_coverage: true,
    },
    post_production: {
      ...object(currentMetadata.post_production),
      timeline: {
        ...object(currentMetadata.post_production?.timeline),
        minimum_duration_seconds: duration,
        maximum_duration_seconds: duration,
        required_exact_duration_seconds: duration,
      },
    },
  },
});

await AssetGraphRepository.update(soundtrack.id, {
  metadata: {
    ...object(soundtrack.metadata),
    include_in_master: true,
    render_role: "PRIMARY_SOUNDTRACK",
    timeline_in_seconds: 0,
    source_in_seconds: 0,
    duration_seconds: duration,
    gain: 1,
    timing_authority: true,
    full_song: true,
  },
});

console.log("============================================================");
console.log("AVANTIQO FULL-SONG PRODUCTION");
console.log("============================================================");
console.log(`ORGANIZATION_ID=${organizationId}`);
console.log(`CREATIVE_PROJECT_ID=${projectId}`);
console.log(`CREATIVE_MISSION_ID=${missionId}`);
console.log(`PRIMARY_SOUNDTRACK_NODE_ID=${soundtrack.id}`);
console.log(`FULL_MASTER_DURATION=${duration}`);
console.log("DURATION_MODE=FULL_SOURCE_AUDIO");
console.log("PRODUCTION_STARTING=YES");
console.log("============================================================");

try {
  const result = await CreativeDirectorRuntime.execute({
    organization_id: organizationId,
    creative_project_id: projectId,
    creative_mission_id: missionId,
    workflow_kind: "TEMPORAL",
    duration_mode: "FULL_SOURCE_AUDIO",
    full_song: true,
    temporal_contract: temporalContract,
  });

  const pipeline = object(result.pipeline);
  const production = object(result.production);
  const masterPlan = object(pipeline.master_plan?.plan || pipeline.master_plan);
  const scenes = Array.isArray(pipeline.scenes) ? pipeline.scenes : [];
  const shots = Array.isArray(pipeline.shots) ? pipeline.shots : [];
  const tasks = Array.isArray(pipeline.tasks?.all) ? pipeline.tasks.all : [];

  console.log("============================================================");
  console.log("FULL-SONG PRODUCTION RESULT");
  console.log("============================================================");
  console.log(`SUCCESS=${result.success === false ? "NO" : "YES"}`);
  console.log(`STATUS=${text(result.status || production.status || "UNKNOWN")}`);
  console.log(`WORKFLOW_KIND=${text(result.workflow_kind || masterPlan.workflow_kind || "TEMPORAL")}`);
  console.log(`SCENE_COUNT=${scenes.length}`);
  console.log(`SHOT_COUNT=${shots.length}`);
  console.log(`TASK_COUNT=${tasks.length}`);
  console.log(`DISPATCHED=${Number(production.dispatched || 0)}`);
  console.log(`ASSETS_CREATED=${Number(production.assets_created || 0)}`);
  console.log(`PRODUCTION_COMPLETE=${production.complete === true ? "YES" : "NO"}`);
  console.log("============================================================");

  if (result.success === false) process.exitCode = 1;
} catch (error) {
  console.error("============================================================");
  console.error("FULL-SONG PRODUCTION FAILED");
  console.error("============================================================");
  console.error(error?.stack || error?.message || String(error));
  if (error?.validation) {
    console.error(JSON.stringify(error.validation, null, 2));
  }
  console.error("============================================================");
  process.exitCode = 1;
}
