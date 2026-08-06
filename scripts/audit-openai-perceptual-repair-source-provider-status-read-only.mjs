#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv({ cwd: process.cwd() });
await import("./creative-runtime-bootstrap.mjs");

const DISPATCH_REPORT_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_REPAIR_SOURCE_DISPATCH_EXECUTION_V1";
const CHECKPOINT_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_REPAIR_SOURCE_DISPATCH_CHECKPOINT_V1";
const ISOLATION_VERIFY_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_REPAIR_SHOT_ISOLATION_GATE_VERIFICATION_V2";
const REPORT_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_REPAIR_SOURCE_PROVIDER_STATUS_AUDIT_V1";
const SOURCE_CONTRACT =
  "GENERATED_MEDIA_PERCEPTUAL_REPLACEMENT_SOURCE_V1";
const REVIEW_CONTRACT =
  "GENERATED_MEDIA_PERCEPTUAL_REPLACEMENT_REVIEW_V1";
const EXPECTED_UNIT_PRICE = 5.26032;
const EXPECTED_TOTAL_PRICE = 47.34288;

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

function repairKind(task = {}) {
  const contract = text(task.metadata?.repair_payload_contract);
  if (contract === SOURCE_CONTRACT) return "SOURCE";
  if (contract === REVIEW_CONTRACT) return "REVIEW";
  return null;
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

function providerStatus(task = {}) {
  return text(
    task.output?.provider_status ||
      task.output?.provider_submission?.provider_status ||
      task.output?.provider_submission?.output?.status ||
      task.output?.provider_submission?.output?.output?.status,
  ) || null;
}

function outputMediaUrl(value, seen = new Set()) {
  if (!value) return null;
  if (typeof value === "string") {
    return /^(https?:\/\/|storage:\/\/|s3:\/\/|gs:\/\/)/i.test(value)
      ? value
      : null;
  }
  if (typeof value !== "object" || seen.has(value)) return null;
  seen.add(value);
  if (Array.isArray(value)) {
    return value.map((item) => outputMediaUrl(item, seen)).find(Boolean) || null;
  }
  for (const key of [
    "url",
    "file_url",
    "fileUrl",
    "video_url",
    "videoUrl",
    "download_url",
    "downloadUrl",
    "output",
    "outputs",
    "result",
    "results",
    "data",
    "files",
    "videos",
  ]) {
    const found = outputMediaUrl(value[key], seen);
    if (found) return found;
  }
  return null;
}

function sourceAuthorizationValid(task = {}, dispatchContractSha) {
  const authorization = object(
    task.metadata?.repair_source_dispatch_authorization,
  );
  return Boolean(
    authorization.contract ===
      "CREATIVE_PERCEPTUAL_REPAIR_SOURCE_DISPATCH_AUTHORIZATION_V1" &&
      text(authorization.dispatch_contract_sha256) === dispatchContractSha &&
      authorization.provider_spend_authorized === true &&
      authorization.wallet_reservation_authorized === true &&
      authorization.provider_call_authorized === true &&
      authorization.dispatch_authorized === true &&
      authorization.poll_authorized === false &&
      authorization.review_execution_authorized === false &&
      authorization.retry_authorized === false &&
      authorization.finalisation_authorized === false &&
      authorization.publication_authorized === false &&
      task.metadata?.provider_spend_authorized === true &&
      task.metadata?.wallet_reservation_authorized === true &&
      task.metadata?.provider_call_authorized === true &&
      task.metadata?.dispatch_authorized === true &&
      task.metadata?.poll_authorized === false &&
      task.metadata?.review_execution_authorized === false &&
      task.metadata?.retry_authorized === false &&
      task.metadata?.finalisation_authorized === false &&
      task.metadata?.publication_authorized === false,
  );
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

const dispatchFile = readJson(
  process.argv[2],
  "SOURCE_DISPATCH_EXECUTION_REPORT",
);
const checkpointFile = readJson(
  process.argv[3],
  "SOURCE_DISPATCH_CHECKPOINT",
);
const isolationFile = readJson(
  process.argv[4],
  "SHOT_ISOLATION_GATE_VERIFICATION_V2",
);

const dispatch = object(dispatchFile.value);
const checkpoint = object(checkpointFile.value);
const isolation = object(isolationFile.value);

const organizationId = text(process.env.ORGANIZATION_ID);
const projectId = text(process.env.CREATIVE_PROJECT_ID);
const graphId = text(process.env.PRODUCTION_GRAPH_ID);
const outputPath = path.resolve(
  text(process.env.OPENAI_PERCEPTUAL_SOURCE_PROVIDER_STATUS_AUDIT_OUTPUT) ||
    "/tmp/churchill-openai-perceptual-repair-source-provider-status-audit.json",
);

if (!organizationId || !projectId || !graphId) {
  throw new Error("SOURCE_PROVIDER_STATUS_AUDIT_SCOPE_REQUIRED");
}

const [{ supabaseAdmin }, { ProductionTaskRuntime }] = await Promise.all([
  import("@/lib/shared/supabase/admin"),
  import("@/lib/operations/tasks/runtime/ProductionTaskRuntime"),
]);

const blockers = [];
const requireValue = (condition, label) => {
  if (!condition) blockers.push(label);
};

requireValue(
  text(dispatch.contract) === DISPATCH_REPORT_CONTRACT,
  "DISPATCH_REPORT_CONTRACT_INVALID",
);
requireValue(
  text(checkpoint.contract) === CHECKPOINT_CONTRACT,
  "CHECKPOINT_CONTRACT_INVALID",
);
requireValue(
  text(isolation.contract) === ISOLATION_VERIFY_CONTRACT,
  "ISOLATION_VERIFICATION_CONTRACT_INVALID",
);

for (const [label, value] of [
  ["DISPATCH", dispatch],
  ["CHECKPOINT", checkpoint],
  ["ISOLATION", isolation],
]) {
  requireValue(
    text(value.organization_id) === organizationId &&
      text(value.creative_project_id) === projectId &&
      text(value.production_graph_id) === graphId,
    `${label}_SCOPE_INVALID`,
  );
}

requireValue(
  text(dispatch.decision) ===
    "REPAIR_SOURCE_DISPATCH_9_SOURCES_SUBMITTED" &&
    text(dispatch.readiness) ===
      "READY_FOR_READ_ONLY_SOURCE_PROVIDER_STATUS_AUDIT" &&
    list(dispatch.blockers).length === 0 &&
    Number(dispatch.source_task_count) === 9 &&
    Number(dispatch.review_task_count) === 9 &&
    Number(dispatch.running_count) === 9 &&
    Number(dispatch.completed_count) === 0 &&
    Number(dispatch.failed_count) === 0 &&
    Number(dispatch.dispatch_call_count) === 9 &&
    Number(dispatch.usage_delta) === 9 &&
    money(dispatch.wallet_delta) === EXPECTED_TOTAL_PRICE &&
    dispatch.provider_polls_executed === false &&
    dispatch.retries_executed === false &&
    dispatch.review_execution_executed === false &&
    dispatch.finalisation_executed === false &&
    dispatch.publication_executed === false,
  "DISPATCH_REPORT_NOT_SUBMITTED_CLEANLY",
);

requireValue(
  text(checkpoint.status) === "SUBMITTED" &&
    list(checkpoint.source_records).length === 9 &&
    Number(checkpoint.initial_task_count) === 45 &&
    Number(checkpoint.initial_usage_count) === 2658 &&
    money(checkpoint.initial_wallet_balance) === 9300.972022 &&
    Number(checkpoint.usage_delta) === 9 &&
    money(checkpoint.wallet_delta) === EXPECTED_TOTAL_PRICE &&
    Number(checkpoint.dispatch_call_count) === 9 &&
    money(checkpoint.maximum_authorized_spend) === EXPECTED_TOTAL_PRICE &&
    text(checkpoint.currency) === "THB" &&
    /^[a-f0-9]{64}$/i.test(text(checkpoint.final_task_state_sha256)),
  "CHECKPOINT_SUBMITTED_STATE_INVALID",
);

requireValue(
  text(isolation.decision) ===
    "REPAIR_SHOT_ISOLATION_GATE_V2_18_REPLACEMENTS_CONFIRMED" &&
    text(isolation.readiness) ===
      "READY_TO_RESUME_CHECKPOINTED_REPAIR_SOURCE_DISPATCH" &&
    Number(isolation.source_passed_count) === 9 &&
    Number(isolation.review_passed_count) === 9 &&
    Number(isolation.failed_count) === 0 &&
    list(isolation.blockers).length === 0 &&
    isolation.state_unchanged === true,
  "ISOLATION_VERIFICATION_NOT_CLEAN",
);

const before = await exactState({
  supabaseAdmin,
  ProductionTaskRuntime,
  organizationId,
  projectId,
  graphId,
});
const taskMap = new Map(before.tasks.map((task) => [task.id, task]));
const sourceRecords = list(checkpoint.source_records);
const sourceIds = new Set(sourceRecords.map((record) => text(record.source_task_id)));
const reviewIds = new Set(sourceRecords.map((record) => text(record.review_task_id)));
const usageIds = sourceRecords.map((record) => text(record.usage_id));
const providerJobIds = sourceRecords.map((record) => text(record.provider_job_id));
const dispatchContractSha = text(checkpoint.dispatch_contract_sha256);

requireValue(before.task_count === 45, "LIVE_TASK_COUNT_INVALID");
requireValue(
  Number(before.task_status_counts.COMPLETED || 0) === 9 &&
    Number(before.task_status_counts.RUNNING || 0) === 9 &&
    Number(before.task_status_counts.WAITING || 0) === 9 &&
    Number(before.task_status_counts.FAILED || 0) === 18,
  "LIVE_TASK_STATUS_COUNTS_INVALID",
);
requireValue(
  before.task_state_sha256 === text(checkpoint.final_task_state_sha256) &&
    before.task_state_sha256 === text(dispatch.exact_state_after?.task_state_sha256),
  "LIVE_TASK_STATE_CHANGED_AFTER_SUBMISSION",
);
requireValue(
  before.usage_count === Number(checkpoint.initial_usage_count) + 9 &&
    before.usage_count === Number(dispatch.exact_state_after?.usage_count),
  "LIVE_USAGE_COUNT_INVALID",
);
requireValue(
  before.wallet_balance ===
      money(checkpoint.initial_wallet_balance - EXPECTED_TOTAL_PRICE) &&
    before.wallet_balance === money(dispatch.exact_state_after?.wallet_balance) &&
    before.wallet_currency === "THB",
  "LIVE_WALLET_RESERVATION_BALANCE_INVALID",
);
requireValue(
  sourceIds.size === 9 &&
    reviewIds.size === 9 &&
    usageIds.length === 9 &&
    new Set(usageIds).size === 9 &&
    usageIds.every(Boolean) &&
    providerJobIds.length === 9 &&
    new Set(providerJobIds).size === 9 &&
    providerJobIds.every(Boolean),
  "CHECKPOINT_RECORD_IDENTIFIERS_INVALID",
);
requireValue(
  sourceRecords.every(
    (record) => text(record.state) === "DISPATCHED_RUNNING",
  ),
  "CHECKPOINT_SOURCE_RECORD_STATE_INVALID",
);

const [usageResponse, walletByReferenceResponse, walletByUsageResponse] =
  await Promise.all([
    supabaseAdmin
      .from("platform_service_usage")
      .select("*")
      .in("id", usageIds),
    supabaseAdmin
      .from("wallet_transactions")
      .select("*")
      .eq("organization_id", organizationId)
      .in("reference", usageIds),
    supabaseAdmin
      .from("wallet_transactions")
      .select("*")
      .eq("organization_id", organizationId)
      .in("usage_id", usageIds),
  ]);

if (usageResponse.error) throw usageResponse.error;
if (walletByReferenceResponse.error) throw walletByReferenceResponse.error;
if (walletByUsageResponse.error) throw walletByUsageResponse.error;

const usageRows = list(usageResponse.data);
const usageMap = new Map(usageRows.map((row) => [text(row.id), row]));
const walletTransactions = [
  ...list(walletByReferenceResponse.data),
  ...list(walletByUsageResponse.data),
].filter(
  (row, index, rows) =>
    rows.findIndex((candidate) => text(candidate.id) === text(row.id)) === index,
);

const sourceAudits = sourceRecords.map((record) => {
  const source = taskMap.get(text(record.source_task_id));
  const review = taskMap.get(text(record.review_task_id));
  const checkpointUsageId = text(record.usage_id);
  const checkpointJobId = text(record.provider_job_id);
  const taskUsageId = usageId(source);
  const taskJobId = providerJobId(source);
  const usage = usageMap.get(checkpointUsageId);
  const transactions = walletTransactions.filter(
    (transaction) =>
      text(transaction.reference) === checkpointUsageId ||
      text(transaction.usage_id) === checkpointUsageId,
  );
  const reserves = transactions.filter(
    (transaction) => text(transaction.type) === "RESERVE",
  );
  const charges = transactions.filter(
    (transaction) => text(transaction.type) === "CHARGE",
  );
  const releases = transactions.filter(
    (transaction) => text(transaction.type) === "RELEASE",
  );
  const refunds = transactions.filter(
    (transaction) => text(transaction.type) === "REFUND",
  );
  const issues = [];

  if (!source) issues.push("SOURCE_TASK_MISSING");
  if (!review) issues.push("REVIEW_TASK_MISSING");

  if (source) {
    if (repairKind(source) !== "SOURCE") issues.push("SOURCE_CONTRACT_INVALID");
    if (text(source.status) !== "RUNNING") issues.push("SOURCE_NOT_RUNNING");
    if (text(source.provider_id) !== "runway") issues.push("SOURCE_PROVIDER_INVALID");
    if (!sourceAuthorizationValid(source, dispatchContractSha)) {
      issues.push("SOURCE_AUTHORIZATION_INVALID");
    }
    if (source.cost?.approved !== true) issues.push("SOURCE_COST_NOT_APPROVED");
    if (money(source.cost?.estimated) !== EXPECTED_UNIT_PRICE) {
      issues.push("SOURCE_ESTIMATED_COST_INVALID");
    }
    if (Number(source.cost?.actual || 0) !== 0) {
      issues.push("SOURCE_ACTUAL_COST_ALREADY_RECORDED");
    }
    if (!source.timing?.started_at || source.timing?.completed_at) {
      issues.push("SOURCE_TIMING_INVALID");
    }
    if (text(source.error)) issues.push("SOURCE_ERROR_PRESENT");
    if (taskUsageId !== checkpointUsageId) issues.push("TASK_USAGE_ID_MISMATCH");
    if (taskJobId !== checkpointJobId) issues.push("TASK_PROVIDER_JOB_ID_MISMATCH");
    if (outputMediaUrl(source.output)) issues.push("SOURCE_MEDIA_OUTPUT_ALREADY_PRESENT");
  }

  if (review) {
    if (repairKind(review) !== "REVIEW") issues.push("REVIEW_CONTRACT_INVALID");
    if (text(review.status) !== "WAITING") issues.push("REVIEW_NOT_WAITING");
    if (review.provider_id !== null) issues.push("REVIEW_PROVIDER_BOUND");
    if (review.cost?.approved === true) issues.push("REVIEW_COST_APPROVED");
    if (Number(review.cost?.actual || 0) !== 0) {
      issues.push("REVIEW_ACTUAL_COST_PRESENT");
    }
    if (
      list(review.depends_on).length !== 1 ||
      text(review.depends_on[0]) !== text(source?.id)
    ) {
      issues.push("REVIEW_DEPENDENCY_INVALID");
    }
    if (review.timing?.started_at || review.timing?.completed_at) {
      issues.push("REVIEW_TIMING_CHANGED");
    }
    if (Object.keys(object(review.output)).length !== 0) {
      issues.push("REVIEW_OUTPUT_PRESENT");
    }
    if (text(review.error)) issues.push("REVIEW_ERROR_PRESENT");
  }

  if (!usage) {
    issues.push("USAGE_ROW_MISSING");
  } else {
    if (text(usage.organization_id) !== organizationId) {
      issues.push("USAGE_ORGANIZATION_INVALID");
    }
    if (text(usage.provider) !== "runway") issues.push("USAGE_PROVIDER_INVALID");
    if (text(usage.status) !== "PENDING") issues.push("USAGE_NOT_PENDING");
    if (text(usage.invoice_status) !== "UNBILLED") {
      issues.push("USAGE_ALREADY_BILLED");
    }
    if (text(usage.currency) !== "THB") issues.push("USAGE_CURRENCY_INVALID");
    if (Number(usage.quantity) !== 1) issues.push("USAGE_QUANTITY_INVALID");
    if (text(usage.error_message)) issues.push("USAGE_ERROR_PRESENT");
    if (
      money(usage.metadata?.reservation_pricing?.customer_price) !==
      EXPECTED_UNIT_PRICE
    ) {
      issues.push("USAGE_RESERVATION_PRICE_INVALID");
    }
    if (
      text(usage.metadata?.reservation_pricing?.currency) !== "THB"
    ) {
      issues.push("USAGE_RESERVATION_CURRENCY_INVALID");
    }
  }

  if (reserves.length !== 1) issues.push("RESERVE_TRANSACTION_COUNT_INVALID");
  if (charges.length !== 0) issues.push("CHARGE_TRANSACTION_ALREADY_PRESENT");
  if (releases.length !== 0) issues.push("RELEASE_TRANSACTION_ALREADY_PRESENT");
  if (refunds.length !== 0) issues.push("REFUND_TRANSACTION_ALREADY_PRESENT");
  if (transactions.length !== 1) issues.push("UNEXPECTED_WALLET_TRANSACTION_PRESENT");

  const reserve = reserves[0] || null;
  if (reserve) {
    if (money(reserve.amount) !== EXPECTED_UNIT_PRICE) {
      issues.push("RESERVE_AMOUNT_INVALID");
    }
    if (text(reserve.currency) !== "THB") {
      issues.push("RESERVE_CURRENCY_INVALID");
    }
    if (text(reserve.provider) !== "runway") {
      issues.push("RESERVE_PROVIDER_INVALID");
    }
    if (text(reserve.reference) !== checkpointUsageId) {
      issues.push("RESERVE_REFERENCE_INVALID");
    }
    if (text(reserve.idempotency_key) !== `RESERVE:${checkpointUsageId}`) {
      issues.push("RESERVE_IDEMPOTENCY_KEY_INVALID");
    }
    if (text(reserve.metadata?.usage_id) !== checkpointUsageId) {
      issues.push("RESERVE_METADATA_USAGE_ID_INVALID");
    }
  }

  return {
    source_task_id: source?.id || null,
    review_task_id: review?.id || null,
    usage_id: checkpointUsageId || null,
    provider_job_id: checkpointJobId || null,
    provider_status: providerStatus(source),
    source_status: source?.status || null,
    review_status: review?.status || null,
    usage_status: usage?.status || null,
    reserve_transaction_id: reserve?.id || null,
    reserve_amount: money(reserve?.amount),
    charge_transaction_count: charges.length,
    release_transaction_count: releases.length,
    media_output_present: Boolean(outputMediaUrl(source?.output)),
    issues,
    ready: issues.length === 0,
  };
});

const sourceReadyCount = sourceAudits.filter((audit) => audit.ready).length;
const sourceFailureCount = sourceAudits.filter((audit) => !audit.ready).length;
const pendingUsageCount = usageRows.filter(
  (row) => text(row.status) === "PENDING",
).length;
const reserveTransactions = walletTransactions.filter(
  (row) => text(row.type) === "RESERVE",
);
const reserveTotal = money(
  reserveTransactions.reduce(
    (sum, transaction) => sum + Number(transaction.amount || 0),
    0,
  ),
);
const chargeCount = walletTransactions.filter(
  (row) => text(row.type) === "CHARGE",
).length;
const releaseCount = walletTransactions.filter(
  (row) => text(row.type) === "RELEASE",
).length;
const refundCount = walletTransactions.filter(
  (row) => text(row.type) === "REFUND",
).length;

requireValue(
  sourceReadyCount === 9 && sourceFailureCount === 0,
  "ONE_OR_MORE_SOURCE_PROVIDER_RECORDS_INVALID",
);
requireValue(
  usageRows.length === 9 && pendingUsageCount === 9,
  "USAGE_RECORD_SET_INVALID",
);
requireValue(
  reserveTransactions.length === 9 &&
    reserveTotal === EXPECTED_TOTAL_PRICE &&
    walletTransactions.length === 9 &&
    chargeCount === 0 &&
    releaseCount === 0 &&
    refundCount === 0,
  "WALLET_RESERVATION_SET_INVALID",
);

const protectedIds = new Set(list(checkpoint.protected_task_ids).map(text));
const protectedStateSha = taskFingerprint(
  before.tasks.filter((task) => protectedIds.has(task.id)),
);
requireValue(
  protectedIds.size === 36 &&
    protectedStateSha === text(checkpoint.protected_task_state_sha256),
  "PROTECTED_TASK_STATE_CHANGED",
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
if (!stateUnchanged) blockers.push("READ_ONLY_PROVIDER_STATUS_AUDIT_CHANGED_STATE");

const decision = blockers.length
  ? "REPAIR_SOURCE_PROVIDER_STATUS_AUDIT_BLOCKED"
  : "REPAIR_SOURCE_PROVIDER_STATUS_9_RUNNING_RESERVATIONS_CONFIRMED";
const readiness = blockers.length
  ? "REPAIR_SOURCE_PROVIDER_STATUS_AUDIT_BLOCKED"
  : "READY_FOR_BOUNDED_PROVIDER_STATUS_POLL_DESIGN";
const instruction = blockers.length
  ? "Resolve every provider-status audit blocker. Do not poll providers, retry, execute reviews, finalise, or publish."
  : "Design a separate bounded status-poll workflow for exactly these nine Runway job IDs. The workflow must preserve the checkpoint, poll each job at most once per authorized run, settle only terminal jobs, leave pending jobs reserved, never retry failed jobs, keep all reviews blocked, and never finalise or publish.";

const report = {
  contract: REPORT_CONTRACT,
  generated_at: new Date().toISOString(),
  organization_id: organizationId,
  creative_project_id: projectId,
  production_graph_id: graphId,
  dispatch_report_file: dispatchFile.absolute,
  dispatch_report_file_sha256: dispatchFile.file_sha256,
  checkpoint_file: checkpointFile.absolute,
  checkpoint_file_sha256: checkpointFile.file_sha256,
  isolation_verification_file: isolationFile.absolute,
  isolation_verification_file_sha256: isolationFile.file_sha256,
  source_task_count: sourceIds.size,
  review_task_count: reviewIds.size,
  source_ready_count: sourceReadyCount,
  source_failure_count: sourceFailureCount,
  unique_usage_id_count: new Set(usageIds).size,
  unique_provider_job_id_count: new Set(providerJobIds).size,
  pending_usage_count: pendingUsageCount,
  reserve_transaction_count: reserveTransactions.length,
  reserve_total: reserveTotal,
  charge_transaction_count: chargeCount,
  release_transaction_count: releaseCount,
  refund_transaction_count: refundCount,
  source_audits: sourceAudits,
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
  wallet_charges_executed: false,
  wallet_releases_executed: false,
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
console.log("READ-ONLY REPAIR SOURCE PROVIDER-STATUS AUDIT");
console.log("============================================================");
console.log(`OUTPUT=${outputPath}`);
console.log(`TASK_COUNT=${before.task_count}`);
console.log(`TASK_STATUS_COUNTS=${JSON.stringify(before.task_status_counts)}`);
console.log(`SOURCE_TASK_COUNT=${sourceIds.size}`);
console.log(`REVIEW_TASK_COUNT=${reviewIds.size}`);
console.log(`SOURCE_READY_COUNT=${sourceReadyCount}`);
console.log(`SOURCE_FAILURE_COUNT=${sourceFailureCount}`);
console.log(`UNIQUE_USAGE_ID_COUNT=${new Set(usageIds).size}`);
console.log(`UNIQUE_PROVIDER_JOB_ID_COUNT=${new Set(providerJobIds).size}`);
console.log(`PENDING_USAGE_COUNT=${pendingUsageCount}`);
console.log(`RESERVE_TRANSACTION_COUNT=${reserveTransactions.length}`);
console.log(`RESERVE_TOTAL=${reserveTotal}`);
console.log(`CHARGE_TRANSACTION_COUNT=${chargeCount}`);
console.log(`RELEASE_TRANSACTION_COUNT=${releaseCount}`);
console.log(`REFUND_TRANSACTION_COUNT=${refundCount}`);
console.log(`PROTECTED_TASK_COUNT=${protectedIds.size}`);
console.log(`PROTECTED_TASK_STATE_SHA256=${protectedStateSha}`);

for (const audit of sourceAudits) {
  console.log([
    `SOURCE_PROVIDER_STATUS=${audit.source_task_id || ""}`,
    `review=${audit.review_task_id || ""}`,
    `usage=${audit.usage_id || ""}`,
    `job=${audit.provider_job_id || ""}`,
    `provider_status=${audit.provider_status || ""}`,
    `source_status=${audit.source_status || ""}`,
    `review_status=${audit.review_status || ""}`,
    `usage_status=${audit.usage_status || ""}`,
    `reserve=${audit.reserve_amount}`,
    `charges=${audit.charge_transaction_count}`,
    `releases=${audit.release_transaction_count}`,
    `media=${audit.media_output_present ? "YES" : "NO"}`,
    `issues=${audit.issues.join(",")}`,
    `ready=${audit.ready ? "YES" : "NO"}`,
  ].join("|"));
}

console.log(`SOURCE_PROVIDER_STATUS_BLOCKERS=${JSON.stringify(blockers)}`);
console.log(`SOURCE_PROVIDER_STATUS_DECISION=${decision}`);
console.log(`SOURCE_PROVIDER_STATUS_INSTRUCTION=${instruction}`);
console.log(`TASK_STATE_SHA256_BEFORE=${before.task_state_sha256}`);
console.log(`TASK_STATE_SHA256_AFTER=${after.task_state_sha256}`);
console.log(`USAGE_COUNT_BEFORE=${before.usage_count}`);
console.log(`USAGE_COUNT_AFTER=${after.usage_count}`);
console.log(`WALLET_BALANCE_BEFORE=${before.wallet_balance}`);
console.log(`WALLET_BALANCE_AFTER=${after.wallet_balance}`);
console.log(`STATE_UNCHANGED=${stateUnchanged ? "YES" : "NO"}`);
console.log("DATABASE_WRITES_EXECUTED=NO");
console.log("WALLET_RESERVATIONS_EXECUTED=NO");
console.log("WALLET_CHARGES_EXECUTED=NO");
console.log("WALLET_RELEASES_EXECUTED=NO");
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
