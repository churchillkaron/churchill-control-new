#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const ORGANIZATION_ID =
  process.env.COLE_DISCOVERY_ORGANIZATION_ID ||
  "9550b843-b83c-4d15-b02d-a0b5ca23346e";

const SOURCE_FILES = [
  "IMG_0013.MOV",
  "IMG_0021.MOV",
  "IMG_0023.MOV",
  "IMG_0973.MOV",
  "IMG_0974.MOV",
  "IMG_0975.MOV",
  "IMG_2622.MOV",
  "IMG_2628.MOV",
  "cole-logo1.png",
];

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

function unique(values = []) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function safeJson(value) {
  try {
    return JSON.stringify(value ?? {}).toLowerCase();
  } catch {
    return "";
  }
}

function matchedNames(value) {
  const haystack = safeJson(value);
  return SOURCE_FILES.filter((name) =>
    haystack.includes(name.toLowerCase()),
  );
}

function looksLikeCole(value) {
  const haystack = safeJson(value);
  return (
    matchedNames(value).length > 0 ||
    haystack.includes("cole ley") ||
    haystack.includes("cole-ley")
  );
}

function verifiedMoment(node = {}) {
  return (
    text(node.type).toUpperCase() === "MOMENT" &&
    node.metadata?.performance_verified === true &&
    node.metadata?.blocked !== true &&
    Boolean(node.url)
  );
}

function sourceVideo(node = {}) {
  return (
    text(node.type).toUpperCase() === "VIDEO" &&
    !node.parent_asset_node_id &&
    node.metadata?.performance_verified !== true &&
    text(node.lineage?.source).toLowerCase() !==
      "performance_video_reframe"
  );
}

const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL")
  .replace(/\/$/, "");
const serviceKey = text(
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY,
);
if (!serviceKey) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY required");
}

const reportPath = text(process.env.COLE_FORENSIC_REPORT) || path.join(
  process.env.HOME || process.cwd(),
  "Downloads",
  `COLE_LEY_FORENSIC_DISCOVERY_${new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\..+$/, "")}.json`,
);

async function postgrest(table, query = {}) {
  const url = new URL(`${supabaseUrl}/rest/v1/${table}`);
  for (const [key, value] of Object.entries(query)) {
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
      `${table} query failed (${response.status}): ` +
      `${payload?.message || raw || response.statusText}`,
    );
  }

  return Array.isArray(payload) ? payload : [];
}

async function allRows(table, pageSize = 1000) {
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    const page = await postgrest(table, {
      select: "*",
      organization_id: `eq.${ORGANIZATION_ID}`,
      limit: pageSize,
      offset,
    });
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

async function localReports() {
  const directories = unique([
    path.join(process.env.HOME || "", "Downloads"),
    process.cwd(),
    path.join(process.env.HOME || "", "Projects", "churchill-control-creative"),
  ]);
  const results = [];

  for (const directory of directories) {
    let entries = [];
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const lower = entry.name.toLowerCase();
      if (!lower.endsWith(".json")) continue;
      if (
        !lower.includes("cole") &&
        !lower.includes("creative") &&
        !lower.includes("smoke")
      ) continue;

      const filePath = path.join(directory, entry.name);
      try {
        const raw = await fs.readFile(filePath, "utf8");
        const parsed = JSON.parse(raw);
        const names = matchedNames(parsed);
        if (!names.length && !looksLikeCole(parsed)) continue;
        results.push({
          path: filePath,
          matched_source_files: names,
          mission_ids: unique([
            parsed?.creative_mission_id,
            parsed?.mission_id,
            parsed?.create?.creative_mission_id,
            parsed?.create?.mission?.id,
          ]),
          project_ids: unique([
            parsed?.creative_project_id,
            parsed?.project_id,
            parsed?.create?.creative_project_id,
            parsed?.create?.project?.id,
          ]),
          asset_ids: unique([
            ...(Array.isArray(parsed?.uploads)
              ? parsed.uploads.map((item) => item?.response?.asset?.id)
              : []),
            ...(Array.isArray(parsed?.selected_asset_ids)
              ? parsed.selected_asset_ids
              : []),
          ]),
        });
      } catch {
        continue;
      }
    }
  }

  return results;
}

const [
  assets,
  nodes,
  projects,
  missions,
  reports,
] = await Promise.all([
  allRows("creative_assets"),
  allRows("creative_asset_nodes"),
  allRows("creative_projects"),
  allRows("creative_missions"),
  localReports(),
]);

const matchedAssets = assets.filter(looksLikeCole);
const matchedNodesByContent = nodes.filter(looksLikeCole);
const localMissionIds = unique(reports.flatMap((item) => item.mission_ids));
const localProjectIds = unique(reports.flatMap((item) => item.project_ids));
const localAssetIds = unique(reports.flatMap((item) => item.asset_ids));

const matchedAssetIds = new Set(unique([
  ...matchedAssets.map((asset) => asset.id),
  ...localAssetIds,
]));

const sourceNodes = nodes.filter((node) =>
  sourceVideo(node) && (
    matchedAssetIds.has(text(node.creative_asset_id)) ||
    looksLikeCole(node)
  ),
);
const sourceNodeIds = new Set(sourceNodes.map((node) => text(node.id)));

const directlyMatchedMoments = nodes.filter((node) =>
  verifiedMoment(node) && looksLikeCole(node),
);
const linkedMoments = nodes.filter((node) =>
  verifiedMoment(node) && sourceNodeIds.has(
    text(node.metadata?.source_asset_node_id),
  ),
);
const moments = [...new Map(
  [...directlyMatchedMoments, ...linkedMoments]
    .map((node) => [node.id, node]),
).values()];

const projectIds = unique([
  ...matchedAssets.map((asset) => asset.metadata?.creative_project_id),
  ...matchedNodesByContent.map((node) => node.creative_project_id),
  ...sourceNodes.map((node) => node.creative_project_id),
  ...moments.map((node) => node.creative_project_id),
  ...localProjectIds,
]);
const projectIdSet = new Set(projectIds);
const matchedProjects = projects.filter((project) =>
  projectIdSet.has(text(project.id)) || looksLikeCole(project),
);

const missionIds = unique([
  ...matchedAssets.map((asset) => asset.creative_mission_id),
  ...matchedProjects.map((project) => project.creative_mission_id),
  ...localMissionIds,
]);
const missionIdSet = new Set(missionIds);
const matchedMissions = missions.filter((mission) =>
  missionIdSet.has(text(mission.id)) || looksLikeCole(mission),
);

const verifiedDurationSeconds = moments.reduce((sum, node) => {
  return sum + finite(
    node.technical?.duration_seconds ??
    node.metadata?.original_source_range?.duration_seconds,
    0,
  );
}, 0);

const verifiedSourceIds = unique(
  moments.map((node) => node.metadata?.source_asset_node_id),
);

const report = {
  generated_at: new Date().toISOString(),
  mode: "READ_ONLY_FILENAME_FORENSIC_POSTGREST",
  websocket_used: false,
  production_started: false,
  organization_id: ORGANIZATION_ID,
  source_files: SOURCE_FILES,
  database_totals: {
    creative_assets: assets.length,
    creative_asset_nodes: nodes.length,
    creative_projects: projects.length,
    creative_missions: missions.length,
  },
  findings: {
    matched_asset_count: matchedAssets.length,
    matched_source_node_count: sourceNodes.length,
    matched_verified_moment_count: moments.length,
    matched_verified_source_count: verifiedSourceIds.length,
    matched_verified_duration_seconds: Number(
      verifiedDurationSeconds.toFixed(3),
    ),
    matched_project_count: matchedProjects.length,
    matched_mission_count: matchedMissions.length,
    matched_local_report_count: reports.length,
    resumable:
      matchedMissions.length > 0 &&
      matchedProjects.length > 0 &&
      sourceNodes.length > 0 &&
      moments.length > 0,
  },
  assets: matchedAssets.map((asset) => ({
    id: asset.id,
    name: asset.name || null,
    asset_type: asset.asset_type || null,
    creative_mission_id: asset.creative_mission_id || null,
    creative_project_id: asset.metadata?.creative_project_id || null,
    original_file_name:
      asset.metadata?.original_file_name ||
      asset.analysis?.storage_evidence?.original_file_name ||
      null,
    checksum_sha256:
      asset.metadata?.checksum_sha256 ||
      asset.analysis?.storage_evidence?.checksum_sha256 ||
      asset.analysis?.technical_inspection?.checksum_sha256 ||
      null,
    matched_source_files: matchedNames(asset),
    analysis_status:
      asset.metadata?.analysis_status ||
      asset.analysis?.status ||
      null,
    created_at: asset.created_at || null,
  })),
  source_nodes: sourceNodes.map((node) => ({
    id: node.id,
    name: node.name || null,
    creative_asset_id: node.creative_asset_id || null,
    creative_project_id: node.creative_project_id || null,
    duration_seconds: node.technical?.duration_seconds || null,
    checksum_sha256:
      node.technical?.checksum_sha256 ||
      node.technical?.checksum ||
      null,
    matched_source_files: matchedNames(node),
    created_at: node.created_at || null,
  })),
  verified_moments: moments.map((node) => ({
    id: node.id,
    name: node.name || null,
    creative_project_id: node.creative_project_id || null,
    source_asset_node_id:
      node.metadata?.source_asset_node_id || null,
    performance_analysis_identity:
      node.metadata?.performance_analysis_identity || null,
    original_source_range:
      node.metadata?.original_source_range || null,
    score: node.metadata?.score ?? null,
    duration_seconds:
      node.technical?.duration_seconds ?? null,
    original_audio_preserved:
      node.metadata?.original_audio_preserved === true,
    exact_lip_sync_required:
      node.metadata?.exact_lip_sync_required === true,
  })),
  projects: matchedProjects.map((project) => ({
    id: project.id,
    name: project.name || null,
    status: project.status || null,
    creative_mission_id: project.creative_mission_id || null,
    target_duration:
      project.target_duration ??
      project.metadata?.target_duration ??
      null,
    persisted_analysis_reused:
      project.metadata?.persisted_analysis_reused === true,
    created_at: project.created_at || null,
  })),
  missions: matchedMissions.map((mission) => ({
    id: mission.id,
    title: mission.title || null,
    status: mission.status || null,
    business_goal: mission.business_goal || null,
    objective: mission.objective || null,
    created_at: mission.created_at || null,
  })),
  local_reports: reports,
};

await fs.mkdir(path.dirname(reportPath), { recursive: true });
await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

console.log("============================================================");
console.log("COLE LEY FILENAME-BASED FORENSIC DISCOVERY");
console.log("============================================================");
console.log("MODE=READ_ONLY_FILENAME_FORENSIC_POSTGREST");
console.log("WEBSOCKET_USED=NO");
console.log("UPLOADS=NO");
console.log("ANALYSIS_STARTED=NO");
console.log("PRODUCTION_STARTED=NO");
console.log(`MATCHED_ASSET_COUNT=${report.findings.matched_asset_count}`);
console.log(`MATCHED_SOURCE_NODE_COUNT=${report.findings.matched_source_node_count}`);
console.log(`MATCHED_VERIFIED_MOMENT_COUNT=${report.findings.matched_verified_moment_count}`);
console.log(`MATCHED_VERIFIED_SOURCE_COUNT=${report.findings.matched_verified_source_count}`);
console.log(`MATCHED_VERIFIED_DURATION_SECONDS=${report.findings.matched_verified_duration_seconds}`);
console.log(`MATCHED_PROJECT_COUNT=${report.findings.matched_project_count}`);
console.log(`MATCHED_MISSION_COUNT=${report.findings.matched_mission_count}`);
console.log(`MATCHED_LOCAL_REPORT_COUNT=${report.findings.matched_local_report_count}`);
console.log(`RESUMABLE=${report.findings.resumable ? "YES" : "NO"}`);

for (const mission of report.missions) {
  console.log("");
  console.log(`MISSION_ID=${mission.id}`);
  console.log(`MISSION_TITLE=${mission.title || ""}`);
  console.log(`MISSION_STATUS=${mission.status || ""}`);
}

for (const project of report.projects) {
  console.log("");
  console.log(`PROJECT_ID=${project.id}`);
  console.log(`PROJECT_NAME=${project.name || ""}`);
  console.log(`PROJECT_STATUS=${project.status || ""}`);
}

console.log("");
console.log(`REPORT=${reportPath}`);
