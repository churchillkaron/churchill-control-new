#!/usr/bin/env node

import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

for (const name of [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
]) {
  if (!String(process.env[name] || "").trim()) {
    throw new Error(`Missing environment variable after loadEnvConfig: ${name}`);
  }
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function positive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function projectDuration(project = {}) {
  const metadata = object(project.metadata);
  return positive(
    metadata.temporal_contract?.duration_seconds ??
    metadata.full_master_duration ??
    metadata.full_song_duration_seconds ??
    project.target_duration,
  );
}

function isFullSong(project = {}) {
  const metadata = object(project.metadata);
  return (
    metadata.full_song === true ||
    metadata.music_video === true ||
    text(metadata.duration_mode).toUpperCase() === "FULL_SOURCE_AUDIO" ||
    text(metadata.temporal_contract?.mode).toUpperCase() === "FULL_SOURCE_AUDIO"
  );
}

const [
  { supabaseAdmin },
  { preflightCreativeDirectionOutput },
] = await Promise.all([
  import("@/lib/shared/supabase/admin"),
  import("../lib/creative/director/runtime/CreativeDirectionReliableOutputPatch.js"),
]);

const configuredProjectId = text(
  process.env.CREATIVE_PROJECT_ID ||
  process.env.CREATIVE_FULL_SONG_PROJECT_ID,
);
const configuredOrganizationId = text(
  process.env.CREATIVE_ORGANIZATION_ID ||
  process.env.ORGANIZATION_ID,
);
const durationHint = positive(
  process.env.CREATIVE_FULL_MASTER_DURATION ||
  process.env.CREATIVE_MASTER_DURATION,
);

let project = null;

if (configuredProjectId) {
  const { data, error } = await supabaseAdmin
    .from("creative_projects")
    .select("id,organization_id,target_duration,metadata,archived,created_at")
    .eq("id", configuredProjectId)
    .maybeSingle();

  if (error) throw error;
  project = data || null;
} else {
  let query = supabaseAdmin
    .from("creative_projects")
    .select("id,organization_id,target_duration,metadata,archived,created_at")
    .eq("archived", false)
    .order("created_at", { ascending: false })
    .limit(500);

  if (configuredOrganizationId) {
    query = query.eq("organization_id", configuredOrganizationId);
  }

  const { data, error } = await query;
  if (error) throw error;

  const candidates = (data || [])
    .filter(isFullSong)
    .filter((item) => {
      if (!durationHint) return true;
      const duration = projectDuration(item);
      return duration && Math.abs(duration - durationHint) <= 0.25;
    });

  if (candidates.length !== 1) {
    throw new Error(
      candidates.length
        ? `CREATIVE_DIRECTION_PREFLIGHT_PROJECT_AMBIGUOUS:${candidates.length}`
        : "CREATIVE_DIRECTION_PREFLIGHT_PROJECT_NOT_FOUND",
    );
  }

  [project] = candidates;
}

if (!project?.id) {
  throw new Error("CREATIVE_DIRECTION_PREFLIGHT_PROJECT_REQUIRED");
}
if (!project.organization_id) {
  throw new Error("CREATIVE_DIRECTION_PREFLIGHT_ORGANIZATION_REQUIRED");
}
if (
  configuredOrganizationId &&
  String(project.organization_id) !== String(configuredOrganizationId)
) {
  throw new Error("CREATIVE_DIRECTION_PREFLIGHT_ORGANIZATION_MISMATCH");
}

console.log("============================================================");
console.log("CREATIVE DIRECTION PREFLIGHT");
console.log("============================================================");
console.log(`PREFLIGHT_PROJECT_ID=${project.id}`);
console.log(`PREFLIGHT_ORGANIZATION_ID=${project.organization_id}`);

const preflight = await preflightCreativeDirectionOutput({
  organization_id: project.organization_id,
  creative_project_id: project.id,
});

console.log(`DIRECTION_PREFLIGHT_SOURCE=${preflight.source}`);
console.log(`DIRECTION_PREFLIGHT_USAGE_ID=${preflight.usage_id || ""}`);
console.log(`DIRECTION_PREFLIGHT_SCENE_COUNT=${preflight.scene_count}`);
console.log(`DIRECTION_PREFLIGHT_SHOT_COUNT=${preflight.shot_count}`);
console.log("DIRECTION_PREFLIGHT=PASS");
console.log("PRODUCTION_LOCK_ACQUIRED=NO");
console.log("============================================================");

await import("./creative-studio-full-song-safe-execute.mjs");
