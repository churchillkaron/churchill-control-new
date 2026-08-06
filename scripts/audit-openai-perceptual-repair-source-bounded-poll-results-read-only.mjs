#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv({ cwd: process.cwd() });
await import("./creative-runtime-bootstrap.mjs");

const EXECUTION_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_REPAIR_SOURCE_BOUNDED_POLL_EXECUTION_V1";
const POLL_CHECKPOINT_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_REPAIR_SOURCE_BOUNDED_POLL_CHECKPOINT_V1";
const DISPATCH_CHECKPOINT_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_REPAIR_SOURCE_DISPATCH_CHECKPOINT_V1";
const REPORT_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_REPAIR_SOURCE_BOUNDED_POLL_RESULT_AUDIT_V1";
const SOURCE_CONTRACT =
  "GENERATED_MEDIA_PERCEPTUAL_REPLACEMENT_SOURCE_V1";
const REVIEW_CONTRACT =
  "GENERATED_MEDIA_PERCEPTUAL_REPLACEMENT_REVIEW_V1";
const UNIT_PRICE = 5.26032;
const TOTAL_PRICE = 47.34288;

const text = (value) => String(value ?? "").trim();
const object = (value) =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};
const list = (value) => Array.isArray(value) ? value.filter(Boolean) : [];
const money = (value) => Number(Number(value || 0).toFixed(6));

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
    "provider_poll",
    "provider_submission",
  ]) {
    const found = outputMediaUrl(value[key], seen);
    if (found) return found;
  }
  return null;
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
      .select("available_balance,reserved_balance,currency,updated_at")
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
    wallet_reserved_balance: money(wallet.data?.reserved_balance),
    wallet_currency: text(wallet.data?.currency) || "THB",
    wallet_updated_at: wallet.data?.updated_at || null,
  };
}

const executionFile = readJson(
  process.argv[2],
  "BOUNDED_POLL_EXECUTION",
);
const pollCheckpointFile = readJson(
  process.argv[3],
  "BOUNDED_POLL_CHECKPOINT",
);
const dispatchCheckpointFile = readJson(
  process.argv[4],
  "SOURCE_DISPATCH_CHECKPOINT",
);

const execution = object(executionFile.value);
const pollCheckpoint = object(pollCheckpointFile.value);
const dispatchCheckpoint = object(dispatchCheckpointFile.value);

const organizationId = text(process.env.ORGANIZATION_ID);
const projectId = text(process.env.CREATIVE_PROJECT_ID);
const graphId = text(process.env.PRODUCTION_GRAPH_ID);
const outputPath = path.resolve(
  text(process.env.OPENAI_PERCEPTUAL_SOURCE_POLL_RESULT_AUDIT_OUTPUT) ||
    "/tmp/churchill-openai-perceptual-repair-source-bounded-poll-result-audit.json",
);

if (!organizationId || !projectId || !graphId) {
  throw new Error("SOURCE_POLL_RESULT_AUDIT_SCOPE_REQUIRED");
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
  text(execution.contract) === EXECUTION_CONTRACT,
  "POLL_EXECUTION_CONTRACT_INVALID",
);
requireValue(
  text(pollCheckpoint.contract) === POLL_CHECKPOINT_CONTRACT,
  "POLL_CHECKPOINT_CONTRACT_INVALID",
);
requireValue(
  text(dispatchCheckpoint.contract) === DISPATCH_CHECKPOINT_CONTRACT,
  "DISPATCH_CHECKPOINT_CONTRACT_INVALID",
);

for (const [label, value] of [
  ["EXECUTION", execution],
  ["POLL_CHECKPOINT", pollCheckpoint],
  ["DISPATCH_CHECKPOINT", dispatchCheckpoint],
]) {
  requireValue(
    text(value.organization_id) === organizationId &&
      text(value.creative_project_id) === projectId &&
      text(value.production_graph_id) === graphId,
    `${label}_SCOPE_INVALID`,
  );
}

requireValue(
  text(execution.decision) ===
    "REPAIR_SOURCE_BOUNDED_POLL_ROUND_1_EXECUTED" &&
    text(execution.readiness) ===
      "READY_FOR_READ_ONLY_BOUNDED_POLL_RESULT_AUDIT" &&
    Number(execution.provider_status_call_count) === 9 &&
    Number(execution.completed_attempt_count) === 9 &&
    Number(execution.pending_count) === 0 &&
    Number(execution.succeeded_count) === 9 &&
    Number(execution.failed_count) === 0 &&
    Number(execution.transport_error_count) === 0 &&
    Number(execution.partial_write_error_count) === 0 &&
    Number(execution.ambiguous_count) === 0 &&
    Number(execution.unattempted_count) === 0 &&
    Number(execution.charge_transaction_count) === 9 &&
    Number(execution.release_transaction_count) === 0 &&
    money(execution.charge_total) === TOTAL_PRICE &&
    money(execution.release_total) === 0 &&
    list(execution.blockers).length === 0 &&
    execution.provider_generation_calls_executed === false &&
    execution.retries_executed === false &&
    execution.review_execution_executed === false &&
    execution.finalisation_executed === false &&
    execution.publication_executed === false,
  "POLL_EXECUTION_NOT_CLEAN",
);

const pollRecords = list(pollCheckpoint.records);
requireValue(
  text(pollCheckpoint.status) === "ROUND_1_POLLED" &&
    pollRecords.length === 9 &&
    pollRecords.every(
      (record) =>
        text(record.state) === "POLL_SUCCEEDED" &&
        Number(record.provider_status_call_count) === 1 &&
        text(record.result?.source_status) === "COMPLETED" &&
        text(record.result?.settlement) === "CHARGED" &&
        Boolean(text(record.result?.asset_node_id)) &&
        record.result?.media_url_present === true &&
        !text(record.error),
    ) &&
    Number(pollCheckpoint.provider_status_call_count) === 9 &&
    Number(pollCheckpoint.succeeded_count) === 9 &&
    Number(pollCheckpoint.failed_count) === 0 &&
    Number(pollCheckpoint.transport_error_count) === 0 &&
    Number(pollCheckpoint.partial_write_error_count) === 0 &&
    money(pollCheckpoint.charge_total) === TOTAL_PRICE &&
    money(pollCheckpoint.release_total) === 0,
  "POLL_CHECKPOINT_NOT_CLEAN",
);

const before = await exactState({
  supabaseAdmin,
  ProductionTaskRuntime,
  organizationId,
  projectId,
  graphId,
});
const taskMap = new Map(before.tasks.map((task) => [text(task.id), task]));
const sourceIds = pollRecords.map((record) => text(record.source_task_id));
const reviewIds = pollRecords.map((record) => text(record.review_task_id));
const usageIds = pollRecords.map((record) => text(record.usage_id));
const assetNodeIds = pollRecords.map((record) =>
  text(record.result?.asset_node_id),
);
const providerJobIds = pollRecords.map((record) =>
  text(record.provider_job_id),
);

requireValue(before.task_count === 45, "LIVE_TASK_COUNT_INVALID");
requireValue(
  Number(before.task_status_counts.COMPLETED || 0) === 18 &&
    Number(before.task_status_counts.FAILED || 0) === 18 &&
    Number(before.task_status_counts.WAITING || 0) === 9 &&
    Number(before.task_status_counts.RUNNING || 0) === 0,
  "LIVE_TASK_STATUS_COUNTS_INVALID",
);
requireValue(
  before.task_state_sha256 === text(execution.exact_state_after?.task_state_sha256) &&
    before.task_state_sha256 === text(pollCheckpoint.final_task_state_sha256) &&
    before.usage_count === 2667 &&
    before.wallet_balance === 9253.629142 &&
    before.wallet_reserved_balance === 0 &&
    before.wallet_currency === "THB",
  "LIVE_POST_POLL_STATE_INVALID",
);
requireValue(
  new Set(sourceIds).size === 9 &&
    new Set(reviewIds).size === 9 &&
    new Set(usageIds).size === 9 &&
    new Set(assetNodeIds).size === 9 &&
    new Set(providerJobIds).size === 9 &&
    sourceIds.every(Boolean) &&
    reviewIds.every(Boolean) &&
    usageIds.every(Boolean) &&
    assetNodeIds.every(Boolean) &&
    providerJobIds.every(Boolean),
  "POST_POLL_IDENTIFIER_SET_INVALID",
);

const [
  usageResponse,
  assetResponse,
  lineResponse,
  walletReferenceResponse,
  walletUsageResponse,
] = await Promise.all([
  supabaseAdmin
    .from("platform_service_usage")
    .select("*")
    .in("id", usageIds),
  supabaseAdmin
    .from("creative_asset_nodes")
    .select("*")
    .in("id", assetNodeIds),
  supabaseAdmin
    .from("billing_invoice_lines")
    .select("*")
    .in("usage_id", usageIds),
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

for (const response of [
  usageResponse,
  assetResponse,
  lineResponse,
  walletReferenceResponse,
  walletUsageResponse,
]) {
  if (response.error) throw response.error;
}

const usageRows = list(usageResponse.data);
const usageMap = new Map(usageRows.map((row) => [text(row.id), row]));
const assetRows = list(assetResponse.data);
const assetMap = new Map(assetRows.map((row) => [text(row.id), row]));
const invoiceLines = list(lineResponse.data);
const invoiceLineMap = new Map(
  invoiceLines.map((row) => [text(row.usage_id), row]),
);
const walletRows = [
  ...list(walletReferenceResponse.data),
  ...list(walletUsageResponse.data),
].filter(
  (row, index, rows) =>
    rows.findIndex((candidate) => text(candidate.id) === text(row.id)) === index,
);

const audits = pollRecords.map((record) => {
  const source = taskMap.get(text(record.source_task_id));
  const review = taskMap.get(text(record.review_task_id));
  const usage = usageMap.get(text(record.usage_id));
  const asset = assetMap.get(text(record.result?.asset_node_id));
  const line = invoiceLineMap.get(text(record.usage_id));
  const transactions = walletRows.filter(
    (row) =>
      text(row.reference) === text(record.usage_id) ||
      text(row.usage_id) === text(record.usage_id),
  );
  const reserves = transactions.filter((row) => text(row.type) === "RESERVE");
  const charges = transactions.filter((row) => text(row.type) === "CHARGE");
  const releases = transactions.filter((row) => text(row.type) === "RELEASE");
  const issues = [];
  const taskMediaUrl = outputMediaUrl(source?.output);
  const assetUrl = text(asset?.url) || text(asset?.storage_path) || null;

  if (!source || repairKind(source) !== "SOURCE") {
    issues.push("SOURCE_TASK_INVALID");
  } else {
    if (text(source.status) !== "COMPLETED") issues.push("SOURCE_NOT_COMPLETED");
    if (text(source.provider_id) !== "runway") issues.push("SOURCE_PROVIDER_INVALID");
    if (!source.timing?.completed_at) issues.push("SOURCE_COMPLETION_TIME_MISSING");
    if (text(source.error)) issues.push("SOURCE_ERROR_PRESENT");
    if (text(source.output?.asset_node_id) !== text(asset?.id)) {
      issues.push("SOURCE_ASSET_NODE_LINK_INVALID");
    }
    if (!taskMediaUrl) issues.push("SOURCE_MEDIA_URL_MISSING");
    if (text(source.output?.provider_job_id) !== text(record.provider_job_id)) {
      issues.push("SOURCE_PROVIDER_JOB_ID_INVALID");
    }
    if (text(source.output?.settlement) !== "CHARGED") {
      issues.push("SOURCE_SETTLEMENT_INVALID");
    }
  }

  if (!review || repairKind(review) !== "REVIEW") {
    issues.push("REVIEW_TASK_INVALID");
  } else {
    if (text(review.status) !== "WAITING") issues.push("REVIEW_NOT_WAITING");
    if (review.provider_id !== null) issues.push("REVIEW_PROVIDER_BOUND");
    if (review.cost?.approved === true) issues.push("REVIEW_COST_APPROVED");
    if (review.timing?.started_at || review.timing?.completed_at) {
      issues.push("REVIEW_TIMING_CHANGED");
    }
    if (Object.keys(object(review.output)).length !== 0) {
      issues.push("REVIEW_OUTPUT_PRESENT");
    }
    if (text(review.error)) issues.push("REVIEW_ERROR_PRESENT");
    if (
      list(review.depends_on).length !== 1 ||
      text(review.depends_on[0]) !== text(source?.id)
    ) {
      issues.push("REVIEW_DEPENDENCY_INVALID");
    }
  }

  if (!usage) {
    issues.push("USAGE_ROW_MISSING");
  } else {
    if (text(usage.status) !== "SUCCESS") issues.push("USAGE_NOT_SUCCESS");
    if (text(usage.invoice_status) !== "INVOICED") {
      issues.push("USAGE_NOT_INVOICED");
    }
    if (!text(usage.invoice_id)) issues.push("USAGE_INVOICE_ID_MISSING");
    if (!text(usage.billing_invoice_line_id)) {
      issues.push("USAGE_INVOICE_LINE_ID_MISSING");
    }
    if (text(usage.provider) !== "runway") issues.push("USAGE_PROVIDER_INVALID");
    if (text(usage.currency) !== "THB") issues.push("USAGE_CURRENCY_INVALID");
    if (text(usage.unit) !== "second") issues.push("USAGE_UNIT_INVALID");
    if (Number(usage.quantity) !== Number(source?.input?.quantity)) {
      issues.push("USAGE_DURATION_INVALID");
    }
    if (money(usage.customer_price) !== UNIT_PRICE) {
      issues.push("USAGE_CUSTOMER_PRICE_INVALID");
    }
    if (money(usage.supplier_cost) !== 4.0464) {
      issues.push("USAGE_SUPPLIER_COST_INVALID");
    }
    if (Number(usage.platform_markup) !== 30) {
      issues.push("USAGE_MARKUP_INVALID");
    }
    if (text(usage.error_message)) issues.push("USAGE_ERROR_PRESENT");
  }

  if (!line) {
    issues.push("BILLING_LINE_MISSING");
  } else {
    if (text(line.id) !== text(usage?.billing_invoice_line_id)) {
      issues.push("BILLING_LINE_ID_MISMATCH");
    }
    if (text(line.invoice_id) !== text(usage?.invoice_id)) {
      issues.push("BILLING_INVOICE_ID_MISMATCH");
    }
    if (text(line.provider_id) !== "runway") {
      issues.push("BILLING_PROVIDER_INVALID");
    }
    if (text(line.currency) !== "THB") issues.push("BILLING_CURRENCY_INVALID");
    if (text(line.unit) !== "second") issues.push("BILLING_UNIT_INVALID");
    if (Number(line.quantity) !== Number(usage?.quantity)) {
      issues.push("BILLING_QUANTITY_INVALID");
    }
    if (money(line.line_total) !== UNIT_PRICE) {
      issues.push("BILLING_LINE_TOTAL_INVALID");
    }
  }

  if (!asset) {
    issues.push("ASSET_NODE_MISSING");
  } else {
    if (text(asset.organization_id) !== organizationId) {
      issues.push("ASSET_ORGANIZATION_INVALID");
    }
    if (text(asset.creative_project_id) !== projectId) {
      issues.push("ASSET_PROJECT_INVALID");
    }
    if (text(asset.production_task_id) !== text(source?.id)) {
      issues.push("ASSET_PRODUCTION_TASK_INVALID");
    }
    if (text(asset.type) !== "VIDEO") issues.push("ASSET_TYPE_INVALID");
    if (text(asset.status) !== "GENERATED") issues.push("ASSET_STATUS_INVALID");
    if (!assetUrl) issues.push("ASSET_URL_MISSING");
    if (text(asset.lineage?.provider_id) !== "runway") {
      issues.push("ASSET_PROVIDER_LINEAGE_INVALID");
    }
    if (text(asset.metadata?.provider_job_id) !== text(record.provider_job_id)) {
      issues.push("ASSET_PROVIDER_JOB_ID_INVALID");
    }
    if (text(asset.metadata?.usage_id) !== text(record.usage_id)) {
      issues.push("ASSET_USAGE_ID_INVALID");
    }
    if (money(asset.cost?.actual) !== UNIT_PRICE) {
      issues.push("ASSET_ACTUAL_COST_INVALID");
    }
  }

  if (reserves.length !== 1 || money(reserves[0]?.amount) !== UNIT_PRICE) {
    issues.push("RESERVE_TRANSACTION_INVALID");
  }
  if (charges.length !== 1 || money(charges[0]?.amount) !== UNIT_PRICE) {
    issues.push("CHARGE_TRANSACTION_INVALID");
  }
  if (releases.length !== 0) issues.push("UNEXPECTED_RELEASE_PRESENT");
  if (transactions.length !== 2) issues.push("WALLET_TRANSACTION_SET_INVALID");

  return {
    source_task_id: source?.id || null,
    review_task_id: review?.id || null,
    usage_id: usage?.id || null,
    provider_job_id: record.provider_job_id || null,
    asset_node_id: asset?.id || null,
    invoice_id: usage?.invoice_id || null,
    invoice_line_id: line?.id || null,
    source_status: source?.status || null,
    review_status: review?.status || null,
    usage_status: usage?.status || null,
    invoice_status: usage?.invoice_status || null,
    asset_type: asset?.type || null,
    asset_status: asset?.status || null,
    task_media_url_present: Boolean(taskMediaUrl),
    asset_url_present: Boolean(assetUrl),
    inspection_status: asset?.metadata?.inspection_status || null,
    charge_amount: money(charges[0]?.amount),
    issues,
    ready: issues.length === 0,
  };
});

const readyCount = audits.filter((audit) => audit.ready).length;
const failureCount = audits.filter((audit) => !audit.ready).length;
const inspectionStatusCounts = audits.reduce((result, audit) => {
  const status = text(audit.inspection_status) || "UNSPECIFIED";
  result[status] = Number(result[status] || 0) + 1;
  return result;
}, {});
const reserveRows = walletRows.filter((row) => text(row.type) === "RESERVE");
const chargeRows = walletRows.filter((row) => text(row.type) === "CHARGE");
const releaseRows = walletRows.filter((row) => text(row.type) === "RELEASE");
const chargeTotal = money(
  chargeRows.reduce((sum, row) => sum + Number(row.amount || 0), 0),
);

requireValue(
  usageRows.length === 9 &&
    assetRows.length === 9 &&
    invoiceLines.length === 9 &&
    reserveRows.length === 9 &&
    chargeRows.length === 9 &&
    releaseRows.length === 0 &&
    chargeTotal === TOTAL_PRICE &&
    readyCount === 9 &&
    failureCount === 0,
  "POST_POLL_RESULT_SET_INVALID",
);

const protectedIds = new Set(
  list(dispatchCheckpoint.protected_task_ids).map(text),
);
const protectedStateSha = taskFingerprint(
  before.tasks.filter((task) => protectedIds.has(task.id)),
);
requireValue(
  protectedIds.size === 36 &&
    protectedStateSha === text(dispatchCheckpoint.protected_task_state_sha256),
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
  before.wallet_reserved_balance === after.wallet_reserved_balance &&
  before.wallet_updated_at === after.wallet_updated_at;
if (!stateUnchanged) blockers.push("READ_ONLY_RESULT_AUDIT_CHANGED_STATE");

const decision = blockers.length
  ? "REPAIR_SOURCE_POLL_RESULT_AUDIT_BLOCKED"
  : "REPAIR_SOURCE_9_COMPLETED_VIDEO_ASSETS_CONFIRMED";
const readiness = blockers.length
  ? "REPAIR_SOURCE_POLL_RESULT_AUDIT_BLOCKED"
  : "READY_FOR_REPLACEMENT_PERCEPTUAL_REVIEW_EXECUTION_PREVIEW";
const instruction = blockers.length
  ? "Resolve every result-audit blocker. Do not poll again, retry, execute reviews, finalise, or publish."
  : "Prepare one read-only execution preview for the nine waiting replacement perceptual review tasks against these exact nine completed source asset nodes. Do not regenerate sources, re-poll Runway, execute reviews, finalise, or publish.";

const report = {
  contract: REPORT_CONTRACT,
  generated_at: new Date().toISOString(),
  organization_id: organizationId,
  creative_project_id: projectId,
  production_graph_id: graphId,
  execution_file: executionFile.absolute,
  execution_file_sha256: executionFile.file_sha256,
  poll_checkpoint_file: pollCheckpointFile.absolute,
  poll_checkpoint_file_sha256: pollCheckpointFile.file_sha256,
  dispatch_checkpoint_file: dispatchCheckpointFile.absolute,
  dispatch_checkpoint_file_sha256: dispatchCheckpointFile.file_sha256,
  source_task_count: sourceIds.length,
  review_task_count: reviewIds.length,
  completed_source_count: audits.filter(
    (audit) => audit.source_status === "COMPLETED",
  ).length,
  waiting_review_count: audits.filter(
    (audit) => audit.review_status === "WAITING",
  ).length,
  successful_usage_count: audits.filter(
    (audit) => audit.usage_status === "SUCCESS",
  ).length,
  invoiced_usage_count: audits.filter(
    (audit) => audit.invoice_status === "INVOICED",
  ).length,
  video_asset_count: audits.filter(
    (audit) => audit.asset_type === "VIDEO",
  ).length,
  generated_asset_count: audits.filter(
    (audit) => audit.asset_status === "GENERATED",
  ).length,
  source_ready_count: readyCount,
  source_failure_count: failureCount,
  inspection_status_counts: inspectionStatusCounts,
  reserve_transaction_count: reserveRows.length,
  charge_transaction_count: chargeRows.length,
  release_transaction_count: releaseRows.length,
  charge_total: chargeTotal,
  source_audits: audits,
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
    wallet_reserved_balance: before.wallet_reserved_balance,
  },
  exact_state_after: {
    task_count: after.task_count,
    task_status_counts: after.task_status_counts,
    task_state_sha256: after.task_state_sha256,
    usage_count: after.usage_count,
    wallet_balance: after.wallet_balance,
    wallet_reserved_balance: after.wallet_reserved_balance,
  },
  state_unchanged: stateUnchanged,
  database_writes_executed: false,
  provider_calls_executed: false,
  provider_polls_executed: false,
  wallet_mutations_executed: false,
  review_execution_executed: false,
  finalisation_executed: false,
  publication_executed: false,
  readiness,
};

writeJson(outputPath, report);

console.log("============================================================");
console.log("READ-ONLY COMPLETED REPAIR SOURCE RESULT AUDIT");
console.log("============================================================");
console.log(`OUTPUT=${outputPath}`);
console.log(`TASK_COUNT=${before.task_count}`);
console.log(`TASK_STATUS_COUNTS=${JSON.stringify(before.task_status_counts)}`);
console.log(`SOURCE_TASK_COUNT=${sourceIds.length}`);
console.log(`REVIEW_TASK_COUNT=${reviewIds.length}`);
console.log(`COMPLETED_SOURCE_COUNT=${report.completed_source_count}`);
console.log(`WAITING_REVIEW_COUNT=${report.waiting_review_count}`);
console.log(`SUCCESSFUL_USAGE_COUNT=${report.successful_usage_count}`);
console.log(`INVOICED_USAGE_COUNT=${report.invoiced_usage_count}`);
console.log(`VIDEO_ASSET_COUNT=${report.video_asset_count}`);
console.log(`GENERATED_ASSET_COUNT=${report.generated_asset_count}`);
console.log(`SOURCE_READY_COUNT=${readyCount}`);
console.log(`SOURCE_FAILURE_COUNT=${failureCount}`);
console.log(`INSPECTION_STATUS_COUNTS=${JSON.stringify(inspectionStatusCounts)}`);
console.log(`RESERVE_TRANSACTION_COUNT=${reserveRows.length}`);
console.log(`CHARGE_TRANSACTION_COUNT=${chargeRows.length}`);
console.log(`RELEASE_TRANSACTION_COUNT=${releaseRows.length}`);
console.log(`CHARGE_TOTAL=${chargeTotal}`);

for (const audit of audits) {
  console.log([
    `COMPLETED_SOURCE_RESULT=${audit.source_task_id || ""}`,
    `review=${audit.review_task_id || ""}`,
    `usage=${audit.usage_id || ""}`,
    `job=${audit.provider_job_id || ""}`,
    `asset=${audit.asset_node_id || ""}`,
    `invoice=${audit.invoice_id || ""}`,
    `source=${audit.source_status || ""}`,
    `review_status=${audit.review_status || ""}`,
    `usage_status=${audit.usage_status || ""}`,
    `invoice_status=${audit.invoice_status || ""}`,
    `asset_type=${audit.asset_type || ""}`,
    `asset_status=${audit.asset_status || ""}`,
    `inspection=${audit.inspection_status || ""}`,
    `media=${audit.task_media_url_present && audit.asset_url_present ? "YES" : "NO"}`,
    `charge=${audit.charge_amount}`,
    `issues=${audit.issues.join(",")}`,
    `ready=${audit.ready ? "YES" : "NO"}`,
  ].join("|"));
}

console.log(`SOURCE_RESULT_BLOCKERS=${JSON.stringify(blockers)}`);
console.log(`SOURCE_RESULT_DECISION=${decision}`);
console.log(`SOURCE_RESULT_INSTRUCTION=${instruction}`);
console.log(`TASK_STATE_SHA256_BEFORE=${before.task_state_sha256}`);
console.log(`TASK_STATE_SHA256_AFTER=${after.task_state_sha256}`);
console.log(`USAGE_COUNT_BEFORE=${before.usage_count}`);
console.log(`USAGE_COUNT_AFTER=${after.usage_count}`);
console.log(`WALLET_BALANCE_BEFORE=${before.wallet_balance}`);
console.log(`WALLET_BALANCE_AFTER=${after.wallet_balance}`);
console.log(`WALLET_RESERVED_BALANCE_BEFORE=${before.wallet_reserved_balance}`);
console.log(`WALLET_RESERVED_BALANCE_AFTER=${after.wallet_reserved_balance}`);
console.log(`STATE_UNCHANGED=${stateUnchanged ? "YES" : "NO"}`);
console.log("DATABASE_WRITES_EXECUTED=NO");
console.log("PROVIDER_CALLS_EXECUTED=NO");
console.log("PROVIDER_POLLS_EXECUTED=NO");
console.log("WALLET_MUTATIONS_EXECUTED=NO");
console.log("REVIEW_EXECUTION_EXECUTED=NO");
console.log("FINALISATION_EXECUTED=NO");
console.log("PUBLICATION_EXECUTED=NO");
console.log(`AUDIT_READINESS=${readiness}`);
console.log("TERMINAL_REMAINS_OPEN=YES");

if (blockers.length || !stateUnchanged) process.exitCode = 2;
