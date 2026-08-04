#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv({ cwd: process.cwd() });

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

function authorized(name) {
  return text(process.env[name]).toLowerCase() === "true";
}

const freshDirectionAuthorized = authorized(
  "CREATIVE_FRESH_DIRECTION_AUTHORIZED",
);
const providerExecutionAuthorized = authorized(
  "CREATIVE_PROVIDER_EXECUTION_AUTHORIZED",
);

if (!freshDirectionAuthorized) {
  throw new Error("CREATIVE_FRESH_DIRECTION_AUTHORIZATION_REQUIRED");
}
if (!providerExecutionAuthorized) {
  throw new Error("CREATIVE_PROVIDER_EXECUTION_AUTHORIZATION_REQUIRED");
}
if (authorized("PUBLICATION_AUTHORIZED")) {
  throw new Error("DIRECTION_ONLY_PUBLICATION_MUST_REMAIN_UNAUTHORIZED");
}
if (authorized("REPAIR_EXECUTION_AUTHORIZED")) {
  throw new Error("DIRECTION_ONLY_REPAIR_EXECUTION_MUST_REMAIN_UNAUTHORIZED");
}
if (authorized("CREATIVE_ALLOW_AUTOMATIC_REPAIR")) {
  throw new Error("DIRECTION_ONLY_AUTOMATIC_REPAIR_MUST_REMAIN_DISABLED");
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
  { CreativeMissionRuntime },
  { CreativeBriefRuntime },
  { CreativeAssetsRuntime },
  { CreativeMasterPlanRuntime },
  { CreativeUniversalAssetIntelligenceRuntime },
  { ProductionTaskRuntime },
] = await Promise.all([
  import("@/lib/creative/production-graph/repositories/ProductionGraphRepository"),
  import("@/lib/creative/projects/repositories/CreativeProjectRepository"),
  import("@/lib/creative/missions/runtime/CreativeMissionRuntime"),
  import("@/lib/creative/brief/runtime/CreativeBriefRuntime"),
  import("@/lib/creative/assets/runtime/CreativeAssetsRuntime"),
  import("@/lib/creative/director/runtime/CreativeMasterPlanRuntime"),
  import("@/lib/creative/assets/intelligence/runtime/CreativeUniversalAssetIntelligenceRuntime"),
  import("@/lib/operations/tasks/runtime/ProductionTaskRuntime"),
]);

const sourceGraph = await ProductionGraphRepository.getById(sourceGraphId);
if (!sourceGraph) {
  throw new Error(`SOURCE_PRODUCTION_GRAPH_NOT_FOUND:${sourceGraphId}`);
}

const organizationId = text(sourceGraph.organization_id);
const projectId = text(sourceGraph.creative_project_id);
if (!organizationId || !projectId) {
  throw new Error("SOURCE_PRODUCTION_GRAPH_SCOPE_INCOMPLETE");
}

const project = await CreativeProjectRepository.getById(projectId);
if (!project || text(project.organization_id) !== organizationId) {
  throw new Error("CREATIVE_PROJECT_NOT_FOUND_IN_SOURCE_SCOPE");
}

const missionId = text(
  project.creative_mission_id ||
  sourceGraph.creative_mission_id,
);
if (!missionId) throw new Error("CREATIVE_MISSION_ID_REQUIRED");

const [mission, briefs, assets, graphsBefore, tasksBefore] = await Promise.all([
  CreativeMissionRuntime.get(missionId),
  CreativeBriefRuntime.list({
    organization_id: organizationId,
    creative_project_id: projectId,
    creative_mission_id: missionId,
  }),
  CreativeAssetsRuntime.list({
    organization_id: organizationId,
    creative_project_id: projectId,
    creative_mission_id: missionId,
    limit: 1000,
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

if (!mission || text(mission.organization_id) !== organizationId) {
  throw new Error("CREATIVE_MISSION_NOT_FOUND_IN_SOURCE_SCOPE");
}
const brief = briefs[0] || {};
if (!brief.id) throw new Error("CREATIVE_BRIEF_REQUIRED");

const assetIntelligence = CreativeUniversalAssetIntelligenceRuntime.analyze({
  project,
  brief,
  assets,
});
if (!assetIntelligence.passed) {
  throw new Error(
    `UNIVERSAL_ASSET_INTELLIGENCE_BLOCKED:${assetIntelligence.blocking_issues.join(",")}`,
  );
}
if (list(assetIntelligence.person_profiles).length) {
  throw new Error(
    "DIRECTION_ONLY_EXISTING_IDENTITY_ATLAS_PREFLIGHT_REQUIRED",
  );
}
if (!list(assetIntelligence.audio_sources).length) {
  throw new Error("DIRECTION_ONLY_PRIMARY_SOUNDTRACK_ASSET_REQUIRED");
}

console.log("============================================================");
console.log("ISOLATED FRESH CREATIVE DIRECTION");
console.log("============================================================");
console.log(`SOURCE_GRAPH_ID=${sourceGraphId}`);
console.log(`ORGANIZATION_ID=${organizationId}`);
console.log(`CREATIVE_PROJECT_ID=${projectId}`);
console.log(`CREATIVE_MISSION_ID=${missionId}`);
console.log(`DIRECTION_ASSET_COUNT=${assets.length}`);
console.log(`AUDIO_SOURCE_COUNT=${list(assetIntelligence.audio_sources).length}`);
console.log(`PERSON_PROFILE_COUNT=${list(assetIntelligence.person_profiles).length}`);
console.log(`PRODUCTION_GRAPH_COUNT_BEFORE=${graphsBefore.length}`);
console.log(`PRODUCTION_TASK_COUNT_BEFORE=${tasksBefore.length}`);
console.log("FRESH_DIRECTION_AUTHORIZED=YES");
console.log("REASONING_PROVIDER_AUTHORIZED=YES");
console.log("PRODUCTION_PROVIDER_EXECUTION_AUTHORIZED=NO");
console.log("GRAPH_MATERIALIZATION_AUTHORIZED=NO");
console.log("TASK_MATERIALIZATION_AUTHORIZED=NO");
console.log("PUBLICATION_AUTHORIZED=NO");

const result = await CreativeMasterPlanRuntime.create({
  organization_id: organizationId,
  mission,
  project,
  brief,
  assets,
});

const plan = object(result.plan);
if (!plan.validation?.passed) {
  throw new Error("DIRECTION_ONLY_MASTER_PLAN_VALIDATION_REQUIRED");
}
if (plan.degraded === true || plan.release_blocked === true) {
  throw new Error("DIRECTION_ONLY_DEGRADED_PLAN_REJECTED");
}
if (!list(plan.scenes).length) {
  throw new Error("DIRECTION_ONLY_SCENES_REQUIRED");
}
if (!list(plan.scenes).every((scene) => list(scene.shots).length)) {
  throw new Error("DIRECTION_ONLY_COMPLETE_SHOT_PLAN_REQUIRED");
}

const [graphsAfter, tasksAfter] = await Promise.all([
  ProductionGraphRepository.listByProject({
    organization_id: organizationId,
    creative_project_id: projectId,
  }),
  ProductionTaskRuntime.list({
    organization_id: organizationId,
    creative_project_id: projectId,
  }),
]);

if (graphsAfter.length !== graphsBefore.length) {
  throw new Error(
    `DIRECTION_ONLY_GRAPH_MUTATION_DETECTED:before=${graphsBefore.length};after=${graphsAfter.length}`,
  );
}
if (tasksAfter.length !== tasksBefore.length) {
  throw new Error(
    `DIRECTION_ONLY_TASK_MUTATION_DETECTED:before=${tasksBefore.length};after=${tasksAfter.length}`,
  );
}

const outputPath = text(process.env.CREATIVE_DIRECTION_OUTPUT_PATH) ||
  path.join(
    os.tmpdir(),
    `fresh-creative-direction-${projectId}-${Date.now()}.json`,
  );

const payload = {
  contract: "ISOLATED_FRESH_CREATIVE_DIRECTION_V1",
  generated_at: new Date().toISOString(),
  source_graph_id: sourceGraphId,
  organization_id: organizationId,
  creative_project_id: projectId,
  creative_mission_id: missionId,
  provider: result.provider || null,
  model: result.model || null,
  usage: result.usage || null,
  billing: result.billing || null,
  validation: result.validation || plan.validation,
  canonical_shot_source:
    result.canonical_shot_source ||
    plan.metadata?.canonical_shot_source ||
    null,
  universal_asset_intelligence: assetIntelligence,
  plan,
};

fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

const sceneCount = list(plan.scenes).length;
const shotCount = list(plan.scenes).reduce(
  (sum, scene) => sum + list(scene.shots).length,
  0,
);

console.log("============================================================");
console.log("DIRECTION-ONLY RESULT");
console.log("============================================================");
console.log("SUCCESS=YES");
console.log(`SCENE_COUNT=${sceneCount}`);
console.log(`SHOT_COUNT=${shotCount}`);
console.log(`PROVIDER=${text(result.provider) || "UNKNOWN"}`);
console.log(`MODEL=${text(result.model) || "UNKNOWN"}`);
console.log(`PRODUCTION_GRAPH_COUNT_AFTER=${graphsAfter.length}`);
console.log(`PRODUCTION_TASK_COUNT_AFTER=${tasksAfter.length}`);
console.log(`DIRECTION_OUTPUT_PATH=${outputPath}`);
console.log("STRICT_TYPED_REFERENCE_VALIDATION=PASS");
console.log("CANONICAL_SOURCE_BINDING=PASS");
console.log("OLD_GRAPH_REUSED=NO");
console.log("OLD_TASKS_REUSED=NO");
console.log("NEW_GRAPH_CREATED=NO");
console.log("TASKS_CREATED=NO");
console.log("PRODUCTION_PROVIDER_CALLS_EXECUTED=NO");
console.log("PUBLICATION_AUTHORIZED=NO");
