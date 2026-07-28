#!/usr/bin/env node

import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const {
  CreativeMasterVideoRenderRuntime,
} = await import(
  "../lib/creative/video/runtime/CreativeMasterVideoRenderRuntime.js"
);

function text(value) {
  return String(value ?? "").trim();
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name} required`);
  return value;
}

const organizationId = required("CREATIVE_SMOKE_ORGANIZATION_ID");
const projectId = required("COLE_LEY_PROJECT_ID");

const result = await CreativeMasterVideoRenderRuntime.preflight({
  organization_id: organizationId,
  creative_project_id: projectId,
  policy: {
    target_duration_seconds: 180,
    minimum_distinct_original_sources: 4,
    maximum_clips_per_original_source: 4,
    output_width: 1920,
    output_height: 1080,
    frame_rate: 30,
  },
});

console.log("============================================================");
console.log("COLE SOURCE-ONLY MASTER VIDEO PREFLIGHT");
console.log("============================================================");
console.log(`ORGANIZATION_ID=${result.organization_id}`);
console.log(`CREATIVE_PROJECT_ID=${result.creative_project_id}`);
console.log(`CREATIVE_MISSION_ID=${result.creative_mission_id || ""}`);
console.log(`PROJECT_NAME=${result.project_name || ""}`);
console.log(`TARGET_DURATION_SECONDS=${result.target_duration_seconds}`);
console.log(`VERIFIED_CANDIDATE_COUNT=${result.verified_candidate_count}`);
console.log(`ELIGIBLE_VERIFIED_MOMENT_COUNT=${result.eligible_verified_moment_count}`);
console.log(`ELIGIBLE_VERIFIED_DURATION_SECONDS=${result.eligible_verified_duration_seconds}`);
console.log(`SELECTED_CLIP_COUNT=${result.selected_clip_count}`);
console.log(`SELECTED_DURATION_SECONDS=${result.selected_duration_seconds}`);
console.log(`DISTINCT_ORIGINAL_SOURCE_COUNT=${result.distinct_original_source_count}`);
console.log(`MINIMUM_DISTINCT_ORIGINAL_SOURCES=${result.minimum_distinct_original_sources}`);
console.log(`LOGO_ASSET_NODE_ID=${result.logo_asset_node_id || ""}`);
console.log(`SOURCE_ONLY_FFMPEG=${result.source_only_ffmpeg ? "YES" : "NO"}`);
console.log(`PROVIDER_CALLS_REQUIRED=${result.provider_calls_required ? "YES" : "NO"}`);
console.log(`MASTER_VIDEO_READY=${result.ready ? "PASS" : "FAIL"}`);
console.log(`BLOCKING_REASONS=${result.reasons.join(",")}`);
console.log("DATABASE_MUTATIONS=NO");
console.log("STORAGE_MUTATIONS=NO");
console.log("AI_PROVIDER_CALLS=NO");
console.log("VIDEO_PROVIDER_CALLS=NO");
console.log("WORKER_CALLED=NO");
console.log("PRODUCTION_AUTHORIZED=NO");
console.log("PRODUCTION_STARTED=NO");
console.log("============================================================");

if (!result.ready) process.exitCode = 2;
