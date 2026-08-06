#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

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

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, canonical(value[key])]),
  );
}

function digest(value) {
  return crypto
    .createHash("sha256")
    .update(typeof value === "string" ? value : JSON.stringify(canonical(value)))
    .digest("hex");
}

function readJson(filePath, label) {
  const absolute = path.resolve(filePath);
  if (!fs.existsSync(absolute)) throw new Error(`${label}_FILE_NOT_FOUND:${absolute}`);
  const raw = fs.readFileSync(absolute, "utf8");
  return { absolute, raw, value: JSON.parse(raw) };
}

function musicReadinessSummary(value = {}) {
  const auditBlockers = list(value.blockers).map(text).filter(Boolean);
  const registryProviders = list(value.registry_providers);
  const executableProviders = list(value.resolver?.providers);
  const executablePricing = list(value.resolver?.pricing)
    .filter((row) => row.active !== false);
  const databasePricing = list(value.database?.pricing_rows)
    .filter((row) => row.active !== false);
  const organizationServices = list(value.database?.organization_service_rows)
    .filter((row) => row.enabled !== false);
  const explicitReady = value.ready === true;
  const passed =
    explicitReady &&
    auditBlockers.length === 0 &&
    registryProviders.length > 0 &&
    executableProviders.length > 0 &&
    (executablePricing.length > 0 || databasePricing.length > 0) &&
    organizationServices.length > 0;

  return {
    passed,
    explicit_ready: explicitReady,
    audit_blockers: auditBlockers,
    registry_provider_count: registryProviders.length,
    executable_provider_count: executableProviders.length,
    executable_pricing_count: executablePricing.length,
    active_database_pricing_count: databasePricing.length,
    enabled_organization_service_count: organizationServices.length,
  };
}

const direction = readJson(process.argv[2], "DIRECTION");
const audit = readJson(process.argv[3], "DIRECTION_AUDIT");
const estimate = readJson(process.argv[4], "COST_ESTIMATE");
const readiness = readJson(process.argv[5], "MUSIC_READINESS");

const plan = object(
  direction.value.plan ||
  direction.value.direction?.plan ||
  direction.value.output?.plan ||
  direction.value,
);
const auditSummary = object(audit.value.summary);
const estimateScenarios = object(estimate.value.scenarios);
const estimateWallet = object(estimate.value.wallet);
const musicReadiness = musicReadinessSummary(readiness.value);
const blockers = [];

if (plan.validation?.passed !== true) blockers.push("DIRECTION_VALIDATION_NOT_PASSED");
if (auditSummary.technical_readiness !== "PASS") blockers.push("DIRECTION_TECHNICAL_READINESS_NOT_PASSED");
if (auditSummary.world_class_readiness !== "PASS") blockers.push("DIRECTION_WORLD_CLASS_READINESS_NOT_PASSED");
if (Number(auditSummary.persisted_provider_prompt_count || 0) !== 0) blockers.push("DIRECTION_NOT_PROMPTLESS");
if (Array.isArray(estimate.value.blockers) && estimate.value.blockers.length) blockers.push("COST_ESTIMATE_HAS_BLOCKERS");
if (!musicReadiness.passed) blockers.push("MUSIC_PROVIDER_NOT_READY");

const selectedBaseline = finite(estimateScenarios.selected_baseline);
const approvalCeiling = finite(estimateScenarios.recommended_approval_ceiling);
const walletBalance = finite(estimateWallet.available_balance);

if (selectedBaseline === null || selectedBaseline <= 0) blockers.push("SELECTED_BASELINE_INVALID");
if (approvalCeiling === null || approvalCeiling < selectedBaseline) blockers.push("APPROVAL_CEILING_INVALID");
if (walletBalance === null || walletBalance < approvalCeiling) blockers.push("WALLET_INSUFFICIENT_FOR_APPROVAL_CEILING");

const manifestCore = {
  contract: "CREATIVE_PRODUCTION_APPROVAL_MANIFEST_V1",
  organization_id: text(process.env.ORGANIZATION_ID),
  creative_project_id: text(process.env.CREATIVE_PROJECT_ID),
  creative_mission_id: text(process.env.CREATIVE_MISSION_ID),
  command_identity: text(process.env.COMMAND_IDENTITY),
  currency: text(estimate.value.currency || process.env.CURRENCY || "THB").toUpperCase(),
  direction: {
    file: direction.absolute,
    sha256: digest(direction.raw),
    scene_count: Array.isArray(plan.scenes) ? plan.scenes.length : 0,
    shot_count: Array.isArray(plan.scenes)
      ? plan.scenes.reduce((sum, scene) => sum + (Array.isArray(scene.shots) ? scene.shots.length : 0), 0)
      : 0,
    duration_seconds: auditSummary.calculated_duration_seconds ?? null,
    validation_passed: plan.validation?.passed === true,
    technical_readiness: auditSummary.technical_readiness || null,
    world_class_readiness: auditSummary.world_class_readiness || null,
    promptless: Number(auditSummary.persisted_provider_prompt_count || 0) === 0,
  },
  direction_audit: {
    file: audit.absolute,
    sha256: digest(audit.raw),
  },
  cost_estimate: {
    file: estimate.absolute,
    sha256: digest(estimate.raw),
    selected_baseline: selectedBaseline,
    one_shot_repair_reserve: finite(estimateScenarios.one_shot_repair_reserve),
    approval_ceiling: approvalCeiling,
    wallet_balance: walletBalance,
    wallet_sufficient: walletBalance !== null && approvalCeiling !== null && walletBalance >= approvalCeiling,
    work_item_count: estimate.value.counts?.production_work_item_count ?? null,
    shot_generation_count: estimate.value.counts?.shot_generation_count ?? null,
    perceptual_review_count: estimate.value.counts?.perceptual_review_count ?? null,
    soundtrack_generation_count: estimate.value.counts?.soundtrack_generation_count ?? null,
  },
  music_readiness: {
    file: readiness.absolute,
    sha256: digest(readiness.raw),
    readiness: musicReadiness.passed ? "PASS" : "FAIL",
    explicit_ready: musicReadiness.explicit_ready,
    blockers: musicReadiness.audit_blockers,
    registry_provider_count: musicReadiness.registry_provider_count,
    executable_provider_count: musicReadiness.executable_provider_count,
    executable_pricing_count: musicReadiness.executable_pricing_count,
    active_database_pricing_count: musicReadiness.active_database_pricing_count,
    enabled_organization_service_count:
      musicReadiness.enabled_organization_service_count,
  },
  authorization: {
    production_authorized: false,
    provider_calls_authorized: false,
    wallet_reservation_authorized: false,
    graph_materialization_authorized: false,
    task_materialization_authorized: false,
    publication_authorized: false,
    maximum_customer_price: approvalCeiling,
  },
  blockers,
};

const manifest = {
  ...manifestCore,
  manifest_hash: digest(manifestCore),
  generated_at: new Date().toISOString(),
};

const output = path.resolve(
  text(process.env.APPROVAL_MANIFEST_OUTPUT) ||
  "/tmp/churchill-production-approval-manifest.json",
);
fs.writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

console.log("============================================================");
console.log("CREATIVE PRODUCTION APPROVAL MANIFEST");
console.log("============================================================");
console.log(`OUTPUT=${output}`);
console.log(`MANIFEST_HASH=${manifest.manifest_hash}`);
console.log(`DIRECTION_SHA256=${manifest.direction.sha256}`);
console.log(`COST_ESTIMATE_SHA256=${manifest.cost_estimate.sha256}`);
console.log(`SELECTED_BASELINE=${selectedBaseline}`);
console.log(`APPROVAL_CEILING=${approvalCeiling}`);
console.log(`WALLET_BALANCE=${walletBalance}`);
console.log(`MUSIC_READINESS=${manifest.music_readiness.readiness}`);
console.log(`MUSIC_REGISTRY_PROVIDER_COUNT=${manifest.music_readiness.registry_provider_count}`);
console.log(`MUSIC_EXECUTABLE_PROVIDER_COUNT=${manifest.music_readiness.executable_provider_count}`);
console.log(`MUSIC_EXECUTABLE_PRICING_COUNT=${manifest.music_readiness.executable_pricing_count}`);
console.log(`MUSIC_ACTIVE_DATABASE_PRICING_COUNT=${manifest.music_readiness.active_database_pricing_count}`);
console.log(`MUSIC_ENABLED_ORGANIZATION_SERVICE_COUNT=${manifest.music_readiness.enabled_organization_service_count}`);
console.log(`APPROVAL_MANIFEST_READINESS=${blockers.length ? "FAIL" : "PASS"}`);
console.log(`APPROVAL_MANIFEST_BLOCKER_COUNT=${blockers.length}`);
console.log(`APPROVAL_MANIFEST_BLOCKERS=${JSON.stringify(blockers)}`);
console.log("PROVIDER_CALLS_EXECUTED=NO");
console.log("USAGE_CREATED=NO");
console.log("WALLET_CHANGED=NO");
console.log("GRAPH_CREATED=NO");
console.log("TASKS_CREATED=NO");
console.log("PRODUCTION_AUTHORIZED=NO");
console.log("PUBLICATION_AUTHORIZED=NO");
console.log("TERMINAL_REMAINS_OPEN=YES");

if (blockers.length) process.exitCode = 2;
