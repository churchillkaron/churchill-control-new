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
const REPORT_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_REPAIR_ACTIVE_DOSSIER_TASK_SET_AUDIT_V1";
const DISPATCH_AUTHORIZATION_CONTRACT =
  "CREATIVE_PERCEPTUAL_REPAIR_SOURCE_DISPATCH_AUTHORIZATION_V1";

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

function plannedCost(tasks = []) {
  return money(
    tasks.reduce(
      (sum, task) => sum + Math.max(0, Number(task.cost?.estimated || 0)),
      0,
    ),
  );
}

function supersessionReference(task = {}) {
  const sourceReplacement = text(task.metadata?.superseded_by_repair_task_id);
  const reviewReplacement = text(
    task.metadata?.superseded_by_repair_review_task_id,
  );
  if (sourceReplacement && reviewReplacement) {
    return {
      kind: "AMBIGUOUS",
      replacement_task_id: null,
    };
  }
  if (sourceReplacement) {
    return {
      kind: "SOURCE",
      replacement_task_id: sourceReplacement,
    };
  }
  if (reviewReplacement) {
    return {
      kind: "REVIEW",
      replacement_task_id: reviewReplacement,
    };
  }
  return null;
}

function validateSupersession(task, taskMap) {
  const reference = supersessionReference(task);
  if (!reference) {
    return {
      superseded: false,
      valid: false,
      kind: null,
      replacement_task_id: null,
      issues: [],
    };
  }

  const issues = [];
  const replacement = reference.replacement_task_id
    ? taskMap.get(reference.replacement_task_id)
    : null;

  if (reference.kind === "AMBIGUOUS") {
    issues.push("MULTIPLE_SUPERSESSION_REFERENCES");
  }
  if (!replacement) {
    issues.push("REPLACEMENT_TASK_MISSING");
  }
  if (text(task.status) !== "FAILED") {
    issues.push(`SUPERSEDED_TASK_STATUS_INVALID:${task.status}`);
  }
  if (replacement) {
    for (const key of [
      "organization_id",
      "creative_project_id",
      "production_graph_id",
    ]) {
      if (text(task[key]) !== text(replacement[key])) {
        issues.push(`REPLACEMENT_SCOPE_MISMATCH:${key}`);
      }
    }
    if (
      replacement.metadata?.pair_aware_repair !== true ||
      replacement.metadata?.generated_media_perceptual_pair_repair !== true
    ) {
      issues.push("REPLACEMENT_PAIR_REPAIR_CONTRACT_MISSING");
    }
    if (
      text(task.metadata?.repair_identity) &&
      text(task.metadata?.repair_identity) !==
        text(replacement.metadata?.repair_identity)
    ) {
      issues.push("REPAIR_IDENTITY_MISMATCH");
    }
    if (
      Number(task.metadata?.repair_attempt || 0) > 0 &&
      Number(task.metadata?.repair_attempt) !==
        Number(replacement.metadata?.repair_attempt)
    ) {
      issues.push("REPAIR_ATTEMPT_MISMATCH");
    }
    if (reference.kind === "SOURCE") {
      if (text(replacement.metadata?.repair_of_task_id) !== text(task.id)) {
        issues.push("SOURCE_REPLACEMENT_BACK_REFERENCE_INVALID");
      }
      if (
        text(replacement.metadata?.repair_payload_contract) !==
        "GENERATED_MEDIA_PERCEPTUAL_REPLACEMENT_SOURCE_V1"
      ) {
        issues.push("SOURCE_REPLACEMENT_PAYLOAD_CONTRACT_INVALID");
      }
    }
    if (reference.kind === "REVIEW") {
      if (
        text(replacement.metadata?.repair_review_of_task_id) !== text(task.id)
      ) {
        issues.push("REVIEW_REPLACEMENT_BACK_REFERENCE_INVALID");
      }
      if (
        text(replacement.metadata?.repair_payload_contract) !==
        "GENERATED_MEDIA_PERCEPTUAL_REPLACEMENT_REVIEW_V1"
      ) {
        issues.push("REVIEW_REPLACEMENT_PAYLOAD_CONTRACT_INVALID");
      }
      if (list(replacement.depends_on).length !== 1) {
        issues.push("REVIEW_REPLACEMENT_DEPENDENCY_COUNT_INVALID");
      }
    }
  }

  return {
    superseded: true,
    valid: issues.length === 0,
    kind: reference.kind,
    replacement_task_id: reference.replacement_task_id,
    replacement_status: replacement?.status || null,
    issues,
  };
}

function classifySource(task = {}, dispatchContractSha) {
  const authorization = object(
    task.metadata?.repair_source_dispatch_authorization,
  );
  const authorized =
    authorization.contract === DISPATCH_AUTHORIZATION_CONTRACT &&
    text(authorization.dispatch_contract_sha256) === dispatchContractSha &&
    authorization.provider_spend_authorized === true &&
    authorization.wallet_reservation_authorized === true &&
    authorization.provider_call_authorized === true &&
    authorization.dispatch_authorized === true &&
    authorization.poll_authorized === false &&
    authorization.review_execution_authorized === false &&
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

  if (waitingBase && authorized) return "AUTHORIZED_WAITING";
  if (waitingBase && !authorized && task.metadata?.dispatch_authorized !== true) {
    return "READY";
  }
  if (text(task.status) === "RUNNING") return "RUNNING";
  if (text(task.status) === "COMPLETED") return "COMPLETED";
  if (text(task.status) === "FAILED") return "FAILED";
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
  "BRIDGED_SOURCE_DISPATCH_PREVIEW",
);
const checkpointFile = readJson(
  process.argv[3],
  "SOURCE_DISPATCH_CHECKPOINT",
);
const preview = object(previewFile.value);
const checkpoint = object(checkpointFile.value);

const organizationId = text(process.env.ORGANIZATION_ID);
const projectId = text(process.env.CREATIVE_PROJECT_ID);
const graphId = text(process.env.PRODUCTION_GRAPH_ID);
const outputPath = path.resolve(
  text(process.env.OPENAI_PERCEPTUAL_ACTIVE_DOSSIER_TASK_SET_AUDIT_OUTPUT) ||
    "/tmp/churchill-openai-perceptual-repair-active-dossier-task-set-audit.json",
);

if (!organizationId || !projectId || !graphId) {
  throw new Error("ACTIVE_DOSSIER_TASK_SET_AUDIT_SCOPE_REQUIRED");
}

const [
  { supabaseAdmin },
  { ProductionTaskRuntime },
  { ProductionGraphRuntime },
] = await Promise.all([
  import("@/lib/shared/supabase/admin"),
  import("@/lib/operations/tasks/runtime/ProductionTaskRuntime"),
  import("@/lib/creative/production-graph/runtime/ProductionGraphRuntime"),
]);

const blockers = [];
const requireValue = (condition, label) => {
  if (!condition) blockers.push(label);
};

requireValue(
  text(preview.contract) === PREVIEW_CONTRACT,
  "BRIDGED_PREVIEW_CONTRACT_INVALID",
);
requireValue(
  text(checkpoint.contract) === CHECKPOINT_CONTRACT,
  "CHECKPOINT_CONTRACT_INVALID",
);
for (const [label, value] of [
  ["PREVIEW", preview],
  ["CHECKPOINT", checkpoint],
]) {
  requireValue(
    text(value.organization_id) === organizationId &&
      text(value.creative_project_id) === projectId &&
      text(value.production_graph_id) === graphId,
    `${label}_SCOPE_INVALID`,
  );
}
requireValue(
  text(checkpoint.preview_file_sha256) === previewFile.file_sha256,
  "CHECKPOINT_PREVIEW_FILE_SHA_MISMATCH",
);
requireValue(
  text(checkpoint.dispatch_contract_sha256) ===
    text(preview.dispatch_contract_sha256),
  "CHECKPOINT_DISPATCH_CONTRACT_SHA_MISMATCH",
);
requireValue(
  text(checkpoint.status) === "IN_PROGRESS" &&
    list(checkpoint.source_records).length === 1,
  "CHECKPOINT_PARTIAL_STATE_INVALID",
);
requireValue(
  Number(checkpoint.initial_task_count) === 45 &&
    Number(checkpoint.initial_usage_count) === 2658 &&
    money(checkpoint.initial_wallet_balance) === 9300.972022 &&
    money(checkpoint.maximum_authorized_spend) === 47.34288 &&
    text(checkpoint.currency) === "THB",
  "CHECKPOINT_INITIAL_CONTRACT_INVALID",
);

const before = await exactState({
  supabaseAdmin,
  ProductionTaskRuntime,
  organizationId,
  projectId,
  graphId,
});
const graph = await ProductionGraphRuntime.get(graphId);
const taskMap = new Map(before.tasks.map((task) => [task.id, task]));

requireValue(Boolean(graph), "PRODUCTION_GRAPH_MISSING");
requireValue(before.task_count === 45, "HISTORICAL_TASK_COUNT_INVALID");
requireValue(
  Number(before.task_status_counts.COMPLETED || 0) === 9 &&
    Number(before.task_status_counts.WAITING || 0) === 18 &&
    Number(before.task_status_counts.FAILED || 0) === 18,
  "HISTORICAL_TASK_STATUS_COUNTS_INVALID",
);
requireValue(
  before.usage_count === Number(checkpoint.initial_usage_count),
  "USAGE_CHANGED_DURING_FAILED_DISPATCH",
);
requireValue(
  before.wallet_balance === money(checkpoint.initial_wallet_balance) &&
    before.wallet_updated_at === checkpoint.initial_wallet_updated_at,
  "WALLET_CHANGED_DURING_FAILED_DISPATCH",
);

const supersessionAudits = before.tasks
  .map((task) => ({
    task_id: task.id,
    task_status: task.status,
    ...validateSupersession(task, taskMap),
  }))
  .filter((item) => item.superseded);
const validSupersededIds = new Set(
  supersessionAudits
    .filter((item) => item.valid)
    .map((item) => item.task_id),
);
const invalidSupersessionAudits = supersessionAudits.filter(
  (item) => !item.valid,
);
const activeTasks = before.tasks.filter(
  (task) => !validSupersededIds.has(task.id),
);
const activeTaskStatusCounts = taskCounts(activeTasks);
const activeTaskStateSha = taskFingerprint(activeTasks);
const historicalPlannedCost = plannedCost(before.tasks);
const activePlannedCost = plannedCost(activeTasks);
const sourceSupersededCount = supersessionAudits.filter(
  (item) => item.valid && item.kind === "SOURCE",
).length;
const reviewSupersededCount = supersessionAudits.filter(
  (item) => item.valid && item.kind === "REVIEW",
).length;

const expectedTaskCount = Number(graph?.metadata?.task_count || 0);
const approval = object(graph?.metadata?.production_approval_contract);
const approvedCeiling = money(
  approval.maximum_customer_price || graph?.cost_plan?.maximum_customer_price,
);

requireValue(
  supersessionAudits.length === 18,
  "SUPERSESSION_REFERENCE_COUNT_INVALID",
);
requireValue(
  validSupersededIds.size === 18,
  "VALID_SUPERSEDED_TASK_COUNT_INVALID",
);
requireValue(
  invalidSupersessionAudits.length === 0,
  "INVALID_SUPERSESSION_REFERENCE_PRESENT",
);
requireValue(
  sourceSupersededCount === 9 && reviewSupersededCount === 9,
  "SUPERSEDED_PAIR_TYPE_COUNTS_INVALID",
);
requireValue(activeTasks.length === 27, "ACTIVE_TASK_COUNT_INVALID");
requireValue(
  expectedTaskCount === 27 && activeTasks.length === expectedTaskCount,
  "ACTIVE_TASK_COUNT_DOES_NOT_MATCH_GRAPH",
);
requireValue(
  Number(activeTaskStatusCounts.COMPLETED || 0) === 9 &&
    Number(activeTaskStatusCounts.WAITING || 0) === 18 &&
    Number(activeTaskStatusCounts.FAILED || 0) === 0,
  "ACTIVE_TASK_STATUS_COUNTS_INVALID",
);
requireValue(
  approval.contract === "CREATIVE_SEALED_PRODUCTION_EXECUTION_APPROVAL_V1" &&
    approval.production_authorized === true &&
    approval.publication_authorized === false &&
    approvedCeiling > 0,
  "SEALED_GRAPH_APPROVAL_INVALID",
);
requireValue(
  activePlannedCost <= approvedCeiling + 0.000001,
  "ACTIVE_PLANNED_COST_EXCEEDS_CEILING",
);

const dispatchContractSha = text(preview.dispatch_contract_sha256);
const sourceStates = list(preview.dispatch_plans).map((plan) => {
  const source = taskMap.get(text(plan.source_task_id));
  const review = taskMap.get(text(plan.review_task_id));
  return {
    source_task_id: source?.id || null,
    review_task_id: review?.id || null,
    source_state: classifySource(source, dispatchContractSha),
    source_status: source?.status || null,
    review_status: review?.status || null,
    review_provider_id: review?.provider_id ?? null,
    review_cost_approved: review?.cost?.approved === true,
    review_started: Boolean(
      review?.timing?.started_at || review?.timing?.completed_at,
    ),
  };
});
const authorizedWaitingCount = sourceStates.filter(
  (item) => item.source_state === "AUTHORIZED_WAITING",
).length;
const readyCount = sourceStates.filter(
  (item) => item.source_state === "READY",
).length;
const runningCount = sourceStates.filter(
  (item) => item.source_state === "RUNNING",
).length;
const completedCount = sourceStates.filter(
  (item) => item.source_state === "COMPLETED",
).length;
const failedCount = sourceStates.filter(
  (item) => item.source_state === "FAILED",
).length;
const reviewUntouchedCount = sourceStates.filter(
  (item) =>
    item.review_status === "WAITING" &&
    item.review_provider_id === null &&
    item.review_cost_approved === false &&
    item.review_started === false,
).length;

requireValue(
  sourceStates.length === 9 &&
    authorizedWaitingCount === 1 &&
    readyCount === 8 &&
    runningCount === 0 &&
    completedCount === 0 &&
    failedCount === 0,
  "PARTIAL_SOURCE_DISPATCH_STATE_INVALID",
);
requireValue(
  reviewUntouchedCount === 9,
  "REPLACEMENT_REVIEW_TASKS_CHANGED",
);

const protectedIds = new Set(list(checkpoint.protected_task_ids).map(text));
const protectedStateSha = taskFingerprint(
  before.tasks.filter((task) => protectedIds.has(task.id)),
);
requireValue(
  protectedIds.size === 36 &&
    protectedStateSha === text(checkpoint.protected_task_state_sha256),
  "CHECKPOINT_PROTECTED_TASK_STATE_CHANGED",
);

const after = await exactState({
  supabaseAdmin,
  ProductionTaskRuntime,
  organizationId,
  projectId,
  graphId,
});
const stateUnchanged =
  before.task_count === after.task_count &&
  before.task_state_sha256 === after.task_state_sha256 &&
  before.usage_count === after.usage_count &&
  before.wallet_balance === after.wallet_balance &&
  before.wallet_updated_at === after.wallet_updated_at;
if (!stateUnchanged) {
  blockers.push("READ_ONLY_ACTIVE_TASK_AUDIT_CHANGED_STATE");
}

const rawCountWouldPass = before.task_count === expectedTaskCount;
const activeCountWouldPass = activeTasks.length === expectedTaskCount;
const rawCostWouldPass = historicalPlannedCost <= approvedCeiling + 0.000001;
const activeCostWouldPass = activePlannedCost <= approvedCeiling + 0.000001;

const decision = blockers.length
  ? "REPAIR_ACTIVE_DOSSIER_TASK_SET_AUDIT_BLOCKED"
  : "REPAIR_ACTIVE_DOSSIER_TASK_SET_27_ACTIVE_TASKS_CONFIRMED";
const readiness = blockers.length
  ? "REPAIR_ACTIVE_DOSSIER_TASK_SET_AUDIT_BLOCKED"
  : "READY_FOR_SUPERSESSION_AWARE_DOSSIER_GATE_RUNTIME_FIX";
const instruction = blockers.length
  ? "Resolve every active dossier task-set blocker. Do not resume dispatch."
  : "Do not delete or reset the checkpoint. Update the sealed dossier gate to validate only cryptographically and relationally valid active tasks after supersession, while retaining all 45 rows as immutable history. Then run a read-only gate verification before resuming the authorized waiting source.";

const report = {
  contract: REPORT_CONTRACT,
  generated_at: new Date().toISOString(),
  organization_id: organizationId,
  creative_project_id: projectId,
  production_graph_id: graphId,
  preview_file: previewFile.absolute,
  preview_file_sha256: previewFile.file_sha256,
  checkpoint_file: checkpointFile.absolute,
  checkpoint_file_sha256: checkpointFile.file_sha256,
  dispatch_contract_sha256: dispatchContractSha,
  graph_status: graph?.status || null,
  graph_expected_task_count: expectedTaskCount,
  approved_ceiling: approvedCeiling,
  currency: text(approval.currency) || "THB",
  historical_task_count: before.task_count,
  historical_task_status_counts: before.task_status_counts,
  historical_task_state_sha256: before.task_state_sha256,
  historical_planned_cost: historicalPlannedCost,
  valid_superseded_task_count: validSupersededIds.size,
  invalid_supersession_count: invalidSupersessionAudits.length,
  superseded_source_count: sourceSupersededCount,
  superseded_review_count: reviewSupersededCount,
  active_task_count: activeTasks.length,
  active_task_status_counts: activeTaskStatusCounts,
  active_task_state_sha256: activeTaskStateSha,
  active_planned_cost: activePlannedCost,
  raw_count_would_pass: rawCountWouldPass,
  active_count_would_pass: activeCountWouldPass,
  raw_cost_would_pass: rawCostWouldPass,
  active_cost_would_pass: activeCostWouldPass,
  supersession_audits: supersessionAudits,
  invalid_supersession_audits: invalidSupersessionAudits,
  source_states: sourceStates,
  authorized_waiting_count: authorizedWaitingCount,
  ready_count: readyCount,
  running_count: runningCount,
  completed_count: completedCount,
  failed_count: failedCount,
  review_untouched_count: reviewUntouchedCount,
  checkpoint_status: checkpoint.status,
  checkpoint_source_record_count: list(checkpoint.source_records).length,
  usage_delta_from_checkpoint:
    before.usage_count - Number(checkpoint.initial_usage_count),
  wallet_delta_from_checkpoint: money(
    checkpoint.initial_wallet_balance - before.wallet_balance,
  ),
  protected_task_count: protectedIds.size,
  protected_task_state_sha256: protectedStateSha,
  blockers,
  decision,
  instruction,
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
  database_writes_executed: false,
  wallet_reservations_executed: false,
  provider_calls_executed: false,
  provider_polls_executed: false,
  retries_executed: false,
  review_execution_executed: false,
  finalisation_executed: false,
  publication_executed: false,
  readiness,
};

writeJson(outputPath, report);

console.log("============================================================");
console.log("READ-ONLY ACTIVE DOSSIER TASK-SET AUDIT");
console.log("============================================================");
console.log(`OUTPUT=${outputPath}`);
console.log(`GRAPH_STATUS=${graph?.status || ""}`);
console.log(`GRAPH_EXPECTED_TASK_COUNT=${expectedTaskCount}`);
console.log(`APPROVED_CEILING=${approvedCeiling}`);
console.log(`HISTORICAL_TASK_COUNT=${before.task_count}`);
console.log(
  `HISTORICAL_TASK_STATUS_COUNTS=${JSON.stringify(before.task_status_counts)}`,
);
console.log(`HISTORICAL_PLANNED_COST=${historicalPlannedCost}`);
console.log(`VALID_SUPERSEDED_TASK_COUNT=${validSupersededIds.size}`);
console.log(`INVALID_SUPERSESSION_COUNT=${invalidSupersessionAudits.length}`);
console.log(`SUPERSEDED_SOURCE_COUNT=${sourceSupersededCount}`);
console.log(`SUPERSEDED_REVIEW_COUNT=${reviewSupersededCount}`);
console.log(`ACTIVE_TASK_COUNT=${activeTasks.length}`);
console.log(
  `ACTIVE_TASK_STATUS_COUNTS=${JSON.stringify(activeTaskStatusCounts)}`,
);
console.log(`ACTIVE_PLANNED_COST=${activePlannedCost}`);
console.log(`RAW_COUNT_WOULD_PASS=${rawCountWouldPass ? "YES" : "NO"}`);
console.log(`ACTIVE_COUNT_WOULD_PASS=${activeCountWouldPass ? "YES" : "NO"}`);
console.log(`RAW_COST_WOULD_PASS=${rawCostWouldPass ? "YES" : "NO"}`);
console.log(`ACTIVE_COST_WOULD_PASS=${activeCostWouldPass ? "YES" : "NO"}`);
console.log(`AUTHORIZED_WAITING_COUNT=${authorizedWaitingCount}`);
console.log(`READY_COUNT=${readyCount}`);
console.log(`RUNNING_COUNT=${runningCount}`);
console.log(`COMPLETED_COUNT=${completedCount}`);
console.log(`FAILED_COUNT=${failedCount}`);
console.log(`REVIEW_UNTOUCHED_COUNT=${reviewUntouchedCount}`);
console.log(`CHECKPOINT_STATUS=${checkpoint.status}`);
console.log(
  `CHECKPOINT_SOURCE_RECORD_COUNT=${list(checkpoint.source_records).length}`,
);
console.log(
  `USAGE_DELTA_FROM_CHECKPOINT=${
    before.usage_count - Number(checkpoint.initial_usage_count)
  }`,
);
console.log(
  `WALLET_DELTA_FROM_CHECKPOINT=${money(
    checkpoint.initial_wallet_balance - before.wallet_balance,
  )}`,
);
console.log(`PROTECTED_TASK_COUNT=${protectedIds.size}`);
console.log(`PROTECTED_TASK_STATE_SHA256=${protectedStateSha}`);
console.log(`ACTIVE_TASK_SET_BLOCKERS=${JSON.stringify(blockers)}`);
console.log(`ACTIVE_TASK_SET_DECISION=${decision}`);
console.log(`ACTIVE_TASK_SET_INSTRUCTION=${instruction}`);
console.log(`TASK_STATE_SHA256_BEFORE=${before.task_state_sha256}`);
console.log(`TASK_STATE_SHA256_AFTER=${after.task_state_sha256}`);
console.log(`USAGE_COUNT_BEFORE=${before.usage_count}`);
console.log(`USAGE_COUNT_AFTER=${after.usage_count}`);
console.log(`WALLET_BALANCE_BEFORE=${before.wallet_balance}`);
console.log(`WALLET_BALANCE_AFTER=${after.wallet_balance}`);
console.log(`STATE_UNCHANGED=${stateUnchanged ? "YES" : "NO"}`);
console.log("DATABASE_WRITES_EXECUTED=NO");
console.log("WALLET_RESERVATIONS_EXECUTED=NO");
console.log("PROVIDER_CALLS_EXECUTED=NO");
console.log("PROVIDER_POLLS_EXECUTED=NO");
console.log("RETRIES_EXECUTED=NO");
console.log("REVIEW_EXECUTION_EXECUTED=NO");
console.log("FINALISATION_EXECUTED=NO");
console.log("PUBLICATION_EXECUTED=NO");
console.log(`AUDIT_READINESS=${readiness}`);
console.log("TERMINAL_REMAINS_OPEN=YES");

if (blockers.length || !stateUnchanged) {
  process.exitCode = 2;
}
