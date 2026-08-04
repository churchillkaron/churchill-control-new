#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const list = (value) => Array.isArray(value) ? value.filter(Boolean) : [];
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const text = (value) => String(value ?? "").trim();

function readJson(file, label) {
  const absolute = path.resolve(file);
  if (!fs.existsSync(absolute)) throw new Error(`${label}_FILE_NOT_FOUND:${absolute}`);
  return JSON.parse(fs.readFileSync(absolute, "utf8"));
}

function directionPlan(value = {}) {
  return object(value.plan || value.direction?.plan || value.output?.plan || value);
}

function normalize(plan = {}, projectId) {
  const storyboard = {
    id: `source-shot-gate-storyboard-${projectId}`,
    title: plan.concept?.title || "Source-shot gate audit",
  };
  const scenes = [];
  const shots = [];

  for (const [sceneIndex, sourceScene] of list(plan.scenes).entries()) {
    const sceneId = text(sourceScene.id) || `scene-${sceneIndex + 1}`;
    scenes.push({
      ...sourceScene,
      id: sceneId,
      storyboard_id: storyboard.id,
      scene_number: sourceScene.scene_number || sceneIndex + 1,
    });
    for (const [shotIndex, sourceShot] of list(sourceScene.shots).entries()) {
      shots.push({
        ...sourceShot,
        id: text(sourceShot.id) || `shot-${sceneIndex + 1}-${shotIndex + 1}`,
        scene_id: sceneId,
        storyboard_id: storyboard.id,
        scene_number: sourceScene.scene_number || sceneIndex + 1,
        shot_number: sourceShot.shot_number || shotIndex + 1,
      });
    }
  }
  return { storyboard, scenes, shots };
}

async function count(supabase, table, filters = {}) {
  let query = supabase.from(table).select("id", { count: "exact", head: true });
  for (const [column, value] of Object.entries(filters)) query = query.eq(column, value);
  const { count: result, error } = await query;
  if (error) throw error;
  return Number(result || 0);
}

const direction = readJson(process.argv[2], "DIRECTION");
const plan = directionPlan(direction);
const organizationId = text(process.env.ORGANIZATION_ID);
const projectId = text(process.env.CREATIVE_PROJECT_ID);
if (!organizationId) throw new Error("ORGANIZATION_ID_REQUIRED");
if (!projectId) throw new Error("CREATIVE_PROJECT_ID_REQUIRED");

await import("./creative-runtime-bootstrap.mjs");
const [{ supabaseAdmin }, { ProductionGraphRuntime }, { WalletRuntime }] = await Promise.all([
  import("@/lib/shared/supabase/admin"),
  import("@/lib/creative/production-graph/runtime/ProductionGraphRuntime"),
  import("@/lib/platform/service-runtime/wallet/runtime/WalletRuntime"),
]);

const filters = { organization_id: organizationId, creative_project_id: projectId };
const before = {
  graph_count: await count(supabaseAdmin, "creative_production_graphs", filters),
  task_count: await count(supabaseAdmin, "creative_production_tasks", filters),
  usage_count: await count(supabaseAdmin, "platform_service_usage", { organization_id: organizationId }),
  wallet_balance: await WalletRuntime.balance({ organization_id: organizationId, currency: "THB" }),
};

const documents = normalize(plan, projectId);
let blocked = false;
let errorMessage = null;
let blockers = [];
let results = [];
try {
  await ProductionGraphRuntime.preview({
    organization_id: organizationId,
    creative_project_id: projectId,
    storyboard: documents.storyboard,
    scenes: documents.scenes,
    shots: documents.shots,
    creative_plan: plan,
  });
} catch (error) {
  errorMessage = error?.message || String(error);
  blocked = errorMessage.includes("CREATIVE_SOURCE_SHOT_EVIDENCE_GATE_BLOCKED");
  blockers = list(error?.blockers);
  results = list(error?.results);
}

const after = {
  graph_count: await count(supabaseAdmin, "creative_production_graphs", filters),
  task_count: await count(supabaseAdmin, "creative_production_tasks", filters),
  usage_count: await count(supabaseAdmin, "platform_service_usage", { organization_id: organizationId }),
  wallet_balance: await WalletRuntime.balance({ organization_id: organizationId, currency: "THB" }),
};

const unchanged = before.graph_count === after.graph_count &&
  before.task_count === after.task_count &&
  before.usage_count === after.usage_count &&
  Number(before.wallet_balance) === Number(after.wallet_balance);
const doorBlocked = blockers.some((item) =>
  item.includes("SOURCE_DOES_NOT_EVIDENCE_REQUIRED_ANCHOR:scene-001-shot-001:DOOR_OR_THRESHOLD"));
const readiness = blocked && blockers.length > 0 && doorBlocked && unchanged ? "PASS" : "FAIL";

const report = {
  contract: "CREATIVE_SOURCE_SHOT_PRODUCTION_GATE_AUDIT_V1",
  generated_at: new Date().toISOString(),
  organization_id: organizationId,
  creative_project_id: projectId,
  blocked,
  door_blocked: doorBlocked,
  blocker_count: blockers.length,
  blockers,
  results,
  error: errorMessage,
  before,
  after,
  unchanged,
  readiness,
  database_writes_executed: false,
  provider_calls_executed: false,
  wallet_changed: false,
  production_authorized: false,
  publication_authorized: false,
};

const output = path.resolve(text(process.env.SOURCE_SHOT_PRODUCTION_GATE_AUDIT_OUTPUT) || "/tmp/churchill-source-shot-production-gate-audit.json");
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log("============================================================");
console.log("READ-ONLY STRUCTURED SOURCE-SHOT PRODUCTION GATE AUDIT");
console.log("============================================================");
console.log(`OUTPUT=${output}`);
console.log(`PRODUCTION_PREVIEW_BLOCKED=${blocked ? "YES" : "NO"}`);
console.log(`DOOR_REQUIREMENT_BLOCKED=${doorBlocked ? "YES" : "NO"}`);
console.log(`SOURCE_SHOT_BLOCKER_COUNT=${blockers.length}`);
console.log(`GRAPH_COUNT_BEFORE=${before.graph_count}`);
console.log(`GRAPH_COUNT_AFTER=${after.graph_count}`);
console.log(`TASK_COUNT_BEFORE=${before.task_count}`);
console.log(`TASK_COUNT_AFTER=${after.task_count}`);
console.log(`USAGE_COUNT_BEFORE=${before.usage_count}`);
console.log(`USAGE_COUNT_AFTER=${after.usage_count}`);
console.log(`WALLET_BALANCE_BEFORE=${before.wallet_balance}`);
console.log(`WALLET_BALANCE_AFTER=${after.wallet_balance}`);
console.log(`SOURCE_SHOT_PRODUCTION_GATE_READINESS=${readiness}`);
console.log(`SOURCE_SHOT_PRODUCTION_GATE_ERROR=${errorMessage || "NONE"}`);
console.log("DATABASE_WRITES_EXECUTED=NO");
console.log("PROVIDER_CALLS_EXECUTED=NO");
console.log("WALLET_CHANGED=NO");
console.log("PRODUCTION_AUTHORIZED=NO");
console.log("PUBLICATION_AUTHORIZED=NO");
console.log("TERMINAL_REMAINS_OPEN=YES");

for (const result of results) {
  console.log(`SOURCE_SHOT_GATE|${result.scene_number}.${result.shot_number}|${result.shot_id}|required=${result.required_anchors.map((item) => item.anchor).join(",") || "NONE"}|failed=${result.failed_anchors.join(",") || "NONE"}|result=${result.passed ? "PASS" : "FAIL"}`);
}

if (readiness !== "PASS") process.exitCode = 2;
