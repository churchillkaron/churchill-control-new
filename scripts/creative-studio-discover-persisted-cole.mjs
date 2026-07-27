#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

function text(value) {
  return String(value ?? "").trim();
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name} required`);
  return value;
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function isSourceVideo(node = {}) {
  return (
    node.type === "VIDEO" &&
    !node.parent_asset_node_id &&
    node.metadata?.performance_verified !== true &&
    text(node.lineage?.source).toLowerCase() !== "performance_video_reframe"
  );
}

function isVerifiedMoment(node = {}) {
  return (
    node.type === "MOMENT" &&
    node.metadata?.performance_verified === true &&
    node.metadata?.blocked !== true &&
    Boolean(node.url)
  );
}

const organizationId = text(
  process.env.COLE_DISCOVERY_ORGANIZATION_ID ||
  "9550b843-b83c-4d15-b02d-a0b5ca23346e",
);
const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL").replace(/\/$/, "");
const serviceKey = text(
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY,
);
if (!serviceKey) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY required");
}

const reportPath = text(process.env.COLE_DISCOVERY_REPORT) || path.join(
  process.env.HOME || process.cwd(),
  "Downloads",
  `COLE_LEY_PERSISTED_MISSION_DISCOVERY_${new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\..+$/, "")}.json`,
);

async function rest(table, query) {
  const url = new URL(`${supabaseUrl}/rest/v1/${table}`);
  for (const [key, value] of Object.entries(query || {})) {
    if (value === undefined || value === null || value === "") continue;
    url.searchParams.set(key, String(value));
  }

  const response = await fetch(url, {
    method: "GET",
    headers: {
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
      accept: "application/json",
    },
  });

  const raw = await response.text();
  let payload;
  try {
    payload = raw ? JSON.parse(raw) : [];
  } catch {
    payload = { raw };
  }

  if (!response.ok) {
    throw new Error(
      `${table} query failed (${response.status}): ${payload?.message || raw || response.statusText}`,
    );
  }

  return Array.isArray(payload) ? payload : [];
}

const missions = await rest("creative_missions", {
  select: "id,title,status,business_goal,objective,created_at,started_at,completed_at,metadata",
  organization_id: `eq.${organizationId}`,
  or: "(title.ilike.*Cole Ley*,business_goal.ilike.*Cole Ley*,objective.ilike.*Cole Ley*)",
  order: "created_at.desc",
  limit: "25",
});

const candidates = [];

for (const mission of missions) {
  const projects = await rest("creative_projects", {
    select: "id,status,name,target_duration,created_at,updated_at,metadata,creative_mission_id,organization_id,archived",
    organization_id: `eq.${organizationId}`,
    creative_mission_id: `eq.${mission.id}`,
    archived: "eq.false",
    order: "created_at.asc",
    limit: "1",
  });

  const project = projects[0] || null;
  let nodes = [];

  if (project?.id) {
    nodes = await rest("creative_asset_nodes", {
      select: "id,type,name,status,parent_asset_node_id,creative_asset_id,technical,metadata,lineage,url,created_at",
      organization_id: `eq.${organizationId}`,
      creative_project_id: `eq.${project.id}`,
      status: "neq.ARCHIVED",
      order: "created_at.asc",
    });
  }

  const sourceVideos = nodes.filter(isSourceVideo);
  const verifiedMoments = nodes.filter(isVerifiedMoment);
  const verifiedSourceIds = new Set(
    verifiedMoments
      .map((node) => text(node.metadata?.source_asset_node_id))
      .filter(Boolean),
  );
  const verifiedDurationSeconds = verifiedMoments.reduce((sum, node) => {
    const duration = finite(
      node.technical?.duration_seconds ??
      node.metadata?.original_source_range?.duration_seconds,
      0,
    );
    return sum + duration;
  }, 0);

  candidates.push({
    mission,
    project,
    persisted_evidence: {
      source_video_count: sourceVideos.length,
      verified_moment_count: verifiedMoments.length,
      verified_source_count: verifiedSourceIds.size,
      verified_duration_seconds: Number(verifiedDurationSeconds.toFixed(3)),
      target_duration_seconds: finite(
        project?.target_duration ?? project?.metadata?.target_duration,
        0,
      ),
      reusable:
        Boolean(project?.id) &&
        sourceVideos.length > 0 &&
        verifiedMoments.length > 0,
    },
    source_videos: sourceVideos.map((node) => ({
      id: node.id,
      name: node.name,
      creative_asset_id: node.creative_asset_id,
      duration_seconds: node.technical?.duration_seconds ?? null,
    })),
    verified_moments: verifiedMoments.map((node) => ({
      id: node.id,
      name: node.name,
      source_asset_node_id: node.metadata?.source_asset_node_id || null,
      original_source_range: node.metadata?.original_source_range || null,
      score: node.metadata?.score ?? null,
      duration_seconds: node.technical?.duration_seconds ?? null,
      original_audio_preserved:
        node.metadata?.original_audio_preserved === true,
      exact_lip_sync_required:
        node.metadata?.exact_lip_sync_required === true,
    })),
  });
}

await fs.mkdir(path.dirname(reportPath), { recursive: true });
await fs.writeFile(
  reportPath,
  JSON.stringify({
    generated_at: new Date().toISOString(),
    organization_id: organizationId,
    candidate_count: candidates.length,
    candidates,
  }, null, 2),
);

console.log("============================================================");
console.log("COLE LEY PERSISTED MISSION DISCOVERY");
console.log("============================================================");
console.log("MODE=READ_ONLY_POSTGREST");
console.log("WEBSOCKET_USED=NO");
console.log(`CANDIDATE_COUNT=${candidates.length}`);

if (!candidates.length) {
  console.log("PERSISTED_COLE_MISSION=NOT_FOUND");
} else {
  for (const [index, candidate] of candidates.entries()) {
    console.log("");
    console.log(`CANDIDATE=${index + 1}`);
    console.log(`MISSION_ID=${candidate.mission.id}`);
    console.log(`MISSION_TITLE=${candidate.mission.title || ""}`);
    console.log(`MISSION_STATUS=${candidate.mission.status || ""}`);
    console.log(`PROJECT_ID=${candidate.project?.id || ""}`);
    console.log(`SOURCE_VIDEO_COUNT=${candidate.persisted_evidence.source_video_count}`);
    console.log(`VERIFIED_MOMENT_COUNT=${candidate.persisted_evidence.verified_moment_count}`);
    console.log(`VERIFIED_SOURCE_COUNT=${candidate.persisted_evidence.verified_source_count}`);
    console.log(`VERIFIED_DURATION_SECONDS=${candidate.persisted_evidence.verified_duration_seconds}`);
    console.log(`TARGET_DURATION_SECONDS=${candidate.persisted_evidence.target_duration_seconds}`);
    console.log(`REUSABLE=${candidate.persisted_evidence.reusable ? "YES" : "NO"}`);
  }
}

console.log("");
console.log(`REPORT=${reportPath}`);
