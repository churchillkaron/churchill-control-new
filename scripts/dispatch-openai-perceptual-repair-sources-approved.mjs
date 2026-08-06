#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv({ cwd: process.cwd() });
await import("./creative-runtime-bootstrap.mjs");
await import(
  "@/lib/platform/service-runtime/execution/ServiceExecutionCostGuardRuntime"
);
await import(
  "@/lib/creative/execution/runtime/CreativeApprovedProductionTaskCostGuardRuntime"
);

const PREVIEW_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_REPAIR_SOURCE_DISPATCH_MATERIALIZATION_PREVIEW_V1";
const CHECKPOINT_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_REPAIR_SOURCE_DISPATCH_CHECKPOINT_V1";
const REPORT_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_REPAIR_SOURCE_DISPATCH_EXECUTION_V1";

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

function taskState(task = {}) {
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

function providerJobId(task = {}) {
  return text(
    task.output?.provider_job_id ||
      task.output?.provider_submission?.provider_job_id ||
      task.output?.provider_submission?.output?.provider_job_id ||
      task.output?.provider_submission?.output?.output?.provider_job_id,
  ) || null;
}

function usageId(task = {}) {
  return text(
    task.output?.usage?.id ||
      task.output?.provider_submission?.usage?.id,
  ) || null;
}

function dispatchAuthorization(task = {}) {
  return object(task.metadata?.repair_source_dispatch_authorization);
}

function classifySource(task = {}, dispatchContractSha) {
  if (!task?.id) return "MISSING";

  const authorization = dispatchAuthorization(task);
  const authorized =
    authorization.contract ===
      "CREATIVE_PERCEPTUAL_REPAIR_SOURCE_DISPATCH_AUTHORIZATION_V1" &&
    text(authorization.dispatch_contract_sha256) === dispatchContractSha &&
    authorization.provider_spend_authorized === true &&
    authorization.wallet_reservation_authorized === true &&
    authorization.provider_call_authorized === true &&
    authorization.dispatch_authorized === true &&
    authorization.poll_authorized === false &&
    authorization.review_execution_authorized === false &&
    authorization.finalisation_authorized === false &&
    authorization.publication_authorized === false &&
    task.metadata?.provider_spend_authorized === true &&
    task.metadata?.wallet_reservation_authorized === true &&
    task.metadata?.provider_call_authorized === true &&
    task.metadata?.dispatch_authorized === true &&
    task.metadata?.poll_authorized === false &&
    task.metadata?.review_execution_authorized === false;

  const waitingBase =
    text(task.status) === "WAITING" &&
    text(task.provider_id) === "runway" &&
    task.cost?.approved === true &&
    money(task.cost?.estimated) === 5.26032 &&
    Number(task.cost?.actual || 0) === 0 &&
    !task.timing?.started_at &&
    !task.timing?.completed_at &&
    Object.keys(object(task.output)).length === 0 &&
    !text(task.error);

  if (waitingBase && !authorized && task.metadata?.dispatch_authorized !== true) {
    return "READY";
  }
  if (waitingBase && authorized) return "AUTHORIZED_WAITING";

  if (text(task.status) === "RUNNING" && authorized) {
    return providerJobId(task) && usageId(task)
      ? "DISPATCHED_RUNNING"
      : "RUNNING_INCOMPLETE";
  }
  if (text(task.status) === "COMPLETED" && authorized) {
    return usageId(task) ? "DISPATCHED_COMPLETED" : "COMPLETED_INCOMPLETE";
  }
  if (text(task.status) === "FAILED" && authorized) {
    return "DISPATCH_FAILED";
  }
  return "INVALID";
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

const previewFile = readJson(
  process.argv[2],
  "SOURCE_DISPATCH_MATERIALIZATION_PREVIEW",
);
const preview = object(previewFile.value);

const organizationId = text(process.env.ORGANIZATION_ID);
const projectId = text(process.env.CREATIVE_PROJECT_ID);
const graphId = text(process.env.PRODUCTION_GRAPH_ID);
const outputPath = path.resolve(
  text(process.env.OPENAI_PERCEPTUAL_SOURCE_DISPATCH_OUTPUT) ||
    "/tmp/churchill-openai-perceptual-repair-source-dispatch-execution.json",
);
const checkpointPath = path.resolve(
  text(process.env.OPENAI_PERCEPTUAL_SOURCE_DISPATCH_CHECKPOINT) ||
    "/tmp/churchill-openai-perceptual-repair-source-dispatch-checkpoint.json",
);

if (!organizationId || !projectId || !graphId) {
  throw new Error("SOURCE_DISPATCH_SCOPE_REQUIRED");
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
  "DISPATCH_PREVIEW_CONTRACT_INVALID",
);
requireValue(
  text(preview.organization_id) === organizationId &&
    text(preview.creative_project_id) === projectId &&
    text(preview.production_graph_id) === graphId,
  "DISPATCH_PREVIEW_SCOPE_INVALID",
);
requireValue(
  text(preview.decision) ===
    "REPAIR_SOURCE_DISPATCH_MATERIALIZATION_PREVIEW_9_SOURCES_CONFIRMED" &&
    text(preview.readiness) ===
      "READY_FOR_EXPLICIT_REPAIR_SOURCE_DISPATCH_AUTHORIZATION_DESIGN" &&
    list(preview.blockers).length === 0 &&
    preview.state_unchanged === true,
  "DISPATCH_PREVIEW_NOT_READY",
);
requireValue(
  Number(preview.source_task_count) === 9 &&
    Number(preview.review_task_count) === 9 &&
    money(preview.selected_source_cost) === 47.34288 &&
    money(preview.expected_wallet_reservation) === 47.34288 &&
    text(preview.currency) === "THB" &&
    Number(preview.cost_guard_passed_count) === 9 &&
    Number(preview.request_materialized_count) === 9 &&
    Number(preview.identity_ready_count) === 9 &&
    Number(preview.serialized_instruction_count) === 9 &&
    Number(preview.review_dependency_blocked_count) === 9 &&
    list(preview.dispatch_plans).length === 9,
  "DISPATCH_PREVIEW_COUNTS_INVALID",
);
requireValue(
  preview.provider_binding_authorized === true &&
    preview.cost_approval_authorized === true &&
    preview.provider_spend_authorized === false &&
    preview.dispatch_authorized === false &&
    preview.wallet_reservation_authorized === false &&
    preview.provider_call_authorized === false &&
    preview.database_writes_executed === false &&
    preview.wallet_reservations_executed === false &&
    preview.provider_calls_executed === false &&
    preview.provider_polls_executed === false &&
    preview.retries_executed === false &&
    preview.source_regeneration_executed === false &&
    Number(preview.downstream_tasks_updated) === 0 &&
    preview.finalisation_executed === false &&
    preview.publication_executed === false,
  "DISPATCH_PREVIEW_AUTHORIZATION_STATE_INVALID",
);
requireValue(
  preview.prompt_values_exposed === false &&
    preview.image_data_exposed === false &&
    preview.credential_values_exposed === false,
  "DISPATCH_PREVIEW_SECRET_BOUNDARY_INVALID",
);

const dispatchContractSha = text(preview.dispatch_contract_sha256);
requireValue(
  /^[a-f0-9]{64}$/i.test(dispatchContractSha),
  "DISPATCH_CONTRACT_SHA_INVALID",
);
const expectedAuthorization =
  `AUTHORIZE REPAIR SOURCE DISPATCH RUNWAY 9 TASKS MAX 47.342880 THB ${dispatchContractSha}`;
const suppliedAuthorization = text(
  process.env.PAIR_REPAIR_SOURCE_DISPATCH_AUTHORIZATION,
);
const apply = suppliedAuthorization === expectedAuthorization;
if (suppliedAuthorization && !apply) {
  throw new Error("SOURCE_DISPATCH_AUTHORIZATION_INVALID");
}

const before = await exactState({
  supabaseAdmin,
  ProductionTaskRuntime,
  organizationId,
  projectId,
  graphId,
});
const beforeMap = new Map(before.tasks.map((task) => [task.id, task]));
const plans = list(preview.dispatch_plans);
const sourceIds = new Set(plans.map((plan) => text(plan.source_task_id)));
const reviewIds = new Set(plans.map((plan) => text(plan.review_task_id)));
const protectedIds = new Set(
  before.tasks
    .map((task) => task.id)
    .filter((id) => !sourceIds.has(id)),
);
const protectedBefore = taskFingerprint(
  before.tasks.filter((task) => protectedIds.has(task.id)),
);

requireValue(before.task_count === 45, "LIVE_TASK_COUNT_INVALID");
requireValue(sourceIds.size === 9, "SOURCE_ID_COUNT_INVALID");
requireValue(reviewIds.size === 9, "REVIEW_ID_COUNT_INVALID");
requireValue(protectedIds.size === 36, "PROTECTED_TASK_COUNT_INVALID");
requireValue(
  [...sourceIds].every((id) => !reviewIds.has(id)) &&
    [...reviewIds].every((id) => protectedIds.has(id)),
  "SOURCE_REVIEW_SCOPE_INVALID",
);
requireValue(
  before.usage_count === Number(preview.exact_state_before?.usage_count) &&
    before.usage_count === Number(preview.exact_state_after?.usage_count),
  "INITIAL_USAGE_COUNT_CHANGED",
);
requireValue(
  before.wallet_balance === money(preview.exact_state_before?.wallet_balance) &&
    before.wallet_balance === money(preview.exact_state_after?.wallet_balance) &&
    before.wallet_updated_at === preview.exact_state_before?.wallet_updated_at &&
    before.wallet_updated_at === preview.exact_state_after?.wallet_updated_at,
  "INITIAL_WALLET_STATE_CHANGED",
);
requireValue(
  before.wallet_balance >= 47.34288,
  "SOURCE_DISPATCH_WALLET_INSUFFICIENT",
);

let checkpoint = null;
if (fs.existsSync(checkpointPath)) {
  checkpoint = readJson(checkpointPath, "SOURCE_DISPATCH_CHECKPOINT").value;
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
      text(checkpoint.dispatch_contract_sha256) === dispatchContractSha,
    "CHECKPOINT_PREVIEW_LINKAGE_INVALID",
  );
  requireValue(
    Number(checkpoint.initial_task_count) === 45 &&
      Number(checkpoint.initial_usage_count) <= before.usage_count &&
      money(checkpoint.initial_wallet_balance) >= before.wallet_balance,
    "CHECKPOINT_INITIAL_STATE_INVALID",
  );
  const checkpointProtectedIds = new Set(
    list(checkpoint.protected_task_ids).map(text),
  );
  requireValue(
    checkpointProtectedIds.size === 36 &&
      taskFingerprint(
        before.tasks.filter((task) => checkpointProtectedIds.has(task.id)),
      ) === text(checkpoint.protected_task_state_sha256),
    "CHECKPOINT_PROTECTED_STATE_CHANGED",
  );
  requireValue(
    ["IN_PROGRESS", "SUBMITTED", "PARTIAL_FAILURE"].includes(
      text(checkpoint.status),
    ),
    "CHECKPOINT_STATUS_INVALID",
  );
} else {
  requireValue(
    before.task_state_sha256 ===
      text(preview.exact_state_before?.task_state_sha256) &&
      before.task_state_sha256 ===
        text(preview.exact_state_after?.task_state_sha256),
    "INITIAL_TASK_STATE_SHA_MISMATCH",
  );
}

const statesBefore = plans.map((plan) => ({
  source_task_id: text(plan.source_task_id),
  review_task_id: text(plan.review_task_id),
  state: classifySource(
    beforeMap.get(text(plan.source_task_id)),
    dispatchContractSha,
  ),
}));

requireValue(
  statesBefore.every((item) =>
    [
      "READY",
      "AUTHORIZED_WAITING",
      "DISPATCHED_RUNNING",
      "DISPATCHED_COMPLETED",
      "DISPATCH_FAILED",
    ].includes(item.state),
  ),
  "ONE_OR_MORE_SOURCE_STATES_INVALID",
);
if (!checkpoint) {
  requireValue(
    statesBefore.every((item) => item.state === "READY"),
    "CHECKPOINT_REQUIRED_FOR_NONINITIAL_STATE",
  );
}

for (const plan of plans) {
  const source = beforeMap.get(text(plan.source_task_id));
  const review = beforeMap.get(text(plan.review_task_id));
  requireValue(Boolean(source), `SOURCE_MISSING:${plan.source_task_id}`);
  requireValue(Boolean(review), `REVIEW_MISSING:${plan.review_task_id}`);
  if (!source || !review) continue;

  requireValue(
    text(source.provider_id) === "runway" &&
      source.cost?.approved === true &&
      money(source.cost?.estimated) === money(plan.selected_customer_price) &&
      money(plan.selected_customer_price) === 5.26032 &&
      text(source.metadata?.approved_pricing_id) ===
        text(plan.selected_pricing_id),
    `SOURCE_APPROVAL_DRIFT:${source.id}`,
  );
  requireValue(
    text(plan.selected_provider) === "runway" &&
      text(plan.selected_model) === "gen4.5" &&
      plan.cost_guard_passed === true &&
      plan.review_dependency_blocked === true &&
      plan.ready === true &&
      list(plan.issues).length === 0,
    `SOURCE_DISPATCH_PLAN_INVALID:${source.id}`,
  );
  requireValue(
    text(review.status) === "WAITING" &&
      review.provider_id === null &&
      review.cost?.approved === false &&
      list(review.depends_on).length === 1 &&
      text(review.depends_on[0]) === source.id &&
      !review.timing?.started_at &&
      !review.timing?.completed_at &&
      Object.keys(object(review.output)).length === 0,
    `REVIEW_DEPENDENCY_STATE_INVALID:${review.id}`,
  );
}

if (blockers.length) {
  throw new Error(`SOURCE_DISPATCH_BLOCKED:${blockers.join(",")}`);
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
    dispatch_contract_sha256: dispatchContractSha,
    maximum_authorized_spend: 47.34288,
    currency: "THB",
    initial_task_count: before.task_count,
    initial_task_state_sha256: before.task_state_sha256,
    protected_task_ids: [...protectedIds].sort(),
    protected_task_state_sha256: protectedBefore,
    initial_usage_count: before.usage_count,
    initial_wallet_balance: before.wallet_balance,
    initial_wallet_updated_at: before.wallet_updated_at,
    expected_source_task_ids: [...sourceIds].sort(),
    source_records: [],
  };
  writeJson(checkpointPath, checkpoint);
}

function saveCheckpoint(record) {
  if (!checkpoint) return;
  checkpoint.source_records = [
    ...list(checkpoint.source_records).filter(
      (item) => text(item.source_task_id) !== text(record.source_task_id),
    ),
    {
      ...record,
      updated_at: new Date().toISOString(),
    },
  ];
  checkpoint.updated_at = new Date().toISOString();
  writeJson(checkpointPath, checkpoint);
}

let metadataWriteCount = 0;
let dispatchCallCount = 0;
const dispatchedThisRun = [];

if (apply) {
  for (const plan of plans) {
    const sourceTaskId = text(plan.source_task_id);
    let source = await ProductionTaskRuntime.get(sourceTaskId);
    let state = classifySource(source, dispatchContractSha);

    if (state === "READY") {
      const authorization = {
        contract:
          "CREATIVE_PERCEPTUAL_REPAIR_SOURCE_DISPATCH_AUTHORIZATION_V1",
        dispatch_contract_sha256: dispatchContractSha,
        preview_file_sha256: previewFile.file_sha256,
        provider: "runway",
        model: "gen4.5",
        pricing_id: plan.selected_pricing_id,
        maximum_customer_price: money(plan.selected_customer_price),
        currency: "THB",
        provider_spend_authorized: true,
        wallet_reservation_authorized: true,
        provider_call_authorized: true,
        dispatch_authorized: true,
        poll_authorized: false,
        review_execution_authorized: false,
        retry_authorized: false,
        finalisation_authorized: false,
        publication_authorized: false,
      };
      source = await ProductionTaskRuntime.update(sourceTaskId, {
        metadata: {
          ...object(source.metadata),
          repair_source_dispatch_authorization: authorization,
          dispatch_contract_sha256: dispatchContractSha,
          provider_spend_authorized: true,
          wallet_reservation_authorized: true,
          provider_call_authorized: true,
          dispatch_authorized: true,
          poll_authorized: false,
          review_execution_authorized: false,
          retry_authorized: false,
          finalisation_authorized: false,
          publication_authorized: false,
        },
      });
      metadataWriteCount += 1;
      state = classifySource(source, dispatchContractSha);
      if (state !== "AUTHORIZED_WAITING") {
        throw new Error(
          `SOURCE_DISPATCH_AUTHORIZATION_VERIFY_FAILED:${sourceTaskId}:${state}`,
        );
      }
      saveCheckpoint({
        source_task_id: sourceTaskId,
        review_task_id: text(plan.review_task_id),
        state,
        usage_id: null,
        provider_job_id: null,
      });
    }

    if (state === "AUTHORIZED_WAITING") {
      source = await ProductionTaskRuntime.dispatch(sourceTaskId);
      dispatchCallCount += 1;
      state = classifySource(source, dispatchContractSha);
      dispatchedThisRun.push({
        source_task_id: sourceTaskId,
        review_task_id: text(plan.review_task_id),
        state,
        usage_id: usageId(source),
        provider_job_id: providerJobId(source),
        error: text(source.error) || null,
      });
      saveCheckpoint(dispatchedThisRun.at(-1));
    }

    if (
      ![
        "DISPATCHED_RUNNING",
        "DISPATCHED_COMPLETED",
        "DISPATCH_FAILED",
      ].includes(state)
    ) {
      throw new Error(`SOURCE_DISPATCH_FINAL_STATE_INVALID:${sourceTaskId}:${state}`);
    }

    const liveState = await exactState({
      supabaseAdmin,
      ProductionTaskRuntime,
      organizationId,
      projectId,
      graphId,
    });
    const walletDelta = money(
      checkpoint.initial_wallet_balance - liveState.wallet_balance,
    );
    const usageDelta =
      liveState.usage_count - Number(checkpoint.initial_usage_count);
    if (walletDelta < 0 || walletDelta > 47.34288) {
      throw new Error(
        `SOURCE_DISPATCH_WALLET_CEILING_EXCEEDED:${walletDelta}:47.34288`,
      );
    }
    if (usageDelta < 0 || usageDelta > 9) {
      throw new Error(`SOURCE_DISPATCH_USAGE_DELTA_INVALID:${usageDelta}`);
    }
    const protectedNow = taskFingerprint(
      liveState.tasks.filter((task) => protectedIds.has(task.id)),
    );
    if (protectedNow !== protectedBefore) {
      throw new Error("SOURCE_DISPATCH_PROTECTED_TASK_STATE_CHANGED");
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
const statesAfter = plans.map((plan) => ({
  source_task_id: text(plan.source_task_id),
  review_task_id: text(plan.review_task_id),
  state: classifySource(
    afterMap.get(text(plan.source_task_id)),
    dispatchContractSha,
  ),
  usage_id: usageId(afterMap.get(text(plan.source_task_id))),
  provider_job_id: providerJobId(afterMap.get(text(plan.source_task_id))),
  error: text(afterMap.get(text(plan.source_task_id))?.error) || null,
}));
const protectedAfter = taskFingerprint(
  after.tasks.filter((task) => protectedIds.has(task.id)),
);

const readyCount = statesAfter.filter((item) => item.state === "READY").length;
const authorizedWaitingCount = statesAfter.filter(
  (item) => item.state === "AUTHORIZED_WAITING",
).length;
const runningCount = statesAfter.filter(
  (item) => item.state === "DISPATCHED_RUNNING",
).length;
const completedCount = statesAfter.filter(
  (item) => item.state === "DISPATCHED_COMPLETED",
).length;
const failedCount = statesAfter.filter(
  (item) => item.state === "DISPATCH_FAILED",
).length;
const usageDelta = after.usage_count - before.usage_count;
const walletDelta = money(before.wallet_balance - after.wallet_balance);
const checkpointUsageDelta = checkpoint
  ? after.usage_count - Number(checkpoint.initial_usage_count)
  : 0;
const checkpointWalletDelta = checkpoint
  ? money(checkpoint.initial_wallet_balance - after.wallet_balance)
  : 0;

if (protectedAfter !== protectedBefore) {
  blockers.push("PROTECTED_TASK_STATE_CHANGED");
}
if (walletDelta < 0 || walletDelta > 47.34288) {
  blockers.push("WALLET_DELTA_OUTSIDE_AUTHORIZED_RANGE");
}
if (checkpointWalletDelta < 0 || checkpointWalletDelta > 47.34288) {
  blockers.push("CHECKPOINT_WALLET_DELTA_OUTSIDE_AUTHORIZED_RANGE");
}
if (usageDelta < 0 || usageDelta > 9) {
  blockers.push("USAGE_DELTA_OUTSIDE_AUTHORIZED_RANGE");
}
if (checkpointUsageDelta < 0 || checkpointUsageDelta > 9) {
  blockers.push("CHECKPOINT_USAGE_DELTA_OUTSIDE_AUTHORIZED_RANGE");
}
if (apply && readyCount + authorizedWaitingCount > 0) {
  blockers.push("ONE_OR_MORE_SOURCES_NOT_DISPATCHED");
}
if (statesAfter.some((item) =>
  ["MISSING", "INVALID", "RUNNING_INCOMPLETE", "COMPLETED_INCOMPLETE"].includes(
    item.state,
  ))) {
  blockers.push("ONE_OR_MORE_SOURCE_STATES_INVALID_AFTER_EXECUTION");
}

if (apply && checkpoint) {
  checkpoint.updated_at = new Date().toISOString();
  checkpoint.final_task_count = after.task_count;
  checkpoint.final_task_state_sha256 = after.task_state_sha256;
  checkpoint.final_protected_task_state_sha256 = protectedAfter;
  checkpoint.final_usage_count = after.usage_count;
  checkpoint.final_wallet_balance = after.wallet_balance;
  checkpoint.usage_delta = checkpointUsageDelta;
  checkpoint.wallet_delta = checkpointWalletDelta;
  checkpoint.metadata_write_count =
    Number(checkpoint.metadata_write_count || 0) + metadataWriteCount;
  checkpoint.dispatch_call_count =
    Number(checkpoint.dispatch_call_count || 0) + dispatchCallCount;
  checkpoint.source_records = statesAfter.map((item) => ({
    ...item,
    updated_at: checkpoint.updated_at,
  }));
  checkpoint.status = failedCount
    ? "PARTIAL_FAILURE"
    : runningCount + completedCount === 9
      ? "SUBMITTED"
      : "IN_PROGRESS";
  writeJson(checkpointPath, checkpoint);
}

const stateUnchanged =
  before.task_count === after.task_count &&
  before.task_state_sha256 === after.task_state_sha256 &&
  before.usage_count === after.usage_count &&
  before.wallet_balance === after.wallet_balance &&
  before.wallet_updated_at === after.wallet_updated_at;
const decision = !apply
  ? "REPAIR_SOURCE_DISPATCH_DRY_RUN_READY"
  : blockers.length
    ? "REPAIR_SOURCE_DISPATCH_EXECUTION_BLOCKED"
    : failedCount
      ? "REPAIR_SOURCE_DISPATCH_PARTIAL_FAILURE"
      : "REPAIR_SOURCE_DISPATCH_9_SOURCES_SUBMITTED";
const readiness = !apply
  ? "READY_FOR_EXPLICIT_REPAIR_SOURCE_DISPATCH_AUTHORIZATION"
  : blockers.length
    ? "REPAIR_SOURCE_DISPATCH_EXECUTION_BLOCKED"
    : failedCount
      ? "READY_FOR_READ_ONLY_SOURCE_DISPATCH_FAILURE_DIAGNOSIS"
      : "READY_FOR_READ_ONLY_SOURCE_PROVIDER_STATUS_AUDIT";

const report = {
  contract: REPORT_CONTRACT,
  generated_at: new Date().toISOString(),
  organization_id: organizationId,
  creative_project_id: projectId,
  production_graph_id: graphId,
  preview_file: previewFile.absolute,
  preview_file_sha256: previewFile.file_sha256,
  dispatch_contract_sha256: dispatchContractSha,
  expected_dispatch_authorization: expectedAuthorization,
  checkpoint_file: checkpointPath,
  checkpoint_exists: fs.existsSync(checkpointPath),
  checkpoint_status: checkpoint?.status || null,
  apply_mode: apply,
  maximum_authorized_spend: 47.34288,
  currency: "THB",
  source_task_count: sourceIds.size,
  review_task_count: reviewIds.size,
  protected_task_count: protectedIds.size,
  states_before: statesBefore,
  states_after: statesAfter,
  ready_count: readyCount,
  authorized_waiting_count: authorizedWaitingCount,
  running_count: runningCount,
  completed_count: completedCount,
  failed_count: failedCount,
  metadata_write_count: metadataWriteCount,
  dispatch_call_count: dispatchCallCount,
  dispatched_this_run: dispatchedThisRun,
  usage_delta: usageDelta,
  wallet_delta: walletDelta,
  checkpoint_usage_delta: checkpointUsageDelta,
  checkpoint_wallet_delta: checkpointWalletDelta,
  protected_state_sha256_before: protectedBefore,
  protected_state_sha256_after: protectedAfter,
  blockers,
  decision,
  readiness,
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
  provider_binding_authorized: true,
  cost_approval_authorized: true,
  provider_spend_authorized: apply,
  dispatch_authorized: apply,
  wallet_reservation_authorized: apply,
  provider_call_authorized: apply,
  wallet_reservations_executed: apply && dispatchCallCount > 0,
  provider_calls_executed: apply && dispatchCallCount > 0,
  provider_polls_executed: false,
  retries_executed: false,
  review_execution_authorized: false,
  review_execution_executed: false,
  downstream_tasks_updated: 0,
  finalisation_eligible: false,
  finalisation_executed: false,
  publication_executed: false,
};

writeJson(outputPath, report);

console.log("============================================================");
console.log("GUARDED OPENAI PERCEPTUAL REPAIR SOURCE DISPATCH");
console.log("============================================================");
console.log(`OUTPUT=${outputPath}`);
console.log(`APPLY_MODE=${apply ? "YES" : "NO"}`);
console.log(`EXPECTED_DISPATCH_AUTHORIZATION=${expectedAuthorization}`);
console.log(`MAXIMUM_AUTHORIZED_SPEND=47.34288`);
console.log(`CURRENCY=THB`);
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
    `SOURCE_DISPATCH_STATE=${item.source_task_id}`,
    `review=${item.review_task_id}`,
    `before=${beforeItem?.state || ""}`,
    `after=${item.state}`,
    `usage_id=${item.usage_id || ""}`,
    `provider_job_id=${item.provider_job_id || ""}`,
    `error=${item.error || ""}`,
  ].join("|"));
}

console.log(`READY_COUNT=${readyCount}`);
console.log(`AUTHORIZED_WAITING_COUNT=${authorizedWaitingCount}`);
console.log(`RUNNING_COUNT=${runningCount}`);
console.log(`COMPLETED_COUNT=${completedCount}`);
console.log(`FAILED_COUNT=${failedCount}`);
console.log(`METADATA_WRITE_COUNT=${metadataWriteCount}`);
console.log(`DISPATCH_CALL_COUNT=${dispatchCallCount}`);
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
console.log(`USAGE_DELTA=${usageDelta}`);
console.log(`WALLET_BALANCE_BEFORE=${before.wallet_balance}`);
console.log(`WALLET_BALANCE_AFTER=${after.wallet_balance}`);
console.log(`WALLET_DELTA=${walletDelta}`);
console.log(`STATE_UNCHANGED=${stateUnchanged ? "YES" : "NO"}`);
console.log(`DISPATCH_BLOCKERS=${JSON.stringify(blockers)}`);
console.log(`DISPATCH_DECISION=${decision}`);
console.log(`AUDIT_READINESS=${readiness}`);
console.log(`DATABASE_WRITES_EXECUTED=${metadataWriteCount || dispatchCallCount ? "YES" : "NO"}`);
console.log(`PROVIDER_SPEND_AUTHORIZED=${apply ? "YES" : "NO"}`);
console.log(`DISPATCH_AUTHORIZED=${apply ? "YES" : "NO"}`);
console.log(`WALLET_RESERVATION_AUTHORIZED=${apply ? "YES" : "NO"}`);
console.log(`PROVIDER_CALL_AUTHORIZED=${apply ? "YES" : "NO"}`);
console.log(`WALLET_RESERVATIONS_EXECUTED=${apply && dispatchCallCount ? "YES" : "NO"}`);
console.log(`PROVIDER_CALLS_EXECUTED=${apply && dispatchCallCount ? "YES" : "NO"}`);
console.log("PROVIDER_POLLS_EXECUTED=NO");
console.log("RETRIES_EXECUTED=NO");
console.log("REVIEW_EXECUTION_AUTHORIZED=NO");
console.log("REVIEW_EXECUTION_EXECUTED=NO");
console.log("DOWNSTREAM_TASKS_UPDATED=0");
console.log("FINALISATION_ELIGIBLE=NO");
console.log("FINALISATION_EXECUTED=NO");
console.log("PUBLICATION_EXECUTED=NO");
console.log("TERMINAL_REMAINS_OPEN=YES");

if (blockers.length || failedCount > 0) {
  process.exitCode = 2;
}
