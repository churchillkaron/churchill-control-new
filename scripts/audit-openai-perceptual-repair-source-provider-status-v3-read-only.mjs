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
const V2_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_REPAIR_SOURCE_PROVIDER_STATUS_AUDIT_V2";
const DISPATCH_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_REPAIR_SOURCE_DISPATCH_EXECUTION_V1";
const CHECKPOINT_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_REPAIR_SOURCE_DISPATCH_CHECKPOINT_V1";
const REPORT_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_REPAIR_SOURCE_PROVIDER_STATUS_AUDIT_V3";
const SOURCE_CONTRACT =
  "GENERATED_MEDIA_PERCEPTUAL_REPLACEMENT_SOURCE_V1";
const REVIEW_CONTRACT =
  "GENERATED_MEDIA_PERCEPTUAL_REPLACEMENT_REVIEW_V1";
const EXPECTED_UNIT_SUPPLIER_COST = 4.0464;
const EXPECTED_UNIT_CUSTOMER_PRICE = 5.26032;
const EXPECTED_MARKUP_PERCENT = 30;
const EXPECTED_TOTAL_RESERVATION = 47.34288;
const EXPECTED_V2_ISSUES = [
  "CALCULATED_CUSTOMER_PRICE_INVALID",
  "RESERVATION_SUPPLIER_COST_MISMATCH",
  "RESERVATION_CUSTOMER_PRICE_MISMATCH",
  "RESERVE_AMOUNT_PRICING_MISMATCH",
].sort();

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

function pricingSnapshot(task = {}) {
  return object(
    task.output?.pricing ||
      task.output?.provider_submission?.pricing ||
      task.output?.provider_submission?.reservation_pricing,
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

function sameIssueSet(actual = [], expected = []) {
  return JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort());
}

function singleUnitCustomerPrice(supplierCost, markupPercent) {
  return money(
    finite(supplierCost) * (1 + finite(markupPercent) / 100),
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
const v2File = readJson(process.argv[3], "SOURCE_PROVIDER_STATUS_AUDIT_V2");
const dispatchFile = readJson(process.argv[4], "SOURCE_DISPATCH_REPORT");
const checkpointFile = readJson(process.argv[5], "SOURCE_DISPATCH_CHECKPOINT");
const v1 = object(v1File.value);
const v2 = object(v2File.value);
const dispatch = object(dispatchFile.value);
const checkpoint = object(checkpointFile.value);

const organizationId = text(process.env.ORGANIZATION_ID);
const projectId = text(process.env.CREATIVE_PROJECT_ID);
const graphId = text(process.env.PRODUCTION_GRAPH_ID);
const outputPath = path.resolve(
  text(process.env.OPENAI_PERCEPTUAL_SOURCE_PROVIDER_STATUS_AUDIT_V3_OUTPUT) ||
    "/tmp/churchill-openai-perceptual-repair-source-provider-status-audit-v3.json",
);

if (!organizationId || !projectId || !graphId) {
  throw new Error("SOURCE_PROVIDER_STATUS_AUDIT_V3_SCOPE_REQUIRED");
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
requireValue(text(v2.contract) === V2_CONTRACT, "V2_AUDIT_CONTRACT_INVALID");
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
  ["V2", v2],
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

requireValue(
  text(v1.decision) === "REPAIR_SOURCE_PROVIDER_STATUS_AUDIT_BLOCKED" &&
    Number(v1.source_failure_count) === 9 &&
    list(v1.source_audits).length === 9 &&
    list(v1.source_audits).every(
      (audit) =>
        sameIssueSet(list(audit.issues), ["USAGE_QUANTITY_INVALID"]) &&
        audit.media_output_present === false,
    ) &&
    v1.state_unchanged === true,
  "V1_AUDIT_NOT_QUANTITY_ONLY",
);

requireValue(
  text(v2.decision) === "REPAIR_SOURCE_PROVIDER_STATUS_V2_AUDIT_BLOCKED" &&
    Number(v2.source_failure_count) === 9 &&
    Number(v2.usage_row_count) === 9 &&
    Number(v2.reserve_transaction_count) === 9 &&
    money(v2.reserve_total) === EXPECTED_TOTAL_RESERVATION &&
    list(v2.source_audits).length === 9 &&
    list(v2.source_audits).every(
      (audit) =>
        sameIssueSet(list(audit.issues), EXPECTED_V2_ISSUES) &&
        text(audit.source_status) === "RUNNING" &&
        text(audit.review_status) === "WAITING" &&
        text(audit.usage_status) === "PENDING" &&
        Number(audit.task_payload_quantity) === Number(audit.usage_quantity) &&
        text(audit.usage_unit) === "second" &&
        text(audit.pricing_unit) === "second" &&
        money(audit.reserve_amount) === EXPECTED_UNIT_CUSTOMER_PRICE,
    ) &&
    v2.state_unchanged === true,
  "V2_AUDIT_NOT_RECALCULATION_ONLY",
);

requireValue(
  text(dispatch.decision) === "REPAIR_SOURCE_DISPATCH_9_SOURCES_SUBMITTED" &&
    text(dispatch.readiness) ===
      "READY_FOR_READ_ONLY_SOURCE_PROVIDER_STATUS_AUDIT" &&
    Number(dispatch.running_count) === 9 &&
    Number(dispatch.failed_count) === 0 &&
    Number(dispatch.usage_delta) === 9 &&
    money(dispatch.wallet_delta) === EXPECTED_TOTAL_RESERVATION &&
    dispatch.provider_polls_executed === false &&
    dispatch.retries_executed === false &&
    dispatch.review_execution_executed === false &&
    dispatch.finalisation_executed === false &&
    dispatch.publication_executed === false,
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
    money(checkpoint.wallet_delta) === EXPECTED_TOTAL_RESERVATION &&
    money(checkpoint.maximum_authorized_spend) === EXPECTED_TOTAL_RESERVATION,
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
    before.usage_count === 2667 &&
    before.wallet_balance === 9253.629142 &&
    before.wallet_currency === "THB",
  "LIVE_SUBMITTED_STATE_INVALID",
);
requireValue(
  sourceIds.size === 9 &&
    reviewIds.size === 9 &&
    usageIds.length === 9 &&
    new Set(usageIds).size === 9 &&
    providerJobIds.length === 9 &&
    new Set(providerJobIds).size === 9,
  "CHECKPOINT_IDENTIFIER_SET_INVALID",
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
const pricingIds = [...new Set(usageRows.map((row) => text(row.pricing_id)))];
const pricingResponse = await supabaseAdmin
  .from("provider_pricing")
  .select("*")
  .in("id", pricingIds);
if (pricingResponse.error) throw pricingResponse.error;
const pricingRows = list(pricingResponse.data);
const pricingMap = new Map(pricingRows.map((row) => [text(row.id), row]));

const walletRows = [
  ...list(walletReferenceResponse.data),
  ...list(walletUsageResponse.data),
].filter(
  (row, index, rows) =>
    rows.findIndex((candidate) => text(candidate.id) === text(row.id)) === index,
);

const audits = records.map((record) => {
  const source = taskMap.get(text(record.source_task_id));
  const review = taskMap.get(text(record.review_task_id));
  const usage = usageMap.get(text(record.usage_id));
  const livePricing = pricingMap.get(text(usage?.pricing_id));
  const sourcePricing = pricingSnapshot(source);
  const reservationPricing = object(usage?.metadata?.reservation_pricing);
  const transactions = walletRows.filter(
    (row) =>
      text(row.reference) === text(record.usage_id) ||
      text(row.usage_id) === text(record.usage_id),
  );
  const reserves = transactions.filter((row) => text(row.type) === "RESERVE");
  const charges = transactions.filter((row) => text(row.type) === "CHARGE");
  const releases = transactions.filter((row) => text(row.type) === "RELEASE");
  const refunds = transactions.filter((row) => text(row.type) === "REFUND");
  const reserve = reserves[0] || null;
  const issues = [];

  const payloadQuantity = Number(source?.input?.quantity);
  const usageQuantity = Number(usage?.quantity);
  const snapshotSupplierCost = money(reservationPricing.supplier_cost);
  const snapshotMarkup = finite(reservationPricing.platform_markup);
  const snapshotCustomerPrice = money(reservationPricing.customer_price);
  const snapshotOneUnitCustomerPrice = singleUnitCustomerPrice(
    snapshotSupplierCost,
    snapshotMarkup,
  );
  const liveOneUnitCustomerPrice = singleUnitCustomerPrice(
    livePricing?.cost_per_unit,
    livePricing?.markup_percent,
  );

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
  if (source?.cost?.approved !== true) issues.push("SOURCE_COST_NOT_APPROVED");
  if (money(source?.cost?.estimated) !== EXPECTED_UNIT_CUSTOMER_PRICE) {
    issues.push("SOURCE_APPROVED_PRICE_INVALID");
  }
  if (Number(source?.cost?.actual || 0) !== 0) {
    issues.push("SOURCE_ACTUAL_COST_ALREADY_RECORDED");
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
      issues.push("TASK_DURATION_QUANTITY_INVALID");
    }
    if (usageQuantity !== payloadQuantity) {
      issues.push("USAGE_DURATION_QUANTITY_MISMATCH");
    }
    if (text(usage.unit) !== "second") issues.push("USAGE_UNIT_INVALID");
  }

  if (!livePricing) {
    issues.push("LIVE_PRICING_ROW_MISSING");
  } else {
    if (livePricing.active !== true) issues.push("LIVE_PRICING_NOT_ACTIVE");
    if (text(livePricing.provider) !== "runway") {
      issues.push("LIVE_PRICING_PROVIDER_INVALID");
    }
    if (text(livePricing.currency) !== "THB") {
      issues.push("LIVE_PRICING_CURRENCY_INVALID");
    }
    if (text(livePricing.unit) !== "second") {
      issues.push("LIVE_PRICING_UNIT_INVALID");
    }
    if (money(livePricing.cost_per_unit) !== EXPECTED_UNIT_SUPPLIER_COST) {
      issues.push("LIVE_PRICING_UNIT_COST_INVALID");
    }
    if (finite(livePricing.markup_percent) !== EXPECTED_MARKUP_PERCENT) {
      issues.push("LIVE_PRICING_MARKUP_INVALID");
    }
    if (liveOneUnitCustomerPrice !== EXPECTED_UNIT_CUSTOMER_PRICE) {
      issues.push("LIVE_SINGLE_UNIT_PRICE_INVALID");
    }
  }

  for (const [label, snapshot] of [
    ["SOURCE", sourcePricing],
    ["RESERVATION", reservationPricing],
  ]) {
    if (text(snapshot.pricing_id) !== text(usage?.pricing_id)) {
      issues.push(`${label}_SNAPSHOT_PRICING_ID_MISMATCH`);
    }
    if (text(snapshot.provider) !== "runway") {
      issues.push(`${label}_SNAPSHOT_PROVIDER_INVALID`);
    }
    if (text(snapshot.currency) !== "THB") {
      issues.push(`${label}_SNAPSHOT_CURRENCY_INVALID`);
    }
    if (text(snapshot.unit) !== "second") {
      issues.push(`${label}_SNAPSHOT_UNIT_INVALID`);
    }
    if (money(snapshot.supplier_cost) !== EXPECTED_UNIT_SUPPLIER_COST) {
      issues.push(`${label}_SNAPSHOT_SUPPLIER_COST_INVALID`);
    }
    if (finite(snapshot.platform_markup) !== EXPECTED_MARKUP_PERCENT) {
      issues.push(`${label}_SNAPSHOT_MARKUP_INVALID`);
    }
    if (money(snapshot.customer_price) !== EXPECTED_UNIT_CUSTOMER_PRICE) {
      issues.push(`${label}_SNAPSHOT_CUSTOMER_PRICE_INVALID`);
    }
    if (snapshot.estimated === true) {
      issues.push(`${label}_SNAPSHOT_MUST_BE_NON_ESTIMATED`);
    }
  }

  if (snapshotOneUnitCustomerPrice !== EXPECTED_UNIT_CUSTOMER_PRICE) {
    issues.push("SNAPSHOT_SINGLE_UNIT_FORMULA_INVALID");
  }
  if (reserves.length !== 1) issues.push("RESERVE_TRANSACTION_COUNT_INVALID");
  if (charges.length !== 0) issues.push("CHARGE_ALREADY_PRESENT");
  if (releases.length !== 0) issues.push("RELEASE_ALREADY_PRESENT");
  if (refunds.length !== 0) issues.push("REFUND_ALREADY_PRESENT");
  if (transactions.length !== 1) issues.push("UNEXPECTED_WALLET_TRANSACTION_PRESENT");
  if (money(reserve?.amount) !== EXPECTED_UNIT_CUSTOMER_PRICE) {
    issues.push("RESERVE_AMOUNT_INVALID");
  }
  if (text(reserve?.currency) !== "THB") issues.push("RESERVE_CURRENCY_INVALID");
  if (text(reserve?.provider) !== "runway") issues.push("RESERVE_PROVIDER_INVALID");
  if (text(reserve?.reference) !== text(record.usage_id)) {
    issues.push("RESERVE_REFERENCE_INVALID");
  }
  if (text(reserve?.idempotency_key) !== `RESERVE:${record.usage_id}`) {
    issues.push("RESERVE_IDEMPOTENCY_INVALID");
  }

  return {
    source_task_id: source?.id || null,
    review_task_id: review?.id || null,
    usage_id: usage?.id || null,
    provider_job_id: record.provider_job_id || null,
    source_status: source?.status || null,
    review_status: review?.status || null,
    usage_status: usage?.status || null,
    duration_quantity: usageQuantity,
    usage_unit: usage?.unit || null,
    pricing_resolution_quantity: 1,
    pricing_id: usage?.pricing_id || null,
    snapshot_supplier_cost: snapshotSupplierCost,
    snapshot_markup_percent: snapshotMarkup,
    snapshot_customer_price: snapshotCustomerPrice,
    snapshot_one_unit_customer_price: snapshotOneUnitCustomerPrice,
    live_one_unit_customer_price: liveOneUnitCustomerPrice,
    reserve_amount: money(reserve?.amount),
    charge_transaction_count: charges.length,
    release_transaction_count: releases.length,
    media_output_present: Boolean(outputMediaUrl(source?.output)),
    issues,
    ready: issues.length === 0,
  };
});

const readyCount = audits.filter((audit) => audit.ready).length;
const failureCount = audits.filter((audit) => !audit.ready).length;
const durationValues = [...new Set(audits.map((audit) => audit.duration_quantity))];
const reserveTotal = money(
  audits.reduce((sum, audit) => sum + audit.reserve_amount, 0),
);
const pendingUsageCount = audits.filter(
  (audit) => text(audit.usage_status) === "PENDING",
).length;

requireValue(
  usageRows.length === 9 &&
    pricingRows.length === 1 &&
    readyCount === 9 &&
    failureCount === 0 &&
    pendingUsageCount === 9 &&
    reserveTotal === EXPECTED_TOTAL_RESERVATION,
  "IMMUTABLE_RESERVATION_SNAPSHOT_CONTRACT_INVALID",
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
if (!stateUnchanged) blockers.push("READ_ONLY_PROVIDER_STATUS_V3_CHANGED_STATE");

const decision = blockers.length
  ? "REPAIR_SOURCE_PROVIDER_STATUS_V3_AUDIT_BLOCKED"
  : "REPAIR_SOURCE_PROVIDER_STATUS_9_RUNNING_RESERVATIONS_CONFIRMED";
const readiness = blockers.length
  ? "REPAIR_SOURCE_PROVIDER_STATUS_V3_AUDIT_BLOCKED"
  : "READY_FOR_BOUNDED_PROVIDER_STATUS_POLL_DESIGN";
const instruction = blockers.length
  ? "Resolve every V3 provider-status audit blocker. Do not poll providers, retry, execute reviews, finalise, or publish."
  : "Use the immutable non-estimated reservation snapshot of 5.26032 THB per submitted job for this authorized repair run. Treat usage.quantity as recorded duration metadata, not a second pricing multiplier. Design a separate bounded poll for exactly the nine provider job IDs; poll once per authorized run, settle only terminal jobs, leave pending jobs reserved, never retry failures, keep reviews blocked, and never finalise or publish.";

const report = {
  contract: REPORT_CONTRACT,
  generated_at: new Date().toISOString(),
  organization_id: organizationId,
  creative_project_id: projectId,
  production_graph_id: graphId,
  v1_audit_file: v1File.absolute,
  v1_audit_file_sha256: v1File.file_sha256,
  v2_audit_file: v2File.absolute,
  v2_audit_file_sha256: v2File.file_sha256,
  dispatch_report_file: dispatchFile.absolute,
  dispatch_report_file_sha256: dispatchFile.file_sha256,
  checkpoint_file: checkpointFile.absolute,
  checkpoint_file_sha256: checkpointFile.file_sha256,
  source_task_count: sourceIds.size,
  review_task_count: reviewIds.size,
  source_ready_count: readyCount,
  source_failure_count: failureCount,
  pending_usage_count: pendingUsageCount,
  pricing_row_count: pricingRows.length,
  reserve_transaction_count: audits.length,
  reserve_total: reserveTotal,
  duration_quantity_values: durationValues,
  usage_unit_values: ["second"],
  pricing_resolution_quantity: 1,
  immutable_unit_supplier_cost: EXPECTED_UNIT_SUPPLIER_COST,
  immutable_unit_customer_price: EXPECTED_UNIT_CUSTOMER_PRICE,
  immutable_total_reservation: EXPECTED_TOTAL_RESERVATION,
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
console.log("READ-ONLY REPAIR SOURCE PROVIDER-STATUS AUDIT V3");
console.log("============================================================");
console.log(`OUTPUT=${outputPath}`);
console.log("V1_ONLY_BLOCKER=USAGE_QUANTITY_INVALID");
console.log("V2_ONLY_BLOCKER=SECOND_MULTIPLICATION_OF_RESOLVED_PRICE_SNAPSHOT");
console.log(`TASK_COUNT=${before.task_count}`);
console.log(`TASK_STATUS_COUNTS=${JSON.stringify(before.task_status_counts)}`);
console.log(`SOURCE_TASK_COUNT=${sourceIds.size}`);
console.log(`REVIEW_TASK_COUNT=${reviewIds.size}`);
console.log(`SOURCE_READY_COUNT=${readyCount}`);
console.log(`SOURCE_FAILURE_COUNT=${failureCount}`);
console.log(`PENDING_USAGE_COUNT=${pendingUsageCount}`);
console.log(`PRICING_ROW_COUNT=${pricingRows.length}`);
console.log(`DURATION_QUANTITY_VALUES=${JSON.stringify(durationValues)}`);
console.log("USAGE_UNIT_VALUES=[\"second\"]");
console.log("PRICING_RESOLUTION_QUANTITY=1");
console.log(`IMMUTABLE_UNIT_SUPPLIER_COST=${EXPECTED_UNIT_SUPPLIER_COST}`);
console.log(`IMMUTABLE_UNIT_CUSTOMER_PRICE=${EXPECTED_UNIT_CUSTOMER_PRICE}`);
console.log(`RESERVE_TRANSACTION_COUNT=${audits.length}`);
console.log(`RESERVE_TOTAL=${reserveTotal}`);
console.log(`PROTECTED_TASK_COUNT=${protectedIds.size}`);
console.log(`PROTECTED_TASK_STATE_SHA256=${protectedStateSha}`);

for (const audit of audits) {
  console.log([
    `SOURCE_PROVIDER_STATUS_V3=${audit.source_task_id || ""}`,
    `review=${audit.review_task_id || ""}`,
    `usage=${audit.usage_id || ""}`,
    `job=${audit.provider_job_id || ""}`,
    `duration=${audit.duration_quantity}`,
    `usage_unit=${audit.usage_unit || ""}`,
    `pricing_quantity=${audit.pricing_resolution_quantity}`,
    `supplier=${audit.snapshot_supplier_cost}`,
    `markup=${audit.snapshot_markup_percent}`,
    `customer=${audit.snapshot_customer_price}`,
    `reserve=${audit.reserve_amount}`,
    `source_status=${audit.source_status || ""}`,
    `review_status=${audit.review_status || ""}`,
    `usage_status=${audit.usage_status || ""}`,
    `charges=${audit.charge_transaction_count}`,
    `releases=${audit.release_transaction_count}`,
    `media=${audit.media_output_present ? "YES" : "NO"}`,
    `issues=${audit.issues.join(",")}`,
    `ready=${audit.ready ? "YES" : "NO"}`,
  ].join("|"));
}

console.log(`SOURCE_PROVIDER_STATUS_V3_BLOCKERS=${JSON.stringify(blockers)}`);
console.log(`SOURCE_PROVIDER_STATUS_V3_DECISION=${decision}`);
console.log(`SOURCE_PROVIDER_STATUS_V3_INSTRUCTION=${instruction}`);
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
