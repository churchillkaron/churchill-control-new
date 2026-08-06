#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv({ cwd: process.cwd() });
await import("./creative-runtime-bootstrap.mjs");

const V1_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_REPAIR_SOURCE_PROVIDER_STATUS_AUDIT_V1";
const DISPATCH_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_REPAIR_SOURCE_DISPATCH_EXECUTION_V1";
const CHECKPOINT_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_REPAIR_SOURCE_DISPATCH_CHECKPOINT_V1";
const REPORT_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_REPAIR_SOURCE_PROVIDER_STATUS_AUDIT_V2";
const SOURCE_CONTRACT =
  "GENERATED_MEDIA_PERCEPTUAL_REPLACEMENT_SOURCE_V1";
const REVIEW_CONTRACT =
  "GENERATED_MEDIA_PERCEPTUAL_REPLACEMENT_REVIEW_V1";
const EXPECTED_UNIT_PRICE = 5.26032;
const EXPECTED_TOTAL_PRICE = 47.34288;

const text = (value) => String(value ?? "").trim();
const object = (value) =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};
const list = (value) => Array.isArray(value) ? value.filter(Boolean) : [];
const money = (value) => Number(Number(value || 0).toFixed(6));
const finite = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

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

function expectedPayloadQuantity(task = {}) {
  const supplied = task.input?.quantity;
  return supplied === undefined || supplied === null || supplied === ""
    ? 1
    : Number(supplied);
}

function pricingSupplierCost(pricing = {}, quantity = 1) {
  const inputTokens = finite(pricing.metadata?.estimated_input_tokens_per_request);
  const outputTokens = finite(pricing.metadata?.estimated_output_tokens_per_request);
  const tokenCost =
    (inputTokens * finite(pricing.input_cost_per_1m)) / 1000000 +
    (outputTokens * finite(pricing.output_cost_per_1m)) / 1000000;
  const unitCost = finite(pricing.cost_per_unit) * finite(quantity, 1);
  return money(tokenCost + unitCost);
}

function pricingCustomerPrice(pricing = {}, supplierCost = 0) {
  return money(
    finite(supplierCost) * (1 + finite(pricing.markup_percent) / 100),
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

const v1File = readJson(process.argv[2], "SOURCE_PROVIDER_STATUS_AUDIT_V1");
const dispatchFile = readJson(process.argv[3], "SOURCE_DISPATCH_REPORT");
const checkpointFile = readJson(process.argv[4], "SOURCE_DISPATCH_CHECKPOINT");
const v1 = object(v1File.value);
const dispatch = object(dispatchFile.value);
const checkpoint = object(checkpointFile.value);

const organizationId = text(process.env.ORGANIZATION_ID);
const projectId = text(process.env.CREATIVE_PROJECT_ID);
const graphId = text(process.env.PRODUCTION_GRAPH_ID);
const outputPath = path.resolve(
  text(process.env.OPENAI_PERCEPTUAL_SOURCE_PROVIDER_STATUS_AUDIT_V2_OUTPUT) ||
    "/tmp/churchill-openai-perceptual-repair-source-provider-status-audit-v2.json",
);

if (!organizationId || !projectId || !graphId) {
  throw new Error("SOURCE_PROVIDER_STATUS_AUDIT_V2_SCOPE_REQUIRED");
}

const [{ supabaseAdmin }, { ProductionTaskRuntime }] = await Promise.all([
  import("@/lib/shared/supabase/admin"),
  import("@/lib/operations/tasks/runtime/ProductionTaskRuntime"),
]);

const blockers = [];
const requireValue = (condition, label) => {
  if (!condition) blockers.push(label);
};

requireValue(text(v1.contract) === V1_CONTRACT, "V1_AUDIT_CONTRACT_INVALID");
requireValue(
  text(dispatch.contract) === DISPATCH_CONTRACT,
  "DISPATCH_REPORT_CONTRACT_INVALID",
);
requireValue(
  text(checkpoint.contract) === CHECKPOINT_CONTRACT,
  "CHECKPOINT_CONTRACT_INVALID",
);

for (const [label, value] of [
  ["V1", v1],
  ["DISPATCH", dispatch],
  ["CHECKPOINT", checkpoint],
]) {
  requireValue(
    text(value.organization_id) === organizationId &&
      text(value.creative_project_id) === projectId &&
      text(value.production_graph_id) === graphId,
    `${label}_SCOPE_INVALID`,
  );
}

const v1Audits = list(v1.source_audits);
requireValue(
  text(v1.decision) === "REPAIR_SOURCE_PROVIDER_STATUS_AUDIT_BLOCKED" &&
    text(v1.readiness) === "REPAIR_SOURCE_PROVIDER_STATUS_AUDIT_BLOCKED" &&
    Number(v1.source_task_count) === 9 &&
    Number(v1.review_task_count) === 9 &&
    Number(v1.source_ready_count) === 0 &&
    Number(v1.source_failure_count) === 9 &&
    Number(v1.unique_usage_id_count) === 9 &&
    Number(v1.unique_provider_job_id_count) === 9 &&
    Number(v1.pending_usage_count) === 9 &&
    Number(v1.reserve_transaction_count) === 9 &&
    money(v1.reserve_total) === EXPECTED_TOTAL_PRICE &&
    Number(v1.charge_transaction_count) === 0 &&
    Number(v1.release_transaction_count) === 0 &&
    Number(v1.refund_transaction_count) === 0 &&
    list(v1.blockers).length === 1 &&
    v1.blockers[0] === "ONE_OR_MORE_SOURCE_PROVIDER_RECORDS_INVALID" &&
    v1Audits.length === 9 &&
    v1Audits.every(
      (audit) =>
        list(audit.issues).length === 1 &&
        audit.issues[0] === "USAGE_QUANTITY_INVALID" &&
        text(audit.source_status) === "RUNNING" &&
        text(audit.review_status) === "WAITING" &&
        text(audit.usage_status) === "PENDING" &&
        money(audit.reserve_amount) === EXPECTED_UNIT_PRICE &&
        Number(audit.charge_transaction_count) === 0 &&
        Number(audit.release_transaction_count) === 0 &&
        audit.media_output_present === false,
    ) &&
    v1.state_unchanged === true,
  "V1_AUDIT_NOT_QUANTITY_ONLY",
);

requireValue(
  text(dispatch.decision) === "REPAIR_SOURCE_DISPATCH_9_SOURCES_SUBMITTED" &&
    text(dispatch.readiness) ===
      "READY_FOR_READ_ONLY_SOURCE_PROVIDER_STATUS_AUDIT" &&
    Number(dispatch.running_count) === 9 &&
    Number(dispatch.failed_count) === 0 &&
    Number(dispatch.usage_delta) === 9 &&
    money(dispatch.wallet_delta) === EXPECTED_TOTAL_PRICE,
  "DISPATCH_REPORT_INVALID",
);

const records = list(checkpoint.source_records);
requireValue(
  text(checkpoint.status) === "SUBMITTED" &&
    records.length === 9 &&
    records.every((record) => text(record.state) === "DISPATCHED_RUNNING") &&
    Number(checkpoint.initial_usage_count) === 2658 &&
    money(checkpoint.initial_wallet_balance) === 9300.972022 &&
    Number(checkpoint.usage_delta) === 9 &&
    money(checkpoint.wallet_delta) === EXPECTED_TOTAL_PRICE,
  "CHECKPOINT_STATE_INVALID",
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
const sourceIds = new Set(records.map((record) => text(record.source_task_id)));
const reviewIds = new Set(records.map((record) => text(record.review_task_id)));

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
    before.usage_count === 2667 &&
    before.wallet_balance === 9253.629142 &&
    before.wallet_currency === "THB",
  "LIVE_SUBMITTED_STATE_INVALID",
);
requireValue(
  sourceIds.size === 9 && reviewIds.size === 9 && new Set(usageIds).size === 9,
  "CHECKPOINT_IDENTIFIER_SET_INVALID",
);

const usageResponse = await supabaseAdmin
  .from("platform_service_usage")
  .select("*")
  .in("id", usageIds);
if (usageResponse.error) throw usageResponse.error;
const usageRows = list(usageResponse.data);
const usageMap = new Map(usageRows.map((row) => [text(row.id), row]));
const pricingIds = [...new Set(usageRows.map((row) => text(row.pricing_id)))];

const pricingResponse = await supabaseAdmin
  .from("provider_pricing")
  .select("*")
  .in("id", pricingIds);
if (pricingResponse.error) throw pricingResponse.error;
const pricingRows = list(pricingResponse.data);
const pricingMap = new Map(pricingRows.map((row) => [text(row.id), row]));

const walletResponse = await supabaseAdmin
  .from("wallet_transactions")
  .select("*")
  .eq("organization_id", organizationId)
  .in("reference", usageIds);
if (walletResponse.error) throw walletResponse.error;
const walletRows = list(walletResponse.data);

const audits = records.map((record) => {
  const source = taskMap.get(text(record.source_task_id));
  const review = taskMap.get(text(record.review_task_id));
  const usage = usageMap.get(text(record.usage_id));
  const pricing = pricingMap.get(text(usage?.pricing_id));
  const reserves = walletRows.filter(
    (row) =>
      text(row.reference) === text(record.usage_id) &&
      text(row.type) === "RESERVE",
  );
  const reserve = reserves[0] || null;
  const issues = [];

  const payloadQuantity = expectedPayloadQuantity(source);
  const usageQuantity = Number(usage?.quantity);
  const pricingUnit = text(pricing?.unit) || "request";
  const expectedSupplierCost = pricingSupplierCost(pricing, payloadQuantity);
  const expectedCustomerPrice = pricingCustomerPrice(
    pricing,
    expectedSupplierCost,
  );
  const reservationPricing = object(usage?.metadata?.reservation_pricing);

  if (!source || repairKind(source) !== "SOURCE") {
    issues.push("SOURCE_TASK_INVALID");
  }
  if (!review || repairKind(review) !== "REVIEW") {
    issues.push("REVIEW_TASK_INVALID");
  }
  if (text(source?.status) !== "RUNNING") issues.push("SOURCE_NOT_RUNNING");
  if (text(review?.status) !== "WAITING") issues.push("REVIEW_NOT_WAITING");
  if (usageId(source) !== text(record.usage_id)) {
    issues.push("TASK_USAGE_ID_MISMATCH");
  }
  if (providerJobId(source) !== text(record.provider_job_id)) {
    issues.push("TASK_PROVIDER_JOB_ID_MISMATCH");
  }
  if (outputMediaUrl(source?.output)) issues.push("MEDIA_ALREADY_PRESENT");

  if (!usage) {
    issues.push("USAGE_ROW_MISSING");
  } else {
    if (text(usage.status) !== "PENDING") issues.push("USAGE_NOT_PENDING");
    if (text(usage.provider) !== "runway") issues.push("USAGE_PROVIDER_INVALID");
    if (text(usage.currency) !== "THB") issues.push("USAGE_CURRENCY_INVALID");
    if (text(usage.invoice_status) !== "UNBILLED") {
      issues.push("USAGE_INVOICE_STATUS_INVALID");
    }
    if (text(usage.error_message)) issues.push("USAGE_ERROR_PRESENT");
    if (!Number.isFinite(payloadQuantity) || payloadQuantity <= 0) {
      issues.push("TASK_PAYLOAD_QUANTITY_INVALID");
    }
    if (!Number.isFinite(usageQuantity) || usageQuantity <= 0) {
      issues.push("USAGE_QUANTITY_NON_POSITIVE");
    }
    if (usageQuantity !== payloadQuantity) {
      issues.push("USAGE_QUANTITY_PAYLOAD_MISMATCH");
    }
    if (text(usage.unit) !== pricingUnit) {
      issues.push("USAGE_UNIT_PRICING_MISMATCH");
    }
  }

  if (!pricing) {
    issues.push("PRICING_ROW_MISSING");
  } else {
    if (pricing.active !== true) issues.push("PRICING_NOT_ACTIVE");
    if (text(pricing.provider) !== "runway") issues.push("PRICING_PROVIDER_INVALID");
    if (text(pricing.currency) !== "THB") issues.push("PRICING_CURRENCY_INVALID");
    if (finite(pricing.cost_per_unit) <= 0) issues.push("PRICING_UNIT_COST_INVALID");
    if (expectedSupplierCost <= 0) issues.push("EXPECTED_SUPPLIER_COST_INVALID");
    if (expectedCustomerPrice !== EXPECTED_UNIT_PRICE) {
      issues.push("CALCULATED_CUSTOMER_PRICE_INVALID");
    }
  }

  if (text(reservationPricing.pricing_id) !== text(pricing?.id)) {
    issues.push("RESERVATION_PRICING_ID_MISMATCH");
  }
  if (text(reservationPricing.provider) !== "runway") {
    issues.push("RESERVATION_PROVIDER_INVALID");
  }
  if (text(reservationPricing.currency) !== "THB") {
    issues.push("RESERVATION_CURRENCY_INVALID");
  }
  if ((text(reservationPricing.unit) || "request") !== pricingUnit) {
    issues.push("RESERVATION_UNIT_MISMATCH");
  }
  if (money(reservationPricing.supplier_cost) !== expectedSupplierCost) {
    issues.push("RESERVATION_SUPPLIER_COST_MISMATCH");
  }
  if (money(reservationPricing.customer_price) !== expectedCustomerPrice) {
    issues.push("RESERVATION_CUSTOMER_PRICE_MISMATCH");
  }

  if (reserves.length !== 1) issues.push("RESERVE_TRANSACTION_COUNT_INVALID");
  if (money(reserve?.amount) !== expectedCustomerPrice) {
    issues.push("RESERVE_AMOUNT_PRICING_MISMATCH");
  }
  if (text(reserve?.currency) !== "THB") issues.push("RESERVE_CURRENCY_INVALID");
  if (text(reserve?.provider) !== "runway") issues.push("RESERVE_PROVIDER_INVALID");
  if (text(reserve?.reference) !== text(record.usage_id)) {
    issues.push("RESERVE_REFERENCE_INVALID");
  }

  return {
    source_task_id: source?.id || null,
    review_task_id: review?.id || null,
    usage_id: usage?.id || null,
    provider_job_id: record.provider_job_id || null,
    task_payload_quantity: payloadQuantity,
    usage_quantity: usageQuantity,
    usage_unit: usage?.unit || null,
    pricing_id: pricing?.id || null,
    pricing_model: pricing?.model || null,
    pricing_unit: pricingUnit,
    pricing_cost_per_unit: finite(pricing?.cost_per_unit),
    pricing_markup_percent: finite(pricing?.markup_percent),
    calculated_supplier_cost: expectedSupplierCost,
    calculated_customer_price: expectedCustomerPrice,
    reservation_supplier_cost: money(reservationPricing.supplier_cost),
    reservation_customer_price: money(reservationPricing.customer_price),
    reserve_amount: money(reserve?.amount),
    source_status: source?.status || null,
    review_status: review?.status || null,
    usage_status: usage?.status || null,
    issues,
    ready: issues.length === 0,
  };
});

const readyCount = audits.filter((audit) => audit.ready).length;
const failureCount = audits.filter((audit) => !audit.ready).length;
const quantitySet = [...new Set(audits.map((audit) => audit.usage_quantity))];
const unitSet = [...new Set(audits.map((audit) => text(audit.usage_unit)))];
const reserveTotal = money(
  audits.reduce((sum, audit) => sum + audit.reserve_amount, 0),
);

requireValue(
  usageRows.length === 9 &&
    pricingRows.length >= 1 &&
    walletRows.length === 9 &&
    readyCount === 9 &&
    failureCount === 0 &&
    reserveTotal === EXPECTED_TOTAL_PRICE,
  "QUANTITY_PRICING_RESERVATION_CONTRACT_INVALID",
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
if (!stateUnchanged) blockers.push("READ_ONLY_PROVIDER_STATUS_V2_CHANGED_STATE");

const decision = blockers.length
  ? "REPAIR_SOURCE_PROVIDER_STATUS_V2_AUDIT_BLOCKED"
  : "REPAIR_SOURCE_PROVIDER_STATUS_9_RUNNING_RESERVATIONS_CONFIRMED";
const readiness = blockers.length
  ? "REPAIR_SOURCE_PROVIDER_STATUS_V2_AUDIT_BLOCKED"
  : "READY_FOR_BOUNDED_PROVIDER_STATUS_POLL_DESIGN";
const instruction = blockers.length
  ? "Resolve every V2 provider-status audit blocker. Do not poll providers, retry, execute reviews, finalise, or publish."
  : "Design a separate bounded status-poll workflow for exactly these nine Runway job IDs. Poll each job at most once per authorized run, settle only terminal jobs, leave pending jobs reserved, never retry failed jobs, keep all reviews blocked, and never finalise or publish.";

const report = {
  contract: REPORT_CONTRACT,
  generated_at: new Date().toISOString(),
  organization_id: organizationId,
  creative_project_id: projectId,
  production_graph_id: graphId,
  v1_audit_file: v1File.absolute,
  v1_audit_file_sha256: v1File.file_sha256,
  dispatch_report_file: dispatchFile.absolute,
  dispatch_report_file_sha256: dispatchFile.file_sha256,
  checkpoint_file: checkpointFile.absolute,
  checkpoint_file_sha256: checkpointFile.file_sha256,
  source_task_count: sourceIds.size,
  review_task_count: reviewIds.size,
  source_ready_count: readyCount,
  source_failure_count: failureCount,
  usage_row_count: usageRows.length,
  pricing_row_count: pricingRows.length,
  reserve_transaction_count: walletRows.length,
  reserve_total: reserveTotal,
  usage_quantity_values: quantitySet,
  usage_unit_values: unitSet,
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
console.log("READ-ONLY REPAIR SOURCE PROVIDER-STATUS AUDIT V2");
console.log("============================================================");
console.log(`OUTPUT=${outputPath}`);
console.log(`V1_ONLY_BLOCKER=USAGE_QUANTITY_INVALID`);
console.log(`TASK_COUNT=${before.task_count}`);
console.log(`TASK_STATUS_COUNTS=${JSON.stringify(before.task_status_counts)}`);
console.log(`SOURCE_TASK_COUNT=${sourceIds.size}`);
console.log(`REVIEW_TASK_COUNT=${reviewIds.size}`);
console.log(`SOURCE_READY_COUNT=${readyCount}`);
console.log(`SOURCE_FAILURE_COUNT=${failureCount}`);
console.log(`USAGE_ROW_COUNT=${usageRows.length}`);
console.log(`PRICING_ROW_COUNT=${pricingRows.length}`);
console.log(`USAGE_QUANTITY_VALUES=${JSON.stringify(quantitySet)}`);
console.log(`USAGE_UNIT_VALUES=${JSON.stringify(unitSet)}`);
console.log(`RESERVE_TRANSACTION_COUNT=${walletRows.length}`);
console.log(`RESERVE_TOTAL=${reserveTotal}`);
console.log(`PROTECTED_TASK_COUNT=${protectedIds.size}`);
console.log(`PROTECTED_TASK_STATE_SHA256=${protectedStateSha}`);

for (const audit of audits) {
  console.log([
    `SOURCE_PROVIDER_STATUS_V2=${audit.source_task_id || ""}`,
    `review=${audit.review_task_id || ""}`,
    `usage=${audit.usage_id || ""}`,
    `job=${audit.provider_job_id || ""}`,
    `payload_quantity=${audit.task_payload_quantity}`,
    `usage_quantity=${audit.usage_quantity}`,
    `usage_unit=${audit.usage_unit || ""}`,
    `pricing_unit=${audit.pricing_unit || ""}`,
    `cost_per_unit=${audit.pricing_cost_per_unit}`,
    `markup=${audit.pricing_markup_percent}`,
    `supplier=${audit.calculated_supplier_cost}`,
    `customer=${audit.calculated_customer_price}`,
    `reserve=${audit.reserve_amount}`,
    `source_status=${audit.source_status || ""}`,
    `review_status=${audit.review_status || ""}`,
    `usage_status=${audit.usage_status || ""}`,
    `issues=${audit.issues.join(",")}`,
    `ready=${audit.ready ? "YES" : "NO"}`,
  ].join("|"));
}

console.log(`SOURCE_PROVIDER_STATUS_V2_BLOCKERS=${JSON.stringify(blockers)}`);
console.log(`SOURCE_PROVIDER_STATUS_V2_DECISION=${decision}`);
console.log(`SOURCE_PROVIDER_STATUS_V2_INSTRUCTION=${instruction}`);
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

if (blockers.length || !stateUnchanged) process.exitCode = 2;
