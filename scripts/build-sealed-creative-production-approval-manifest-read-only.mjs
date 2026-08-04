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

function readJson(filePath, label) {
  const absolute = path.resolve(text(filePath));
  if (!absolute || !fs.existsSync(absolute)) {
    throw new Error(`${label}_FILE_NOT_FOUND:${absolute || "MISSING"}`);
  }
  const raw = fs.readFileSync(absolute, "utf8");
  return {
    absolute,
    raw,
    file_sha256: sha256(raw),
    value: JSON.parse(raw),
  };
}

function coreWithout(value, key) {
  const output = { ...object(value) };
  delete output[key];
  return output;
}

function musicReadinessSummary(value = {}) {
  const blockers = list(value.blockers).map(text).filter(Boolean);
  const registryProviders = list(value.registry_providers);
  const executableProviders = list(value.resolver?.providers)
    .filter((row) => row.active !== false && row.runtime_available !== false);
  const executablePricing = list(value.resolver?.pricing)
    .filter((row) => row.active !== false);
  const databasePricing = list(value.database?.pricing_rows)
    .filter((row) => row.active !== false);
  const organizationServices = list(value.database?.organization_service_rows)
    .filter((row) => row.enabled !== false);
  const explicitReady = value.ready === true;
  const passed = Boolean(
    explicitReady &&
    blockers.length === 0 &&
    registryProviders.length > 0 &&
    executableProviders.length > 0 &&
    (executablePricing.length > 0 || databasePricing.length > 0) &&
    organizationServices.length > 0
  );

  return {
    passed,
    explicit_ready: explicitReady,
    blockers,
    registry_provider_count: registryProviders.length,
    executable_provider_count: executableProviders.length,
    executable_pricing_count: executablePricing.length,
    active_database_pricing_count: databasePricing.length,
    enabled_organization_service_count: organizationServices.length,
    selected_provider: text(
      executablePricing[0]?.provider ||
      databasePricing[0]?.provider ||
      executableProviders[0]?.id,
    ) || null,
    selected_model: text(
      executablePricing[0]?.model ||
      databasePricing[0]?.model,
    ) || null,
  };
}

async function exactState(supabaseAdmin, organizationId, projectId) {
  const [graphs, tasks, usage, wallet] = await Promise.all([
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

  for (const result of [graphs, tasks, usage, wallet]) {
    if (result.error) throw result.error;
  }

  return {
    graph_count: Number(graphs.count || 0),
    task_count: Number(tasks.count || 0),
    usage_count: Number(usage.count || 0),
    wallet_balance: Number(wallet.data?.available_balance || 0),
    wallet_currency: text(wallet.data?.currency) || "THB",
    wallet_updated_at: wallet.data?.updated_at || null,
  };
}

function addMismatch(blockers, condition, code) {
  if (!condition) blockers.push(code);
}

const direction = readJson(process.argv[2], "DIRECTION");
const seal = readJson(process.argv[3], "DIRECTION_SEAL");
const quality = readJson(process.argv[4], "DIRECTION_QUALITY_AUDIT");
const cost = readJson(process.argv[5], "SEALED_COST_ESTIMATE");
const music = readJson(process.argv[6], "MUSIC_READINESS");

const organizationId = text(process.env.ORGANIZATION_ID);
const projectId = text(process.env.CREATIVE_PROJECT_ID || process.env.PROJECT_ID);
const missionId = text(process.env.CREATIVE_MISSION_ID);
const commandIdentity = text(process.env.COMMAND_IDENTITY);
if (!organizationId) throw new Error("ORGANIZATION_ID_REQUIRED");
if (!projectId) throw new Error("CREATIVE_PROJECT_ID_REQUIRED");
if (!missionId) throw new Error("CREATIVE_MISSION_ID_REQUIRED");
if (!commandIdentity) throw new Error("COMMAND_IDENTITY_REQUIRED");

const directionEnvelope = object(direction.value);
const plan = object(
  directionEnvelope.plan ||
  directionEnvelope.direction?.plan ||
  directionEnvelope.output?.plan ||
  directionEnvelope,
);
const sealValue = object(seal.value);
const qualityValue = object(quality.value);
const costValue = object(cost.value);
const estimate = object(costValue.estimate);
const estimateCounts = object(estimate.counts);
const estimateScenarios = object(estimate.scenarios);
const estimateWallet = object(estimate.wallet);
const qualitySummary = object(qualityValue.summary);
const musicSummary = musicReadinessSummary(music.value);

const directionSha = sha256(plan);
const directionEnvelopeSha = sha256(directionEnvelope);
const sealSha = sha256(coreWithout(sealValue, "seal_sha256"));
const qualitySha = sha256(coreWithout(qualityValue, "audit_sha256"));
const costSha = sha256(
  coreWithout(costValue, "sealed_cost_estimate_sha256"),
);

const blockers = [];

addMismatch(blockers,
  directionEnvelope.contract === "ISOLATED_FRESH_CREATIVE_DIRECTION_V1",
  "DIRECTION_ENVELOPE_CONTRACT_INVALID");
addMismatch(blockers,
  text(directionEnvelope.organization_id) === organizationId,
  "DIRECTION_ORGANIZATION_MISMATCH");
addMismatch(blockers,
  text(directionEnvelope.creative_project_id) === projectId,
  "DIRECTION_PROJECT_MISMATCH");
addMismatch(blockers,
  text(directionEnvelope.creative_mission_id) === missionId,
  "DIRECTION_MISSION_MISMATCH");
addMismatch(blockers,
  plan.validation?.passed === true,
  "DIRECTION_VALIDATION_NOT_PASSED");

addMismatch(blockers,
  sealValue.contract === "CREATIVE_EVIDENCE_CONSTRAINED_DIRECTION_SEAL_V1",
  "DIRECTION_SEAL_CONTRACT_INVALID");
addMismatch(blockers,
  sealValue.readiness === "PASS" && list(sealValue.blockers).length === 0,
  "DIRECTION_SEAL_NOT_READY");
addMismatch(blockers,
  directionSha === text(sealValue.direction_sha256),
  "DIRECTION_SHA_MISMATCH");
addMismatch(blockers,
  directionEnvelopeSha === text(sealValue.direction_envelope_sha256),
  "DIRECTION_ENVELOPE_SHA_MISMATCH");
addMismatch(blockers,
  sealSha === text(sealValue.seal_sha256),
  "DIRECTION_SEAL_SHA_MISMATCH");
addMismatch(blockers,
  Number(sealValue.counts?.scene_count) === 7,
  "SEALED_SCENE_COUNT_INVALID");
addMismatch(blockers,
  Number(sealValue.counts?.shot_count) === 13,
  "SEALED_SHOT_COUNT_INVALID");
addMismatch(blockers,
  Math.abs(Number(sealValue.counts?.duration_seconds) - 60) <= 0.000001,
  "SEALED_DURATION_INVALID");
addMismatch(blockers,
  Number(sealValue.counts?.source_asset_count) === 9,
  "SEALED_SOURCE_ASSET_COUNT_INVALID");
addMismatch(blockers,
  Number(sealValue.counts?.semantic_verified_asset_count) === 9,
  "SEALED_SEMANTIC_VERIFIED_ASSET_COUNT_INVALID");
addMismatch(blockers,
  Number(sealValue.counts?.source_evidenced_shot_count) === 13,
  "SEALED_SOURCE_EVIDENCED_SHOT_COUNT_INVALID");
addMismatch(blockers,
  Number(sealValue.counts?.persisted_prompt_field_count) === 0 &&
    Number(sealValue.counts?.persisted_instruction_field_count) === 0,
  "SEALED_DIRECTION_NOT_PROMPTLESS");

addMismatch(blockers,
  qualityValue.contract === "CREATIVE_SEALED_EVIDENCE_DIRECTION_QUALITY_AUDIT_V1",
  "QUALITY_AUDIT_CONTRACT_INVALID");
addMismatch(blockers,
  qualitySha === text(qualityValue.audit_sha256),
  "QUALITY_AUDIT_SHA_MISMATCH");
addMismatch(blockers,
  text(qualityValue.direction_sha256) === directionSha,
  "QUALITY_DIRECTION_SHA_MISMATCH");
addMismatch(blockers,
  text(qualityValue.direction_seal_sha256) === sealSha,
  "QUALITY_SEAL_SHA_MISMATCH");
addMismatch(blockers,
  qualitySummary.technical_readiness === "PASS",
  "QUALITY_TECHNICAL_READINESS_NOT_PASSED");
addMismatch(blockers,
  qualitySummary.creative_readiness === "PASS",
  "QUALITY_CREATIVE_READINESS_NOT_PASSED");
addMismatch(blockers,
  qualitySummary.world_class_readiness === "PASS",
  "QUALITY_WORLD_CLASS_READINESS_NOT_PASSED");
addMismatch(blockers,
  Number(qualitySummary.total_score) >= 85,
  "QUALITY_TOTAL_SCORE_TOO_LOW");
addMismatch(blockers,
  Number(qualitySummary.persisted_provider_prompt_count) === 0,
  "QUALITY_PROMPTLIKE_FIELDS_PRESENT");
addMismatch(blockers,
  list(qualityValue.technical_issues).length === 0 &&
    list(qualityValue.creative_issues).length === 0,
  "QUALITY_AUDIT_HAS_ISSUES");

addMismatch(blockers,
  costValue.contract === "CREATIVE_SEALED_PRODUCTION_COST_ESTIMATE_V1",
  "SEALED_COST_CONTRACT_INVALID");
addMismatch(blockers,
  costSha === text(costValue.sealed_cost_estimate_sha256),
  "SEALED_COST_SHA_MISMATCH");
addMismatch(blockers,
  costValue.readiness === "PASS" && list(costValue.blockers).length === 0,
  "SEALED_COST_NOT_READY");
addMismatch(blockers,
  text(costValue.direction_sha256) === directionSha,
  "COST_DIRECTION_SHA_MISMATCH");
addMismatch(blockers,
  text(costValue.direction_envelope_sha256) === directionEnvelopeSha,
  "COST_DIRECTION_ENVELOPE_SHA_MISMATCH");
addMismatch(blockers,
  text(costValue.direction_seal_sha256) === sealSha,
  "COST_DIRECTION_SEAL_SHA_MISMATCH");
addMismatch(blockers,
  estimate.contract === "CREATIVE_PRODUCTION_COST_ESTIMATE_V1",
  "INNER_COST_ESTIMATE_CONTRACT_INVALID");
addMismatch(blockers,
  list(estimate.blockers).length === 0,
  "INNER_COST_ESTIMATE_HAS_BLOCKERS");
addMismatch(blockers,
  Number(estimateCounts.scene_count) === 7 &&
    Number(estimateCounts.shot_count) === 13,
  "COST_DIRECTION_COUNTS_INVALID");
addMismatch(blockers,
  Number(estimateCounts.production_work_item_count) === 27,
  "PRODUCTION_WORK_ITEM_COUNT_INVALID");
addMismatch(blockers,
  Number(estimateCounts.shot_generation_count) === 13,
  "SHOT_GENERATION_COUNT_INVALID");
addMismatch(blockers,
  Number(estimateCounts.perceptual_review_count) === 13,
  "PERCEPTUAL_REVIEW_COUNT_INVALID");
addMismatch(blockers,
  Number(estimateCounts.soundtrack_generation_count) === 1,
  "SOUNDTRACK_GENERATION_COUNT_INVALID");
addMismatch(blockers,
  Number(estimateCounts.identity_keyframe_count) === 0,
  "IDENTITY_KEYFRAME_COUNT_MUST_BE_ZERO");
addMismatch(blockers,
  Number(estimateCounts.lip_sync_count) === 0,
  "LIP_SYNC_COUNT_MUST_BE_ZERO");
addMismatch(blockers,
  estimate.promptless_direction_verified === true,
  "COST_PROMPTLESS_DIRECTION_NOT_VERIFIED");

const selectedBaseline = finite(estimateScenarios.selected_baseline);
const repairReserve = finite(estimateScenarios.one_shot_repair_reserve);
const approvalCeiling = finite(
  estimateScenarios.recommended_approval_ceiling,
);
const estimatedWalletBalance = finite(estimateWallet.available_balance);

addMismatch(blockers,
  selectedBaseline !== null && selectedBaseline > 0,
  "SELECTED_BASELINE_INVALID");
addMismatch(blockers,
  repairReserve !== null && repairReserve > 0,
  "REPAIR_RESERVE_INVALID");
addMismatch(blockers,
  approvalCeiling !== null &&
    selectedBaseline !== null &&
    approvalCeiling >= selectedBaseline + repairReserve - 0.000001,
  "APPROVAL_CEILING_INVALID");

addMismatch(blockers, musicSummary.passed, "MUSIC_PROVIDER_NOT_READY");
addMismatch(blockers,
  text(music.value.organization_id) === organizationId,
  "MUSIC_READINESS_ORGANIZATION_MISMATCH");
addMismatch(blockers,
  text(music.value.capability) === "ai.music.generate",
  "MUSIC_READINESS_CAPABILITY_INVALID");
addMismatch(blockers,
  music.value.provider_calls_executed === false &&
    music.value.database_writes_executed === false &&
    music.value.wallet_changed === false,
  "MUSIC_READINESS_NOT_READ_ONLY");

for (const [label, artifact] of [
  ["SEAL", sealValue],
  ["QUALITY", qualityValue],
  ["COST", costValue],
]) {
  addMismatch(blockers,
    artifact.provider_calls_executed === false,
    `${label}_PROVIDER_CALL_STATE_INVALID`);
  addMismatch(blockers,
    artifact.production_authorized === false,
    `${label}_PRODUCTION_AUTHORIZATION_INVALID`);
  addMismatch(blockers,
    artifact.publication_authorized === false,
    `${label}_PUBLICATION_AUTHORIZATION_INVALID`);
}

const { supabaseAdmin } = await import("@/lib/shared/supabase/admin");
const before = await exactState(supabaseAdmin, organizationId, projectId);
const after = await exactState(supabaseAdmin, organizationId, projectId);

addMismatch(blockers,
  JSON.stringify(stable(before)) === JSON.stringify(stable(after)),
  "READ_ONLY_STATE_CHANGED");
addMismatch(blockers,
  approvalCeiling !== null && before.wallet_balance >= approvalCeiling,
  "CURRENT_WALLET_INSUFFICIENT_FOR_APPROVAL_CEILING");
addMismatch(blockers,
  estimatedWalletBalance !== null &&
    Math.abs(estimatedWalletBalance - before.wallet_balance) <= 0.000001,
  "COST_WALLET_BALANCE_STALE");
addMismatch(blockers,
  before.wallet_currency.toUpperCase() ===
    text(estimate.currency || costValue.currency || "THB").toUpperCase(),
  "CURRENCY_MISMATCH");

const manifestCore = {
  contract: "CREATIVE_SEALED_PRODUCTION_APPROVAL_MANIFEST_V2",
  generated_at: new Date().toISOString(),
  organization_id: organizationId,
  creative_project_id: projectId,
  creative_mission_id: missionId,
  command_identity: commandIdentity,
  currency: before.wallet_currency.toUpperCase(),
  direction: {
    file: direction.absolute,
    file_sha256: direction.file_sha256,
    plan_sha256: directionSha,
    envelope_sha256: directionEnvelopeSha,
    scene_count: Number(sealValue.counts?.scene_count),
    shot_count: Number(sealValue.counts?.shot_count),
    duration_seconds: Number(sealValue.counts?.duration_seconds),
    source_asset_count: Number(sealValue.counts?.source_asset_count),
    semantic_verified_asset_count:
      Number(sealValue.counts?.semantic_verified_asset_count),
    source_evidenced_shot_count:
      Number(sealValue.counts?.source_evidenced_shot_count),
    promptless: true,
  },
  direction_seal: {
    file: seal.absolute,
    file_sha256: seal.file_sha256,
    internal_sha256: sealSha,
    readiness: sealValue.readiness,
  },
  quality_audit: {
    file: quality.absolute,
    file_sha256: quality.file_sha256,
    internal_sha256: qualitySha,
    technical_readiness: qualitySummary.technical_readiness,
    creative_readiness: qualitySummary.creative_readiness,
    world_class_readiness: qualitySummary.world_class_readiness,
    technical_score: Number(qualitySummary.technical_score),
    creative_score: Number(qualitySummary.creative_score),
    total_score: Number(qualitySummary.total_score),
    issue_count:
      list(qualityValue.technical_issues).length +
      list(qualityValue.creative_issues).length,
  },
  cost_estimate: {
    file: cost.absolute,
    file_sha256: cost.file_sha256,
    internal_sha256: costSha,
    selected_baseline: selectedBaseline,
    one_shot_repair_reserve: repairReserve,
    approval_ceiling: approvalCeiling,
    production_work_item_count:
      Number(estimateCounts.production_work_item_count),
    shot_generation_count: Number(estimateCounts.shot_generation_count),
    perceptual_review_count: Number(estimateCounts.perceptual_review_count),
    soundtrack_generation_count:
      Number(estimateCounts.soundtrack_generation_count),
    identity_keyframe_count: Number(estimateCounts.identity_keyframe_count),
    lip_sync_count: Number(estimateCounts.lip_sync_count),
    wallet_balance: before.wallet_balance,
    wallet_sufficient: before.wallet_balance >= approvalCeiling,
  },
  music_readiness: {
    file: music.absolute,
    file_sha256: music.file_sha256,
    readiness: musicSummary.passed ? "PASS" : "FAIL",
    provider: musicSummary.selected_provider,
    model: musicSummary.selected_model,
    registry_provider_count: musicSummary.registry_provider_count,
    executable_provider_count: musicSummary.executable_provider_count,
    executable_pricing_count: musicSummary.executable_pricing_count,
    active_database_pricing_count:
      musicSummary.active_database_pricing_count,
    enabled_organization_service_count:
      musicSummary.enabled_organization_service_count,
  },
  exact_state_before: before,
  exact_state_after: after,
  authorization: {
    production_authorized: false,
    provider_calls_authorized: false,
    usage_creation_authorized: false,
    wallet_reservation_authorized: false,
    wallet_charge_authorized: false,
    graph_materialization_authorized: false,
    task_materialization_authorized: false,
    repair_execution_authorized: false,
    publication_authorized: false,
    maximum_customer_price: approvalCeiling,
  },
  blockers,
  readiness: blockers.length ? "FAIL" : "PASS",
};

const manifest = {
  ...manifestCore,
  manifest_sha256: sha256(manifestCore),
};

const outputPath = path.resolve(
  text(process.env.SEALED_APPROVAL_MANIFEST_OUTPUT) ||
    "/tmp/churchill-evidence-constrained-production-approval-manifest.json",
);
fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

console.log("============================================================");
console.log("READ-ONLY SEALED CREATIVE PRODUCTION APPROVAL MANIFEST");
console.log("============================================================");
console.log(`OUTPUT=${outputPath}`);
console.log(`MANIFEST_SHA256=${manifest.manifest_sha256}`);
console.log(`DIRECTION_SHA256=${directionSha}`);
console.log(`DIRECTION_SEAL_SHA256=${sealSha}`);
console.log(`QUALITY_AUDIT_SHA256=${qualitySha}`);
console.log(`SEALED_COST_ESTIMATE_SHA256=${costSha}`);
console.log(`QUALITY_TOTAL_SCORE=${qualitySummary.total_score}`);
console.log(`WORLD_CLASS_READINESS=${qualitySummary.world_class_readiness}`);
console.log(`PRODUCTION_WORK_ITEM_COUNT=${estimateCounts.production_work_item_count}`);
console.log(`SHOT_GENERATION_COUNT=${estimateCounts.shot_generation_count}`);
console.log(`PERCEPTUAL_REVIEW_COUNT=${estimateCounts.perceptual_review_count}`);
console.log(`SOUNDTRACK_GENERATION_COUNT=${estimateCounts.soundtrack_generation_count}`);
console.log(`IDENTITY_KEYFRAME_COUNT=${estimateCounts.identity_keyframe_count}`);
console.log(`LIP_SYNC_COUNT=${estimateCounts.lip_sync_count}`);
console.log(`SELECTED_BASELINE=${selectedBaseline}`);
console.log(`ONE_SHOT_REPAIR_RESERVE=${repairReserve}`);
console.log(`APPROVAL_CEILING=${approvalCeiling}`);
console.log(`CURRENT_WALLET_BALANCE=${before.wallet_balance}`);
console.log(`MUSIC_READINESS=${manifest.music_readiness.readiness}`);
console.log(`MUSIC_PROVIDER=${manifest.music_readiness.provider || "NONE"}`);
console.log(`MUSIC_MODEL=${manifest.music_readiness.model || "NONE"}`);
console.log(`EXACT_GRAPH_COUNT_BEFORE=${before.graph_count}`);
console.log(`EXACT_GRAPH_COUNT_AFTER=${after.graph_count}`);
console.log(`EXACT_TASK_COUNT_BEFORE=${before.task_count}`);
console.log(`EXACT_TASK_COUNT_AFTER=${after.task_count}`);
console.log(`EXACT_USAGE_COUNT_BEFORE=${before.usage_count}`);
console.log(`EXACT_USAGE_COUNT_AFTER=${after.usage_count}`);
console.log(`WALLET_BALANCE_BEFORE=${before.wallet_balance}`);
console.log(`WALLET_BALANCE_AFTER=${after.wallet_balance}`);
console.log(`APPROVAL_MANIFEST_READINESS=${manifest.readiness}`);
console.log(`APPROVAL_MANIFEST_BLOCKER_COUNT=${blockers.length}`);
console.log(`APPROVAL_MANIFEST_BLOCKERS=${JSON.stringify(blockers)}`);
console.log("DATABASE_WRITES_EXECUTED=NO");
console.log("PROVIDER_CALLS_EXECUTED=NO");
console.log("USAGE_CREATED=NO");
console.log("WALLET_RESERVED=NO");
console.log("WALLET_CHARGED=NO");
console.log("GRAPH_CREATED=NO");
console.log("TASKS_CREATED=NO");
console.log("PRODUCTION_AUTHORIZED=NO");
console.log("PUBLICATION_AUTHORIZED=NO");
console.log("TERMINAL_REMAINS_OPEN=YES");

if (blockers.length) process.exitCode = 2;
