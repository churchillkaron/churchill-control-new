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
    Object.keys(value).sort().map((key) => [key, stable(value[key])]),
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

function run(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env,
      stdio: ["inherit", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      const rendered = String(chunk);
      stdout += rendered;
      process.stdout.write(rendered);
    });
    child.stderr.on("data", (chunk) => {
      const rendered = String(chunk);
      stderr += rendered;
      process.stderr.write(rendered);
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

function same(left, right) {
  return JSON.stringify(stable(left)) === JSON.stringify(stable(right));
}

function writeCompatibilityFiles({
  direction,
  manifest,
  preview,
  manifestPath,
  previewPath,
}) {
  const manifestValue = object(manifest.value);
  const previewValue = object(preview.value);
  const directionRawSha = sha256(direction.raw);
  const manifestInternalSha = text(manifestValue.manifest_sha256);
  const counts = object(previewValue.counts);

  const compatibilityManifest = {
    ...manifestValue,
    manifest_hash: manifestInternalSha,
    direction: {
      ...object(manifestValue.direction),
      sha256: directionRawSha,
    },
  };

  const compatibilityPreview = {
    ...previewValue,
    direction_sha256: directionRawSha,
    approval_manifest_hash: manifestInternalSha,
    summary: {
      ...object(previewValue.summary),
      readiness: previewValue.readiness,
      node_count: counts.node_count,
      edge_count: counts.edge_count,
      generation_node_count: counts.generation_node_count,
      execution_step_count: counts.execution_step_count,
      shot_generation_count: counts.video_generation_count,
      video_generation_count: counts.video_generation_count,
      perceptual_review_count: counts.perceptual_review_count,
      soundtrack_generation_count: counts.soundtrack_generation_count,
      identity_keyframe_count: counts.identity_keyframe_count,
      graph_prompt_field_count: counts.graph_forbidden_field_count,
      execution_prompt_field_count: counts.execution_forbidden_field_count,
    },
  };

  fs.writeFileSync(
    manifestPath,
    `${JSON.stringify(compatibilityManifest, null, 2)}\n`,
    "utf8",
  );
  fs.writeFileSync(
    previewPath,
    `${JSON.stringify(compatibilityPreview, null, 2)}\n`,
    "utf8",
  );

  return {
    direction_raw_sha256: directionRawSha,
    manifest_internal_sha256: manifestInternalSha,
    compatibility_manifest_sha256: sha256(compatibilityManifest),
    compatibility_preview_sha256: sha256(compatibilityPreview),
  };
}

const direction = readJson(process.argv[2], "DIRECTION");
const manifest = readJson(process.argv[3], "SEALED_APPROVAL_MANIFEST");
const manifestValue = object(manifest.value);

const organizationId = text(process.env.ORGANIZATION_ID);
const projectId = text(process.env.CREATIVE_PROJECT_ID || process.env.PROJECT_ID);
const missionId = text(process.env.CREATIVE_MISSION_ID);
if (!organizationId) throw new Error("ORGANIZATION_ID_REQUIRED");
if (!projectId) throw new Error("CREATIVE_PROJECT_ID_REQUIRED");
if (!missionId) throw new Error("CREATIVE_MISSION_ID_REQUIRED");

const preflightBlockers = [];
if (manifestValue.contract !==
  "CREATIVE_SEALED_PRODUCTION_APPROVAL_MANIFEST_V2") {
  preflightBlockers.push("MANIFEST_CONTRACT_INVALID");
}
if (manifestValue.readiness !== "PASS" || list(manifestValue.blockers).length) {
  preflightBlockers.push("MANIFEST_NOT_READY");
}
if (text(manifestValue.organization_id) !== organizationId) {
  preflightBlockers.push("MANIFEST_ORGANIZATION_MISMATCH");
}
if (text(manifestValue.creative_project_id) !== projectId) {
  preflightBlockers.push("MANIFEST_PROJECT_MISMATCH");
}
if (text(manifestValue.creative_mission_id) !== missionId) {
  preflightBlockers.push("MANIFEST_MISSION_MISMATCH");
}
if (manifestValue.quality_audit?.world_class_readiness !== "PASS" ||
  Number(manifestValue.quality_audit?.total_score) !== 100) {
  preflightBlockers.push("WORLD_CLASS_QUALITY_NOT_READY");
}
if (Number(manifestValue.cost_estimate?.production_work_item_count) !== 27) {
  preflightBlockers.push("PRODUCTION_WORKLOAD_COUNT_INVALID");
}
if (manifestValue.music_readiness?.readiness !== "PASS") {
  preflightBlockers.push("MUSIC_READINESS_NOT_PASSED");
}
for (const key of [
  "production_authorized",
  "provider_calls_authorized",
  "usage_creation_authorized",
  "wallet_reservation_authorized",
  "wallet_charge_authorized",
  "graph_materialization_authorized",
  "task_materialization_authorized",
  "repair_execution_authorized",
  "publication_authorized",
]) {
  if (manifestValue.authorization?.[key] !== false) {
    preflightBlockers.push(`AUTHORIZATION_MUST_REMAIN_FALSE:${key}`);
  }
}
if (preflightBlockers.length) {
  throw new Error(
    `SEALED_PREPRODUCTION_PREFLIGHT_BLOCKED:${preflightBlockers.join(",")}`,
  );
}

const graphPreviewPath = path.resolve(
  text(process.env.SEALED_GRAPH_PREVIEW_OUTPUT) ||
    "/tmp/churchill-evidence-constrained-production-graph-preview.json",
);
const persistencePath = path.resolve(
  text(process.env.PROMPTLESS_PERSISTENCE_AUDIT_OUTPUT) ||
    "/tmp/churchill-evidence-constrained-promptless-persistence-audit.json",
);
const humanReviewPath = path.resolve(
  text(process.env.HUMAN_PRODUCTION_REVIEW_JSON) ||
    "/tmp/churchill-evidence-constrained-human-production-review.json",
);
const humanReviewMarkdownPath = path.resolve(
  text(process.env.HUMAN_PRODUCTION_REVIEW_MARKDOWN) ||
    "/tmp/churchill-evidence-constrained-human-production-review.md",
);
const gateOutputPath = path.resolve(
  text(process.env.SEALED_PREPRODUCTION_GATE_OUTPUT) ||
    "/tmp/churchill-evidence-constrained-preproduction-gate.json",
);
const compatibilityManifestPath = path.resolve(
  text(process.env.SEALED_COMPATIBILITY_MANIFEST_OUTPUT) ||
    "/tmp/churchill-sealed-manifest-compatibility-v1.json",
);
const compatibilityPreviewPath = path.resolve(
  text(process.env.SEALED_COMPATIBILITY_PREVIEW_OUTPUT) ||
    "/tmp/churchill-sealed-preview-compatibility-v1.json",
);

for (const output of [
  graphPreviewPath,
  persistencePath,
  humanReviewPath,
  humanReviewMarkdownPath,
  gateOutputPath,
  compatibilityManifestPath,
  compatibilityPreviewPath,
]) {
  fs.rmSync(output, { force: true });
}

const { supabaseAdmin } = await import("@/lib/shared/supabase/admin");
const before = await exactState(supabaseAdmin, organizationId, projectId);
const childEnv = {
  ...process.env,
  ORGANIZATION_ID: organizationId,
  CREATIVE_PROJECT_ID: projectId,
  CREATIVE_MISSION_ID: missionId,
};

console.log("============================================================");
console.log("1. SEALED PRODUCTION GRAPH PREVIEW");
console.log("============================================================");
const previewRun = await run(
  process.execPath,
  [
    "--loader",
    "./scripts/next-alias-loader.mjs",
    "scripts/preview-sealed-creative-production-graph-read-only.mjs",
    direction.absolute,
    manifest.absolute,
  ],
  {
    ...childEnv,
    SEALED_GRAPH_PREVIEW_OUTPUT: graphPreviewPath,
  },
);
if (previewRun.code !== 0) {
  throw new Error(
    `SEALED_GRAPH_PREVIEW_FAILED:${previewRun.code}:${text(previewRun.stderr).slice(0, 1200)}`,
  );
}
const preview = readJson(graphPreviewPath, "SEALED_GRAPH_PREVIEW");
if (preview.value.readiness !== "PASS" || list(preview.value.blockers).length) {
  throw new Error(
    `SEALED_GRAPH_PREVIEW_NOT_READY:${list(preview.value.blockers).join(",")}`,
  );
}

const compatibility = writeCompatibilityFiles({
  direction,
  manifest,
  preview,
  manifestPath: compatibilityManifestPath,
  previewPath: compatibilityPreviewPath,
});

console.log("============================================================");
console.log("2. PROMPTLESS PERSISTENCE AUDIT");
console.log("============================================================");
const persistenceRun = await run(
  process.execPath,
  [
    "--loader",
    "./scripts/next-alias-loader.mjs",
    "scripts/audit-creative-promptless-persistence-read-only.mjs",
    compatibilityPreviewPath,
    compatibilityManifestPath,
  ],
  {
    ...childEnv,
    PROMPTLESS_PERSISTENCE_AUDIT_OUTPUT: persistencePath,
  },
);
if (persistenceRun.code !== 0) {
  throw new Error(
    `PROMPTLESS_PERSISTENCE_AUDIT_FAILED:${persistenceRun.code}:${text(persistenceRun.stderr).slice(0, 1200)}`,
  );
}
const persistence = readJson(persistencePath, "PROMPTLESS_PERSISTENCE_AUDIT");
if (persistence.value.readiness !== "PASS" || list(persistence.value.blockers).length) {
  throw new Error(
    `PROMPTLESS_PERSISTENCE_NOT_READY:${list(persistence.value.blockers).join(",")}`,
  );
}

console.log("============================================================");
console.log("3. HUMAN PRODUCTION REVIEW");
console.log("============================================================");
const humanReviewRun = await run(
  process.execPath,
  [
    "--loader",
    "./scripts/next-alias-loader.mjs",
    "scripts/build-creative-human-production-review-read-only.mjs",
    direction.absolute,
    compatibilityPreviewPath,
    compatibilityManifestPath,
    persistence.absolute,
  ],
  {
    ...childEnv,
    HUMAN_PRODUCTION_REVIEW_JSON: humanReviewPath,
    HUMAN_PRODUCTION_REVIEW_MARKDOWN: humanReviewMarkdownPath,
  },
);
if (humanReviewRun.code !== 0) {
  throw new Error(
    `HUMAN_PRODUCTION_REVIEW_FAILED:${humanReviewRun.code}:${text(humanReviewRun.stderr).slice(0, 1200)}`,
  );
}
const humanReview = readJson(humanReviewPath, "HUMAN_PRODUCTION_REVIEW");
if (humanReview.value.readiness !== "PASS" || list(humanReview.value.blockers).length) {
  throw new Error(
    `HUMAN_PRODUCTION_REVIEW_NOT_READY:${list(humanReview.value.blockers).join(",")}`,
  );
}

const after = await exactState(supabaseAdmin, organizationId, projectId);
const previewCounts = object(preview.value.counts);
const reviewSummary = object(humanReview.value.summary);
const blockers = [];

if (!same(before, after)) blockers.push("READ_ONLY_STATE_CHANGED");
if (preview.value.contract !== "CREATIVE_SEALED_PRODUCTION_GRAPH_PREVIEW_V2") {
  blockers.push("GRAPH_PREVIEW_CONTRACT_INVALID");
}
if (Number(previewCounts.node_count) !== 34) {
  blockers.push("GRAPH_NODE_COUNT_INVALID");
}
if (Number(previewCounts.edge_count) !== 26) {
  blockers.push("GRAPH_EDGE_COUNT_INVALID");
}
if (Number(previewCounts.generation_node_count) !== 27 ||
  Number(previewCounts.execution_step_count) !== 27) {
  blockers.push("PRODUCTION_WORKLOAD_COUNT_INVALID");
}
if (Number(previewCounts.video_generation_count) !== 13 ||
  Number(previewCounts.perceptual_review_count) !== 13 ||
  Number(previewCounts.soundtrack_generation_count) !== 1 ||
  Number(previewCounts.identity_keyframe_count) !== 0) {
  blockers.push("PRODUCTION_SERVICE_COUNTS_INVALID");
}
if (Number(previewCounts.graph_forbidden_field_count) !== 0 ||
  Number(previewCounts.execution_forbidden_field_count) !== 0) {
  blockers.push("GRAPH_OR_EXECUTION_NOT_PROMPTLESS");
}
if (Number(persistence.value.task_payload_count) !== 27 ||
  Number(persistence.value.transport_instruction_count) !== 27 ||
  Number(list(persistence.value.empty_transport_instruction_indexes).length) !== 0) {
  blockers.push("PROMPTLESS_TASK_TRANSPORT_CONTRACT_INVALID");
}
if (Number(list(persistence.value.graph_prompt_field_paths).length) !== 0 ||
  Number(list(persistence.value.execution_prompt_field_paths).length) !== 0 ||
  Number(list(persistence.value.task_prompt_field_paths).length) !== 0) {
  blockers.push("PERSISTED_PROMPT_FIELDS_PRESENT");
}
if (humanReview.value.contract !== "CREATIVE_HUMAN_PRODUCTION_REVIEW_V2") {
  blockers.push("HUMAN_REVIEW_CONTRACT_INVALID");
}
if (Number(reviewSummary.scene_count) !== 7 ||
  Number(reviewSummary.shot_count) !== 13 ||
  Math.abs(Number(reviewSummary.duration_seconds) - 60) > 0.01) {
  blockers.push("HUMAN_REVIEW_TIMELINE_INVALID");
}
if (Number(reviewSummary.human_review_warning_count) !== 0 ||
  Number(reviewSummary.persisted_prompt_field_count) !== 0 ||
  Number(reviewSummary.transport_instruction_count) !== 27) {
  blockers.push("HUMAN_REVIEW_WARNING_OR_PROMPT_BLOCKER");
}
if (manifestValue.authorization?.production_authorized !== false ||
  manifestValue.authorization?.publication_authorized !== false) {
  blockers.push("MANIFEST_AUTHORIZATION_STATE_INVALID");
}

const reportCore = {
  contract: "CREATIVE_SEALED_PREPRODUCTION_GATE_V1",
  generated_at: new Date().toISOString(),
  organization_id: organizationId,
  creative_project_id: projectId,
  creative_mission_id: missionId,
  direction_file: direction.absolute,
  direction_file_sha256: direction.file_sha256,
  manifest_file: manifest.absolute,
  manifest_file_sha256: manifest.file_sha256,
  manifest_sha256: text(manifestValue.manifest_sha256),
  graph_preview_file: preview.absolute,
  graph_preview_file_sha256: preview.file_sha256,
  graph_preview_sha256: text(preview.value.preview_sha256),
  promptless_persistence_file: persistence.absolute,
  promptless_persistence_file_sha256: persistence.file_sha256,
  human_review_file: humanReview.absolute,
  human_review_file_sha256: humanReview.file_sha256,
  human_review_markdown_file: humanReviewMarkdownPath,
  compatibility,
  counts: {
    graph_node_count: Number(previewCounts.node_count),
    graph_edge_count: Number(previewCounts.edge_count),
    generation_node_count: Number(previewCounts.generation_node_count),
    execution_step_count: Number(previewCounts.execution_step_count),
    video_generation_count: Number(previewCounts.video_generation_count),
    perceptual_review_count: Number(previewCounts.perceptual_review_count),
    soundtrack_generation_count: Number(previewCounts.soundtrack_generation_count),
    identity_keyframe_count: Number(previewCounts.identity_keyframe_count),
    task_payload_count: Number(persistence.value.task_payload_count),
    transport_instruction_count:
      Number(persistence.value.transport_instruction_count),
    scene_count: Number(reviewSummary.scene_count),
    shot_count: Number(reviewSummary.shot_count),
    duration_seconds: Number(reviewSummary.duration_seconds),
    human_review_warning_count:
      Number(reviewSummary.human_review_warning_count),
    persisted_prompt_field_count:
      Number(reviewSummary.persisted_prompt_field_count),
  },
  cost: {
    currency: manifestValue.currency,
    selected_baseline: manifestValue.cost_estimate?.selected_baseline,
    one_shot_repair_reserve:
      manifestValue.cost_estimate?.one_shot_repair_reserve,
    maximum_customer_price:
      manifestValue.authorization?.maximum_customer_price,
    current_wallet_balance: after.wallet_balance,
    wallet_sufficient:
      after.wallet_balance >=
        Number(manifestValue.authorization?.maximum_customer_price || 0),
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
  },
  database_writes_executed: false,
  provider_calls_executed: false,
  wallet_changed: false,
  graph_created: false,
  tasks_created: false,
  blockers,
  readiness: blockers.length ? "FAIL" : "PASS",
};
const report = {
  ...reportCore,
  gate_sha256: sha256(reportCore),
};
fs.writeFileSync(gateOutputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log("============================================================");
console.log("SEALED CREATIVE PREPRODUCTION GATE RESULT");
console.log("============================================================");
console.log(`OUTPUT=${gateOutputPath}`);
console.log(`GATE_SHA256=${report.gate_sha256}`);
console.log(`MANIFEST_SHA256=${report.manifest_sha256}`);
console.log(`GRAPH_PREVIEW_SHA256=${report.graph_preview_sha256}`);
console.log(`GRAPH_NODE_COUNT=${report.counts.graph_node_count}`);
console.log(`GRAPH_EDGE_COUNT=${report.counts.graph_edge_count}`);
console.log(`GENERATION_NODE_COUNT=${report.counts.generation_node_count}`);
console.log(`EXECUTION_STEP_COUNT=${report.counts.execution_step_count}`);
console.log(`VIDEO_GENERATION_COUNT=${report.counts.video_generation_count}`);
console.log(`PERCEPTUAL_REVIEW_COUNT=${report.counts.perceptual_review_count}`);
console.log(`SOUNDTRACK_GENERATION_COUNT=${report.counts.soundtrack_generation_count}`);
console.log(`IDENTITY_KEYFRAME_COUNT=${report.counts.identity_keyframe_count}`);
console.log(`TASK_PAYLOAD_COUNT=${report.counts.task_payload_count}`);
console.log(`TRANSPORT_INSTRUCTION_COUNT=${report.counts.transport_instruction_count}`);
console.log(`SCENE_COUNT=${report.counts.scene_count}`);
console.log(`SHOT_COUNT=${report.counts.shot_count}`);
console.log(`DURATION_SECONDS=${report.counts.duration_seconds}`);
console.log(`HUMAN_REVIEW_WARNING_COUNT=${report.counts.human_review_warning_count}`);
console.log(`PERSISTED_PROMPT_FIELD_COUNT=${report.counts.persisted_prompt_field_count}`);
console.log(`SELECTED_BASELINE=${report.cost.selected_baseline}`);
console.log(`ONE_SHOT_REPAIR_RESERVE=${report.cost.one_shot_repair_reserve}`);
console.log(`MAXIMUM_CUSTOMER_PRICE=${report.cost.maximum_customer_price}`);
console.log(`CURRENT_WALLET_BALANCE=${report.cost.current_wallet_balance}`);
console.log(`EXACT_GRAPH_COUNT_BEFORE=${before.graph_count}`);
console.log(`EXACT_GRAPH_COUNT_AFTER=${after.graph_count}`);
console.log(`EXACT_TASK_COUNT_BEFORE=${before.task_count}`);
console.log(`EXACT_TASK_COUNT_AFTER=${after.task_count}`);
console.log(`EXACT_USAGE_COUNT_BEFORE=${before.usage_count}`);
console.log(`EXACT_USAGE_COUNT_AFTER=${after.usage_count}`);
console.log(`WALLET_BALANCE_BEFORE=${before.wallet_balance}`);
console.log(`WALLET_BALANCE_AFTER=${after.wallet_balance}`);
console.log(`SEALED_PREPRODUCTION_READINESS=${report.readiness}`);
console.log(`SEALED_PREPRODUCTION_BLOCKER_COUNT=${blockers.length}`);
console.log(`SEALED_PREPRODUCTION_BLOCKERS=${JSON.stringify(blockers)}`);
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
