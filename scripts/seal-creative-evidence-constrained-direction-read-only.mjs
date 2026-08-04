#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv({ cwd: process.cwd() });

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return String(value ?? "").trim();
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stable(value[key])]),
  );
}

function sha256(value) {
  return crypto
    .createHash("sha256")
    .update(typeof value === "string" ? value : JSON.stringify(stable(value)))
    .digest("hex");
}

function assetId(value) {
  if (typeof value === "string" || typeof value === "number") {
    return text(value);
  }
  return text(
    value?.asset_id ||
      value?.assetId ||
      value?.creative_asset_id ||
      value?.creativeAssetId ||
      value?.id,
  );
}

function sourceIds(shots = []) {
  return [...new Set(
    list(shots)
      .flatMap((shot) => [
        shot.primary_source_asset_id,
        shot.primarySourceAssetId,
        shot.generation?.primary_source_asset_id,
        shot.generation?.primarySourceAssetId,
        shot.metadata?.primary_source_asset_id,
        shot.metadata?.primarySourceAssetId,
        ...list(shot.reference_asset_ids),
        ...list(shot.referenceAssetIds),
        ...list(shot.identity_requirements?.reference_asset_ids),
        ...list(shot.identity_requirements?.referenceAssetIds),
      ])
      .map(assetId)
      .filter(Boolean),
  )];
}

function shotDuration(shot = {}) {
  return finite(
    shot.duration_seconds ??
      shot.duration ??
      shot.timing?.duration_seconds ??
      shot.timing?.duration ??
      shot.timeline?.duration_seconds,
  );
}

const PROMPT_KEYS = new Set([
  "prompt",
  "prompts",
  "system_prompt",
  "user_prompt",
  "provider_prompt",
  "generation_prompt",
  "visual_prompt",
  "video_prompt",
  "negative_prompt",
]);

const INSTRUCTION_KEYS = new Set([
  "instruction",
  "instructions",
  "provider_instruction",
  "transport_instruction",
]);

function persistedGenerationFields(value, currentPath = "root", output = []) {
  if (value === null || value === undefined) return output;
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      persistedGenerationFields(item, `${currentPath}[${index}]`, output));
    return output;
  }
  if (typeof value !== "object") return output;

  for (const [key, child] of Object.entries(value)) {
    const normalized = key
      .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
      .replaceAll("-", "_")
      .toLowerCase();
    if (PROMPT_KEYS.has(normalized) || INSTRUCTION_KEYS.has(normalized)) {
      const rendered = text(child);
      if (rendered || Array.isArray(child) || (child && typeof child === "object")) {
        output.push({
          path: `${currentPath}.${key}`,
          key: normalized,
          category: PROMPT_KEYS.has(normalized) ? "PROMPT" : "INSTRUCTION",
        });
      }
    }
    persistedGenerationFields(child, `${currentPath}.${key}`, output);
  }
  return output;
}

async function exactState(supabaseAdmin, organizationId, projectId) {
  const [graphResult, taskResult, usageResult, walletResult] = await Promise.all([
    supabaseAdmin
      .from("creative_production_graphs")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("creative_project_id", projectId),
    supabaseAdmin
      .from("creative_production_tasks")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("creative_project_id", projectId),
    supabaseAdmin
      .from("platform_service_usage")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId),
    supabaseAdmin
      .from("organization_wallets")
      .select("available_balance,currency,updated_at")
      .eq("organization_id", organizationId)
      .single(),
  ]);

  for (const result of [graphResult, taskResult, usageResult, walletResult]) {
    if (result.error) throw result.error;
  }

  return {
    graph_count: Number(graphResult.count || 0),
    task_count: Number(taskResult.count || 0),
    usage_count: Number(usageResult.count || 0),
    wallet_balance: Number(walletResult.data?.available_balance || 0),
    wallet_currency: text(walletResult.data?.currency) || "THB",
    wallet_updated_at: walletResult.data?.updated_at || null,
  };
}

const inputPath = path.resolve(text(process.argv[2]));
if (!inputPath || !fs.existsSync(inputPath)) {
  throw new Error(`EVIDENCE_DIRECTION_FILE_NOT_FOUND:${inputPath || "MISSING"}`);
}

const organizationId = text(process.env.ORGANIZATION_ID);
const projectId = text(process.env.CREATIVE_PROJECT_ID || process.env.PROJECT_ID);
const missionId = text(process.env.CREATIVE_MISSION_ID);
if (!organizationId) throw new Error("ORGANIZATION_ID_REQUIRED");
if (!projectId) throw new Error("CREATIVE_PROJECT_ID_REQUIRED");

const raw = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const plan = object(raw.plan || raw.direction?.plan || raw.output?.plan || raw);
const scenes = list(plan.scenes);
const shots = scenes.flatMap((scene, sceneIndex) =>
  list(scene.shots).map((shot, shotIndex) => ({
    ...shot,
    scene_number: shot.scene_number ?? scene.scene_number ?? sceneIndex + 1,
    shot_number: shot.shot_number ?? shotIndex + 1,
  })),
);
const requiredSourceIds = sourceIds(shots);
const durationSeconds = shots.reduce((sum, shot) => {
  const duration = shotDuration(shot);
  return sum + (duration === null ? 0 : duration);
}, 0);
const unresolvedDurationCount = shots.filter((shot) =>
  shotDuration(shot) === null || shotDuration(shot) <= 0).length;
const persistedFields = persistedGenerationFields(plan);
const promptFields = persistedFields.filter((row) => row.category === "PROMPT");
const instructionFields = persistedFields.filter((row) => row.category === "INSTRUCTION");

const [
  { supabaseAdmin },
  { assertCreativeSourceAssetsSemanticReady },
  { evaluateCreativeSourceShotEvidence },
] = await Promise.all([
  import("@/lib/shared/supabase/admin"),
  import("@/lib/creative/assets/intelligence/CreativeAssetSemanticEvidenceRuntime"),
  import("@/lib/creative/assets/intelligence/runtime/CreativeSourceShotEvidenceRuntime"),
]);

const before = await exactState(supabaseAdmin, organizationId, projectId);

const { data: assets, error: assetError } = await supabaseAdmin
  .from("creative_assets")
  .select("*")
  .eq("organization_id", organizationId)
  .in("id", requiredSourceIds);
if (assetError) throw assetError;

const semanticGate = assertCreativeSourceAssetsSemanticReady({
  assets: assets || [],
  required_asset_ids: requiredSourceIds,
});
const shotGate = evaluateCreativeSourceShotEvidence({
  shots,
  assets: assets || [],
  minimum_confidence: 60,
});

const after = await exactState(supabaseAdmin, organizationId, projectId);
const blockers = [];

if (raw.contract !== "ISOLATED_FRESH_CREATIVE_DIRECTION_V1") {
  blockers.push(`DIRECTION_ENVELOPE_CONTRACT_INVALID:${text(raw.contract) || "MISSING"}`);
}
if (text(raw.organization_id) !== organizationId) {
  blockers.push("DIRECTION_ORGANIZATION_MISMATCH");
}
if (text(raw.creative_project_id) !== projectId) {
  blockers.push("DIRECTION_PROJECT_MISMATCH");
}
if (missionId && text(raw.creative_mission_id) !== missionId) {
  blockers.push("DIRECTION_MISSION_MISMATCH");
}
if (plan.validation?.passed !== true) {
  blockers.push("DIRECTION_PLAN_VALIDATION_NOT_PASSED");
}
if (text(plan.metadata?.evidence_constrained_direction?.contract) !==
  "CREATIVE_EVIDENCE_CONSTRAINED_DIRECTION_V1") {
  blockers.push("EVIDENCE_CONSTRAINED_DIRECTION_CONTRACT_MISSING");
}
if (scenes.length !== 7) blockers.push(`SCENE_COUNT_INVALID:${scenes.length}:7`);
if (shots.length !== 13) blockers.push(`SHOT_COUNT_INVALID:${shots.length}:13`);
if (unresolvedDurationCount) {
  blockers.push(`SHOT_DURATION_UNRESOLVED:${unresolvedDurationCount}`);
}
if (Math.abs(durationSeconds - 60) > 0.000001) {
  blockers.push(`DIRECTION_DURATION_INVALID:${durationSeconds}:60`);
}
if (requiredSourceIds.length !== 9) {
  blockers.push(`SOURCE_ASSET_COUNT_INVALID:${requiredSourceIds.length}:9`);
}
if (semanticGate.passed !== true) blockers.push("SOURCE_SEMANTIC_GATE_NOT_PASSED");
if (shotGate.readiness !== "PASS") {
  blockers.push(...shotGate.blockers.map((item) => `SOURCE_SHOT:${item}`));
}
if (shotGate.passed_shot_count !== shots.length) {
  blockers.push(
    `SOURCE_SHOT_PASS_COUNT_INVALID:${shotGate.passed_shot_count}:${shots.length}`,
  );
}
if (promptFields.length) blockers.push(`PERSISTED_PROMPT_FIELDS:${promptFields.length}`);
if (instructionFields.length) {
  blockers.push(`PERSISTED_INSTRUCTION_FIELDS:${instructionFields.length}`);
}
if (JSON.stringify(before) !== JSON.stringify(after)) {
  blockers.push("READ_ONLY_STATE_CHANGED");
}

const sealCore = {
  contract: "CREATIVE_EVIDENCE_CONSTRAINED_DIRECTION_SEAL_V1",
  sealed_at: new Date().toISOString(),
  input_path: inputPath,
  organization_id: organizationId,
  creative_project_id: projectId,
  creative_mission_id: text(raw.creative_mission_id) || null,
  direction_sha256: sha256(plan),
  direction_envelope_sha256: sha256(raw),
  counts: {
    scene_count: scenes.length,
    shot_count: shots.length,
    duration_seconds: durationSeconds,
    source_asset_count: requiredSourceIds.length,
    semantic_verified_asset_count: Number(semanticGate.asset_count || requiredSourceIds.length),
    source_evidenced_shot_count: shotGate.passed_shot_count,
    persisted_prompt_field_count: promptFields.length,
    persisted_instruction_field_count: instructionFields.length,
  },
  source_asset_ids: requiredSourceIds,
  semantic_gate: semanticGate,
  source_shot_gate: shotGate,
  exact_state_before: before,
  exact_state_after: after,
  persisted_generation_fields: persistedFields,
  database_writes_executed: false,
  provider_calls_executed: false,
  wallet_changed: before.wallet_balance !== after.wallet_balance,
  graph_materialization_authorized: false,
  task_materialization_authorized: false,
  production_authorized: false,
  publication_authorized: false,
  blockers,
  readiness: blockers.length ? "FAIL" : "PASS",
};
const seal = {
  ...sealCore,
  seal_sha256: sha256(sealCore),
};

const outputPath = path.resolve(
  text(process.env.EVIDENCE_DIRECTION_SEAL_OUTPUT) ||
    "/tmp/churchill-evidence-constrained-direction-seal.json",
);
fs.writeFileSync(outputPath, `${JSON.stringify(seal, null, 2)}\n`, "utf8");

console.log("============================================================");
console.log("READ-ONLY EVIDENCE-CONSTRAINED DIRECTION SEAL");
console.log("============================================================");
console.log(`OUTPUT=${outputPath}`);
console.log(`DIRECTION_SHA256=${seal.direction_sha256}`);
console.log(`DIRECTION_ENVELOPE_SHA256=${seal.direction_envelope_sha256}`);
console.log(`SEAL_SHA256=${seal.seal_sha256}`);
console.log(`SCENE_COUNT=${seal.counts.scene_count}`);
console.log(`SHOT_COUNT=${seal.counts.shot_count}`);
console.log(`DURATION_SECONDS=${seal.counts.duration_seconds}`);
console.log(`SOURCE_ASSET_COUNT=${seal.counts.source_asset_count}`);
console.log(`SEMANTIC_VERIFIED_ASSET_COUNT=${seal.counts.semantic_verified_asset_count}`);
console.log(`SOURCE_EVIDENCED_SHOT_COUNT=${seal.counts.source_evidenced_shot_count}`);
console.log(`PERSISTED_PROMPT_FIELD_COUNT=${seal.counts.persisted_prompt_field_count}`);
console.log(`PERSISTED_INSTRUCTION_FIELD_COUNT=${seal.counts.persisted_instruction_field_count}`);
console.log(`EXACT_GRAPH_COUNT_BEFORE=${before.graph_count}`);
console.log(`EXACT_GRAPH_COUNT_AFTER=${after.graph_count}`);
console.log(`EXACT_TASK_COUNT_BEFORE=${before.task_count}`);
console.log(`EXACT_TASK_COUNT_AFTER=${after.task_count}`);
console.log(`EXACT_USAGE_COUNT_BEFORE=${before.usage_count}`);
console.log(`EXACT_USAGE_COUNT_AFTER=${after.usage_count}`);
console.log(`WALLET_BALANCE_BEFORE=${before.wallet_balance}`);
console.log(`WALLET_BALANCE_AFTER=${after.wallet_balance}`);
console.log(`EVIDENCE_DIRECTION_SEAL_READINESS=${seal.readiness}`);
console.log(`EVIDENCE_DIRECTION_SEAL_BLOCKER_COUNT=${blockers.length}`);
console.log(`EVIDENCE_DIRECTION_SEAL_BLOCKERS=${JSON.stringify(blockers)}`);
console.log("DATABASE_WRITES_EXECUTED=NO");
console.log("PROVIDER_CALLS_EXECUTED=NO");
console.log("WALLET_CHANGED=NO");
console.log("PRODUCTION_AUTHORIZED=NO");
console.log("PUBLICATION_AUTHORIZED=NO");
console.log("TERMINAL_REMAINS_OPEN=YES");

if (blockers.length) process.exitCode = 2;
