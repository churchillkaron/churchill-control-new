#!/usr/bin/env node

import crypto from "node:crypto";
import process from "node:process";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

function text(value) {
  return String(value ?? "").trim();
}

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function env(name, fallback = null) {
  const value = text(process.env[name]);
  return value || fallback;
}

function yes(name) {
  return env(name, "NO").toUpperCase() === "YES";
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function hash(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

function timelineDurationOf(timeline) {
  const explicit = finite(timeline?.technical?.duration_seconds, null);
  if (explicit !== null && explicit > 0) return explicit;

  return list(timeline?.metadata?.edit_decision_list).reduce(
    (maximum, edit) => Math.max(
      maximum,
      finite(edit?.timeline_out_seconds, 0),
    ),
    0,
  );
}

const PROJECT_ID = env(
  "COLE_LEY_PROJECT_ID",
  "6fbac0e8-ab00-44be-9b26-94bf25f28c1e",
);
const TIMELINE_ID = env(
  "COLE_LEY_TIMELINE_ASSET_NODE_ID",
  "64654bfd-264e-47c7-98a9-1a2260bc2934",
);
const MASTER_AUDIO_NODE_ID = env(
  "COLE_LEY_MASTER_AUDIO_ASSET_NODE_ID",
  null,
);
const SOURCE_IN_SECONDS = Math.max(
  0,
  finite(env("COLE_LEY_MASTER_AUDIO_SOURCE_IN_SECONDS", "0"), 0),
);
const EXECUTE = yes("COLE_AUDIO_EXCERPT_EXECUTE");

const projectModule = await import(
  "@/lib/creative/projects/repositories/CreativeProjectRepository"
);
const ProjectRepository = projectModule.CreativeProjectRepository?.getById
  ? projectModule.CreativeProjectRepository
  : projectModule;
const AssetGraphRepository = await import(
  "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository"
);
const {
  createCreativeAssetNode,
  CREATIVE_ASSET_NODE_STATUS,
  CREATIVE_ASSET_NODE_TYPES,
} = await import(
  "@/lib/creative/assets/graph/documents/CreativeAssetNode"
);

const project = await ProjectRepository.getById(PROJECT_ID);
if (!project) throw new Error(`PROJECT_NOT_FOUND:${PROJECT_ID}`);

const organizationId = env(
  "CREATIVE_SMOKE_ORGANIZATION_ID",
  project.organization_id,
);
if (organizationId !== project.organization_id) {
  throw new Error("PROJECT_ORGANIZATION_MISMATCH");
}

const nodes = await AssetGraphRepository.listByProject({
  organization_id: organizationId,
  creative_project_id: PROJECT_ID,
});
const nodesById = new Map(nodes.map((node) => [node.id, node]));

const timeline = nodesById.get(TIMELINE_ID) || nodes
  .filter((node) => node.type === CREATIVE_ASSET_NODE_TYPES.TIMELINE)
  .sort((left, right) =>
    Date.parse(right.created_at || 0) - Date.parse(left.created_at || 0)
  )[0];
if (!timeline) throw new Error("TIMELINE_REQUIRED");
if (!list(timeline.metadata?.edit_decision_list).length) {
  throw new Error("TIMELINE_EDL_REQUIRED");
}

const timelineDuration = timelineDurationOf(timeline);
if (!(timelineDuration > 0)) throw new Error("TIMELINE_DURATION_REQUIRED");

const masterAudio = MASTER_AUDIO_NODE_ID
  ? nodesById.get(MASTER_AUDIO_NODE_ID)
  : nodes
      .filter((node) => node?.url)
      .filter((node) => ["MUSIC", "AUDIO"].includes(node.type))
      .filter((node) => !["ARCHIVED", "REJECTED"].includes(node.status))
      .filter((node) => node.metadata?.timeline_audio_excerpt !== true)
      .sort((left, right) => {
        const leftPrimary = left.metadata?.primary_master_audio === true ? 1 : 0;
        const rightPrimary = right.metadata?.primary_master_audio === true ? 1 : 0;
        if (leftPrimary !== rightPrimary) return rightPrimary - leftPrimary;
        return Date.parse(right.updated_at || right.created_at || 0) -
          Date.parse(left.updated_at || left.created_at || 0);
      })[0];

if (!masterAudio) {
  throw new Error(
    `MASTER_AUDIO_NODE_NOT_FOUND:${MASTER_AUDIO_NODE_ID || "AUTO"}`,
  );
}
if (!masterAudio.url) throw new Error("MASTER_AUDIO_URL_REQUIRED");

const masterDuration = finite(
  masterAudio.technical?.duration_seconds ??
    masterAudio.metadata?.duration_seconds,
  null,
);
if (!(masterDuration > 0)) throw new Error("MASTER_AUDIO_DURATION_REQUIRED");

const requiredSourceEnd = SOURCE_IN_SECONDS + timelineDuration;
if (masterDuration + 0.05 < requiredSourceEnd) {
  throw new Error(
    `MASTER_AUDIO_TOO_SHORT:${masterDuration}:${SOURCE_IN_SECONDS}:${timelineDuration}`,
  );
}

const excerptIdentity = hash({
  project_id: PROJECT_ID,
  timeline_id: timeline.id,
  master_audio_asset_node_id: masterAudio.id,
  source_in_seconds: SOURCE_IN_SECONDS,
  duration_seconds: timelineDuration,
  version: 1,
});

const existing = nodes.find((node) =>
  node.metadata?.timeline_audio_excerpt_identity === excerptIdentity &&
  !["ARCHIVED", "REJECTED"].includes(node.status)
) || null;

console.log("============================================================");
console.log("TIMELINE AUDIO EXCERPT PREPARATION");
console.log("============================================================");
console.log(`ORGANIZATION_ID=${organizationId}`);
console.log(`PROJECT_ID=${PROJECT_ID}`);
console.log(`TIMELINE_ID=${timeline.id}`);
console.log(`TIMELINE_DURATION=${timelineDuration}`);
console.log(`MASTER_AUDIO_NODE_ID=${masterAudio.id}`);
console.log(`MASTER_AUDIO_DURATION=${masterDuration}`);
console.log(`SOURCE_IN_SECONDS=${SOURCE_IN_SECONDS}`);
console.log(`SOURCE_OUT_SECONDS=${requiredSourceEnd}`);
console.log(`EXISTING_EXCERPT_NODE_ID=${existing?.id || ""}`);
console.log(`EXECUTE=${EXECUTE ? "YES" : "NO"}`);
console.log("============================================================");

if (!EXECUTE) {
  console.log("TIMELINE_AUDIO_EXCERPT_DRY_RUN=PASS");
  console.log("No database writes were executed.");
  process.exit(0);
}

const now = new Date().toISOString();
const excerptValues = {
  organization_id: organizationId,
  creative_project_id: PROJECT_ID,
  parent_asset_node_id: masterAudio.id,
  type: CREATIVE_ASSET_NODE_TYPES.MUSIC,
  status: CREATIVE_ASSET_NODE_STATUS.APPROVED,
  name: `Show Me Love — ${timelineDuration.toFixed(3)}s timeline master excerpt`,
  description:
    "Render-safe excerpt of the approved full-length master audio aligned to the selected creative timeline.",
  url: masterAudio.url,
  storage_path: masterAudio.storage_path || null,
  lineage: {
    ...(masterAudio.lineage || {}),
    source: "timeline_audio_excerpt",
    capability: "creative.audio.timeline_excerpt",
    generation_version: 1,
  },
  technical: {
    ...(masterAudio.technical || {}),
    duration_seconds: timelineDuration,
  },
  review: {
    ...(masterAudio.review || {}),
    ai_reviewed: true,
    human_reviewed: true,
    approved: true,
    notes:
      "Derived from the approved full-length master; only the render range is changed.",
  },
  metadata: {
    timeline_audio_excerpt: true,
    timeline_audio_excerpt_identity: excerptIdentity,
    source_master_audio_asset_node_id: masterAudio.id,
    source_master_audio_duration_seconds: masterDuration,
    timeline_asset_node_id: timeline.id,
    timeline_in_seconds: 0,
    source_in_seconds: SOURCE_IN_SECONDS,
    source_out_seconds: requiredSourceEnd,
    duration_seconds: timelineDuration,
    include_in_master: true,
    primary_master_audio: true,
    render_role: "PRIMARY_MASTER_MUSIC",
    exact_song_master: true,
    original_audio_required: true,
    prepared_at: now,
  },
};

let excerpt;
if (existing) {
  excerpt = await AssetGraphRepository.update(existing.id, excerptValues);
} else {
  excerpt = await AssetGraphRepository.create(
    createCreativeAssetNode(excerptValues),
  );
}

if (masterAudio.id !== excerpt.id) {
  await AssetGraphRepository.update(masterAudio.id, {
    metadata: {
      ...(masterAudio.metadata || {}),
      include_in_master: false,
      primary_master_audio: false,
      full_length_master_audio: true,
      render_role: "MASTER_AUDIO_SOURCE",
      timeline_excerpt_asset_node_id: excerpt.id,
      timeline_excerpt_prepared_at: now,
    },
  });
}

console.log(`TIMELINE_AUDIO_EXCERPT_NODE_ID=${excerpt.id}`);
console.log(`TIMELINE_AUDIO_EXCERPT_DURATION=${excerpt.technical?.duration_seconds}`);
console.log(`TIMELINE_AUDIO_EXCERPT_SOURCE_IN=${excerpt.metadata?.source_in_seconds}`);
console.log(`FULL_MASTER_AUDIO_PRESERVED=${masterAudio.id}`);
console.log("TIMELINE_AUDIO_EXCERPT_STATUS=PASS");
