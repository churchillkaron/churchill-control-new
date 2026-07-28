#!/usr/bin/env node

import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const EXCLUDED_AI_STATUSES = new Set([
  "REJECTED",
  "RUNNING",
  "FAILED",
  "FAILED_RECONCILIATION_REQUIRED",
]);

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

function status(candidate) {
  return text(object(candidate.metadata).ai_verification_status || "NOT_SELECTED")
    .toUpperCase();
}

function range(candidate) {
  const source = object(object(candidate.metadata).original_source_range);
  const start = finite(source.start_seconds, -1);
  const end = finite(source.end_seconds, -1);
  const suppliedDuration = finite(source.duration_seconds, -1);
  const duration = end > start ? end - start : suppliedDuration;

  if (start < 0 || duration <= 0) return null;

  return {
    start_seconds: start,
    end_seconds: start + duration,
    duration_seconds: duration,
  };
}

function score(candidate) {
  const metadata = object(candidate.metadata);
  const intelligence = object(candidate.intelligence);

  return finite(
    metadata.local_score ??
      metadata.score ??
      intelligence.quality_score ??
      intelligence.reuse_score,
    0,
  );
}

function sourceId(candidate) {
  return text(object(candidate.metadata).source_asset_node_id) ||
    text(candidate.parent_asset_node_id) ||
    null;
}

function priority(candidate) {
  const value = status(candidate);
  if (value === "COMPLETE") return 0;
  if (value === "PENDING_AUTHORIZATION") return 1;
  if (value === "NOT_SELECTED") return 2;
  return 3;
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
const minimumLocalScore = 0;

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

const candidates = (nodes || []).filter((node) =>
  node.type === "MOMENT" &&
  object(node.metadata).local_shortlist_candidate === true,
);

const unresolved = candidates.filter((candidate) =>
  ["RUNNING", "FAILED", "FAILED_RECONCILIATION_REQUIRED"].includes(
    status(candidate),
  ),
);

const rejected = candidates.filter((candidate) =>
  status(candidate) === "REJECTED",
);

const eligible = candidates
  .filter((candidate) =>
    !EXCLUDED_AI_STATUSES.has(status(candidate)) &&
    object(candidate.metadata).blocked !== true &&
    text(candidate.url) &&
    range(candidate) &&
    score(candidate) >= minimumLocalScore,
  )
  .sort((left, right) => {
    const priorityDifference = priority(left) - priority(right);
    if (priorityDifference !== 0) return priorityDifference;

    const leftRank = finite(object(left.metadata).shortlist_rank, 999999);
    const rightRank = finite(object(right.metadata).shortlist_rank, 999999);
    if (leftRank !== rightRank) return leftRank - rightRank;

    return score(right) - score(left);
  });

const counts = new Map();
const preferred = [];
const overflow = [];

for (const candidate of eligible) {
  const identity = sourceId(candidate) || candidate.id;
  const count = counts.get(identity) || 0;

  if (count < maximumClipsPerSource) {
    preferred.push(candidate);
    counts.set(identity, count + 1);
  } else {
    overflow.push(candidate);
  }
}

const selected = [];
let selectedDuration = 0;

for (const candidate of [...preferred, ...overflow]) {
  if (selectedDuration >= targetDuration - 0.001) break;

  const sourceRange = range(candidate);
  if (!sourceRange) continue;

  const clipDuration = Math.min(
    sourceRange.duration_seconds,
    targetDuration - selectedDuration,
  );
  if (clipDuration <= 0) continue;

  selected.push({
    candidate_id: candidate.id,
    source_asset_node_id: sourceId(candidate),
    ai_verification_status: status(candidate),
    local_score: score(candidate),
    selected_duration_seconds: clipDuration,
  });

  selectedDuration += clipDuration;
}

selectedDuration = Number(selectedDuration.toFixed(6));
const eligibleDuration = Number(
  eligible.reduce((sum, candidate) =>
    sum + range(candidate).duration_seconds,
  0).toFixed(3),
);
const distinctSources = new Set(
  selected.map((item) => item.source_asset_node_id).filter(Boolean),
).size;
const logo = findLogo(nodes || []);

const reasons = [];
if (unresolved.length) {
  reasons.push("LEGACY_VERIFICATION_RECONCILIATION_REQUIRED");
}
if (!eligible.length) {
  reasons.push("LOCAL_SHORTLIST_CANDIDATES_REQUIRED");
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
console.log("EVIDENCE_SOURCE=LOCAL_ZERO_PROVIDER_SHORTLIST");
console.log(`ORGANIZATION_ID=${organizationId}`);
console.log(`CREATIVE_PROJECT_ID=${projectId}`);
console.log(`CREATIVE_MISSION_ID=${project.creative_mission_id || ""}`);
console.log(`PROJECT_NAME=${project.name || ""}`);
console.log(`TARGET_DURATION_SECONDS=${targetDuration}`);
console.log(`LOCAL_SHORTLIST_CANDIDATE_COUNT=${candidates.length}`);
console.log(`ELIGIBLE_LOCAL_CANDIDATE_COUNT=${eligible.length}`);
console.log(`ELIGIBLE_LOCAL_DURATION_SECONDS=${eligibleDuration}`);
console.log(`EXCLUDED_AI_REJECTED_CANDIDATE_COUNT=${rejected.length}`);
console.log(`UNRESOLVED_LEGACY_CANDIDATE_COUNT=${unresolved.length}`);
console.log(`SELECTED_CLIP_COUNT=${selected.length}`);
console.log(`SELECTED_DURATION_SECONDS=${selectedDuration}`);
console.log(`DISTINCT_ORIGINAL_SOURCE_COUNT=${distinctSources}`);
console.log(`MINIMUM_DISTINCT_ORIGINAL_SOURCES=${minimumDistinctSources}`);
console.log(`LOGO_ASSET_NODE_ID=${logo?.id || ""}`);
console.log("SOURCE_ONLY_FFMPEG=YES");
console.log("PROVIDER_CALLS_REQUIRED=NO");
console.log("HUMAN_REVIEW_REQUIRED=YES");
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
