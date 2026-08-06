#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv({ cwd: process.cwd() });
await import("./creative-runtime-bootstrap.mjs");

const PROVIDER_AUDIT_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_REPAIR_SOURCE_PROVIDER_STATUS_AUDIT_V3";
const CHECKPOINT_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_REPAIR_SOURCE_DISPATCH_CHECKPOINT_V1";
const DISPATCH_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_REPAIR_SOURCE_DISPATCH_EXECUTION_V1";
const PREVIEW_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_REPAIR_SOURCE_BOUNDED_POLL_PREVIEW_V1";
const SOURCE_CONTRACT =
  "GENERATED_MEDIA_PERCEPTUAL_REPLACEMENT_SOURCE_V1";
const REVIEW_CONTRACT =
  "GENERATED_MEDIA_PERCEPTUAL_REPLACEMENT_REVIEW_V1";
const UNIT_PRICE = 5.26032;
const TOTAL_RESERVATION = 47.34288;
const POLL_ROUND = 1;

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

function readSource(relativePath) {
  const absolute = path.resolve(process.cwd(), relativePath);
  if (!fs.existsSync(absolute)) {
    throw new Error(`POLL_RUNTIME_SOURCE_NOT_FOUND:${relativePath}`);
  }
  const content = fs.readFileSync(absolute, "utf8");
  return {
    path: relativePath,
    absolute,
    sha256: sha256(content),
    content,
  };
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

function providerSubmission(task = {}) {
  return object(task.output?.provider_submission);
}

function usageId(task = {}) {
  return text(
    task.output?.usage?.id ||
      providerSubmission(task).usage?.id,
  ) || null;
}

function providerJobId(task = {}) {
  const submission = providerSubmission(task);
  return text(
    task.output?.provider_job_id ||
      submission.provider_job_id ||
      submission.output?.provider_job_id ||
      submission.output?.output?.provider_job_id,
  ) || null;
}

function providerStatus(task = {}) {
  const submission = providerSubmission(task);
  return text(
    task.output?.provider_status ||
      submission.provider_status ||
      submission.output?.status ||
      submission.output?.output?.status,
  ) || null;
}

function credentialId(task = {}) {
  const submission = providerSubmission(task);
  return text(
    submission.credential_id ||
      task.output?.credential_id,
  ) || null;
}

function pricingSnapshot(task = {}) {
  const submission = providerSubmission(task);
  return object(
    task.output?.pricing ||
      submission.pricing ||
      submission.reservation_pricing,
  );
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

const providerAuditFile = readJson(
  process.argv[2],
  "SOURCE_PROVIDER_STATUS_AUDIT_V3",
);
const checkpointFile = readJson(
  process.argv[3],
  "SOURCE_DISPATCH_CHECKPOINT",
);
const dispatchFile = readJson(
  process.argv[4],
  "SOURCE_DISPATCH_REPORT",
);
const providerAudit = object(providerAuditFile.value);
const checkpoint = object(checkpointFile.value);
const dispatch = object(dispatchFile.value);

const organizationId = text(process.env.ORGANIZATION_ID);
const projectId = text(process.env.CREATIVE_PROJECT_ID);
const graphId = text(process.env.PRODUCTION_GRAPH_ID);
const outputPath = path.resolve(
  text(process.env.OPENAI_PERCEPTUAL_SOURCE_BOUNDED_POLL_PREVIEW_OUTPUT) ||
    "/tmp/churchill-openai-perceptual-repair-source-bounded-poll-preview.json",
);

if (!organizationId || !projectId || !graphId) {
  throw new Error("SOURCE_BOUNDED_POLL_PREVIEW_SCOPE_REQUIRED");
}

const [
  { supabaseAdmin },
  { ProductionTaskRuntime },
  { ServiceExecutionRuntime },
  { loadProviderRuntime },
] = await Promise.all([
  import("@/lib/shared/supabase/admin"),
  import("@/lib/operations/tasks/runtime/ProductionTaskRuntime"),
  import("@/lib/platform/service-runtime/execution/ServiceExecutionRuntime"),
  import("@/lib/platform/service-runtime/providers/ProviderExecutor"),
]);

const productionTaskSource = readSource(
  "lib/operations/tasks/runtime/ProductionTaskRuntime.js",
);
const serviceExecutionSource = readSource(
  "lib/platform/service-runtime/execution/ServiceExecutionRuntime.js",
);
const runwaySource = readSource(
  "lib/platform/service-runtime/providers/runway/RunwayProvider.js",
);
const billingSource = readSource(
  "lib/platform/service-runtime/billing/runtime/BillingRuntime.js",
);
const assetGraphSource = readSource(
  "lib/creative/assets/graph/runtime/CreativeAssetGraphRuntime.js",
);

const blockers = [];
const requireValue = (condition, label) => {
  if (!condition) blockers.push(label);
};

requireValue(
  text(providerAudit.contract) === PROVIDER_AUDIT_CONTRACT,
  "PROVIDER_AUDIT_CONTRACT_INVALID",
);
requireValue(
  text(checkpoint.contract) === CHECKPOINT_CONTRACT,
  "CHECKPOINT_CONTRACT_INVALID",
);
requireValue(
  text(dispatch.contract) === DISPATCH_CONTRACT,
  "DISPATCH_REPORT_CONTRACT_INVALID",
);

for (const [label, value] of [
  ["PROVIDER_AUDIT", providerAudit],
  ["CHECKPOINT", checkpoint],
  ["DISPATCH", dispatch],
]) {
  requireValue(
    text(value.organization_id) === organizationId &&
      text(value.creative_project_id) === projectId &&
      text(value.production_graph_id) === graphId,
    `${label}_SCOPE_INVALID`,
  );
}

requireValue(
  text(providerAudit.decision) ===
    "REPAIR_SOURCE_PROVIDER_STATUS_9_RUNNING_RESERVATIONS_CONFIRMED" &&
    text(providerAudit.readiness) ===
      "READY_FOR_BOUNDED_PROVIDER_STATUS_POLL_DESIGN" &&
    Number(providerAudit.source_ready_count) === 9 &&
    Number(providerAudit.source_failure_count) === 0 &&
    Number(providerAudit.pending_usage_count) === 9 &&
    money(providerAudit.reserve_total) === TOTAL_RESERVATION &&
    list(providerAudit.blockers).length === 0 &&
    providerAudit.state_unchanged === true,
  "PROVIDER_AUDIT_NOT_READY",
);

const records = list(checkpoint.source_records);
requireValue(
  text(checkpoint.status) === "SUBMITTED" &&
    records.length === 9 &&
    records.every((record) => text(record.state) === "DISPATCHED_RUNNING") &&
    Number(checkpoint.initial_usage_count) === 2658 &&
    money(checkpoint.initial_wallet_balance) === 9300.972022 &&
    Number(checkpoint.usage_delta) === 9 &&
    money(checkpoint.wallet_delta) === TOTAL_RESERVATION &&
    money(checkpoint.maximum_authorized_spend) === TOTAL_RESERVATION &&
    /^[a-f0-9]{64}$/i.test(text(checkpoint.final_task_state_sha256)),
  "CHECKPOINT_NOT_SUBMITTED_CLEANLY",
);

requireValue(
  text(dispatch.decision) === "REPAIR_SOURCE_DISPATCH_9_SOURCES_SUBMITTED" &&
    Number(dispatch.running_count) === 9 &&
    Number(dispatch.failed_count) === 0 &&
    Number(dispatch.dispatch_call_count) === 9 &&
    Number(dispatch.usage_delta) === 9 &&
    money(dispatch.wallet_delta) === TOTAL_RESERVATION &&
    dispatch.provider_polls_executed === false &&
    dispatch.retries_executed === false &&
    dispatch.review_execution_executed === false &&
    dispatch.finalisation_executed === false &&
    dispatch.publication_executed === false,
  "DISPATCH_REPORT_INVALID",
);

requireValue(
  typeof ServiceExecutionRuntime.settle === "function",
  "SERVICE_SETTLEMENT_RUNTIME_UNAVAILABLE",
);
const runwayRuntime = await loadProviderRuntime("runway");
requireValue(
  typeof runwayRuntime.getStatus === "function",
  "RUNWAY_STATUS_RUNTIME_UNAVAILABLE",
);

const genericPollTransportFailureUnsafe = Boolean(
  productionTaskSource.content.includes("async poll(id)") &&
    productionTaskSource.content.includes("return this.fail(id, error") &&
    productionTaskSource.content.includes('provider_status: "poll_error"'),
);
const directSettlementAvailable = Boolean(
  serviceExecutionSource.content.includes("export async function settlePendingService") &&
    serviceExecutionSource.content.includes("const result = await getProviderStatus") &&
    serviceExecutionSource.content.includes("if (state.pending || !state.completed)") &&
    serviceExecutionSource.content.includes("if (state.failed)") &&
    serviceExecutionSource.content.includes("await settleReservation"),
);
const runwaySingleGetStatusAvailable = Boolean(
  runwaySource.content.includes("async getStatus(input = {})") &&
    runwaySource.content.includes('method: options.method || "GET"') &&
    runwaySource.content.includes("resolveStatusEndpoint(statusTemplate, jobId)"),
);
const automaticBillingOnSuccess = Boolean(
  serviceExecutionSource.content.includes("await BillingRuntime.billUsage") &&
    billingSource.content.includes("async function billUsage") &&
    billingSource.content.includes("createLine") &&
    billingSource.content.includes("markInvoiced"),
);
const assetMaterializationOnSuccess = Boolean(
  productionTaskSource.content.includes("return this.complete(id") &&
    productionTaskSource.content.includes("CreativeAssetGraphRuntime.createFromProductionTask") &&
    assetGraphSource.content.includes("async createFromProductionTask"),
);

requireValue(
  genericPollTransportFailureUnsafe,
  "GENERIC_POLL_TRANSPORT_FAILURE_BEHAVIOR_NOT_PROVEN",
);
requireValue(
  directSettlementAvailable,
  "DIRECT_SETTLEMENT_PATH_NOT_PROVEN",
);
requireValue(
  runwaySingleGetStatusAvailable,
  "RUNWAY_SINGLE_GET_STATUS_PATH_NOT_PROVEN",
);
requireValue(
  automaticBillingOnSuccess,
  "SUCCESS_BILLING_PATH_NOT_PROVEN",
);
requireValue(
  assetMaterializationOnSuccess,
  "SUCCESS_ASSET_MATERIALIZATION_PATH_NOT_PROVEN",
);

const before = await exactState({
  supabaseAdmin,
  ProductionTaskRuntime,
  organizationId,
  projectId,
  graphId,
});
const taskMap = new Map(before.tasks.map((task) => [text(task.id), task]));
const usageIds = records.map((record) => text(record.usage_id));
const providerJobIds = records.map((record) => text(record.provider_job_id));

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
    before.task_state_sha256 ===
      text(providerAudit.exact_state_after?.task_state_sha256) &&
    before.usage_count === 2667 &&
    before.wallet_balance === 9253.629142 &&
    before.wallet_currency === "THB",
  "LIVE_SUBMITTED_STATE_CHANGED",
);
requireValue(
  usageIds.length === 9 &&
    new Set(usageIds).size === 9 &&
    usageIds.every(Boolean) &&
    providerJobIds.length === 9 &&
    new Set(providerJobIds).size === 9 &&
    providerJobIds.every(Boolean),
  "POLL_IDENTIFIER_SET_INVALID",
);

const [usageResponse, walletReferenceResponse, walletUsageResponse] =
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
if (walletReferenceResponse.error) throw walletReferenceResponse.error;
if (walletUsageResponse.error) throw walletUsageResponse.error;

const usageRows = list(usageResponse.data);
const usageMap = new Map(usageRows.map((row) => [text(row.id), row]));
const walletRows = [
  ...list(walletReferenceResponse.data),
  ...list(walletUsageResponse.data),
].filter(
  (row, index, rows) =>
    rows.findIndex((candidate) => text(candidate.id) === text(row.id)) === index,
);

const plans = records.map((record, index) => {
  const source = taskMap.get(text(record.source_task_id));
  const review = taskMap.get(text(record.review_task_id));
  const usage = usageMap.get(text(record.usage_id));
  const pricing = pricingSnapshot(source);
  const transactions = walletRows.filter(
    (row) =>
      text(row.reference) === text(record.usage_id) ||
      text(row.usage_id) === text(record.usage_id),
  );
  const reserves = transactions.filter((row) => text(row.type) === "RESERVE");
  const charges = transactions.filter((row) => text(row.type) === "CHARGE");
  const releases = transactions.filter((row) => text(row.type) === "RELEASE");
  const issues = [];

  if (!source || repairKind(source) !== "SOURCE") {
    issues.push("SOURCE_TASK_INVALID");
  }
  if (!review || repairKind(review) !== "REVIEW") {
    issues.push("REVIEW_TASK_INVALID");
  }
  if (text(source?.status) !== "RUNNING") issues.push("SOURCE_NOT_RUNNING");
  if (text(review?.status) !== "WAITING") issues.push("REVIEW_NOT_WAITING");
  if (text(source?.provider_id) !== "runway") issues.push("SOURCE_PROVIDER_INVALID");
  if (usageId(source) !== text(record.usage_id)) {
    issues.push("TASK_USAGE_ID_MISMATCH");
  }
  if (providerJobId(source) !== text(record.provider_job_id)) {
    issues.push("TASK_PROVIDER_JOB_ID_MISMATCH");
  }
  if (!credentialId(source)) issues.push("SOURCE_CREDENTIAL_ID_MISSING");
  if (outputMediaUrl(source?.output)) issues.push("SOURCE_MEDIA_ALREADY_PRESENT");
  if (source?.timing?.completed_at) issues.push("SOURCE_ALREADY_COMPLETED");
  if (text(source?.error)) issues.push("SOURCE_ERROR_PRESENT");

  if (!usage) {
    issues.push("USAGE_ROW_MISSING");
  } else {
    if (text(usage.status) !== "PENDING") issues.push("USAGE_NOT_PENDING");
    if (text(usage.provider) !== "runway") issues.push("USAGE_PROVIDER_INVALID");
    if (text(usage.currency) !== "THB") issues.push("USAGE_CURRENCY_INVALID");
    if (text(usage.invoice_status) !== "UNBILLED") {
      issues.push("USAGE_ALREADY_INVOICED");
    }
    if (text(usage.error_message)) issues.push("USAGE_ERROR_PRESENT");
    if (Number(usage.quantity) !== Number(source?.input?.quantity)) {
      issues.push("USAGE_DURATION_MISMATCH");
    }
    if (text(usage.unit) !== "second") issues.push("USAGE_UNIT_INVALID");
  }

  if (money(pricing.customer_price) !== UNIT_PRICE) {
    issues.push("PRICING_SNAPSHOT_INVALID");
  }
  if (pricing.estimated === true) issues.push("PRICING_SNAPSHOT_ESTIMATED");
  if (reserves.length !== 1) issues.push("RESERVE_TRANSACTION_COUNT_INVALID");
  if (money(reserves[0]?.amount) !== UNIT_PRICE) {
    issues.push("RESERVE_AMOUNT_INVALID");
  }
  if (charges.length !== 0) issues.push("CHARGE_ALREADY_PRESENT");
  if (releases.length !== 0) issues.push("RELEASE_ALREADY_PRESENT");
  if (transactions.length !== 1) issues.push("UNEXPECTED_WALLET_TRANSACTION_PRESENT");

  return {
    sequence: index + 1,
    source_task_id: source?.id || null,
    review_task_id: review?.id || null,
    usage_id: usage?.id || null,
    provider_job_id: record.provider_job_id || null,
    credential_id_present: Boolean(credentialId(source)),
    provider_status_before: providerStatus(source),
    source_status_before: source?.status || null,
    review_status_before: review?.status || null,
    usage_status_before: usage?.status || null,
    duration_quantity: Number(usage?.quantity || 0),
    unit: usage?.unit || null,
    reservation_amount: money(reserves[0]?.amount),
    permitted_provider_status_calls: 1,
    retry_permitted: false,
    review_execution_permitted: false,
    pending_transition: {
      source_status: "RUNNING",
      usage_status: "PENDING",
      wallet_action: "NONE",
      reservation: "REMAINS_RESERVED",
      review_status: "WAITING",
    },
    success_transition: {
      source_status: "COMPLETED",
      usage_status: "SUCCESS_INVOICED",
      wallet_action: "CHARGE_EXISTING_RESERVATION",
      maximum_charge: UNIT_PRICE,
      maximum_release: 0,
      asset_node_creation: true,
      media_inspection: true,
      review_status: "WAITING",
    },
    failure_transition: {
      source_status: "FAILED",
      usage_status: "FAILED",
      wallet_action: "RELEASE_EXISTING_RESERVATION",
      maximum_charge: 0,
      maximum_release: UNIT_PRICE,
      asset_node_creation: false,
      review_status: "WAITING",
    },
    transport_error_transition: {
      source_status: "RUNNING_UNCHANGED",
      usage_status: "PENDING_UNCHANGED",
      wallet_action: "NONE",
      reservation: "REMAINS_RESERVED",
      review_status: "WAITING_UNCHANGED",
      checkpoint_records_error_only: true,
    },
    issues,
    ready: issues.length === 0,
  };
});

const readyCount = plans.filter((plan) => plan.ready).length;
const failureCount = plans.filter((plan) => !plan.ready).length;
const reserveTotal = money(
  plans.reduce((sum, plan) => sum + plan.reservation_amount, 0),
);
const uniqueCredentialPresenceCount = plans.filter(
  (plan) => plan.credential_id_present,
).length;

requireValue(
  usageRows.length === 9 &&
    walletRows.length === 9 &&
    readyCount === 9 &&
    failureCount === 0 &&
    reserveTotal === TOTAL_RESERVATION &&
    uniqueCredentialPresenceCount === 9,
  "BOUNDED_POLL_PLAN_SET_INVALID",
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

const pollContract = {
  contract: "CHURCHILL_OPENAI_PERCEPTUAL_REPAIR_SOURCE_BOUNDED_POLL_CONTRACT_V1",
  organization_id: organizationId,
  creative_project_id: projectId,
  production_graph_id: graphId,
  poll_round: POLL_ROUND,
  provider: "runway",
  provider_status_method: "GET",
  source_task_ids: plans.map((plan) => plan.source_task_id),
  review_task_ids: plans.map((plan) => plan.review_task_id),
  usage_ids: plans.map((plan) => plan.usage_id),
  provider_job_ids: plans.map((plan) => plan.provider_job_id),
  checkpoint_file_sha256: checkpointFile.file_sha256,
  provider_audit_file_sha256: providerAuditFile.file_sha256,
  starting_task_state_sha256: before.task_state_sha256,
  protected_task_state_sha256: protectedStateSha,
  starting_usage_count: before.usage_count,
  starting_wallet_balance: before.wallet_balance,
  maximum_provider_status_calls: 9,
  maximum_calls_per_job: 1,
  maximum_existing_reservation_per_job: UNIT_PRICE,
  maximum_existing_reservation_total: TOTAL_RESERVATION,
  new_provider_generation_calls_permitted: 0,
  new_wallet_reservations_permitted: 0,
  retries_permitted: 0,
  review_execution_permitted: 0,
  downstream_review_updates_permitted: 0,
  finalisation_permitted: 0,
  publication_permitted: 0,
  generic_production_task_poll_permitted: false,
  direct_service_settlement_required: true,
  transport_error_must_leave_database_state_unchanged: true,
  pending_jobs_remain_reserved: true,
  terminal_success_settles_and_materializes: true,
  terminal_failure_releases_without_retry: true,
};
const pollContractSha = sha256(pollContract);
const expectedAuthorization =
  `AUTHORIZE BOUNDED REPAIR SOURCE STATUS POLL RUNWAY 9 JOBS ROUND ${POLL_ROUND} ` +
  `NO RETRIES NO REVIEWS ${pollContractSha}`;

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
if (!stateUnchanged) blockers.push("READ_ONLY_BOUNDED_POLL_PREVIEW_CHANGED_STATE");

const decision = blockers.length
  ? "REPAIR_SOURCE_BOUNDED_POLL_PREVIEW_BLOCKED"
  : "REPAIR_SOURCE_BOUNDED_POLL_9_JOB_ROUND_1_PREVIEW_CONFIRMED";
const readiness = blockers.length
  ? "REPAIR_SOURCE_BOUNDED_POLL_PREVIEW_BLOCKED"
  : "READY_FOR_GUARDED_BOUNDED_PROVIDER_STATUS_POLL_IMPLEMENTATION";
const instruction = blockers.length
  ? "Resolve every bounded-poll preview blocker. Do not poll providers, retry, execute reviews, finalise, or publish."
  : "Implement a guarded checkpointed round-one poll that requires the exact authorization string, calls ServiceExecutionRuntime.settle directly once for each of the nine provider job IDs, never calls ProductionTaskRuntime.poll, leaves transport errors unchanged, settles only terminal jobs, preserves waiting reviews, and never retries, finalises, or publishes.";

const report = {
  contract: PREVIEW_CONTRACT,
  generated_at: new Date().toISOString(),
  organization_id: organizationId,
  creative_project_id: projectId,
  production_graph_id: graphId,
  provider_audit_file: providerAuditFile.absolute,
  provider_audit_file_sha256: providerAuditFile.file_sha256,
  checkpoint_file: checkpointFile.absolute,
  checkpoint_file_sha256: checkpointFile.file_sha256,
  dispatch_file: dispatchFile.absolute,
  dispatch_file_sha256: dispatchFile.file_sha256,
  runtime_sources: [
    productionTaskSource,
    serviceExecutionSource,
    runwaySource,
    billingSource,
    assetGraphSource,
  ].map((source) => ({ path: source.path, sha256: source.sha256 })),
  generic_poll_transport_failure_unsafe: genericPollTransportFailureUnsafe,
  generic_production_task_poll_permitted: false,
  direct_service_settlement_available: directSettlementAvailable,
  runway_single_get_status_available: runwaySingleGetStatusAvailable,
  automatic_billing_on_success: automaticBillingOnSuccess,
  asset_materialization_on_success: assetMaterializationOnSuccess,
  poll_round: POLL_ROUND,
  source_task_count: plans.length,
  review_task_count: plans.length,
  ready_count: readyCount,
  failure_count: failureCount,
  maximum_provider_status_calls: 9,
  maximum_calls_per_job: 1,
  reservation_total: reserveTotal,
  plans,
  poll_contract: pollContract,
  poll_contract_sha256: pollContractSha,
  expected_authorization: expectedAuthorization,
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
    wallet_updated_at: before.wallet_updated_at,
  },
  exact_state_after: {
    task_count: after.task_count,
    task_status_counts: after.task_status_counts,
    task_state_sha256: after.task_state_sha256,
    usage_count: after.usage_count,
    wallet_balance: after.wallet_balance,
    wallet_reserved_balance: after.wallet_reserved_balance,
    wallet_updated_at: after.wallet_updated_at,
  },
  state_unchanged: stateUnchanged,
  database_writes_executed: false,
  wallet_reservations_executed: false,
  wallet_charges_executed: false,
  wallet_releases_executed: false,
  provider_generation_calls_executed: false,
  provider_status_calls_executed: false,
  retries_executed: false,
  review_execution_executed: false,
  finalisation_executed: false,
  publication_executed: false,
  readiness,
};

writeJson(outputPath, report);

console.log("============================================================");
console.log("READ-ONLY BOUNDED REPAIR SOURCE STATUS-POLL PREVIEW");
console.log("============================================================");
console.log(`OUTPUT=${outputPath}`);
console.log(`POLL_ROUND=${POLL_ROUND}`);
console.log(`TASK_COUNT=${before.task_count}`);
console.log(`TASK_STATUS_COUNTS=${JSON.stringify(before.task_status_counts)}`);
console.log(`SOURCE_TASK_COUNT=${plans.length}`);
console.log(`REVIEW_TASK_COUNT=${plans.length}`);
console.log(`READY_COUNT=${readyCount}`);
console.log(`FAILURE_COUNT=${failureCount}`);
console.log(`MAXIMUM_PROVIDER_STATUS_CALLS=9`);
console.log(`MAXIMUM_CALLS_PER_JOB=1`);
console.log(`RESERVATION_TOTAL=${reserveTotal}`);
console.log(`GENERIC_POLL_TRANSPORT_FAILURE_UNSAFE=${genericPollTransportFailureUnsafe ? "YES" : "NO"}`);
console.log("GENERIC_PRODUCTION_TASK_POLL_PERMITTED=NO");
console.log(`DIRECT_SERVICE_SETTLEMENT_AVAILABLE=${directSettlementAvailable ? "YES" : "NO"}`);
console.log(`RUNWAY_SINGLE_GET_STATUS_AVAILABLE=${runwaySingleGetStatusAvailable ? "YES" : "NO"}`);
console.log(`AUTOMATIC_BILLING_ON_SUCCESS=${automaticBillingOnSuccess ? "YES" : "NO"}`);
console.log(`ASSET_MATERIALIZATION_ON_SUCCESS=${assetMaterializationOnSuccess ? "YES" : "NO"}`);

for (const plan of plans) {
  console.log([
    `BOUNDED_POLL_PLAN=${plan.source_task_id || ""}`,
    `review=${plan.review_task_id || ""}`,
    `usage=${plan.usage_id || ""}`,
    `job=${plan.provider_job_id || ""}`,
    `provider_status=${plan.provider_status_before || ""}`,
    `source=${plan.source_status_before || ""}`,
    `review_status=${plan.review_status_before || ""}`,
    `usage_status=${plan.usage_status_before || ""}`,
    `duration=${plan.duration_quantity}`,
    `reserve=${plan.reservation_amount}`,
    `calls=1`,
    `retry=NO`,
    `issues=${plan.issues.join(",")}`,
    `ready=${plan.ready ? "YES" : "NO"}`,
  ].join("|"));
}

console.log(`POLL_CONTRACT_SHA256=${pollContractSha}`);
console.log(`EXPECTED_POLL_AUTHORIZATION=${expectedAuthorization}`);
console.log(`BOUNDED_POLL_BLOCKERS=${JSON.stringify(blockers)}`);
console.log(`BOUNDED_POLL_DECISION=${decision}`);
console.log(`BOUNDED_POLL_INSTRUCTION=${instruction}`);
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
console.log("WALLET_RESERVATIONS_EXECUTED=NO");
console.log("WALLET_CHARGES_EXECUTED=NO");
console.log("WALLET_RELEASES_EXECUTED=NO");
console.log("PROVIDER_GENERATION_CALLS_EXECUTED=NO");
console.log("PROVIDER_STATUS_CALLS_EXECUTED=NO");
console.log("RETRIES_EXECUTED=NO");
console.log("REVIEW_EXECUTION_EXECUTED=NO");
console.log("FINALISATION_EXECUTED=NO");
console.log("PUBLICATION_EXECUTED=NO");
console.log(`AUDIT_READINESS=${readiness}`);
console.log("TERMINAL_REMAINS_OPEN=YES");

if (blockers.length || !stateUnchanged) process.exitCode = 2;
