#!/usr/bin/env node

import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

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

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name} required`);
  return value;
}

function upper(value) {
  return text(value).toUpperCase();
}

function rank(candidate) {
  return finite(candidate?.metadata?.shortlist_rank, 999999);
}

function score(node) {
  return finite(
    node?.metadata?.score ?? node?.intelligence?.reuse_score,
    0,
  );
}

function momentDuration(moment) {
  return finite(
    moment?.metadata?.clip_range?.duration_seconds ??
      moment?.technical?.duration_seconds,
    0,
  );
}

function findLogo(nodes) {
  return nodes.find((node) =>
    node.type === "LOGO" &&
    node.status !== "ARCHIVED" &&
    text(node.url),
  ) || nodes.find((node) =>
    node.type === "IMAGE" &&
    node.status !== "ARCHIVED" &&
    text(node.url) &&
    /cole[-_ ]?logo/i.test(
      `${node.name || ""} ${object(node.metadata).original_file_name || ""}`,
    ),
  ) || null;
}

const organizationId = required("CREATIVE_SMOKE_ORGANIZATION_ID");
const projectId = required("COLE_LEY_PROJECT_ID");
const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL");
const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");

const targetDuration = 180;
const minimumDistinctSources = 4;
const maximumClipsPerOriginalSource = 4;

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
  realtime: {
    transport: WebSocket,
  },
});

const {
  data: project,
  error: projectError,
} = await supabase
  .from("creative_projects")
  .select("*")
  .eq("id", projectId)
  .eq("organization_id", organizationId)
  .maybeSingle();

if (projectError) {
  throw new Error(`PROJECT_READ_FAILED:${projectError.message}`);
}
if (!project) {
  throw new Error("MASTER_VIDEO_PROJECT_NOT_FOUND");
}

const {
  data: nodes,
  error: nodesError,
} = await supabase
  .from("creative_asset_nodes")
  .select("*")
  .eq("organization_id", organizationId)
  .eq("creative_project_id", projectId)
  .neq("status", "ARCHIVED")
  .order("created_at", { ascending: true });

if (nodesError) {
  throw new Error(`ASSET_NODES_READ_FAILED:${nodesError.message}`);
}

const nodeMap = new Map((nodes || []).map((node) => [node.id, node]));

const candidates = (nodes || [])
  .filter((node) =>
    node.type === "MOMENT" &&
    object(node.metadata).local_shortlist_candidate === true &&
    object(node.metadata).selected_for_ai_verification === true &&
    upper(object(node.metadata).ai_verification_status) === "COMPLETE",
  )
  .sort((left, right) => {
    const rankDifference = rank(left) - rank(right);
    if (rankDifference !== 0) return rankDifference;
    return score(right) - score(left);
  });

const eligible = [];
const seenMomentIds = new Set();

for (const candidate of candidates) {
  const metadata = object(candidate.metadata);
  const originalSourceId = text(metadata.source_asset_node_id) || null;

  for (const momentId of list(metadata.verified_moment_ids)) {
    if (seenMomentIds.has(momentId)) continue;

    const moment = nodeMap.get(momentId);
    if (!moment || moment.type !== "MOMENT") continue;

    const momentMetadata = object(moment.metadata);
    const duration = momentDuration(moment);

    if (
      momentMetadata.performance_verified !== true ||
      momentMetadata.blocked === true ||
      momentMetadata.original_audio_preserved !== true ||
      !text(moment.url) ||
      !(duration > 0)
    ) {
      continue;
    }

    eligible.push({
      candidate_id: candidate.id,
      moment_id: moment.id,
      original_source_asset_node_id: originalSourceId,
      duration_seconds: duration,
      shortlist_rank: rank(candidate),
      score: finite(
        momentMetadata.score ??
          object(moment.intelligence).reuse_score ??
          score(candidate),
        0,
      ),
    });

    seenMomentIds.add(momentId);
  }
}

const sourceCounts = new Map();
const primary = [];
const overflow = [];

for (const item of eligible) {
  const sourceId = item.original_source_asset_node_id || item.moment_id;
  const count = sourceCounts.get(sourceId) || 0;

  if (count < maximumClipsPerOriginalSource) {
    primary.push(item);
    sourceCounts.set(sourceId, count + 1);
  } else {
    overflow.push(item);
  }
}

const selected = [];
let selectedDuration = 0;

for (const item of [...primary, ...overflow]) {
  if (selectedDuration >= targetDuration - 0.001) break;

  const duration = Math.min(
    item.duration_seconds,
    targetDuration - selectedDuration,
  );

  if (!(duration > 0)) continue;

  selected.push({
    ...item,
    selected_duration_seconds: duration,
  });
  selectedDuration += duration;
}

selectedDuration = Number(selectedDuration.toFixed(6));

const distinctOriginalSources = new Set(
  selected
    .map((item) => item.original_source_asset_node_id)
    .filter(Boolean),
).size;

const eligibleDuration = Number(
  eligible
    .reduce((sum, item) => sum + item.duration_seconds, 0)
    .toFixed(3),
);

const logo = findLogo(nodes || []);
const reasons = [];

if (!candidates.length) {
  reasons.push("VERIFIED_SHORTLIST_CANDIDATES_REQUIRED");
}
if (!eligible.length) {
  reasons.push("VERIFIED_PERFORMANCE_MOMENTS_REQUIRED");
}
if (selectedDuration + 0.001 < targetDuration) {
  reasons.push("MASTER_VIDEO_SOURCE_DURATION_INSUFFICIENT");
}
if (distinctOriginalSources < minimumDistinctSources) {
  reasons.push("MASTER_VIDEO_SOURCE_DIVERSITY_INSUFFICIENT");
}
if (!logo) {
  reasons.push("MASTER_VIDEO_LOGO_REQUIRED");
}

const ready = reasons.length === 0;

console.log("============================================================");
console.log("COLE SOURCE-ONLY MASTER VIDEO PREFLIGHT");
console.log("============================================================");
console.log("PREFLIGHT_MODE=READ_ONLY_LIVE_DATABASE");
console.log(`ORGANIZATION_ID=${organizationId}`);
console.log(`CREATIVE_PROJECT_ID=${projectId}`);
console.log(`CREATIVE_MISSION_ID=${project.creative_mission_id || ""}`);
console.log(`PROJECT_NAME=${project.name || ""}`);
console.log(`TARGET_DURATION_SECONDS=${targetDuration}`);
console.log(`VERIFIED_CANDIDATE_COUNT=${candidates.length}`);
console.log(`ELIGIBLE_VERIFIED_MOMENT_COUNT=${eligible.length}`);
console.log(`ELIGIBLE_VERIFIED_DURATION_SECONDS=${eligibleDuration}`);
console.log(`SELECTED_CLIP_COUNT=${selected.length}`);
console.log(`SELECTED_DURATION_SECONDS=${selectedDuration}`);
console.log(`DISTINCT_ORIGINAL_SOURCE_COUNT=${distinctOriginalSources}`);
console.log(`MINIMUM_DISTINCT_ORIGINAL_SOURCES=${minimumDistinctSources}`);
console.log(`LOGO_ASSET_NODE_ID=${logo?.id || ""}`);
console.log("SOURCE_ONLY_FFMPEG=YES");
console.log("PROVIDER_CALLS_REQUIRED=NO");
console.log(`MASTER_VIDEO_READY=${ready ? "PASS" : "FAIL"}`);
console.log(`BLOCKING_REASONS=${reasons.join(",")}`);
console.log("DATABASE_MUTATIONS=NO");
console.log("STORAGE_MUTATIONS=NO");
console.log("AI_PROVIDER_CALLS=NO");
console.log("VIDEO_PROVIDER_CALLS=NO");
console.log("WORKER_CALLED=NO");
console.log("PRODUCTION_AUTHORIZED=NO");
console.log("PRODUCTION_STARTED=NO");
console.log("============================================================");

if (!ready) process.exitCode = 2;
