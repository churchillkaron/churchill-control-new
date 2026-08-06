#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv({ cwd: process.cwd() });
await import("./creative-runtime-bootstrap.mjs");

const PREVIEW_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_REPAIR_SOURCE_BOUNDED_POLL_PREVIEW_V2";
const DISPATCH_CHECKPOINT_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_REPAIR_SOURCE_DISPATCH_CHECKPOINT_V1";
const POLL_CHECKPOINT_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_REPAIR_SOURCE_BOUNDED_POLL_CHECKPOINT_V1";
const REPORT_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_REPAIR_SOURCE_BOUNDED_POLL_EXECUTION_V1";
const SOURCE_CONTRACT =
  "GENERATED_MEDIA_PERCEPTUAL_REPLACEMENT_SOURCE_V1";
const REVIEW_CONTRACT =
  "GENERATED_MEDIA_PERCEPTUAL_REPLACEMENT_REVIEW_V1";
const UNIT_PRICE = 5.26032;
const TOTAL_RESERVATION = 47.34288;
const POLL_ROUND = 1;
const AUTHORIZATION_ENV =
  "PAIR_REPAIR_SOURCE_BOUNDED_POLL_AUTHORIZATION";
const TERMINAL_RECORD_STATES = new Set([
  "POLL_PENDING",
  "POLL_SUCCEEDED",
  "POLL_FAILED",
  "POLL_TRANSPORT_ERROR",
  "POLL_PARTIAL_WRITE_ERROR",
]);

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
  const temporary = `${absolute}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(temporary, absolute);
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

function providerJobId(task = {}) {
  const submission = providerSubmission(task);
  return text(
    task.output?.provider_job_id ||
      submission.provider_job_id ||
      submission.output?.provider_job_id ||
      submission.output?.output?.provider_job_id,
  ) || null;
}

function usageId(task = {}) {
  return text(
    task.output?.usage?.id ||
      providerSubmission(task).usage?.id,
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

function startedAt(task = {}) {
  return (
    providerSubmission(task).started_at ||
    task.timing?.started_at ||
    null
  );
}

function providerOutput(result = {}) {
  return result?.output || result || {};
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

function credentialRecordReady(record = {}) {
  if (!record || typeof record !== "object") return false;
  const status = text(record.status).toUpperCase();
  if (status && status !== "ACTIVE") return false;
  return Boolean(text(record.secret_reference));
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

async function usageWalletState(supabaseAdmin, usageIdValue) {
  const [usageResponse, referenceResponse, usageResponseTransactions] =
    await Promise.all([
      supabaseAdmin
        .from("platform_service_usage")
        .select("*")
        .eq("id", usageIdValue)
        .single(),
      supabaseAdmin
        .from("wallet_transactions")
        .select("*")
        .eq("reference", usageIdValue),
      supabaseAdmin
        .from("wallet_transactions")
        .select("*")
        .eq("usage_id", usageIdValue),
    ]);

  if (usageResponse.error) throw usageResponse.error;
  if (referenceResponse.error) throw referenceResponse.error;
  if (usageResponseTransactions.error) throw usageResponseTransactions.error;

  const transactions = [
    ...list(referenceResponse.data),
    ...list(usageResponseTransactions.data),
  ].filter(
    (row, index, rows) =>
      rows.findIndex((candidate) => text(candidate.id) === text(row.id)) === index,
  );

  return {
    usage: usageResponse.data,
    transactions,
    fingerprint: sha256({
      usage: usageResponse.data,
      transactions: transactions
        .sort((left, right) => text(left.id).localeCompare(text(right.id))),
    }),
  };
}

async function resolvePollProvider({
  source,
  organizationId,
  resolveCreativeService,
  OrganizationServiceRuntime,
  resolveServiceCapabilities,
  resolvePrimaryExecutionCapability,
  resolveProvider,
  CredentialRuntime,
}) {
  const serviceId = resolveCreativeService(source);
  const organizationService = await OrganizationServiceRuntime.get({
    organization_id: organizationId,
    service_id: serviceId,
  });
  if (!organizationService) {
    throw new Error("POLL_ORGANIZATION_SERVICE_NOT_ENABLED");
  }

  const capabilities = resolveServiceCapabilities(serviceId);
  const executionCapability = resolvePrimaryExecutionCapability(
    capabilities?.capabilities || [],
  );
  if (!executionCapability) {
    throw new Error("POLL_EXECUTION_CAPABILITY_UNRESOLVED");
  }

  const selectedProvider = await resolveProvider({
    organization_id: organizationId,
    capability: executionCapability,
    preferredProvider: source.provider_id,
    country: source.input?.country ?? null,
    currency: source.input?.currency ?? null,
    policy: {
      ...object(organizationService.provider_policy),
      ...object(
        source.input?.provider_policy ||
          source.metadata?.provider_policy,
      ),
    },
  });

  if (text(selectedProvider?.provider) !== "runway") {
    throw new Error("POLL_SELECTED_PROVIDER_NOT_RUNWAY");
  }

  let credentialRecord = null;
  if (selectedProvider.credential_id) {
    credentialRecord = await CredentialRuntime.resolve(
      selectedProvider.credential_id,
    );
  }
  const environmentCredentialPresent = Boolean(
    text(process.env.RUNWAY_API_KEY) ||
      text(process.env.RUNWAYML_API_SECRET),
  );
  if (!credentialRecordReady(credentialRecord) && !environmentCredentialPresent) {
    throw new Error("RUNWAY_POLL_CREDENTIAL_UNAVAILABLE");
  }

  return {
    service_id: serviceId,
    execution_capability: executionCapability,
    selected_provider: selectedProvider.provider,
    selected_model: selectedProvider.model || null,
    selected_pricing_id: selectedProvider.pricing_id || null,
    credential_id: selectedProvider.credential_id || null,
    credential_source: credentialRecordReady(credentialRecord)
      ? "CREDENTIAL_RECORD"
      : text(process.env.RUNWAY_API_KEY)
        ? "RUNWAY_API_KEY"
        : "RUNWAYML_API_SECRET",
  };
}

const previewFile = readJson(
  process.argv[2],
  "BOUNDED_POLL_PREVIEW_V2",
);
const dispatchCheckpointFile = readJson(
  process.argv[3],
  "SOURCE_DISPATCH_CHECKPOINT",
);
const preview = object(previewFile.value);
const dispatchCheckpoint = object(dispatchCheckpointFile.value);

const organizationId = text(process.env.ORGANIZATION_ID);
const projectId = text(process.env.CREATIVE_PROJECT_ID);
const graphId = text(process.env.PRODUCTION_GRAPH_ID);
const outputPath = path.resolve(
  text(process.env.OPENAI_PERCEPTUAL_SOURCE_BOUNDED_POLL_OUTPUT) ||
    "/tmp/churchill-openai-perceptual-repair-source-bounded-poll-execution.json",
);
const pollCheckpointPath = path.resolve(
  text(process.env.OPENAI_PERCEPTUAL_SOURCE_BOUNDED_POLL_CHECKPOINT) ||
    "/tmp/churchill-openai-perceptual-repair-source-bounded-poll-checkpoint-round-1.json",
);
const authorization = text(process.env[AUTHORIZATION_ENV]);

if (!organizationId || !projectId || !graphId) {
  throw new Error("SOURCE_BOUNDED_POLL_SCOPE_REQUIRED");
}

const [
  { supabaseAdmin },
  { ProductionTaskRuntime },
  { ServiceExecutionRuntime },
  { resolveCreativeService },
  { OrganizationServiceRuntime },
  { resolveServiceCapabilities },
  { resolvePrimaryExecutionCapability },
  { resolveProvider },
  { CredentialRuntime },
] = await Promise.all([
  import("@/lib/shared/supabase/admin"),
  import("@/lib/operations/tasks/runtime/ProductionTaskRuntime"),
  import("@/lib/platform/service-runtime/execution/ServiceExecutionRuntime"),
  import("@/lib/creative/services/CreativeServiceResolver"),
  import("@/lib/platform/service-runtime/services/runtime/OrganizationServiceRuntime"),
  import("@/lib/platform/service-runtime/services/resolver/ServiceCapabilityResolver"),
  import("@/lib/platform/service-runtime/services/resolver/CapabilityExecutionResolver"),
  import("@/lib/platform/service-runtime/providers/ProviderResolver"),
  import("@/lib/platform/service-runtime/credentials/runtime/CredentialRuntime"),
]);

const blockers = [];
const requireValue = (condition, label) => {
  if (!condition) blockers.push(label);
};

requireValue(
  text(preview.contract) === PREVIEW_CONTRACT,
  "POLL_PREVIEW_CONTRACT_INVALID",
);
requireValue(
  text(dispatchCheckpoint.contract) === DISPATCH_CHECKPOINT_CONTRACT,
  "DISPATCH_CHECKPOINT_CONTRACT_INVALID",
);
for (const [label, value] of [
  ["PREVIEW", preview],
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
  text(preview.decision) ===
    "REPAIR_SOURCE_BOUNDED_POLL_9_JOB_ROUND_1_V2_PREVIEW_CONFIRMED" &&
    text(preview.readiness) ===
      "READY_FOR_GUARDED_BOUNDED_PROVIDER_STATUS_POLL_IMPLEMENTATION" &&
    Number(preview.poll_round) === POLL_ROUND &&
    Number(preview.source_task_count) === 9 &&
    Number(preview.ready_count) === 9 &&
    Number(preview.failure_count) === 0 &&
    Number(preview.credential_ready_count) === 9 &&
    Number(preview.maximum_provider_status_calls) === 9 &&
    Number(preview.maximum_calls_per_job) === 1 &&
    money(preview.reservation_total) === TOTAL_RESERVATION &&
    list(preview.blockers).length === 0 &&
    preview.state_unchanged === true &&
    preview.provider_status_calls_executed === false,
  "POLL_PREVIEW_NOT_READY",
);
requireValue(
  text(dispatchCheckpoint.status) === "SUBMITTED" &&
    list(dispatchCheckpoint.source_records).length === 9 &&
    money(dispatchCheckpoint.maximum_authorized_spend) === TOTAL_RESERVATION,
  "DISPATCH_CHECKPOINT_NOT_SUBMITTED",
);
requireValue(
  authorization && authorization === text(preview.expected_authorization),
  "EXACT_POLL_AUTHORIZATION_REQUIRED",
);
requireValue(
  sha256(object(preview.poll_contract)) === text(preview.poll_contract_sha256),
  "POLL_CONTRACT_HASH_INVALID",
);
requireValue(
  preview.poll_contract?.generic_production_task_poll_permitted === false &&
    preview.poll_contract?.direct_service_settlement_required === true &&
    Number(preview.poll_contract?.maximum_provider_status_calls) === 9 &&
    Number(preview.poll_contract?.maximum_calls_per_job) === 1 &&
    Number(preview.poll_contract?.retries_permitted) === 0 &&
    Number(preview.poll_contract?.review_execution_permitted) === 0 &&
    Number(preview.poll_contract?.finalisation_permitted) === 0 &&
    Number(preview.poll_contract?.publication_permitted) === 0,
  "POLL_CONTRACT_SAFETY_GATES_INVALID",
);

if (blockers.length) {
  throw new Error(`BOUNDED_POLL_PREFLIGHT_BLOCKED:${blockers.join(",")}`);
}

const before = await exactState({
  supabaseAdmin,
  ProductionTaskRuntime,
  organizationId,
  projectId,
  graphId,
});
const protectedIds = new Set(
  list(dispatchCheckpoint.protected_task_ids).map(text),
);
const protectedStateBefore = taskFingerprint(
  before.tasks.filter((task) => protectedIds.has(task.id)),
);

let pollCheckpoint;
let checkpointResume = false;
if (fs.existsSync(pollCheckpointPath)) {
  checkpointResume = true;
  pollCheckpoint = JSON.parse(fs.readFileSync(pollCheckpointPath, "utf8"));
  requireValue(
    text(pollCheckpoint.contract) === POLL_CHECKPOINT_CONTRACT,
    "POLL_CHECKPOINT_CONTRACT_INVALID",
  );
  requireValue(
    text(pollCheckpoint.organization_id) === organizationId &&
      text(pollCheckpoint.creative_project_id) === projectId &&
      text(pollCheckpoint.production_graph_id) === graphId,
    "POLL_CHECKPOINT_SCOPE_INVALID",
  );
  requireValue(
    text(pollCheckpoint.preview_file_sha256) === previewFile.file_sha256 &&
      text(pollCheckpoint.poll_contract_sha256) ===
        text(preview.poll_contract_sha256) &&
      text(pollCheckpoint.authorization_sha256) === sha256(authorization),
    "POLL_CHECKPOINT_BINDING_INVALID",
  );
  requireValue(
    list(pollCheckpoint.records).length === 9,
    "POLL_CHECKPOINT_RECORD_COUNT_INVALID",
  );
} else {
  requireValue(
    before.task_state_sha256 ===
      text(preview.exact_state_after?.task_state_sha256) &&
      before.task_state_sha256 ===
        text(dispatchCheckpoint.final_task_state_sha256),
    "INITIAL_POLL_TASK_STATE_CHANGED",
  );
  requireValue(
    before.usage_count === Number(preview.exact_state_after?.usage_count) &&
      before.wallet_balance ===
        money(preview.exact_state_after?.wallet_balance) &&
      before.wallet_reserved_balance ===
        money(preview.exact_state_after?.wallet_reserved_balance),
    "INITIAL_POLL_ACCOUNTING_STATE_CHANGED",
  );
  requireValue(
    protectedIds.size === 36 &&
      protectedStateBefore ===
        text(dispatchCheckpoint.protected_task_state_sha256),
    "INITIAL_PROTECTED_TASK_STATE_CHANGED",
  );

  pollCheckpoint = {
    contract: POLL_CHECKPOINT_CONTRACT,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    status: "IN_PROGRESS",
    organization_id: organizationId,
    creative_project_id: projectId,
    production_graph_id: graphId,
    poll_round: POLL_ROUND,
    preview_file: previewFile.absolute,
    preview_file_sha256: previewFile.file_sha256,
    dispatch_checkpoint_file: dispatchCheckpointFile.absolute,
    dispatch_checkpoint_file_sha256:
      dispatchCheckpointFile.file_sha256,
    poll_contract_sha256: preview.poll_contract_sha256,
    authorization_sha256: sha256(authorization),
    initial_task_state_sha256: before.task_state_sha256,
    initial_usage_count: before.usage_count,
    initial_wallet_balance: before.wallet_balance,
    initial_wallet_reserved_balance: before.wallet_reserved_balance,
    protected_task_ids: [...protectedIds],
    protected_task_state_sha256: protectedStateBefore,
    provider_status_call_count: 0,
    new_provider_generation_call_count: 0,
    retry_count: 0,
    review_execution_count: 0,
    finalisation_count: 0,
    publication_count: 0,
    records: list(preview.plans).map((plan) => ({
      sequence: plan.sequence,
      source_task_id: plan.source_task_id,
      review_task_id: plan.review_task_id,
      usage_id: plan.usage_id,
      provider_job_id: plan.provider_job_id,
      reservation_amount: plan.reservation_amount,
      planned_credential_id: plan.poll_credential_id || null,
      planned_credential_source: plan.poll_credential_source,
      state: "READY_TO_POLL",
      provider_status_call_count: 0,
      result: null,
      error: null,
    })),
  };
  writeJson(pollCheckpointPath, pollCheckpoint);
}

if (blockers.length) {
  throw new Error(`BOUNDED_POLL_CHECKPOINT_BLOCKED:${blockers.join(",")}`);
}

const recordResults = [];
for (const record of pollCheckpoint.records) {
  if (TERMINAL_RECORD_STATES.has(text(record.state))) {
    recordResults.push({ ...record, skipped_on_resume: true });
    continue;
  }
  if (text(record.state) === "POLL_STARTED") {
    blockers.push(`AMBIGUOUS_STARTED_RECORD:${record.source_task_id}`);
    recordResults.push({ ...record, skipped_ambiguous: true });
    continue;
  }
  if (text(record.state) !== "READY_TO_POLL") {
    blockers.push(
      `UNSUPPORTED_POLL_CHECKPOINT_STATE:${record.source_task_id}:${record.state}`,
    );
    recordResults.push({ ...record, skipped_invalid_state: true });
    continue;
  }

  const sourceBefore = await ProductionTaskRuntime.get(record.source_task_id);
  const reviewBefore = await ProductionTaskRuntime.get(record.review_task_id);
  const accountingBefore = await usageWalletState(
    supabaseAdmin,
    record.usage_id,
  );
  const issues = [];

  if (!sourceBefore || repairKind(sourceBefore) !== "SOURCE") {
    issues.push("SOURCE_TASK_INVALID");
  }
  if (!reviewBefore || repairKind(reviewBefore) !== "REVIEW") {
    issues.push("REVIEW_TASK_INVALID");
  }
  if (text(sourceBefore?.status) !== "RUNNING") {
    issues.push("SOURCE_NOT_RUNNING");
  }
  if (text(reviewBefore?.status) !== "WAITING") {
    issues.push("REVIEW_NOT_WAITING");
  }
  if (usageId(sourceBefore) !== text(record.usage_id)) {
    issues.push("SOURCE_USAGE_ID_MISMATCH");
  }
  if (providerJobId(sourceBefore) !== text(record.provider_job_id)) {
    issues.push("SOURCE_PROVIDER_JOB_ID_MISMATCH");
  }
  if (text(accountingBefore.usage?.status) !== "PENDING") {
    issues.push("USAGE_NOT_PENDING");
  }
  if (outputMediaUrl(sourceBefore?.output)) {
    issues.push("SOURCE_MEDIA_ALREADY_PRESENT");
  }

  const transactionsBefore = accountingBefore.transactions;
  const reservesBefore = transactionsBefore.filter(
    (row) => text(row.type) === "RESERVE",
  );
  const chargesBefore = transactionsBefore.filter(
    (row) => text(row.type) === "CHARGE",
  );
  const releasesBefore = transactionsBefore.filter(
    (row) => text(row.type) === "RELEASE",
  );
  if (
    reservesBefore.length !== 1 ||
    money(reservesBefore[0]?.amount) !== UNIT_PRICE ||
    chargesBefore.length !== 0 ||
    releasesBefore.length !== 0
  ) {
    issues.push("PRE_POLL_RESERVATION_STATE_INVALID");
  }

  let pollProvider = null;
  try {
    pollProvider = await resolvePollProvider({
      source: sourceBefore,
      organizationId,
      resolveCreativeService,
      OrganizationServiceRuntime,
      resolveServiceCapabilities,
      resolvePrimaryExecutionCapability,
      resolveProvider,
      CredentialRuntime,
    });
  } catch (error) {
    issues.push(`POLL_PROVIDER_RESOLUTION_FAILED:${error.message}`);
  }
  if (
    pollProvider?.selected_pricing_id &&
    text(pollProvider.selected_pricing_id) !==
      text(accountingBefore.usage?.pricing_id)
  ) {
    issues.push("POLL_PRICING_SELECTION_CHANGED");
  }

  if (issues.length) {
    blockers.push(
      `POLL_RECORD_PREFLIGHT_BLOCKED:${record.source_task_id}:${issues.join("+")}`,
    );
    record.error = issues.join(",");
    recordResults.push({ ...record, issues });
    continue;
  }

  record.state = "POLL_STARTED";
  record.started_at = new Date().toISOString();
  record.provider_status_call_count = 1;
  record.poll_credential_id = pollProvider.credential_id;
  record.poll_credential_source = pollProvider.credential_source;
  record.secret_value_exposed = false;
  pollCheckpoint.provider_status_call_count =
    Number(pollCheckpoint.provider_status_call_count || 0) + 1;
  pollCheckpoint.updated_at = new Date().toISOString();
  writeJson(pollCheckpointPath, pollCheckpoint);

  let settlementResult = null;
  try {
    settlementResult = await ServiceExecutionRuntime.settle({
      organization_id: organizationId,
      provider: "runway",
      provider_job_id: record.provider_job_id,
      usage_id: record.usage_id,
      pricing: pricingSnapshot(sourceBefore),
      quantity: accountingBefore.usage.quantity,
      unit: accountingBefore.usage.unit,
      credential_id: pollProvider.credential_id,
      started_at: startedAt(sourceBefore),
      provider_status_input:
        sourceBefore.input?.provider_status ||
        sourceBefore.metadata?.provider_status ||
        {},
      metadata: {
        task_id: sourceBefore.id,
        creative_project_id: sourceBefore.creative_project_id,
        production_graph_id: sourceBefore.production_graph_id,
        scene_id: sourceBefore.scene_id,
        shot_id: sourceBefore.shot_id,
        operation: sourceBefore.type,
        repair_poll_round: POLL_ROUND,
        repair_poll_contract_sha256: preview.poll_contract_sha256,
      },
    });

    if (settlementResult.pending) {
      const updated = await ProductionTaskRuntime.update(sourceBefore.id, {
        status: "RUNNING",
        provider_id: settlementResult.provider || "runway",
        output: {
          ...object(sourceBefore.output),
          provider_job_id: record.provider_job_id,
          provider_status:
            settlementResult.provider_status || "processing",
          provider_poll: settlementResult,
          settlement: settlementResult.settlement || "RESERVED",
          last_polled_at: new Date().toISOString(),
        },
        error: null,
      });
      record.state = "POLL_PENDING";
      record.result = {
        provider_status: settlementResult.provider_status || null,
        settlement: settlementResult.settlement || "RESERVED",
        source_status: updated.status,
      };
    } else if (settlementResult.failed) {
      const updated = await ProductionTaskRuntime.fail(
        sourceBefore.id,
        new Error(settlementResult.error || "Provider job failed"),
        {
          provider_job_id: record.provider_job_id,
          provider_status:
            settlementResult.provider_status || "failed",
          provider_poll: settlementResult,
          settlement: settlementResult.settlement || "RELEASED",
          last_polled_at: new Date().toISOString(),
        },
      );
      record.state = "POLL_FAILED";
      record.result = {
        provider_status: settlementResult.provider_status || null,
        settlement: settlementResult.settlement || "RELEASED",
        source_status: updated.status,
        error: settlementResult.error || null,
      };
    } else {
      const mediaUrl = outputMediaUrl(settlementResult.output);
      if (!mediaUrl) {
        throw new Error("TERMINAL_SUCCESS_MEDIA_URL_REQUIRED");
      }
      const updated = await ProductionTaskRuntime.complete(sourceBefore.id, {
        provider_submission: providerSubmission(sourceBefore),
        provider_poll: settlementResult,
        provider_job_id: record.provider_job_id,
        provider_status:
          settlementResult.provider_status || "completed",
        provider: settlementResult.provider || "runway",
        pricing:
          settlementResult.pricing || pricingSnapshot(sourceBefore),
        usage: settlementResult.usage || accountingBefore.usage,
        billing: settlementResult.billing || null,
        settlement: settlementResult.settlement || "CHARGED",
        last_polled_at: new Date().toISOString(),
        output: providerOutput(settlementResult),
      });
      record.state = "POLL_SUCCEEDED";
      record.result = {
        provider_status: settlementResult.provider_status || null,
        settlement: settlementResult.settlement || "CHARGED",
        source_status: updated.status,
        asset_node_id: updated.output?.asset_node_id || null,
        media_url_present: Boolean(mediaUrl),
      };
    }
  } catch (error) {
    const sourceAfterError = await ProductionTaskRuntime.get(
      record.source_task_id,
    );
    const accountingAfterError = await usageWalletState(
      supabaseAdmin,
      record.usage_id,
    );
    const databaseUnchanged =
      taskFingerprint([sourceBefore]) === taskFingerprint([sourceAfterError]) &&
      accountingBefore.fingerprint === accountingAfterError.fingerprint;

    record.state = databaseUnchanged
      ? "POLL_TRANSPORT_ERROR"
      : "POLL_PARTIAL_WRITE_ERROR";
    record.error = error?.message || String(error);
    record.result = {
      database_state_unchanged: databaseUnchanged,
    };
    if (!databaseUnchanged) {
      blockers.push(
        `POLL_PARTIAL_WRITE_ERROR:${record.source_task_id}:${record.error}`,
      );
    }
  }

  record.completed_at = new Date().toISOString();
  pollCheckpoint.updated_at = new Date().toISOString();
  writeJson(pollCheckpointPath, pollCheckpoint);
  recordResults.push({ ...record });
}

const after = await exactState({
  supabaseAdmin,
  ProductionTaskRuntime,
  organizationId,
  projectId,
  graphId,
});
const protectedStateAfter = taskFingerprint(
  after.tasks.filter((task) => protectedIds.has(task.id)),
);
if (protectedStateAfter !== protectedStateBefore) {
  blockers.push("PROTECTED_TASK_STATE_CHANGED");
}
if (after.usage_count !== before.usage_count) {
  blockers.push("USAGE_ROW_COUNT_CHANGED");
}
if (Number(pollCheckpoint.provider_status_call_count || 0) > 9) {
  blockers.push("PROVIDER_STATUS_CALL_LIMIT_EXCEEDED");
}
if (
  pollCheckpoint.records.some(
    (record) => Number(record.provider_status_call_count || 0) > 1,
  )
) {
  blockers.push("PER_JOB_STATUS_CALL_LIMIT_EXCEEDED");
}

const reviewStates = await Promise.all(
  pollCheckpoint.records.map(async (record) => {
    const review = await ProductionTaskRuntime.get(record.review_task_id);
    return {
      id: record.review_task_id,
      status: review?.status || null,
      unchanged: text(review?.status) === "WAITING",
    };
  }),
);
if (reviewStates.some((review) => !review.unchanged)) {
  blockers.push("DOWNSTREAM_REVIEW_STATE_CHANGED");
}

const usageIds = pollCheckpoint.records.map((record) => record.usage_id);
const walletResponse = await supabaseAdmin
  .from("wallet_transactions")
  .select("*")
  .eq("organization_id", organizationId)
  .in("usage_id", usageIds);
if (walletResponse.error) throw walletResponse.error;
const referenceWalletResponse = await supabaseAdmin
  .from("wallet_transactions")
  .select("*")
  .eq("organization_id", organizationId)
  .in("reference", usageIds);
if (referenceWalletResponse.error) throw referenceWalletResponse.error;
const walletTransactions = [
  ...list(walletResponse.data),
  ...list(referenceWalletResponse.data),
].filter(
  (row, index, rows) =>
    rows.findIndex((candidate) => text(candidate.id) === text(row.id)) === index,
);
const reserveTransactions = walletTransactions.filter(
  (row) => text(row.type) === "RESERVE",
);
const chargeTransactions = walletTransactions.filter(
  (row) => text(row.type) === "CHARGE",
);
const releaseTransactions = walletTransactions.filter(
  (row) => text(row.type) === "RELEASE",
);
const chargeTotal = money(
  chargeTransactions.reduce((sum, row) => sum + Number(row.amount || 0), 0),
);
const releaseTotal = money(
  releaseTransactions.reduce((sum, row) => sum + Number(row.amount || 0), 0),
);

if (reserveTransactions.length !== 9) {
  blockers.push("ORIGINAL_RESERVATION_COUNT_CHANGED");
}
if (chargeTotal + releaseTotal > TOTAL_RESERVATION) {
  blockers.push("SETTLEMENT_TOTAL_EXCEEDS_AUTHORIZED_RESERVATION");
}
if (
  after.wallet_balance !== money(before.wallet_balance + releaseTotal)
) {
  blockers.push("AVAILABLE_WALLET_BALANCE_TRANSITION_INVALID");
}
if (
  after.wallet_reserved_balance !==
    money(before.wallet_reserved_balance - chargeTotal - releaseTotal)
) {
  blockers.push("RESERVED_WALLET_BALANCE_TRANSITION_INVALID");
}

const counts = pollCheckpoint.records.reduce(
  (result, record) => {
    result[text(record.state) || "UNKNOWN"] =
      Number(result[text(record.state) || "UNKNOWN"] || 0) + 1;
    return result;
  },
  {},
);
const pendingCount = Number(counts.POLL_PENDING || 0);
const succeededCount = Number(counts.POLL_SUCCEEDED || 0);
const failedCount = Number(counts.POLL_FAILED || 0);
const transportErrorCount = Number(counts.POLL_TRANSPORT_ERROR || 0);
const partialWriteErrorCount = Number(counts.POLL_PARTIAL_WRITE_ERROR || 0);
const ambiguousCount = Number(counts.POLL_STARTED || 0);
const unattemptedCount = Number(counts.READY_TO_POLL || 0);
const completedAttemptCount =
  pendingCount +
  succeededCount +
  failedCount +
  transportErrorCount +
  partialWriteErrorCount;

pollCheckpoint.status =
  partialWriteErrorCount || ambiguousCount || unattemptedCount
    ? "ROUND_1_BLOCKED"
    : "ROUND_1_POLLED";
pollCheckpoint.updated_at = new Date().toISOString();
pollCheckpoint.final_task_state_sha256 = after.task_state_sha256;
pollCheckpoint.final_usage_count = after.usage_count;
pollCheckpoint.final_wallet_balance = after.wallet_balance;
pollCheckpoint.final_wallet_reserved_balance =
  after.wallet_reserved_balance;
pollCheckpoint.pending_count = pendingCount;
pollCheckpoint.succeeded_count = succeededCount;
pollCheckpoint.failed_count = failedCount;
pollCheckpoint.transport_error_count = transportErrorCount;
pollCheckpoint.partial_write_error_count = partialWriteErrorCount;
pollCheckpoint.charge_total = chargeTotal;
pollCheckpoint.release_total = releaseTotal;
writeJson(pollCheckpointPath, pollCheckpoint);

const decision = blockers.length
  ? "REPAIR_SOURCE_BOUNDED_POLL_ROUND_1_BLOCKED"
  : transportErrorCount > 0
    ? "REPAIR_SOURCE_BOUNDED_POLL_ROUND_1_COMPLETED_WITH_TRANSPORT_ERRORS"
    : "REPAIR_SOURCE_BOUNDED_POLL_ROUND_1_EXECUTED";
const readiness = blockers.length
  ? "REPAIR_SOURCE_BOUNDED_POLL_ROUND_1_BLOCKED"
  : "READY_FOR_READ_ONLY_BOUNDED_POLL_RESULT_AUDIT";
const instruction = blockers.length
  ? "Preserve both checkpoints and audit every blocker. Do not poll again, retry, execute reviews, finalise, or publish."
  : "Run a separate read-only result audit. Do not poll any job again in round one. Keep pending jobs reserved, do not retry failed or transport-error jobs, keep all reviews waiting, and do not finalise or publish.";

const report = {
  contract: REPORT_CONTRACT,
  generated_at: new Date().toISOString(),
  organization_id: organizationId,
  creative_project_id: projectId,
  production_graph_id: graphId,
  poll_round: POLL_ROUND,
  preview_file: previewFile.absolute,
  preview_file_sha256: previewFile.file_sha256,
  dispatch_checkpoint_file: dispatchCheckpointFile.absolute,
  dispatch_checkpoint_file_sha256:
    dispatchCheckpointFile.file_sha256,
  poll_checkpoint_file: pollCheckpointPath,
  poll_checkpoint_resume: checkpointResume,
  poll_contract_sha256: preview.poll_contract_sha256,
  authorization_sha256: sha256(authorization),
  source_task_count: pollCheckpoint.records.length,
  review_task_count: reviewStates.length,
  provider_status_call_count:
    Number(pollCheckpoint.provider_status_call_count || 0),
  completed_attempt_count: completedAttemptCount,
  pending_count: pendingCount,
  succeeded_count: succeededCount,
  failed_count: failedCount,
  transport_error_count: transportErrorCount,
  partial_write_error_count: partialWriteErrorCount,
  ambiguous_count: ambiguousCount,
  unattempted_count: unattemptedCount,
  record_state_counts: counts,
  records: recordResults,
  review_states: reviewStates,
  reserve_transaction_count: reserveTransactions.length,
  charge_transaction_count: chargeTransactions.length,
  release_transaction_count: releaseTransactions.length,
  charge_total: chargeTotal,
  release_total: releaseTotal,
  protected_task_count: protectedIds.size,
  protected_task_state_sha256_before: protectedStateBefore,
  protected_task_state_sha256_after: protectedStateAfter,
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
  database_writes_executed: completedAttemptCount > 0,
  new_wallet_reservations_executed: false,
  wallet_charges_executed: chargeTransactions.length > 0,
  wallet_releases_executed: releaseTransactions.length > 0,
  provider_generation_calls_executed: false,
  provider_status_calls_executed:
    Number(pollCheckpoint.provider_status_call_count || 0) > 0,
  retries_executed: false,
  review_execution_executed: false,
  downstream_reviews_updated: 0,
  finalisation_executed: false,
  publication_executed: false,
  readiness,
};

writeJson(outputPath, report);

console.log("============================================================");
console.log("GUARDED BOUNDED REPAIR SOURCE STATUS POLL");
console.log("============================================================");
console.log(`OUTPUT=${outputPath}`);
console.log(`POLL_CHECKPOINT=${pollCheckpointPath}`);
console.log(`POLL_CHECKPOINT_RESUME=${checkpointResume ? "YES" : "NO"}`);
console.log(`POLL_CHECKPOINT_STATUS=${pollCheckpoint.status}`);
console.log(`POLL_ROUND=${POLL_ROUND}`);
console.log(`SOURCE_TASK_COUNT=${pollCheckpoint.records.length}`);
console.log(`REVIEW_TASK_COUNT=${reviewStates.length}`);
console.log(`PROVIDER_STATUS_CALL_COUNT=${pollCheckpoint.provider_status_call_count}`);
console.log(`COMPLETED_ATTEMPT_COUNT=${completedAttemptCount}`);
console.log(`PENDING_COUNT=${pendingCount}`);
console.log(`SUCCEEDED_COUNT=${succeededCount}`);
console.log(`FAILED_COUNT=${failedCount}`);
console.log(`TRANSPORT_ERROR_COUNT=${transportErrorCount}`);
console.log(`PARTIAL_WRITE_ERROR_COUNT=${partialWriteErrorCount}`);
console.log(`AMBIGUOUS_COUNT=${ambiguousCount}`);
console.log(`UNATTEMPTED_COUNT=${unattemptedCount}`);

for (const record of pollCheckpoint.records) {
  console.log([
    `BOUNDED_POLL_RESULT=${record.source_task_id}`,
    `review=${record.review_task_id}`,
    `usage=${record.usage_id}`,
    `job=${record.provider_job_id}`,
    `state=${record.state}`,
    `calls=${record.provider_status_call_count || 0}`,
    `provider_status=${record.result?.provider_status || ""}`,
    `settlement=${record.result?.settlement || ""}`,
    `asset_node=${record.result?.asset_node_id || ""}`,
    `error=${record.error || record.result?.error || ""}`,
  ].join("|"));
}

console.log(`RESERVE_TRANSACTION_COUNT=${reserveTransactions.length}`);
console.log(`CHARGE_TRANSACTION_COUNT=${chargeTransactions.length}`);
console.log(`RELEASE_TRANSACTION_COUNT=${releaseTransactions.length}`);
console.log(`CHARGE_TOTAL=${chargeTotal}`);
console.log(`RELEASE_TOTAL=${releaseTotal}`);
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
console.log(`PROTECTED_TASK_STATE_UNCHANGED=${protectedStateBefore === protectedStateAfter ? "YES" : "NO"}`);
console.log("NEW_WALLET_RESERVATIONS_EXECUTED=NO");
console.log(`WALLET_CHARGES_EXECUTED=${chargeTransactions.length > 0 ? "YES" : "NO"}`);
console.log(`WALLET_RELEASES_EXECUTED=${releaseTransactions.length > 0 ? "YES" : "NO"}`);
console.log("PROVIDER_GENERATION_CALLS_EXECUTED=NO");
console.log(`PROVIDER_STATUS_CALLS_EXECUTED=${pollCheckpoint.provider_status_call_count > 0 ? "YES" : "NO"}`);
console.log("RETRIES_EXECUTED=NO");
console.log("REVIEW_EXECUTION_EXECUTED=NO");
console.log("DOWNSTREAM_REVIEWS_UPDATED=0");
console.log("FINALISATION_EXECUTED=NO");
console.log("PUBLICATION_EXECUTED=NO");
console.log(`AUDIT_READINESS=${readiness}`);
console.log("TERMINAL_REMAINS_OPEN=YES");

if (blockers.length) process.exitCode = 2;
