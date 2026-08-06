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

function generatedVideoShot(shot = {}) {
  const generation = object(shot.generation);
  const capability = text(
    generation.capability ||
    generation.service ||
    shot.capability ||
    shot.service_id,
  ).toLowerCase();
  return generation.required !== false && capability.includes("video");
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
  { bindCreativeAssetManifest },
] = await Promise.all([
  import("@/lib/creative/production-graph/runtime/ProductionGraphRuntime"),
  import("@/lib/creative/scenes/runtime/SceneRuntime"),
  import("@/lib/creative/shots/runtime/ShotRuntime"),
  import("@/lib/creative/production-graph/planner/bindCreativeAssetManifest"),
]);

const graph = await ProductionGraphRuntime.get(graphId);
if (!graph) throw new Error(`PRODUCTION_GRAPH_NOT_FOUND:${graphId}`);

const organizationId = text(graph.organization_id);
const creativeProjectId = text(graph.creative_project_id);
const creativePlan = object(graph.metadata?.approval_plan_snapshot);

if (!organizationId || !creativeProjectId) {
  throw new Error("PRODUCTION_GRAPH_SCOPE_INCOMPLETE");
}
if (!list(creativePlan.scenes).length) {
  throw new Error("PRODUCTION_GRAPH_APPROVAL_PLAN_SNAPSHOT_REQUIRED");
}

const [scenes, shots] = await Promise.all([
  SceneRuntime.list({
    organization_id: organizationId,
    creative_project_id: creativeProjectId,
  }),
  ShotRuntime.list({
    organization_id: organizationId,
    creative_project_id: creativeProjectId,
  }),
]);

console.log("============================================================");
console.log("ZERO-COST PRODUCTION GRAPH REPLAN READINESS AUDIT");
console.log("============================================================");
console.log(`SOURCE_GRAPH_ID=${graphId}`);
console.log(`ORGANIZATION_ID=${organizationId}`);
console.log(`CREATIVE_PROJECT_ID=${creativeProjectId}`);
console.log(`PERSISTED_SCENE_COUNT=${scenes.length}`);
console.log(`PERSISTED_SHOT_COUNT=${shots.length}`);
console.log(`PLAN_SCENE_COUNT=${list(creativePlan.scenes).length}`);
console.log(`PLAN_ASSET_MANIFEST_COUNT=${list(creativePlan.asset_manifest).length}`);
console.log(`EXPECTED_VIDEO_SHOT_COUNT=${expectedVideoCount}`);
console.log("READ_ONLY_AUDIT=YES");
console.log("GRAPH_CREATED=NO");
console.log("TASKS_CREATED=NO");
console.log("PROVIDER_CALLS_EXECUTED=NO");
console.log("WALLET_CHANGED=NO");
console.log("REPAIR_EXECUTION_AUTHORIZED=NO");
console.log("PUBLICATION_AUTHORIZED=NO");

let bound;
try {
  bound = bindCreativeAssetManifest({
    scenes,
    shots,
    creative_plan: creativePlan,
  });
} catch (error) {
  console.log("============================================================");
  console.log("REPLAN READINESS RESULT");
  console.log("============================================================");
  console.log("REPLAN_READY=NO");
  console.log(`REPLAN_BLOCKER=${text(error?.message || error)}`);
  console.log("GRAPH_CREATED=NO");
  console.log("TASKS_CREATED=NO");
  console.log("PROVIDER_CALLS_EXECUTED=NO");
  console.log("WALLET_CHANGED=NO");
  process.exitCode = 2;
}

if (bound) {
  const videoShots = list(bound.shots).filter(generatedVideoShot);
  const missingPrimary = videoShots.filter((shot) => !text(shot.primary_source_asset_id));
  const invalidContract = videoShots.filter((shot) =>
    text(shot.generation?.source_binding_contract) !==
      "EXPLICIT_SHOT_PRIMARY_SOURCE_V1",
  );
  const sourceCounts = new Map();

  for (const shot of videoShots) {
    const primary = text(shot.primary_source_asset_id);
    if (primary) sourceCounts.set(primary, (sourceCounts.get(primary) || 0) + 1);
    console.log("------------------------------------------------------------");
    console.log(`SHOT_ID=${shot.id}`);
    console.log(`SHOT_TITLE=${text(shot.title)}`);
    console.log(`PRIMARY_SOURCE_ASSET_ID=${primary || "NONE"}`);
    console.log(`SHOT_SOURCE_ASSET_IDS=${JSON.stringify(list(shot.assets))}`);
    console.log(`SOURCE_BINDING_CONTRACT=${text(shot.generation?.source_binding_contract) || "NONE"}`);
    console.log(`SHARED_ASSIGNMENTS_NOT_EXPOSED=${JSON.stringify(list(shot.metadata?.shared_asset_assignments_not_exposed))}`);
  }

  const duplicateSources = [...sourceCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([asset_id, count]) => ({ asset_id, count }));

  const ready =
    videoShots.length === expectedVideoCount &&
    missingPrimary.length === 0 &&
    invalidContract.length === 0;

  console.log("============================================================");
  console.log("REPLAN READINESS RESULT");
  console.log("============================================================");
  console.log(`VIDEO_SHOT_COUNT=${videoShots.length}`);
  console.log(`MISSING_PRIMARY_SOURCE_COUNT=${missingPrimary.length}`);
  console.log(`INVALID_SOURCE_CONTRACT_COUNT=${invalidContract.length}`);
  console.log(`UNIQUE_PRIMARY_SOURCE_COUNT=${sourceCounts.size}`);
  console.log(`DUPLICATE_PRIMARY_SOURCES=${JSON.stringify(duplicateSources)}`);
  console.log(`REPLAN_READY=${ready ? "YES" : "NO"}`);
  console.log("GRAPH_CREATED=NO");
  console.log("TASKS_CREATED=NO");
  console.log("PROVIDER_CALLS_EXECUTED=NO");
  console.log("WALLET_CHANGED=NO");
  console.log("REPAIR_EXECUTION_AUTHORIZED=NO");
  console.log("PUBLICATION_AUTHORIZED=NO");

  if (!ready) process.exitCode = 2;
}
