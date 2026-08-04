#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";

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

function exactNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function sameState(left, right) {
  return JSON.stringify(stable(left)) === JSON.stringify(stable(right));
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

function runChild(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env,
      stdio: ["inherit", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      const value = String(chunk);
      stdout += value;
      process.stdout.write(value);
    });
    child.stderr.on("data", (chunk) => {
      const value = String(chunk);
      stderr += value;
      process.stderr.write(value);
    });
    child.once("error", reject);
    child.once("close", (code, signal) => {
      resolve({
        code: Number.isInteger(code) ? code : 1,
        signal: signal || null,
        stdout,
        stderr,
      });
    });
  });
}

const directionPath = path.resolve(text(process.argv[2]));
const sealPath = path.resolve(text(process.argv[3]));
if (!directionPath || !fs.existsSync(directionPath)) {
  throw new Error(`SEALED_COST_DIRECTION_FILE_NOT_FOUND:${directionPath || "MISSING"}`);
}
if (!sealPath || !fs.existsSync(sealPath)) {
  throw new Error(`SEALED_COST_DIRECTION_SEAL_NOT_FOUND:${sealPath || "MISSING"}`);
}

const organizationId = text(process.env.ORGANIZATION_ID);
const projectId = text(process.env.CREATIVE_PROJECT_ID || process.env.PROJECT_ID);
if (!organizationId) throw new Error("ORGANIZATION_ID_REQUIRED");
if (!projectId) throw new Error("CREATIVE_PROJECT_ID_REQUIRED");

const directionEnvelope = JSON.parse(fs.readFileSync(directionPath, "utf8"));
const directionPlan = object(
  directionEnvelope.plan ||
  directionEnvelope.direction?.plan ||
  directionEnvelope.output?.plan ||
  directionEnvelope,
);
const seal = JSON.parse(fs.readFileSync(sealPath, "utf8"));
const sealCore = { ...seal };
delete sealCore.seal_sha256;

const directionSha = sha256(directionPlan);
const directionEnvelopeSha = sha256(directionEnvelope);
const sealSha = sha256(sealCore);
const blockers = [];

if (seal.contract !== "CREATIVE_EVIDENCE_CONSTRAINED_DIRECTION_SEAL_V1") {
  blockers.push(`DIRECTION_SEAL_CONTRACT_INVALID:${text(seal.contract) || "MISSING"}`);
}
if (seal.readiness !== "PASS" || list(seal.blockers).length) {
  blockers.push("DIRECTION_SEAL_NOT_READY");
}
if (text(seal.organization_id) !== organizationId) {
  blockers.push("DIRECTION_SEAL_ORGANIZATION_MISMATCH");
}
if (text(seal.creative_project_id) !== projectId) {
  blockers.push("DIRECTION_SEAL_PROJECT_MISMATCH");
}
if (directionSha !== text(seal.direction_sha256)) {
  blockers.push(`DIRECTION_SHA_MISMATCH:${directionSha}:${text(seal.direction_sha256)}`);
}
if (directionEnvelopeSha !== text(seal.direction_envelope_sha256)) {
  blockers.push(
    `DIRECTION_ENVELOPE_SHA_MISMATCH:${directionEnvelopeSha}:${text(seal.direction_envelope_sha256)}`,
  );
}
if (sealSha !== text(seal.seal_sha256)) {
  blockers.push(`DIRECTION_SEAL_SHA_MISMATCH:${sealSha}:${text(seal.seal_sha256)}`);
}
if (Number(seal.counts?.shot_count) !== 13) {
  blockers.push(`SEALED_SHOT_COUNT_INVALID:${seal.counts?.shot_count}:13`);
}
if (Number(seal.counts?.source_evidenced_shot_count) !== 13) {
  blockers.push(
    `SEALED_SOURCE_EVIDENCED_SHOT_COUNT_INVALID:${seal.counts?.source_evidenced_shot_count}:13`,
  );
}
if (Number(seal.counts?.persisted_prompt_field_count) !== 0) {
  blockers.push("SEALED_PROMPT_FIELDS_PRESENT");
}
if (Number(seal.counts?.persisted_instruction_field_count) !== 0) {
  blockers.push("SEALED_INSTRUCTION_FIELDS_PRESENT");
}
if (blockers.length) {
  throw new Error(`SEALED_PRODUCTION_COST_PREFLIGHT_BLOCKED:${blockers.join(",")}`);
}

const { supabaseAdmin } = await import("@/lib/shared/supabase/admin");
const before = await exactState(supabaseAdmin, organizationId, projectId);
const rawEstimatePath = path.resolve(
  text(process.env.RAW_COST_ESTIMATE_OUTPUT) ||
  "/tmp/churchill-evidence-constrained-production-cost.raw.json",
);
const outputPath = path.resolve(
  text(process.env.SEALED_COST_ESTIMATE_OUTPUT) ||
  "/tmp/churchill-evidence-constrained-production-cost.json",
);
fs.rmSync(rawEstimatePath, { force: true });
fs.rmSync(outputPath, { force: true });

console.log("============================================================");
console.log("SEALED CREATIVE PRODUCTION COST ESTIMATE PREFLIGHT");
console.log("============================================================");
console.log(`DIRECTION=${directionPath}`);
console.log(`DIRECTION_SEAL=${sealPath}`);
console.log(`DIRECTION_SHA256=${directionSha}`);
console.log(`DIRECTION_SEAL_SHA256=${sealSha}`);
console.log(`AVAILABLE_WALLET_BALANCE=${before.wallet_balance}`);
console.log("PROVIDER_CALLS_AUTHORIZED=NO");
console.log("USAGE_CREATION_AUTHORIZED=NO");
console.log("WALLET_MUTATION_AUTHORIZED=NO");
console.log("GRAPH_MATERIALIZATION_AUTHORIZED=NO");
console.log("TASK_MATERIALIZATION_AUTHORIZED=NO");

const child = await runChild(
  process.execPath,
  [
    "--loader",
    "./scripts/next-alias-loader.mjs",
    "scripts/run-creative-production-cost-estimate-read-only.mjs",
    directionPath,
  ],
  {
    ...process.env,
    ORGANIZATION_ID: organizationId,
    CURRENCY: before.wallet_currency,
    AVAILABLE_WALLET_BALANCE: String(before.wallet_balance),
    COST_ESTIMATE_OUTPUT: rawEstimatePath,
  },
);

if (child.code !== 0) {
  throw new Error(
    `SEALED_PRODUCTION_COST_ESTIMATOR_FAILED:${child.code}:${text(child.stderr).slice(0, 1000)}`,
  );
}
if (!fs.existsSync(rawEstimatePath)) {
  throw new Error("SEALED_PRODUCTION_COST_RAW_OUTPUT_MISSING");
}

const estimate = JSON.parse(fs.readFileSync(rawEstimatePath, "utf8"));
const after = await exactState(supabaseAdmin, organizationId, projectId);

if (estimate.contract !== "CREATIVE_PRODUCTION_COST_ESTIMATE_V1") {
  blockers.push(`COST_ESTIMATE_CONTRACT_INVALID:${text(estimate.contract)}`);
}
if (text(estimate.organization_id) !== organizationId) {
  blockers.push("COST_ESTIMATE_ORGANIZATION_MISMATCH");
}
if (list(estimate.blockers).length) {
  blockers.push(...list(estimate.blockers).map((item) => `COST:${item}`));
}
if (Number(estimate.counts?.scene_count) !== 7) {
  blockers.push(`COST_SCENE_COUNT_INVALID:${estimate.counts?.scene_count}:7`);
}
if (Number(estimate.counts?.shot_count) !== 13) {
  blockers.push(`COST_SHOT_COUNT_INVALID:${estimate.counts?.shot_count}:13`);
}
if (Number(estimate.counts?.shot_generation_count) !== 13) {
  blockers.push(
    `SHOT_GENERATION_COUNT_INVALID:${estimate.counts?.shot_generation_count}:13`,
  );
}
if (Number(estimate.counts?.perceptual_review_count) !== 13) {
  blockers.push(
    `PERCEPTUAL_REVIEW_COUNT_INVALID:${estimate.counts?.perceptual_review_count}:13`,
  );
}
if (Number(estimate.counts?.soundtrack_generation_count) !== 1) {
  blockers.push(
    `SOUNDTRACK_GENERATION_COUNT_INVALID:${estimate.counts?.soundtrack_generation_count}:1`,
  );
}
if (Number(estimate.counts?.identity_keyframe_count) !== 0) {
  blockers.push(
    `IDENTITY_KEYFRAME_COUNT_MUST_BE_ZERO:${estimate.counts?.identity_keyframe_count}`,
  );
}
if (Number(estimate.counts?.lip_sync_count) !== 0) {
  blockers.push(`LIP_SYNC_COUNT_MUST_BE_ZERO:${estimate.counts?.lip_sync_count}`);
}
if (Number(estimate.counts?.production_work_item_count) !== 27) {
  blockers.push(
    `PRODUCTION_WORK_ITEM_COUNT_INVALID:${estimate.counts?.production_work_item_count}:27`,
  );
}
if (estimate.promptless_direction_verified !== true) {
  blockers.push("COST_PROMPTLESS_DIRECTION_NOT_VERIFIED");
}
if (
  estimate.provider_calls_executed !== false ||
  estimate.usage_created !== false ||
  estimate.wallet_reserved !== false ||
  estimate.wallet_charged !== false ||
  estimate.graph_created !== false ||
  estimate.tasks_created !== false ||
  estimate.production_authorized !== false
) {
  blockers.push("COST_ESTIMATE_READ_ONLY_CONTRACT_VIOLATED");
}
if (!sameState(before, after)) blockers.push("COST_ESTIMATE_STATE_CHANGED");

const selectedBaseline = exactNumber(estimate.scenarios?.selected_baseline);
const repairReserve = exactNumber(estimate.scenarios?.one_shot_repair_reserve);
const approvalCeiling = exactNumber(
  estimate.scenarios?.recommended_approval_ceiling,
);
if (selectedBaseline === null || selectedBaseline <= 0) {
  blockers.push("SELECTED_BASELINE_INVALID");
}
if (repairReserve === null || repairReserve <= 0) {
  blockers.push("ONE_SHOT_REPAIR_RESERVE_INVALID");
}
if (approvalCeiling === null || approvalCeiling <= selectedBaseline) {
  blockers.push("RECOMMENDED_APPROVAL_CEILING_INVALID");
}
if (approvalCeiling !== null && approvalCeiling > before.wallet_balance) {
  blockers.push("WALLET_INSUFFICIENT_FOR_RECOMMENDED_APPROVAL_CEILING");
}

const reportCore = {
  contract: "CREATIVE_SEALED_PRODUCTION_COST_ESTIMATE_V1",
  generated_at: new Date().toISOString(),
  input_direction_path: directionPath,
  input_seal_path: sealPath,
  organization_id: organizationId,
  creative_project_id: projectId,
  direction_sha256: directionSha,
  direction_envelope_sha256: directionEnvelopeSha,
  direction_seal_sha256: sealSha,
  direction_seal_contract: seal.contract,
  direction_seal_readiness: seal.readiness,
  estimate,
  exact_state_before: before,
  exact_state_after: after,
  provider_calls_executed: false,
  usage_created: false,
  wallet_reserved: false,
  wallet_charged: false,
  graph_created: false,
  tasks_created: false,
  production_authorized: false,
  publication_authorized: false,
  blockers,
  readiness: blockers.length ? "FAIL" : "PASS",
};
const report = {
  ...reportCore,
  sealed_cost_estimate_sha256: sha256(reportCore),
};
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log("============================================================");
console.log("SEALED CREATIVE PRODUCTION COST ESTIMATE RESULT");
console.log("============================================================");
console.log(`OUTPUT=${outputPath}`);
console.log(`SEALED_COST_ESTIMATE_SHA256=${report.sealed_cost_estimate_sha256}`);
console.log(`SCENE_COUNT=${estimate.counts?.scene_count}`);
console.log(`SHOT_COUNT=${estimate.counts?.shot_count}`);
console.log(`PRODUCTION_WORK_ITEM_COUNT=${estimate.counts?.production_work_item_count}`);
console.log(`SHOT_GENERATION_COUNT=${estimate.counts?.shot_generation_count}`);
console.log(`PERCEPTUAL_REVIEW_COUNT=${estimate.counts?.perceptual_review_count}`);
console.log(`SOUNDTRACK_GENERATION_COUNT=${estimate.counts?.soundtrack_generation_count}`);
console.log(`IDENTITY_KEYFRAME_COUNT=${estimate.counts?.identity_keyframe_count}`);
console.log(`LIP_SYNC_COUNT=${estimate.counts?.lip_sync_count}`);
console.log(`SELECTED_BASELINE=${estimate.scenarios?.selected_baseline}`);
console.log(`ONE_SHOT_REPAIR_RESERVE=${estimate.scenarios?.one_shot_repair_reserve}`);
console.log(`RECOMMENDED_APPROVAL_CEILING=${estimate.scenarios?.recommended_approval_ceiling}`);
console.log(`AVAILABLE_WALLET_BALANCE=${before.wallet_balance}`);
console.log(`EXACT_GRAPH_COUNT_BEFORE=${before.graph_count}`);
console.log(`EXACT_GRAPH_COUNT_AFTER=${after.graph_count}`);
console.log(`EXACT_TASK_COUNT_BEFORE=${before.task_count}`);
console.log(`EXACT_TASK_COUNT_AFTER=${after.task_count}`);
console.log(`EXACT_USAGE_COUNT_BEFORE=${before.usage_count}`);
console.log(`EXACT_USAGE_COUNT_AFTER=${after.usage_count}`);
console.log(`WALLET_BALANCE_BEFORE=${before.wallet_balance}`);
console.log(`WALLET_BALANCE_AFTER=${after.wallet_balance}`);
console.log(`SEALED_COST_ESTIMATE_READINESS=${report.readiness}`);
console.log(`SEALED_COST_ESTIMATE_BLOCKER_COUNT=${blockers.length}`);
console.log(`SEALED_COST_ESTIMATE_BLOCKERS=${JSON.stringify(blockers)}`);
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
