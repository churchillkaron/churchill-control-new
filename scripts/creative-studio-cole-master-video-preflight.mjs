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

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name} required`);
  return value;
}

function duration(moment) {
  return finite(
    object(moment.metadata).clip_range?.duration_seconds ??
    object(moment.technical).duration_seconds,
    0,
  );
}

function sourceId(moment) {
  const metadata = object(moment.metadata);
  return text(metadata.source_asset_node_id) ||
    text(metadata.original_source_asset_node_id) ||
    text(object(metadata.performance_evidence).source_asset_node_id) ||
    null;
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
const maximumClipsPerSource = 4;

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
  realtime: { transport: WebSocket },
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

const verified = (nodes || [])
  .filter((node) => {
    const metadata = object(node.metadata);
    return (
      node.type === "MOMENT" &&
      metadata.performance_verified === true &&
      metadata.blocked !== true &&
      metadata.original_audio_preserved === true &&
      text(node.url) &&
      duration(node) > 0
    );
  })
  .sort((left, right) => {
    const leftScore = finite(
      object(left.metadata).score ?? object(left.intelligence).reuse_score,
      0,
    );
    const rightScore = finite(
      object(right.metadata).score ?? object(right.intelligence).reuse_score,
      0,
    );
    return rightScore - leftScore;
  });

const counts = new Map();
const preferred = [];
const overflow = [];

for (const moment of verified) {
  const identity = sourceId(moment) || moment.id;
  const count = counts.get(identity) || 0;
  if (count < maximumClipsPerSource) {
    preferred.push(moment);
    counts.set(identity, count + 1);
  } else {
    overflow.push(moment);
  }
}

const selected = [];
let selectedDuration = 0;
for (const moment of [...preferred, ...overflow]) {
  if (selectedDuration >= targetDuration - 0.001) break;
  const clipDuration = Math.min(
    duration(moment),
    targetDuration - selectedDuration,
  );
  if (clipDuration <= 0) continue;
  selected.push({
    moment_id: moment.id,
    source_asset_node_id: sourceId(moment),
    selected_duration_seconds: clipDuration,
  });
  selectedDuration += clipDuration;
}

selectedDuration = Number(selectedDuration.toFixed(6));
const eligibleDuration = Number(
  verified.reduce((sum, moment) => sum + duration(moment), 0).toFixed(3),
);
const distinctSources = new Set(
  selected.map((item) => item.source_asset_node_id).filter(Boolean),
).size;
const logo = findLogo(nodes || []);

const reasons = [];
if (!verified.length) {
  reasons.push("VERIFIED_PERFORMANCE_MOMENTS_REQUIRED");
}
if (selectedDuration + 0.001 < targetDuration) {
  reasons.push("MASTER_VIDEO_SOURCE_DURATION_INSUFFICIENT");
}
if (distinctSources < minimumDistinctSources) {
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
console.log("EVIDENCE_SOURCE=CANONICAL_PERFORMANCE_VERIFIED_MOMENTS");
console.log(`ORGANIZATION_ID=${organizationId}`);
console.log(`CREATIVE_PROJECT_ID=${projectId}`);
console.log(`CREATIVE_MISSION_ID=${project.creative_mission_id || ""}`);
console.log(`PROJECT_NAME=${project.name || ""}`);
console.log(`TARGET_DURATION_SECONDS=${targetDuration}`);
console.log(`ELIGIBLE_VERIFIED_MOMENT_COUNT=${verified.length}`);
console.log(`ELIGIBLE_VERIFIED_DURATION_SECONDS=${eligibleDuration}`);
console.log(`SELECTED_CLIP_COUNT=${selected.length}`);
console.log(`SELECTED_DURATION_SECONDS=${selectedDuration}`);
console.log(`DISTINCT_ORIGINAL_SOURCE_COUNT=${distinctSources}`);
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
