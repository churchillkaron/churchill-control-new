#!/usr/bin/env node

import process from "node:process";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv({ cwd: process.cwd() });

function text(value) {
  return String(value ?? "").trim();
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function assetId(value) {
  if (typeof value === "string" || typeof value === "number") return text(value);
  return text(
    value?.asset_id ||
    value?.assetId ||
    value?.creative_asset_id ||
    value?.creativeAssetId ||
    value?.id,
  );
}

function unique(values = []) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function referenceRows(values = []) {
  return list(values)
    .map((entry) => ({
      asset_id: assetId(entry),
      role: text(entry?.role || entry?.asset_role || entry?.binding_role),
      primary: entry?.primary_source === true ||
        entry?.primarySource === true ||
        entry?.primary === true,
      raw: entry,
    }))
    .filter((entry) => entry.asset_id);
}

function planSceneFor(shot, plan = {}) {
  const sceneIndex = Number(shot.metadata?.master_plan_scene_index);
  if (Number.isInteger(sceneIndex) && list(plan.scenes)[sceneIndex]) {
    return list(plan.scenes)[sceneIndex];
  }
  return list(plan.scenes).find((scene) =>
    text(scene.id) === text(shot.metadata?.source_master_plan_scene_id),
  ) || null;
}

function planShotFor(shot, planScene) {
  const shotIndex = Number(shot.metadata?.master_plan_shot_index);
  if (Number.isInteger(shotIndex) && list(planScene?.shots)[shotIndex]) {
    return list(planScene.shots)[shotIndex];
  }
  return list(planScene?.shots).find((candidate) =>
    text(candidate.id) === text(shot.metadata?.source_master_plan_shot_id),
  ) || null;
}

function assetSummary(asset = {}) {
  return {
    id: asset.id,
    name: asset.name || asset.title || asset.file_name || null,
    file_name: asset.file_name || null,
    asset_type: asset.asset_type || asset.type || null,
    url: asset.file_url || asset.image_url || asset.url || null,
    description: asset.description || asset.analysis?.description || null,
    tags: list(asset.tags || asset.analysis?.tags),
    analysis_status:
      asset.analysis?.status ||
      asset.metadata?.analysis_status ||
      null,
    analysis: asset.analysis || {},
    metadata: asset.metadata || {},
  };
}

const graphId = text(process.env.PRODUCTION_GRAPH_ID || process.argv[2]);
const shotId = text(process.env.SHOT_ID || process.argv[3]);

if (!graphId) throw new Error("PRODUCTION_GRAPH_ID_REQUIRED");
if (!shotId) throw new Error("SHOT_ID_REQUIRED");

process.env.CREATIVE_ALLOW_AUTOMATIC_REPAIR = "false";
process.env.CREATIVE_APPROVED_INCREMENTAL_REPAIR_BUDGET = "0";
process.env.REPAIR_EXECUTION_AUTHORIZED = "false";
process.env.PUBLICATION_AUTHORIZED = "false";

const [
  { ProductionGraphRuntime },
  { ShotRuntime },
  { CreativeAssetsRuntime },
] = await Promise.all([
  import("@/lib/creative/production-graph/runtime/ProductionGraphRuntime"),
  import("@/lib/creative/shots/runtime/ShotRuntime"),
  import("@/lib/creative/assets/runtime/CreativeAssetsRuntime"),
]);

const graph = await ProductionGraphRuntime.get(graphId);
if (!graph) throw new Error(`PRODUCTION_GRAPH_NOT_FOUND:${graphId}`);

const shot = await ShotRuntime.get(shotId);
if (!shot) throw new Error(`SHOT_NOT_FOUND:${shotId}`);

if (
  text(shot.organization_id) !== text(graph.organization_id) ||
  text(shot.creative_project_id) !== text(graph.creative_project_id)
) {
  throw new Error("SHOT_OUTSIDE_GRAPH_PROJECT_SCOPE");
}

const plan = object(graph.metadata?.approval_plan_snapshot);
if (!list(plan.scenes).length) {
  throw new Error("PRODUCTION_GRAPH_APPROVAL_PLAN_SNAPSHOT_REQUIRED");
}

const planScene = planSceneFor(shot, plan);
const planShot = planShotFor(shot, planScene);
if (!planScene || !planShot) {
  throw new Error("SHOT_PLAN_MAPPING_REQUIRED");
}

const persistedReferences = referenceRows([
  ...list(shot.reference_assets),
  ...list(shot.reference_asset_ids),
]);
const plannedReferences = referenceRows([
  ...list(planShot.reference_assets),
  ...list(planShot.reference_asset_ids),
]);
const candidateIds = unique([
  ...persistedReferences.map((entry) => entry.asset_id),
  ...plannedReferences.map((entry) => entry.asset_id),
]);

const manifestEntries = list(plan.asset_manifest)
  .filter((entry) => candidateIds.includes(assetId(entry)))
  .map((entry) => ({
    asset_id: assetId(entry),
    disposition: text(entry.disposition).toUpperCase(),
    role: text(entry.role || entry.asset_role || entry.binding_role),
    primary: entry.primary_source === true ||
      entry.primarySource === true ||
      entry.primary === true,
    reason: text(entry.reason),
    confidence: entry.confidence ?? null,
    assignments: list(entry.assignments),
    continuity_anchors: object(entry.continuity_anchors),
    restrictions: object(entry.restrictions),
    repair_requirements: list(entry.repair_requirements),
  }));

const assets = await CreativeAssetsRuntime.list({
  organization_id: graph.organization_id,
  creative_project_id: graph.creative_project_id,
  limit: 1000,
});
const assetsById = new Map(assets.map((asset) => [text(asset.id), asset]));

console.log("============================================================");
console.log("READ-ONLY SHOT PRIMARY CANDIDATE INSPECTOR");
console.log("============================================================");
console.log(`PRODUCTION_GRAPH_ID=${graphId}`);
console.log(`SHOT_ID=${shotId}`);
console.log(`SHOT_TITLE=${text(shot.title)}`);
console.log(`SHOT_PURPOSE=${text(shot.purpose)}`);
console.log(`SHOT_ACTION=${text(shot.action)}`);
console.log(`PLAN_SCENE_ID=${text(planScene.id)}`);
console.log(`PLAN_SCENE_TITLE=${text(planScene.title)}`);
console.log(`PLAN_SHOT_ID=${text(planShot.id)}`);
console.log(`PLAN_SHOT_TITLE=${text(planShot.title)}`);
console.log(`PLAN_SHOT_SUBJECT=${text(planShot.subject)}`);
console.log(`PLAN_SHOT_ACTION=${text(planShot.action)}`);
console.log(`PLAN_SHOT_MEDIUM=${text(planShot.medium)}`);
console.log(`PERSISTED_REFERENCE_ROWS=${JSON.stringify(persistedReferences)}`);
console.log(`PLANNED_REFERENCE_ROWS=${JSON.stringify(plannedReferences)}`);
console.log(`CANDIDATE_COUNT=${candidateIds.length}`);
console.log(`CANDIDATE_IDS=${JSON.stringify(candidateIds)}`);
console.log(`MANIFEST_ENTRIES=${JSON.stringify(manifestEntries)}`);
console.log("READ_ONLY_AUDIT=YES");
console.log("GRAPH_CHANGED=NO");
console.log("SHOT_CHANGED=NO");
console.log("TASKS_CREATED=NO");
console.log("PROVIDER_CALLS_EXECUTED=NO");
console.log("WALLET_CHANGED=NO");
console.log("REPAIR_EXECUTION_AUTHORIZED=NO");
console.log("PUBLICATION_AUTHORIZED=NO");

for (const candidateId of candidateIds) {
  const asset = assetsById.get(candidateId);
  console.log("------------------------------------------------------------");
  console.log(`CANDIDATE_ASSET_ID=${candidateId}`);
  console.log(`CANDIDATE_ASSET_FOUND=${asset ? "YES" : "NO"}`);
  console.log(`CANDIDATE_ASSET=${JSON.stringify(asset ? assetSummary(asset) : null)}`);
  console.log(`CANDIDATE_PLAN_REFERENCES=${JSON.stringify(plannedReferences.filter((entry) => entry.asset_id === candidateId))}`);
  console.log(`CANDIDATE_PERSISTED_REFERENCES=${JSON.stringify(persistedReferences.filter((entry) => entry.asset_id === candidateId))}`);
  console.log(`CANDIDATE_MANIFEST=${JSON.stringify(manifestEntries.filter((entry) => entry.asset_id === candidateId))}`);
}

console.log("============================================================");
console.log("INSPECTION RESULT");
console.log("============================================================");
console.log(`PRIMARY_SELECTION_REQUIRED=${candidateIds.length === 1 ? "NO" : "YES"}`);
console.log("PRIMARY_SELECTED=NO");
console.log("GRAPH_CHANGED=NO");
console.log("TASKS_CREATED=NO");
console.log("PROVIDER_CALLS_EXECUTED=NO");
console.log("WALLET_CHANGED=NO");
