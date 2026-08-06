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
  return text(value?.asset_id || value?.assetId || value?.id);
}

function unique(values = []) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function generatedVideo(shot = {}, planShot = {}) {
  const generation = {
    ...object(shot.generation),
    ...object(planShot.generation),
  };
  const capability = text(
    generation.capability || generation.service || shot.capability || shot.service_id,
  ).toLowerCase();
  return generation.required !== false && capability.includes("video");
}

function planSceneFor(scene, planScenes) {
  const index = Number(scene.metadata?.master_plan_index);
  if (Number.isInteger(index) && planScenes[index]) return planScenes[index];
  return planScenes.find((candidate) => text(candidate.id) === text(scene.id)) || null;
}

function planShotFor(shot, planScene) {
  const index = Number(shot.metadata?.master_plan_shot_index);
  if (Number.isInteger(index) && list(planScene?.shots)[index]) return list(planScene.shots)[index];
  return list(planScene?.shots).find((candidate) => text(candidate.id) === text(shot.id)) || null;
}

function compactAsset(asset = {}) {
  return {
    id: asset.id,
    name: asset.name || asset.title || asset.file_name || null,
    type: asset.asset_type || asset.type || null,
    description: asset.description || asset.analysis?.description || null,
    tags: list(asset.tags || asset.analysis?.tags),
  };
}

const graphId = text(process.env.PRODUCTION_GRAPH_ID || process.argv[2]);
const expectedVideoCount = Number(process.env.EXPECTED_VIDEO_TASK_COUNT || 10);
if (!graphId) throw new Error("PRODUCTION_GRAPH_ID_REQUIRED");

process.env.CREATIVE_ALLOW_AUTOMATIC_REPAIR = "false";
process.env.CREATIVE_APPROVED_INCREMENTAL_REPAIR_BUDGET = "0";
process.env.REPAIR_EXECUTION_AUTHORIZED = "false";
process.env.PUBLICATION_AUTHORIZED = "false";

const [
  { ProductionGraphRuntime },
  { SceneRuntime },
  { ShotRuntime },
  { CreativeAssetsRuntime },
] = await Promise.all([
  import("@/lib/creative/production-graph/runtime/ProductionGraphRuntime"),
  import("@/lib/creative/scenes/runtime/SceneRuntime"),
  import("@/lib/creative/shots/runtime/ShotRuntime"),
  import("@/lib/creative/assets/runtime/CreativeAssetsRuntime"),
]);

const graph = await ProductionGraphRuntime.get(graphId);
if (!graph) throw new Error(`PRODUCTION_GRAPH_NOT_FOUND:${graphId}`);

const organizationId = text(graph.organization_id);
const projectId = text(graph.creative_project_id);
const plan = object(graph.metadata?.approval_plan_snapshot);
const planScenes = list(plan.scenes);
if (!planScenes.length) throw new Error("PRODUCTION_GRAPH_APPROVAL_PLAN_SNAPSHOT_REQUIRED");

const [scenes, shots, assets] = await Promise.all([
  SceneRuntime.list({ organization_id: organizationId, creative_project_id: projectId }),
  ShotRuntime.list({ organization_id: organizationId, creative_project_id: projectId }),
  CreativeAssetsRuntime.list({ organization_id: organizationId, creative_project_id: projectId, limit: 1000 }),
]);

const assetsById = new Map(assets.map((asset) => [text(asset.id), asset]));
const manifestById = new Map(
  list(plan.asset_manifest).map((entry) => [assetId(entry), entry]),
);

const rows = [];
for (const scene of scenes) {
  const planScene = planSceneFor(scene, planScenes);
  for (const shot of shots.filter((candidate) => text(candidate.scene_id) === text(scene.id))) {
    const planShot = planShotFor(shot, planScene);
    if (!planShot || !generatedVideo(shot, planShot)) continue;

    const references = unique([
      ...list(shot.reference_assets).map(assetId),
      ...list(shot.reference_asset_ids).map(assetId),
      ...list(planShot.reference_assets).map(assetId),
      ...list(planShot.reference_asset_ids).map(assetId),
    ]);

    const candidates = references.map((id) => ({
      asset: compactAsset(assetsById.get(id) || { id }),
      manifest: (() => {
        const entry = manifestById.get(id) || {};
        return {
          disposition: text(entry.disposition).toUpperCase() || null,
          reason: text(entry.reason) || null,
          confidence: entry.confidence ?? null,
          assignments: list(entry.assignments),
        };
      })(),
    }));

    rows.push({
      shot_id: shot.id,
      shot_title: text(shot.title),
      shot_purpose: text(shot.purpose),
      shot_action: text(shot.action),
      plan_scene_id: text(planScene?.id),
      plan_scene_title: text(planScene?.title),
      plan_shot_id: text(planShot.id),
      plan_shot_title: text(planShot.title),
      plan_shot_subject: text(planShot.subject),
      plan_shot_action: text(planShot.action),
      plan_shot_medium: text(planShot.medium),
      reference_count: references.length,
      reference_ids: references,
      candidates,
    });
  }
}

const missing = rows.filter((row) => row.reference_count === 0);
const ambiguous = rows.filter((row) => row.reference_count > 1);
const stale = rows.filter((row) => {
  const id = row.plan_shot_id.toLowerCase();
  const title = row.shot_title.toLowerCase();
  return (
    (id.includes("entrance") && !title.includes("entrance")) ||
    (id.includes("food") && !title.includes("food")) ||
    (id.includes("game") && !title.includes("game") && !title.includes("play")) ||
    (id.includes("music") && !title.includes("music") && !title.includes("performance"))
  );
});

console.log("============================================================");
console.log("PROJECT-WIDE SHOT REFERENCE MATRIX AUDIT");
console.log("============================================================");
console.log(`PRODUCTION_GRAPH_ID=${graphId}`);
console.log(`VIDEO_SHOT_COUNT=${rows.length}`);
console.log(`EXPECTED_VIDEO_SHOT_COUNT=${expectedVideoCount}`);
console.log(`MISSING_REFERENCE_SHOT_COUNT=${missing.length}`);
console.log(`AMBIGUOUS_REFERENCE_SHOT_COUNT=${ambiguous.length}`);
console.log(`STALE_PLAN_ID_SUSPECT_COUNT=${stale.length}`);
console.log("READ_ONLY_AUDIT=YES");
console.log("GRAPH_CHANGED=NO");
console.log("SHOTS_CHANGED=NO");
console.log("TASKS_CREATED=NO");
console.log("PROVIDER_CALLS_EXECUTED=NO");
console.log("WALLET_CHANGED=NO");
console.log("PUBLICATION_AUTHORIZED=NO");

rows.forEach((row, index) => {
  console.log("------------------------------------------------------------");
  console.log(`MATRIX_${index + 1}=${JSON.stringify(row)}`);
});

const clean =
  rows.length === expectedVideoCount &&
  missing.length === 0 &&
  ambiguous.length === 0 &&
  stale.length === 0;

console.log("============================================================");
console.log("MATRIX AUDIT RESULT");
console.log("============================================================");
console.log(`REFERENCE_MATRIX_CLEAN=${clean ? "YES" : "NO"}`);
console.log(`MISSING_REFERENCE_SHOT_IDS=${JSON.stringify(missing.map((row) => row.shot_id))}`);
console.log(`AMBIGUOUS_REFERENCE_SHOT_IDS=${JSON.stringify(ambiguous.map((row) => row.shot_id))}`);
console.log(`STALE_PLAN_ID_SHOT_IDS=${JSON.stringify(stale.map((row) => row.shot_id))}`);
console.log("GRAPH_CHANGED=NO");
console.log("TASKS_CREATED=NO");
console.log("PROVIDER_CALLS_EXECUTED=NO");
console.log("WALLET_CHANGED=NO");

if (!clean) process.exitCode = 2;
