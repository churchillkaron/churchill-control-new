#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv({ cwd: process.cwd() });
await import("./creative-runtime-bootstrap.mjs");

const PREVIEW_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_REPAIR_SOURCE_BINDING_COST_APPROVAL_PREVIEW_V2";
const CHECKPOINT_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_REPAIR_SOURCE_BINDING_COST_APPROVAL_CHECKPOINT_V1";
const REPORT_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_REPAIR_SOURCE_BINDING_COST_APPROVAL_APPLY_V1";

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

function mutableProjection(task = {}) {
  return {
    id: task.id,
    provider_id: task.provider_id ?? null,
    input: task.input ?? {},
    cost: task.cost ?? {},
    metadata: task.metadata ?? {},
    status: task.status,
    output: task.output ?? {},
    timing: task.timing ?? {},
    error: task.error ?? null,
  };
}

function mutableSha(task = {}) {
  return sha256(mutableProjection(task));
}

function taskState(task = {}) {
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

function taskFingerprint(tasks = []) {
  return sha256(
    [...tasks]
      .sort((left, right) => text(left.id).localeCompare(text(right.id)))
      .map(taskState),
  );
}

function taskCounts(tasks = []) {
  return tasks.reduce((result, task) => {
    const status = text(task.status) || "UNKNOWN";
    result[status] = Number(result[status] || 0) + 1;
    return result;
  }, {});
}

async function exactState({
  supabaseAdmin,
  ProductionTaskRuntime,
  organizationId,
  projectId,
  graphId,
}) {
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

  return {
    tasks: scopedTasks,
    task_count: scopedTasks.length,
    task_status_counts: taskCounts(scopedTasks),
    task_state_sha256: taskFingerprint(scopedTasks),
    usage_count: Number(usage.count || 0),
    wallet_balance: money(wallet.data?.available_balance),
    wallet_currency: text(wallet.data?.currency) || "THB",
    wallet_updated_at: wallet.data?.updated_at || null,
  };
}

function classify(task, change) {
  if (!task) return "MISSING";
  const live = mutableSha(task);
  if (live === text(change.original_mutable_state_sha256)) return "BEFORE";
  if (live === text(change.binding_state_sha256)) return "BOUND";
  if (live === text(change.final_cumulative_state_sha256)) return "APPROVED";
  return "INVALID";
}

const previewFile = readJson(
  process.argv[2],
  "CUMULATIVE_BINDING_COST_PREVIEW",
);
const preview = object(previewFile.value);

const organizationId = text(process.env.ORGANIZATION_ID);
const projectId = text(process.env.CREATIVE_PROJECT_ID);
const graphId = text(process.env.PRODUCTION_GRAPH_ID);
const outputPath = path.resolve(
  text(process.env.OPENAI_PERCEPTUAL_SOURCE_BINDING_COST_APPLY_OUTPUT) ||
    "/tmp/churchill-openai-perceptual-repair-source-binding-cost-approval-apply.json",
);
const checkpointPath = path.resolve(
  text(process.env.OPENAI_PERCEPTUAL_SOURCE_BINDING_COST_CHECKPOINT) ||
    "/tmp/churchill-openai-perceptual-repair-source-binding-cost-approval-checkpoint.json",
);

if (!organizationId || !projectId || !graphId) {
  throw new Error("SOURCE_BINDING_COST_APPLY_SCOPE_REQUIRED");
}

const [
  { supabaseAdmin },
  { ProductionTaskRuntime },
] = await Promise.all([
  import("@/lib/shared/supabase/admin"),
  import("@/lib/operations/tasks/runtime/ProductionTaskRuntime"),
]);

const blockers = [];
const requireValue = (condition, label) => {
  if (!condition) blockers.push(label);
};

requireValue(
  text(preview.contract) === PREVIEW_CONTRACT,
  "CUMULATIVE_PREVIEW_CONTRACT_INVALID",
);
requireValue(
  text(preview.organization_id) === organizationId &&
    text(preview.creative_project_id) === projectId &&
    text(preview.production_graph_id) === graphId,
  "CUMULATIVE_PREVIEW_SCOPE_INVALID",
);
requireValue(
  text(preview.decision) ===
    "REPAIR_SOURCE_CUMULATIVE_BINDING_COST_PREVIEW_9_SOURCES_CONFIRMED" &&
    text(preview.readiness) ===
      "READY_FOR_CHECKPOINTED_BINDING_COST_APPROVAL_DRY_RUN_DESIGN" &&
    list(preview.blockers).length === 0 &&
    preview.state_unchanged === true,
  "CUMULATIVE_PREVIEW_NOT_READY",
);
requireValue(
  Number(preview.source_task_count) === 9 &&
    Number(preview.review_task_count) === 9 &&
    Number(preview.proposed_binding_write_count) === 9 &&
    Number(preview.proposed_cost_approval_write_count) === 9 &&
    Number(preview.proposed_total_write_count) === 18 &&
    list(preview.corrected_changes).length === 9,
  "CUMULATIVE_PREVIEW_COUNTS_INVALID",
);
requireValue(
  money(preview.proposed_exact_customer_price) === 47.34288 &&
    money(preview.original_task_cost_ceiling) === 208.187686 &&
    text(preview.currency) === "THB",
  "CUMULATIVE_PREVIEW_COST_INVALID",
);
requireValue(
  preview.existing_sealed_cost_guard_compatible === true &&
    preview.dedicated_repair_cost_guard_required === false,
  "CUMULATIVE_PREVIEW_COST_GUARD_INVALID",
);
requireValue(
  preview.provider_binding_authorized === false &&
    preview.cost_approval_authorized === false &&
    preview.provider_spend_authorized === false &&
    preview.dispatch_authorized === false &&
    preview.database_writes_executed === false &&
    preview.wallet_reservations_executed === false &&
    preview.provider_calls_executed === false,
  "CUMULATIVE_PREVIEW_ALREADY_AUTHORIZED",
);

const expectedBindingAuthorization = text(
  preview.expected_provider_binding_authorization,
);
const expectedCostAuthorization = text(
  preview.expected_cost_approval_authorization,
);
const suppliedBindingAuthorization = text(
  process.env.PAIR_REPAIR_SOURCE_PROVIDER_BINDING_AUTHORIZATION,
);
const suppliedCostAuthorization = text(
  process.env.PAIR_REPAIR_SOURCE_COST_APPROVAL_AUTHORIZATION,
);
const anyAuthorization = Boolean(
  suppliedBindingAuthorization || suppliedCostAuthorization,
);
const bothAuthorizations = Boolean(
  suppliedBindingAuthorization && suppliedCostAuthorization,
);
const apply =
  suppliedBindingAuthorization === expectedBindingAuthorization &&
  suppliedCostAuthorization === expectedCostAuthorization;

if (anyAuthorization && !bothAuthorizations) {
  throw new Error("BOTH_SOURCE_BINDING_AND_COST_AUTHORIZATIONS_REQUIRED");
}
if (bothAuthorizations && !apply) {
  throw new Error("SOURCE_BINDING_OR_COST_AUTHORIZATION_INVALID");
}

const before = await exactState({
  supabaseAdmin,
  ProductionTaskRuntime,
  organizationId,
  projectId,
  graphId,
});
const beforeMap = new Map(before.tasks.map((task) => [task.id, task]));
const changes = list(preview.corrected_changes);
const sourceIds = new Set(changes.map((change) => text(change.source_task_id)));
const reviewIds = new Set(changes.map((change) => text(change.review_task_id)));
const protectedIds = new Set(
  before.tasks
    .map((task) => task.id)
    .filter((id) => !sourceIds.has(id)),
);
const protectedBefore = taskFingerprint(
  before.tasks.filter((task) => protectedIds.has(task.id)),
);

requireValue(before.task_count === 45, "LIVE_TASK_COUNT_INVALID");
requireValue(sourceIds.size === 9, "LIVE_SOURCE_ID_COUNT_INVALID");
requireValue(reviewIds.size === 9, "LIVE_REVIEW_ID_COUNT_INVALID");
requireValue(protectedIds.size === 36, "PROTECTED_TASK_COUNT_INVALID");
requireValue(
  [...sourceIds].every((id) => !reviewIds.has(id)),
  "SOURCE_REVIEW_SCOPE_OVERLAP_INVALID",
);
requireValue(
  before.usage_count === Number(preview.exact_state_before?.usage_count) &&
    before.wallet_balance === money(preview.exact_state_before?.wallet_balance) &&
    before.wallet_updated_at === preview.exact_state_before?.wallet_updated_at,
  "LIVE_ACCOUNTING_STATE_CHANGED",
);

let checkpoint = null;
if (fs.existsSync(checkpointPath)) {
  checkpoint = readJson(checkpointPath, "SOURCE_BINDING_COST_CHECKPOINT").value;
  requireValue(
    text(checkpoint.contract) === CHECKPOINT_CONTRACT,
    "CHECKPOINT_CONTRACT_INVALID",
  );
  requireValue(
    text(checkpoint.organization_id) === organizationId &&
      text(checkpoint.creative_project_id) === projectId &&
      text(checkpoint.production_graph_id) === graphId,
    "CHECKPOINT_SCOPE_INVALID",
  );
  requireValue(
    text(checkpoint.preview_file_sha256) === previewFile.file_sha256 &&
      text(checkpoint.corrected_changeset_sha256) ===
        text(preview.corrected_changeset_sha256),
    "CHECKPOINT_PREVIEW_LINKAGE_INVALID",
  );
  requireValue(
    Number(checkpoint.initial_usage_count) === before.usage_count &&
      money(checkpoint.initial_wallet_balance) === before.wallet_balance &&
      checkpoint.initial_wallet_updated_at === before.wallet_updated_at,
    "CHECKPOINT_ACCOUNTING_STATE_CHANGED",
  );
  requireValue(
    list(checkpoint.protected_task_ids).length === 36 &&
      taskFingerprint(
        before.tasks.filter((task) =>
          new Set(list(checkpoint.protected_task_ids).map(text)).has(task.id),
        ),
      ) === text(checkpoint.protected_task_state_sha256),
    "CHECKPOINT_PROTECTED_STATE_CHANGED",
  );
  requireValue(
    ["IN_PROGRESS", "COMPLETED"].includes(text(checkpoint.status)),
    "CHECKPOINT_STATUS_INVALID",
  );
} else {
  requireValue(
    before.task_state_sha256 ===
      text(preview.exact_state_before?.task_state_sha256) &&
      before.task_state_sha256 ===
        text(preview.exact_state_after?.task_state_sha256),
    "INITIAL_LIVE_TASK_STATE_SHA_MISMATCH",
  );
}

const statesBefore = changes.map((change) => ({
  source_task_id: text(change.source_task_id),
  review_task_id: text(change.review_task_id),
  state: classify(beforeMap.get(text(change.source_task_id)), change),
}));

requireValue(
  statesBefore.every((item) =>
    ["BEFORE", "BOUND", "APPROVED"].includes(item.state),
  ),
  "ONE_OR_MORE_SOURCE_STATES_INVALID",
);
if (!checkpoint) {
  requireValue(
    statesBefore.every((item) => item.state === "BEFORE"),
    "CHECKPOINT_REQUIRED_FOR_PARTIAL_STATE",
  );
}
if (checkpoint?.status === "COMPLETED") {
  requireValue(
    statesBefore.every((item) => item.state === "APPROVED"),
    "COMPLETED_CHECKPOINT_LIVE_STATE_INVALID",
  );
}

if (blockers.length) {
  throw new Error(`SOURCE_BINDING_COST_APPLY_BLOCKED:${blockers.join(",")}`);
}

if (apply && !checkpoint) {
  const now = new Date().toISOString();
  checkpoint = {
    contract: CHECKPOINT_CONTRACT,
    status: "IN_PROGRESS",
    created_at: now,
    updated_at: now,
    organization_id: organizationId,
    creative_project_id: projectId,
    production_graph_id: graphId,
    preview_file: previewFile.absolute,
    preview_file_sha256: previewFile.file_sha256,
    corrected_changeset_sha256: preview.corrected_changeset_sha256,
    initial_task_count: before.task_count,
    initial_task_state_sha256: before.task_state_sha256,
    protected_task_ids: [...protectedIds].sort(),
    protected_task_state_sha256: protectedBefore,
    initial_usage_count: before.usage_count,
    initial_wallet_balance: before.wallet_balance,
    initial_wallet_updated_at: before.wallet_updated_at,
    expected_source_task_ids: [...sourceIds].sort(),
    completed_sources: [],
  };
  writeJson(checkpointPath, checkpoint);
}

function saveCheckpoint(sourceTaskId, state) {
  if (!checkpoint) return;
  checkpoint.completed_sources = [
    ...list(checkpoint.completed_sources).filter(
      (item) => text(item.source_task_id) !== sourceTaskId,
    ),
    {
      source_task_id: sourceTaskId,
      state,
      updated_at: new Date().toISOString(),
    },
  ];
  checkpoint.updated_at = new Date().toISOString();
  writeJson(checkpointPath, checkpoint);
}

let databaseWrites = 0;

if (apply && checkpoint?.status !== "COMPLETED") {
  for (const change of changes) {
    const sourceTaskId = text(change.source_task_id);
    let live = await ProductionTaskRuntime.get(sourceTaskId);
    let state = classify(live, change);

    if (state === "BEFORE") {
      await ProductionTaskRuntime.update(
        sourceTaskId,
        change.provider_binding_patch,
      );
      databaseWrites += 1;
      live = await ProductionTaskRuntime.get(sourceTaskId);
      state = classify(live, change);
      if (state !== "BOUND") {
        throw new Error(
          `SOURCE_PROVIDER_BINDING_VERIFY_FAILED:${sourceTaskId}:${state}`,
        );
      }
      saveCheckpoint(sourceTaskId, "BOUND");
    }

    if (state === "BOUND") {
      await ProductionTaskRuntime.update(
        sourceTaskId,
        change.corrected_cost_approval_patch,
      );
      databaseWrites += 1;
      live = await ProductionTaskRuntime.get(sourceTaskId);
      state = classify(live, change);
      if (state !== "APPROVED") {
        throw new Error(
          `SOURCE_COST_APPROVAL_VERIFY_FAILED:${sourceTaskId}:${state}`,
        );
      }
      saveCheckpoint(sourceTaskId, "APPROVED");
    }

    if (state !== "APPROVED") {
      throw new Error(
        `SOURCE_BINDING_COST_FINAL_STATE_INVALID:${sourceTaskId}:${state}`,
      );
    }
  }
}

const after = await exactState({
  supabaseAdmin,
  ProductionTaskRuntime,
  organizationId,
  projectId,
  graphId,
});
const afterMap = new Map(after.tasks.map((task) => [task.id, task]));
const statesAfter = changes.map((change) => ({
  source_task_id: text(change.source_task_id),
  review_task_id: text(change.review_task_id),
  state: classify(afterMap.get(text(change.source_task_id)), change),
}));
const protectedAfter = taskFingerprint(
  after.tasks.filter((task) => protectedIds.has(task.id)),
);

const sourceTasks = after.tasks.filter((task) => sourceIds.has(task.id));
const providerBoundCount = sourceTasks.filter(
  (task) => text(task.provider_id) === "runway",
).length;
const costApprovedCount = sourceTasks.filter(
  (task) => task.cost?.approved === true,
).length;
const approvedEstimatedCost = money(
  sourceTasks.reduce(
    (sum, task) => sum + Number(task.cost?.estimated || 0),
    0,
  ),
);
const startedCount = sourceTasks.filter(
  (task) => task.timing?.started_at || task.timing?.completed_at,
).length;
const outputPresentCount = sourceTasks.filter(
  (task) => Object.keys(object(task.output)).length !== 0,
).length;

if (apply) {
  if (!statesAfter.every((item) => item.state === "APPROVED")) {
    throw new Error("FINAL_SOURCE_APPROVAL_STATE_INVALID");
  }
  if (
    providerBoundCount !== 9 ||
    costApprovedCount !== 9 ||
    approvedEstimatedCost !== 47.34288
  ) {
    throw new Error("FINAL_SOURCE_BINDING_COST_COUNTS_INVALID");
  }
  if (startedCount !== 0 || outputPresentCount !== 0) {
    throw new Error("FINAL_SOURCE_EXECUTION_STATE_CHANGED");
  }
  if (protectedAfter !== protectedBefore) {
    throw new Error("FINAL_PROTECTED_TASK_STATE_CHANGED");
  }
  if (
    after.usage_count !== before.usage_count ||
    after.wallet_balance !== before.wallet_balance ||
    after.wallet_updated_at !== before.wallet_updated_at
  ) {
    throw new Error("FINAL_ACCOUNTING_STATE_CHANGED");
  }

  checkpoint.status = "COMPLETED";
  checkpoint.updated_at = new Date().toISOString();
  checkpoint.completed_at = checkpoint.updated_at;
  checkpoint.final_task_count = after.task_count;
  checkpoint.final_task_state_sha256 = after.task_state_sha256;
  checkpoint.final_protected_task_state_sha256 = protectedAfter;
  checkpoint.database_write_count = databaseWrites;
  checkpoint.completed_sources = statesAfter.map((item) => ({
    source_task_id: item.source_task_id,
    state: item.state,
    updated_at: checkpoint.updated_at,
  }));
  writeJson(checkpointPath, checkpoint);
}

const stateUnchanged =
  before.task_count === after.task_count &&
  before.task_state_sha256 === after.task_state_sha256 &&
  before.usage_count === after.usage_count &&
  before.wallet_balance === after.wallet_balance &&
  before.wallet_updated_at === after.wallet_updated_at;
const decision = apply
  ? "REPAIR_SOURCE_BINDING_COST_APPROVAL_9_SOURCES_APPLIED"
  : "REPAIR_SOURCE_BINDING_COST_APPROVAL_DRY_RUN_READY";
const readiness = apply
  ? "READY_FOR_POST_BINDING_COST_APPROVAL_AUDIT"
  : "READY_FOR_EXPLICIT_BINDING_AND_COST_APPROVAL_AUTHORIZATION";

const report = {
  contract: REPORT_CONTRACT,
  generated_at: new Date().toISOString(),
  organization_id: organizationId,
  creative_project_id: projectId,
  production_graph_id: graphId,
  preview_file: previewFile.absolute,
  preview_file_sha256: previewFile.file_sha256,
  corrected_changeset_sha256: preview.corrected_changeset_sha256,
  checkpoint_file: checkpointPath,
  checkpoint_exists: fs.existsSync(checkpointPath),
  checkpoint_status: checkpoint?.status || null,
  apply_mode: apply,
  expected_provider_binding_authorization:
    expectedBindingAuthorization,
  expected_cost_approval_authorization:
    expectedCostAuthorization,
  source_task_count: sourceIds.size,
  review_task_count: reviewIds.size,
  protected_task_count: protectedIds.size,
  states_before: statesBefore,
  states_after: statesAfter,
  provider_bound_count: providerBoundCount,
  cost_approved_count: costApprovedCount,
  approved_estimated_cost: approvedEstimatedCost,
  source_started_count: startedCount,
  source_output_present_count: outputPresentCount,
  database_write_count: databaseWrites,
  protected_state_sha256_before: protectedBefore,
  protected_state_sha256_after: protectedAfter,
  exact_state_before: {
    task_count: before.task_count,
    task_status_counts: before.task_status_counts,
    task_state_sha256: before.task_state_sha256,
    usage_count: before.usage_count,
    wallet_balance: before.wallet_balance,
    wallet_updated_at: before.wallet_updated_at,
  },
  exact_state_after: {
    task_count: after.task_count,
    task_status_counts: after.task_status_counts,
    task_state_sha256: after.task_state_sha256,
    usage_count: after.usage_count,
    wallet_balance: after.wallet_balance,
    wallet_updated_at: after.wallet_updated_at,
  },
  state_unchanged: stateUnchanged,
  provider_binding_authorized: apply,
  cost_approval_authorized: apply,
  provider_spend_authorized: false,
  dispatch_authorized: false,
  wallet_reservations_executed: false,
  provider_calls_executed: false,
  provider_polls_executed: false,
  retries_executed: false,
  source_regeneration_executed: false,
  downstream_tasks_updated: 0,
  finalisation_eligible: false,
  finalisation_executed: false,
  publication_executed: false,
  decision,
  readiness,
};

writeJson(outputPath, report);

console.log("============================================================");
console.log("GUARDED REPAIR SOURCE PROVIDER BINDING / COST APPROVAL");
console.log("============================================================");
console.log(`OUTPUT=${outputPath}`);
console.log(`APPLY_MODE=${apply ? "YES" : "NO"}`);
console.log(
  `EXPECTED_PROVIDER_BINDING_AUTHORIZATION=${expectedBindingAuthorization}`,
);
console.log(
  `EXPECTED_COST_APPROVAL_AUTHORIZATION=${expectedCostAuthorization}`,
);
console.log(`CHECKPOINT_PATH=${checkpointPath}`);
console.log(`CHECKPOINT_EXISTS=${fs.existsSync(checkpointPath) ? "YES" : "NO"}`);
console.log(`CHECKPOINT_STATUS=${checkpoint?.status || "NONE"}`);
console.log(`SOURCE_TASK_COUNT=${sourceIds.size}`);
console.log(`REVIEW_TASK_COUNT=${reviewIds.size}`);
console.log(`PROTECTED_TASK_COUNT=${protectedIds.size}`);

for (const item of statesAfter) {
  const beforeItem = statesBefore.find(
    (candidate) => candidate.source_task_id === item.source_task_id,
  );
  console.log([
    `SOURCE_APPROVAL_STATE=${item.source_task_id}`,
    `review=${item.review_task_id}`,
    `before=${beforeItem?.state || ""}`,
    `after=${item.state}`,
  ].join("|"));
}

console.log(`PROVIDER_BOUND_COUNT=${providerBoundCount}`);
console.log(`COST_APPROVED_COUNT=${costApprovedCount}`);
console.log(`APPROVED_ESTIMATED_COST=${approvedEstimatedCost}`);
console.log(`SOURCE_STARTED_COUNT=${startedCount}`);
console.log(`SOURCE_OUTPUT_PRESENT_COUNT=${outputPresentCount}`);
console.log(`DATABASE_WRITE_COUNT=${databaseWrites}`);
console.log(`TASK_COUNT_BEFORE=${before.task_count}`);
console.log(`TASK_COUNT_AFTER=${after.task_count}`);
console.log(`TASK_STATUS_COUNTS_BEFORE=${JSON.stringify(before.task_status_counts)}`);
console.log(`TASK_STATUS_COUNTS_AFTER=${JSON.stringify(after.task_status_counts)}`);
console.log(`TASK_STATE_SHA256_BEFORE=${before.task_state_sha256}`);
console.log(`TASK_STATE_SHA256_AFTER=${after.task_state_sha256}`);
console.log(`PROTECTED_STATE_SHA256_BEFORE=${protectedBefore}`);
console.log(`PROTECTED_STATE_SHA256_AFTER=${protectedAfter}`);
console.log(`USAGE_COUNT_BEFORE=${before.usage_count}`);
console.log(`USAGE_COUNT_AFTER=${after.usage_count}`);
console.log(`WALLET_BALANCE_BEFORE=${before.wallet_balance}`);
console.log(`WALLET_BALANCE_AFTER=${after.wallet_balance}`);
console.log(`STATE_UNCHANGED=${stateUnchanged ? "YES" : "NO"}`);
console.log(`APPLY_DECISION=${decision}`);
console.log(`AUDIT_READINESS=${readiness}`);
console.log(`DATABASE_WRITES_EXECUTED=${databaseWrites ? "YES" : "NO"}`);
console.log(`PROVIDER_BINDING_AUTHORIZED=${apply ? "YES" : "NO"}`);
console.log(`COST_APPROVAL_AUTHORIZED=${apply ? "YES" : "NO"}`);
console.log("PROVIDER_SPEND_AUTHORIZED=NO");
console.log("DISPATCH_AUTHORIZED=NO");
console.log("WALLET_RESERVATIONS_EXECUTED=NO");
console.log("PROVIDER_CALLS_EXECUTED=NO");
console.log("PROVIDER_POLLS_EXECUTED=NO");
console.log("RETRIES_EXECUTED=NO");
console.log("SOURCE_REGENERATION_EXECUTED=NO");
console.log("DOWNSTREAM_TASKS_UPDATED=0");
console.log("FINALISATION_ELIGIBLE=NO");
console.log("FINALISATION_EXECUTED=NO");
console.log("PUBLICATION_EXECUTED=NO");
console.log("TERMINAL_REMAINS_OPEN=YES");
