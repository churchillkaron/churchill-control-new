#!/usr/bin/env node

import process from "node:process";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv({ cwd: process.cwd() });

process.env.CREATIVE_ALLOW_AUTOMATIC_REPAIR = "false";
process.env.CREATIVE_APPROVED_INCREMENTAL_REPAIR_BUDGET = "0";
process.env.REPAIR_EXECUTION_AUTHORIZED = "false";
process.env.PUBLICATION_AUTHORIZED = "false";
process.env.CREATIVE_FRESH_DIRECTION_AUTHORIZED = "false";
process.env.CREATIVE_PROVIDER_EXECUTION_AUTHORIZED = "false";

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function unique(values = []) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function assetUrl(asset = {}) {
  return text(asset.url || asset.file_url || asset.image_url || asset.thumbnail_url);
}

function assetName(asset = {}) {
  return text(
    asset.name ||
    asset.title ||
    asset.file_name ||
    asset.metadata?.original_file_name ||
    asset.id,
  );
}

function assetKind(asset = {}) {
  const mime = text(
    asset.mime_type ||
    asset.technical?.mime_type ||
    asset.metadata?.mime_type ||
    asset.analysis?.technical_inspection?.mime_type,
  ).toLowerCase();
  const type = text(asset.asset_type || asset.type).toLowerCase();
  const source = assetUrl(asset).toLowerCase();

  if (mime.startsWith("video/") || type.includes("video") || /\.(mp4|mov|m4v|webm|mkv)(\?|$)/.test(source)) {
    return "VIDEO";
  }
  if (mime.startsWith("audio/") || /audio|music|voice|sfx/.test(type) || /\.(mp3|wav|m4a|aac|flac|ogg|opus)(\?|$)/.test(source)) {
    return "AUDIO";
  }
  if (mime.startsWith("image/") || /image|logo|brand/.test(type) || /\.(jpg|jpeg|png|webp|heic|avif)(\?|$)/.test(source)) {
    return "IMAGE";
  }
  if (/pdf|document|presentation|spreadsheet/.test(`${mime} ${type}`)) {
    return "DOCUMENT";
  }
  return "OTHER";
}

function assetTechnical(asset = {}) {
  const analysis = object(asset.analysis);
  const inspection = object(analysis.technical_inspection || analysis.technical);
  return {
    duration_seconds: finite(
      inspection.duration_seconds ??
      analysis.duration_seconds ??
      asset.technical?.duration_seconds ??
      asset.metadata?.duration_seconds,
    ),
    width: finite(
      inspection.width ??
      analysis.width ??
      asset.technical?.width ??
      asset.metadata?.width,
    ),
    height: finite(
      inspection.height ??
      analysis.height ??
      asset.technical?.height ??
      asset.metadata?.height,
    ),
  };
}

function assetVerified(asset = {}) {
  const statuses = [
    asset.status,
    asset.review?.status,
    asset.analysis?.status,
    asset.analysis_status,
    asset.metadata?.analysis_status,
    asset.metadata?.verification_status,
  ].map((value) => text(value).toUpperCase());

  return Boolean(
    asset.review?.approved === true ||
    asset.metadata?.verified === true ||
    asset.metadata?.asset_verified === true ||
    asset.metadata?.analysis_complete === true ||
    asset.analysis?.verified === true ||
    statuses.some((status) => [
      "APPROVED",
      "VERIFIED",
      "COMPLETE",
      "COMPLETED",
      "READY",
      "ACTIVE",
      "ANALYSED",
      "ANALYZED",
    ].includes(status)),
  );
}

function assetAvailable(asset = {}, organizationId) {
  if (!asset?.id || text(asset.organization_id) !== text(organizationId)) {
    return false;
  }
  if (asset.archived === true || asset.disabled === true || asset.deleted_at) {
    return false;
  }
  if (["ARCHIVED", "DISABLED", "DELETED", "REJECTED", "FAILED"].includes(text(asset.status).toUpperCase())) {
    return false;
  }
  return Boolean(assetUrl(asset));
}

function projectDuration(project = {}, brief = {}) {
  const metadata = object(project.metadata);
  return finite(
    metadata.temporal_contract?.duration_seconds ??
    metadata.temporalContract?.duration_seconds ??
    metadata.full_master_duration ??
    metadata.full_song_duration_seconds ??
    metadata.creative_direction_constraints?.full_song_duration_seconds ??
    brief.duration_seconds ??
    brief.target_duration ??
    project.target_duration,
  );
}

function fullSourceAudioProject(project = {}) {
  const metadata = object(project.metadata);
  const mode = text(
    metadata.duration_mode ||
    metadata.temporal_contract?.mode ||
    metadata.temporalContract?.mode,
  ).toUpperCase();
  return (
    metadata.full_song === true ||
    metadata.music_video === true ||
    ["FULL_SOURCE_AUDIO", "FULL_SONG", "MATCH_SOURCE_AUDIO"].includes(mode)
  );
}

const QUALITY_NUMBER_FIELDS = [
  "minimum_scene_score",
  "regenerate_below_score",
];

const QUALITY_BOOLEAN_FIELDS = [
  "require_brand_fit",
  "require_non_ai_feel",
  "require_identity_continuity",
  "require_product_continuity",
  "require_story_progression",
];

function qualityPolicy(project = {}, brief = {}) {
  return object(
    project.metadata?.creative_quality_policy ||
    brief.creative_quality_policy ||
    brief.metadata?.creative_quality_policy,
  );
}

function validateQualityPolicy(policy = {}) {
  const failures = [];
  if (!text(policy.version)) failures.push("QUALITY_POLICY_VERSION_REQUIRED");

  for (const field of QUALITY_NUMBER_FIELDS) {
    const value = finite(policy[field]);
    if (value === null || value < 0 || value > 100) {
      failures.push(`QUALITY_POLICY_${field.toUpperCase()}_INVALID`);
    }
  }

  if (
    finite(policy.regenerate_below_score) !== null &&
    finite(policy.minimum_scene_score) !== null &&
    Number(policy.regenerate_below_score) > Number(policy.minimum_scene_score)
  ) {
    failures.push("QUALITY_POLICY_REGENERATION_THRESHOLD_INVALID");
  }

  for (const field of QUALITY_BOOLEAN_FIELDS) {
    if (typeof policy[field] !== "boolean") {
      failures.push(`QUALITY_POLICY_${field.toUpperCase()}_REQUIRED`);
    }
  }

  return failures;
}

function taskStatusCounts(tasks = []) {
  const counts = {};
  for (const task of list(tasks)) {
    const status = text(task.status || "UNKNOWN").toUpperCase();
    counts[status] = (counts[status] || 0) + 1;
  }
  return counts;
}

const sourceGraphId = text(
  process.env.SOURCE_PRODUCTION_GRAPH_ID ||
  process.env.PRODUCTION_GRAPH_ID ||
  process.argv[2],
);

if (!sourceGraphId) throw new Error("SOURCE_PRODUCTION_GRAPH_ID_REQUIRED");

const [
  ProductionGraphRepository,
  CreativeProjectRepository,
  { CreativeBriefRuntime },
  { CreativeAssetsRuntime },
  AssetGraphRepository,
  { ProductionTaskRuntime },
  { CreativeUniversalAssetIntelligenceRuntime },
  { supabaseAdmin },
] = await Promise.all([
  import("@/lib/creative/production-graph/repositories/ProductionGraphRepository"),
  import("@/lib/creative/projects/repositories/CreativeProjectRepository"),
  import("@/lib/creative/brief/runtime/CreativeBriefRuntime"),
  import("@/lib/creative/assets/runtime/CreativeAssetsRuntime"),
  import("@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository"),
  import("@/lib/operations/tasks/runtime/ProductionTaskRuntime"),
  import("@/lib/creative/assets/intelligence/runtime/CreativeUniversalAssetIntelligenceRuntime"),
  import("@/lib/shared/supabase/admin"),
]);

const sourceGraph = await ProductionGraphRepository.getById(sourceGraphId);
const organizationId = text(sourceGraph?.organization_id);
const projectId = text(sourceGraph?.creative_project_id);

if (!sourceGraph) throw new Error(`SOURCE_PRODUCTION_GRAPH_NOT_FOUND:${sourceGraphId}`);
if (!organizationId || !projectId) {
  throw new Error("SOURCE_PRODUCTION_GRAPH_SCOPE_INCOMPLETE");
}

const project = await CreativeProjectRepository.getById(projectId);
if (!project) throw new Error(`CREATIVE_PROJECT_NOT_FOUND:${projectId}`);

const missionId = text(
  project.creative_mission_id ||
  sourceGraph.creative_mission_id,
);

const missionResult = missionId
  ? await supabaseAdmin
      .from("creative_missions")
      .select("*")
      .eq("id", missionId)
      .maybeSingle()
  : { data: null, error: null };
if (missionResult.error) throw missionResult.error;
const mission = missionResult.data || null;

const [briefs, assets, assetNodes, graphs, tasks] = await Promise.all([
  CreativeBriefRuntime.list({
    organization_id: organizationId,
    creative_mission_id: missionId || undefined,
    creative_project_id: projectId,
  }),
  CreativeAssetsRuntime.list({
    organization_id: organizationId,
    creative_mission_id: missionId || undefined,
    creative_project_id: projectId,
    limit: 1000,
  }),
  AssetGraphRepository.listByProject({
    organization_id: organizationId,
    creative_project_id: projectId,
  }),
  ProductionGraphRepository.listByProject({
    organization_id: organizationId,
    creative_project_id: projectId,
  }),
  ProductionTaskRuntime.list({
    organization_id: organizationId,
    creative_project_id: projectId,
  }),
]);

const brief = briefs[0] || {};
const selectedIds = unique(list(project.metadata?.selected_asset_ids));
const assetById = new Map(list(assets).map((asset) => [text(asset.id), asset]));
const selectedAssets = selectedIds.map((id) => assetById.get(id)).filter(Boolean);
const selectedIdSet = new Set(selectedIds);
const directionSupportAssets = list(assets).filter((asset) =>
  !selectedIdSet.has(text(asset.id)) &&
  asset.metadata?.direction_support_asset === true &&
  asset.metadata?.read_only_projection === true
);
const directionAssets = [
  ...selectedAssets,
  ...directionSupportAssets,
];
const directionSupportAssetIds = directionSupportAssets
  .map((asset) => text(asset.id))
  .filter(Boolean);
const missingSelectedIds = selectedIds.filter((id) => !assetById.has(id));
const unavailableSelectedIds = selectedAssets
  .filter((asset) => !assetAvailable(asset, organizationId))
  .map((asset) => text(asset.id));
const unverifiedSelectedIds = selectedAssets
  .filter((asset) => !assetVerified(asset))
  .map((asset) => text(asset.id));

const projectNodesByAsset = new Map();
for (const node of list(assetNodes)) {
  const creativeAssetId = text(
    node.creative_asset_id ||
    node.metadata?.source_creative_asset_id,
  );
  if (!creativeAssetId) continue;
  if (!projectNodesByAsset.has(creativeAssetId)) {
    projectNodesByAsset.set(creativeAssetId, []);
  }
  projectNodesByAsset.get(creativeAssetId).push(node);
}
const selectedIdsMissingProjectNodes = selectedIds.filter(
  (id) => !list(projectNodesByAsset.get(id)).length,
);

const policy = qualityPolicy(project, brief);
const qualityFailures = validateQualityPolicy(policy);
const duration = projectDuration(project, brief);
const fullSourceAudio = fullSourceAudioProject(project);
const soundtrackNodeId = text(
  project.metadata?.primary_soundtrack_asset_node_id ||
  project.metadata?.temporal_contract?.source_asset_node_id ||
  project.metadata?.temporalContract?.source_asset_node_id,
);
const soundtrackNode = soundtrackNodeId
  ? assetNodes.find((node) => text(node.id) === soundtrackNodeId) || null
  : null;
const soundtrackDuration = finite(
  soundtrackNode?.technical?.duration_seconds ??
  soundtrackNode?.metadata?.duration_seconds ??
  soundtrackNode?.metadata?.timing?.duration_seconds,
);

let assetIntelligence = null;
let assetIntelligenceError = null;
try {
  assetIntelligence = CreativeUniversalAssetIntelligenceRuntime.analyze({
    project,
    brief,
    assets: directionAssets,
  });
} catch (error) {
  assetIntelligenceError = text(error?.message || error);
}

const taskCountsByGraph = {};
for (const graph of graphs) {
  taskCountsByGraph[text(graph.id)] = 0;
}
let unscopedTaskCount = 0;
for (const task of tasks) {
  const graphId = text(task.production_graph_id || task.metadata?.production_graph_id);
  if (!graphId) {
    unscopedTaskCount += 1;
    continue;
  }
  taskCountsByGraph[graphId] = (taskCountsByGraph[graphId] || 0) + 1;
}

const blockers = [];
if (text(project.organization_id) !== organizationId) {
  blockers.push("PROJECT_ORGANIZATION_SCOPE_MISMATCH");
}
if (project.archived === true || text(project.status).toUpperCase() === "ARCHIVED") {
  blockers.push("PROJECT_ARCHIVED");
}
if (!missionId) blockers.push("CREATIVE_MISSION_ID_REQUIRED");
if (!mission) blockers.push("CREATIVE_MISSION_NOT_FOUND");
if (mission && text(mission.organization_id) !== organizationId) {
  blockers.push("MISSION_ORGANIZATION_SCOPE_MISMATCH");
}
if (!briefs.length) blockers.push("CREATIVE_BRIEF_REQUIRED");
if (!text(project.objective || brief.creative_objective || brief.business_goal)) {
  blockers.push("CREATIVE_OBJECTIVE_REQUIRED");
}
if (duration === null || duration <= 0) {
  blockers.push("CREATIVE_TEMPORAL_DURATION_REQUIRED");
}
blockers.push(...qualityFailures);
if (!selectedIds.length) blockers.push("SELECTED_ASSET_IDS_REQUIRED");
if (missingSelectedIds.length) {
  blockers.push(`SELECTED_ASSETS_MISSING:${missingSelectedIds.join(",")}`);
}
if (unavailableSelectedIds.length) {
  blockers.push(`SELECTED_ASSETS_UNAVAILABLE:${unavailableSelectedIds.join(",")}`);
}
if (unverifiedSelectedIds.length) {
  blockers.push(`SELECTED_ASSETS_UNVERIFIED:${unverifiedSelectedIds.join(",")}`);
}
if (selectedIdsMissingProjectNodes.length) {
  blockers.push(
    `SELECTED_ASSET_PROJECT_NODES_MISSING:${selectedIdsMissingProjectNodes.join(",")}`,
  );
}
if (assetIntelligenceError) {
  blockers.push(`UNIVERSAL_ASSET_INTELLIGENCE_ERROR:${assetIntelligenceError}`);
}
if (assetIntelligence && assetIntelligence.passed !== true) {
  blockers.push(
    `UNIVERSAL_ASSET_INTELLIGENCE_BLOCKED:${list(assetIntelligence.blocking_issues).join(",")}`,
  );
}
if (
  fullSourceAudio &&
  list(assetIntelligence?.audio_sources).length < 1
) {
  blockers.push(
    "PRIMARY_SOUNDTRACK_NOT_VISIBLE_TO_DIRECTION_INTELLIGENCE",
  );
}
if (fullSourceAudio && !soundtrackNodeId) {
  blockers.push("PRIMARY_SOUNDTRACK_NODE_ID_REQUIRED");
}
if (fullSourceAudio && soundtrackNodeId && !soundtrackNode) {
  blockers.push(`PRIMARY_SOUNDTRACK_NODE_NOT_FOUND:${soundtrackNodeId}`);
}
if (
  fullSourceAudio &&
  duration !== null &&
  soundtrackDuration !== null &&
  Math.abs(duration - soundtrackDuration) > 0.25
) {
  blockers.push(
    `PRIMARY_SOUNDTRACK_DURATION_MISMATCH:project=${duration};soundtrack=${soundtrackDuration}`,
  );
}

console.log("============================================================");
console.log("ZERO-COST FRESH CREATIVE DIRECTION INPUT AUDIT");
console.log("============================================================");
console.log(`SOURCE_GRAPH_ID=${sourceGraphId}`);
console.log(`ORGANIZATION_ID=${organizationId}`);
console.log(`CREATIVE_PROJECT_ID=${projectId}`);
console.log(`CREATIVE_MISSION_ID=${missionId || "NONE"}`);
console.log(`PROJECT_NAME=${assetName(project)}`);
console.log(`PROJECT_STATUS=${text(project.status) || "UNKNOWN"}`);
console.log(`PROJECT_ARCHIVED=${project.archived === true ? "YES" : "NO"}`);
console.log(`BRIEF_COUNT=${briefs.length}`);
console.log(`TEMPORAL_DURATION_SECONDS=${duration ?? "UNKNOWN"}`);
console.log(`FULL_SOURCE_AUDIO_REQUIRED=${fullSourceAudio ? "YES" : "NO"}`);
console.log(`PRIMARY_SOUNDTRACK_NODE_ID=${soundtrackNodeId || "NONE"}`);
console.log(`PRIMARY_SOUNDTRACK_DURATION_SECONDS=${soundtrackDuration ?? "UNKNOWN"}`);
console.log(`QUALITY_POLICY_VERSION=${text(policy.version) || "NONE"}`);
console.log(`QUALITY_POLICY_FAILURES=${JSON.stringify(qualityFailures)}`);
console.log(`SELECTED_ASSET_ID_COUNT=${selectedIds.length}`);
console.log(`SELECTED_ASSET_RECORD_COUNT=${selectedAssets.length}`);
console.log(`DIRECTION_SUPPORT_ASSET_COUNT=${directionSupportAssets.length}`);
console.log(`DIRECTION_SUPPORT_ASSET_IDS=${JSON.stringify(directionSupportAssetIds)}`);
console.log(`DIRECTION_ASSET_COUNT=${directionAssets.length}`);
console.log(`SELECTED_ASSET_PROJECT_NODE_COVERAGE=${selectedIds.length - selectedIdsMissingProjectNodes.length}/${selectedIds.length}`);
console.log(`PROJECT_ASSET_NODE_COUNT=${assetNodes.length}`);
console.log(`PROJECT_GRAPH_COUNT=${graphs.length}`);
console.log(`PROJECT_TASK_COUNT=${tasks.length}`);
console.log(`UNSCOPED_PROJECT_TASK_COUNT=${unscopedTaskCount}`);
console.log(`TASK_COUNTS_BY_GRAPH=${JSON.stringify(taskCountsByGraph)}`);
console.log(`SOURCE_GRAPH_TASK_COUNT=${taskCountsByGraph[sourceGraphId] || 0}`);
console.log("TASK_DEDUPE_SCOPE=PRODUCTION_GRAPH");
console.log("READ_ONLY_AUDIT=YES");
console.log("FRESH_DIRECTION_AUTHORIZED=NO");
console.log("PROVIDER_EXECUTION_AUTHORIZED=NO");
console.log("GRAPH_CREATED=NO");
console.log("SHOTS_CHANGED=NO");
console.log("TASKS_CREATED=NO");
console.log("PROVIDER_CALLS_EXECUTED=NO");
console.log("WALLET_CHANGED=NO");
console.log("PUBLICATION_AUTHORIZED=NO");

console.log("============================================================");
console.log("SELECTED ASSET INVENTORY");
console.log("============================================================");
for (const [index, id] of selectedIds.entries()) {
  const asset = assetById.get(id) || null;
  const technical = assetTechnical(asset || {});
  const nodes = list(projectNodesByAsset.get(id));
  console.log(`ASSET_${index + 1}=${JSON.stringify({
    id,
    name: asset ? assetName(asset) : null,
    kind: asset ? assetKind(asset) : null,
    status: asset ? text(asset.status) || null : null,
    analysis_status: asset ? text(asset.analysis_status || asset.analysis?.status || asset.metadata?.analysis_status) || null : null,
    verified: asset ? assetVerified(asset) : false,
    available: asset ? assetAvailable(asset, organizationId) : false,
    url_present: asset ? Boolean(assetUrl(asset)) : false,
    duration_seconds: technical.duration_seconds,
    resolution: technical.width && technical.height
      ? `${technical.width}x${technical.height}`
      : null,
    project_asset_node_count: nodes.length,
    project_asset_node_ids: nodes.map((node) => node.id),
  })}`);
}

console.log("============================================================");
console.log("UNIVERSAL ASSET INTELLIGENCE");
console.log("============================================================");
console.log(`ASSET_INTELLIGENCE_EXECUTED=${assetIntelligence ? "YES" : "NO"}`);
console.log(`ASSET_INTELLIGENCE_PASSED=${assetIntelligence?.passed === true ? "YES" : "NO"}`);
console.log(`ASSET_INTELLIGENCE_ERROR=${assetIntelligenceError || "NONE"}`);
console.log(`ASSET_INTELLIGENCE_BLOCKING_ISSUES=${JSON.stringify(list(assetIntelligence?.blocking_issues))}`);
console.log(`PERSON_PROFILE_COUNT=${list(assetIntelligence?.person_profiles).length}`);
console.log(`PRODUCT_PROFILE_COUNT=${list(assetIntelligence?.product_profiles).length}`);
console.log(`LOCATION_PROFILE_COUNT=${list(assetIntelligence?.location_profiles).length}`);
console.log(`BRAND_MARK_PROFILE_COUNT=${list(assetIntelligence?.brand_mark_profiles).length}`);
console.log(`AUDIO_SOURCE_COUNT=${list(assetIntelligence?.audio_sources).length}`);

console.log("============================================================");
console.log("FRESH DIRECTION INPUT RESULT");
console.log("============================================================");
console.log(`FRESH_DIRECTION_INPUT_READY=${blockers.length ? "NO" : "YES"}`);
console.log(`FRESH_DIRECTION_INPUT_BLOCKER_COUNT=${blockers.length}`);
console.log(`FRESH_DIRECTION_INPUT_BLOCKERS=${JSON.stringify(blockers)}`);
console.log("OLD_GRAPH_REUSE_ALLOWED=NO");
console.log("OLD_TASK_REUSE_ALLOWED=NO");
console.log("NEW_DIRECTION_CREATED=NO");
console.log("NEW_GRAPH_CREATED=NO");
console.log("TASKS_CREATED=NO");
console.log("PROVIDER_CALLS_EXECUTED=NO");
console.log("WALLET_CHANGED=NO");
console.log("BUDGET_AUTHORIZED=NO");
console.log("PUBLICATION_AUTHORIZED=NO");

if (blockers.length) process.exitCode = 2;
