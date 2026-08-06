#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv({ cwd: process.cwd() });
await import("./creative-runtime-bootstrap.mjs");

const PREVIEW_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_REPAIR_SOURCE_DISPATCH_MATERIALIZATION_PREVIEW_V1";
const CHECKPOINT_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_REPAIR_SOURCE_DISPATCH_CHECKPOINT_V1";
const BRIDGE_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_REPAIR_SOURCE_DISPATCH_FINGERPRINT_BRIDGE_V1";

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function money(value) {
  return Number(Number(value || 0).toFixed(6));
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
    throw new Error(`${label}_NOT_FOUND:${absolute || "MISSING"}`);
  }
  const raw = fs.readFileSync(absolute, "utf8");
  return {
    absolute,
    raw,
    file_sha256: sha256(raw),
    value: JSON.parse(raw),
  };
}

function writeJson(filePath, value) {
  const absolute = path.resolve(filePath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function previewTaskState(task = {}) {
  return {
    id: task.id,
    status: task.status,
    error: task.error || null,
    depends_on: task.depends_on || [],
    review: task.review || {},
    metadata: task.metadata || {},
    output: task.output || {},
    timing: task.timing || {},
    updated_at: task.updated_at || null,
  };
}

function dispatchTaskState(task = {}) {
  return {
    id: task.id,
    status: task.status,
    provider_id: task.provider_id ?? null,
    cost: task.cost || {},
    error: task.error || null,
    depends_on: task.depends_on || [],
    review: task.review || {},
    metadata: task.metadata || {},
    output: task.output || {},
    timing: task.timing || {},
    updated_at: task.updated_at || null,
  };
}

function fingerprint(tasks = [], projection) {
  return sha256(
    [...tasks]
      .sort((left, right) => text(left.id).localeCompare(text(right.id)))
      .map(projection),
  );
}

const originalPreviewFile = readJson(
  process.argv[2],
  "SOURCE_DISPATCH_MATERIALIZATION_PREVIEW",
);
const originalPreview = object(originalPreviewFile.value);

const organizationId = text(process.env.ORGANIZATION_ID);
const projectId = text(process.env.CREATIVE_PROJECT_ID);
const graphId = text(process.env.PRODUCTION_GRAPH_ID);
const checkpointPath = path.resolve(
  text(process.env.OPENAI_PERCEPTUAL_SOURCE_DISPATCH_CHECKPOINT) ||
    "/tmp/churchill-openai-perceptual-repair-source-dispatch-checkpoint.json",
);
const bridgedPreviewPath = path.resolve(
  text(process.env.OPENAI_PERCEPTUAL_SOURCE_DISPATCH_BRIDGED_PREVIEW) ||
    "/tmp/churchill-openai-perceptual-repair-source-dispatch-materialization-preview-v2.json",
);

if (!organizationId || !projectId || !graphId) {
  throw new Error("SOURCE_DISPATCH_FINGERPRINT_BRIDGE_SCOPE_REQUIRED");
}
if (text(originalPreview.contract) !== PREVIEW_CONTRACT) {
  throw new Error("SOURCE_DISPATCH_FINGERPRINT_BRIDGE_PREVIEW_CONTRACT_INVALID");
}
if (
  text(originalPreview.organization_id) !== organizationId ||
  text(originalPreview.creative_project_id) !== projectId ||
  text(originalPreview.production_graph_id) !== graphId
) {
  throw new Error("SOURCE_DISPATCH_FINGERPRINT_BRIDGE_PREVIEW_SCOPE_INVALID");
}
if (
  text(originalPreview.decision) !==
    "REPAIR_SOURCE_DISPATCH_MATERIALIZATION_PREVIEW_9_SOURCES_CONFIRMED" ||
  text(originalPreview.readiness) !==
    "READY_FOR_EXPLICIT_REPAIR_SOURCE_DISPATCH_AUTHORIZATION_DESIGN" ||
  !originalPreview.state_unchanged
) {
  throw new Error("SOURCE_DISPATCH_FINGERPRINT_BRIDGE_PREVIEW_NOT_READY");
}

const [{ supabaseAdmin }, { ProductionTaskRuntime }] = await Promise.all([
  import("@/lib/shared/supabase/admin"),
  import("@/lib/operations/tasks/runtime/ProductionTaskRuntime"),
]);

const [tasks, usage, wallet] = await Promise.all([
  ProductionTaskRuntime.list({
    organization_id: organizationId,
    creative_project_id: projectId,
    production_graph_id: graphId,
  }),
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

if (usage.error) throw usage.error;
if (wallet.error) throw wallet.error;

const scopedTasks = tasks.filter(
  (task) => text(task.production_graph_id) === graphId,
);
if (scopedTasks.length !== 45) {
  throw new Error(
    `SOURCE_DISPATCH_FINGERPRINT_BRIDGE_TASK_COUNT_INVALID:${scopedTasks.length}`,
  );
}

const livePreviewFingerprint = fingerprint(scopedTasks, previewTaskState);
const liveDispatchFingerprint = fingerprint(scopedTasks, dispatchTaskState);
const expectedPreviewFingerprint = text(
  originalPreview.exact_state_before?.task_state_sha256,
);
const dispatchContractPreviewFingerprint = text(
  originalPreview.dispatch_contract?.live_task_state_sha256,
);

let initialDispatchFingerprint = liveDispatchFingerprint;
let checkpoint = null;

if (fs.existsSync(checkpointPath)) {
  checkpoint = readJson(checkpointPath, "SOURCE_DISPATCH_CHECKPOINT").value;
  if (text(checkpoint.contract) !== CHECKPOINT_CONTRACT) {
    throw new Error("SOURCE_DISPATCH_FINGERPRINT_BRIDGE_CHECKPOINT_INVALID");
  }
  if (
    text(checkpoint.organization_id) !== organizationId ||
    text(checkpoint.creative_project_id) !== projectId ||
    text(checkpoint.production_graph_id) !== graphId ||
    text(checkpoint.dispatch_contract_sha256) !==
      text(originalPreview.dispatch_contract_sha256)
  ) {
    throw new Error(
      "SOURCE_DISPATCH_FINGERPRINT_BRIDGE_CHECKPOINT_SCOPE_INVALID",
    );
  }
  initialDispatchFingerprint = text(checkpoint.initial_task_state_sha256);
  if (!/^[a-f0-9]{64}$/i.test(initialDispatchFingerprint)) {
    throw new Error(
      "SOURCE_DISPATCH_FINGERPRINT_BRIDGE_CHECKPOINT_INITIAL_HASH_INVALID",
    );
  }
} else {
  if (
    !expectedPreviewFingerprint ||
    livePreviewFingerprint !== expectedPreviewFingerprint ||
    livePreviewFingerprint !==
      text(originalPreview.exact_state_after?.task_state_sha256) ||
    livePreviewFingerprint !== dispatchContractPreviewFingerprint
  ) {
    throw new Error(
      `SOURCE_DISPATCH_FINGERPRINT_BRIDGE_LIVE_STATE_MISMATCH:${livePreviewFingerprint}:${expectedPreviewFingerprint}:${dispatchContractPreviewFingerprint}`,
    );
  }
  if (
    Number(usage.count || 0) !==
      Number(originalPreview.exact_state_before?.usage_count) ||
    Number(usage.count || 0) !==
      Number(originalPreview.exact_state_after?.usage_count)
  ) {
    throw new Error("SOURCE_DISPATCH_FINGERPRINT_BRIDGE_USAGE_CHANGED");
  }
  if (
    money(wallet.data?.available_balance) !==
      money(originalPreview.exact_state_before?.wallet_balance) ||
    money(wallet.data?.available_balance) !==
      money(originalPreview.exact_state_after?.wallet_balance) ||
    wallet.data?.updated_at !==
      originalPreview.exact_state_before?.wallet_updated_at ||
    wallet.data?.updated_at !==
      originalPreview.exact_state_after?.wallet_updated_at
  ) {
    throw new Error("SOURCE_DISPATCH_FINGERPRINT_BRIDGE_WALLET_CHANGED");
  }
}

const bridge = {
  contract: BRIDGE_CONTRACT,
  original_preview_file_sha256: originalPreviewFile.file_sha256,
  original_preview_task_state_sha256: expectedPreviewFingerprint,
  original_preview_projection:
    "id,status,error,depends_on,review,metadata,output,timing,updated_at",
  dispatch_task_state_sha256: initialDispatchFingerprint,
  dispatch_projection:
    "id,status,provider_id,cost,error,depends_on,review,metadata,output,timing,updated_at",
  live_preview_projection_verified: checkpoint ? null : true,
  checkpoint_resume: Boolean(checkpoint),
};

const bridgedPreview = {
  ...originalPreview,
  exact_state_before: {
    ...object(originalPreview.exact_state_before),
    task_state_sha256: initialDispatchFingerprint,
  },
  exact_state_after: {
    ...object(originalPreview.exact_state_after),
    task_state_sha256: initialDispatchFingerprint,
  },
  fingerprint_bridge: bridge,
};

writeJson(bridgedPreviewPath, bridgedPreview);

console.log("============================================================");
console.log("REPAIR SOURCE DISPATCH FINGERPRINT COMPATIBILITY BRIDGE");
console.log("============================================================");
console.log(`ORIGINAL_PREVIEW=${originalPreviewFile.absolute}`);
console.log(`ORIGINAL_PREVIEW_SHA256=${originalPreviewFile.file_sha256}`);
console.log(`BRIDGED_PREVIEW=${bridgedPreviewPath}`);
console.log(`PREVIEW_TASK_STATE_SHA256=${expectedPreviewFingerprint}`);
console.log(`LIVE_PREVIEW_FINGERPRINT=${livePreviewFingerprint}`);
console.log(`DISPATCH_TASK_STATE_SHA256=${initialDispatchFingerprint}`);
console.log(`LIVE_DISPATCH_FINGERPRINT=${liveDispatchFingerprint}`);
console.log(`CHECKPOINT_RESUME=${checkpoint ? "YES" : "NO"}`);
console.log("BRIDGE_DATABASE_WRITES_EXECUTED=NO");
console.log("BRIDGE_WALLET_RESERVATIONS_EXECUTED=NO");
console.log("BRIDGE_PROVIDER_CALLS_EXECUTED=NO");
console.log("BRIDGE_STATE_CHANGED=NO");

process.argv[2] = bridgedPreviewPath;
await import("./dispatch-openai-perceptual-repair-sources-approved.mjs");
