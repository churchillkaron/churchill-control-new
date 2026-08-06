#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv({ cwd: process.cwd() });
await import("./creative-runtime-bootstrap.mjs");

const PREVIEW_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_REPLACEMENT_REVIEW_EXECUTION_PREVIEW_V1";
const SOURCE_AUDIT_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_REPAIR_SOURCE_BOUNDED_POLL_RESULT_AUDIT_V1";
const DISPATCH_CHECKPOINT_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_REPAIR_SOURCE_DISPATCH_CHECKPOINT_V1";
const EXECUTION_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_REPLACEMENT_REVIEW_EXECUTION_CONTRACT_V1";
const CHECKPOINT_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_REPLACEMENT_REVIEW_EXECUTION_CHECKPOINT_V1";
const REPORT_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_REPLACEMENT_REVIEW_EXECUTION_V1";
const SOURCE_PAYLOAD_CONTRACT =
  "GENERATED_MEDIA_PERCEPTUAL_REPLACEMENT_SOURCE_V1";
const REVIEW_PAYLOAD_CONTRACT =
  "GENERATED_MEDIA_PERCEPTUAL_REPLACEMENT_REVIEW_V1";
const REVIEW_GATE_CONTRACT = "GENERATED_MEDIA_PERCEPTUAL_REVIEW_V1";
const REVIEW_REJECTION = "GENERATED_MEDIA_PERCEPTUAL_VALIDATION_FAILED";
const AUTHORIZATION_ENV = "REPLACEMENT_PERCEPTUAL_REVIEW_AUTHORIZATION";
const MAXIMUM_OPENAI_CALLS = 9;
const MAXIMUM_CALLS_PER_REVIEW = 1;
const TERMINAL_RECORD_STATES = new Set([
  "REVIEW_PASSED",
  "REVIEW_REJECTED",
  "REVIEW_TECHNICAL_FAILED",
  "REVIEW_CALL_EXCEPTION",
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

function usageId(task = {}) {
  return text(
    task.output?.usage?.id ||
      task.output?.provider_submission?.usage?.id,
  ) || null;
}

function billingLineId(task = {}) {
  return text(
    task.output?.usage?.billing_invoice_line_id ||
      task.output?.provider_submission?.usage?.billing_invoice_line_id ||
      task.output?.billing?.invoice_line?.id,
  ) || null;
}

function sourceAssetId(source = {}) {
  return text(source.output?.asset_node_id) || null;
}

function reviewUnbound(review = {}) {
  return (
    text(review.status) === "WAITING" &&
    review.provider_id === null &&
    review.cost?.approved !== true &&
    Number(review.cost?.actual || 0) === 0 &&
    !review.timing?.started_at &&
    !review.timing?.completed_at &&
    Object.keys(object(review.output)).length === 0 &&
    !text(review.error)
  );
}

function reviewBound(review = {}, plan = {}, contractSha = "") {
  return (
    text(review.status) === "WAITING" &&
    text(review.provider_id) === "openai" &&
    review.cost?.approved === true &&
    money(review.cost?.estimated) === money(plan.estimated_customer_price) &&
    money(review.cost?.actual) === 0 &&
    text(review.cost?.currency) === text(plan.estimated_currency) &&
    text(review.metadata?.replacement_review_execution_contract_sha256) ===
      contractSha &&
    text(review.metadata?.replacement_review_pricing_id) ===
      text(plan.selected_pricing_id) &&
    text(review.metadata?.replacement_review_model) ===
      text(plan.selected_model) &&
    review.metadata?.replacement_review_execution_authorized === true &&
    !review.timing?.started_at &&
    !review.timing?.completed_at &&
    Object.keys(object(review.output)).length === 0 &&
    !text(review.error)
  );
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

async function resolveReviewExecution({
  review,
  organizationId,
  resolveCreativeService,
  OrganizationServiceRuntime,
  resolveServiceCapabilities,
  resolvePrimaryExecutionCapability,
  resolveProvider,
  PricingRuntime,
  CredentialRuntime,
}) {
  const serviceId = resolveCreativeService(review);
  const organizationService = await OrganizationServiceRuntime.get({
    organization_id: organizationId,
    service_id: serviceId,
  });
  if (!organizationService) {
    throw new Error("REVIEW_ORGANIZATION_SERVICE_NOT_ENABLED");
  }

  const capabilities = resolveServiceCapabilities(serviceId);
  const executionCapability = resolvePrimaryExecutionCapability(
    capabilities?.capabilities || [],
  );
  if (!executionCapability) {
    throw new Error("REVIEW_EXECUTION_CAPABILITY_UNRESOLVED");
  }

  const selectedProvider = await resolveProvider({
    organization_id: organizationId,
    capability: executionCapability,
    preferredProvider: "openai",
    country: review.input?.country ?? null,
    currency: review.input?.currency ?? "THB",
    policy: {
      ...object(organizationService.provider_policy),
      ...object(
        review.input?.provider_policy ||
          review.metadata?.provider_policy,
      ),
    },
  });
  if (text(selectedProvider?.provider) !== "openai") {
    throw new Error("REVIEW_SELECTED_PROVIDER_NOT_OPENAI");
  }

  let credentialRecord = null;
  if (selectedProvider.credential_id) {
    credentialRecord = await CredentialRuntime.resolve(
      selectedProvider.credential_id,
    );
  }
  const credentialSource = credentialRecordReady(credentialRecord)
    ? "CREDENTIAL_RECORD"
    : text(process.env.OPENAI_API_KEY)
      ? "OPENAI_API_KEY"
      : "NONE";
  if (credentialSource === "NONE") {
    throw new Error("OPENAI_REVIEW_CREDENTIAL_UNAVAILABLE");
  }

  const pricing = await PricingRuntime.resolve({
    provider: "openai",
    capability: executionCapability,
    model: selectedProvider.model,
    country: review.input?.country ?? null,
    currency: review.input?.currency ?? "THB",
    usage: { quantity: 1 },
  });

  return {
    service_id: serviceId,
    execution_capability: executionCapability,
    provider: selectedProvider.provider,
    model: selectedProvider.model || null,
    pricing_id: pricing.pricing_id || selectedProvider.pricing_id || null,
    supplier_cost: money(pricing.supplier_cost),
    customer_price: money(pricing.customer_price),
    currency: pricing.currency || null,
    pricing_estimated: pricing.estimated === true,
    credential_id: selectedProvider.credential_id || null,
    credential_source: credentialSource,
  };
}

function compareResolution(resolved = {}, plan = {}) {
  const issues = [];
  if (text(resolved.provider) !== "openai") issues.push("PROVIDER_CHANGED");
  if (text(resolved.model) !== text(plan.selected_model)) {
    issues.push("MODEL_CHANGED");
  }
  if (text(resolved.pricing_id) !== text(plan.selected_pricing_id)) {
    issues.push("PRICING_ID_CHANGED");
  }
  if (text(resolved.currency) !== text(plan.estimated_currency)) {
    issues.push("CURRENCY_CHANGED");
  }
  if (money(resolved.supplier_cost) !== money(plan.estimated_supplier_cost)) {
    issues.push("SUPPLIER_COST_CHANGED");
  }
  if (money(resolved.customer_price) !== money(plan.estimated_customer_price)) {
    issues.push("CUSTOMER_PRICE_CHANGED");
  }
  if (resolved.credential_source === "NONE") issues.push("CREDENTIAL_UNAVAILABLE");
  return issues;
}

const previewFile = readJson(
  process.argv[2],
  "REPLACEMENT_REVIEW_EXECUTION_PREVIEW",
);
const sourceAuditFile = readJson(
  process.argv[3],
  "COMPLETED_SOURCE_RESULT_AUDIT",
);
const dispatchCheckpointFile = readJson(
  process.argv[4],
  "SOURCE_DISPATCH_CHECKPOINT",
);
const preview = object(previewFile.value);
const sourceAudit = object(sourceAuditFile.value);
const dispatchCheckpoint = object(dispatchCheckpointFile.value);

const organizationId = text(process.env.ORGANIZATION_ID);
const projectId = text(process.env.CREATIVE_PROJECT_ID);
const graphId = text(process.env.PRODUCTION_GRAPH_ID);
const outputPath = path.resolve(
  text(process.env.OPENAI_PERCEPTUAL_REPLACEMENT_REVIEW_EXECUTION_OUTPUT) ||
    "/tmp/churchill-openai-perceptual-replacement-review-execution.json",
);
const checkpointPath = path.resolve(
  text(process.env.OPENAI_PERCEPTUAL_REPLACEMENT_REVIEW_CHECKPOINT) ||
    "/tmp/churchill-openai-perceptual-replacement-review-execution-checkpoint.json",
);
const authorization = text(process.env[AUTHORIZATION_ENV]);

if (!organizationId || !projectId || !graphId) {
  throw new Error("REPLACEMENT_REVIEW_EXECUTION_SCOPE_REQUIRED");
}

const [
  { supabaseAdmin },
  { ProductionTaskRuntime },
  { resolveCreativeService },
  { OrganizationServiceRuntime },
  { resolveServiceCapabilities },
  { resolvePrimaryExecutionCapability },
  { resolveProvider },
  { PricingRuntime },
  { CredentialRuntime },
] = await Promise.all([
  import("@/lib/shared/supabase/admin"),
  import("@/lib/operations/tasks/runtime/ProductionTaskRuntime"),
  import("@/lib/creative/services/CreativeServiceResolver"),
  import("@/lib/platform/service-runtime/services/runtime/OrganizationServiceRuntime"),
  import("@/lib/platform/service-runtime/services/resolver/ServiceCapabilityResolver"),
  import("@/lib/platform/service-runtime/services/resolver/CapabilityExecutionResolver"),
  import("@/lib/platform/service-runtime/providers/ProviderResolver"),
  import("@/lib/platform/service-runtime/pricing/PricingRuntime"),
  import("@/lib/platform/service-runtime/credentials/runtime/CredentialRuntime"),
]);

const blockers = [];
const requireValue = (condition, label) => {
  if (!condition) blockers.push(label);
};

requireValue(
  text(preview.contract) === PREVIEW_CONTRACT,
  "REVIEW_PREVIEW_CONTRACT_INVALID",
);
requireValue(
  text(sourceAudit.contract) === SOURCE_AUDIT_CONTRACT,
  "SOURCE_AUDIT_CONTRACT_INVALID",
);
requireValue(
  text(dispatchCheckpoint.contract) === DISPATCH_CHECKPOINT_CONTRACT,
  "DISPATCH_CHECKPOINT_CONTRACT_INVALID",
);
for (const [label, value] of [
  ["PREVIEW", preview],
  ["SOURCE_AUDIT", sourceAudit],
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
    "REPLACEMENT_PERCEPTUAL_REVIEW_9_TASK_EXECUTION_PREVIEW_CONFIRMED" &&
    text(preview.readiness) ===
      "READY_FOR_GUARDED_REPLACEMENT_PERCEPTUAL_REVIEW_IMPLEMENTATION" &&
    Number(preview.source_task_count) === 9 &&
    Number(preview.review_task_count) === 9 &&
    Number(preview.ready_count) === 9 &&
    Number(preview.failure_count) === 0 &&
    Number(preview.frame_ready_count) === 9 &&
    Number(preview.credential_ready_count) === 9 &&
    money(preview.maximum_authorized_spend) > 0 &&
    list(preview.blockers).length === 0 &&
    preview.state_unchanged === true &&
    preview.provider_calls_executed === false &&
    preview.review_execution_executed === false,
  "REVIEW_PREVIEW_NOT_READY",
);
requireValue(
  text(preview.execution_contract?.contract) === EXECUTION_CONTRACT &&
    Number(preview.execution_contract?.task_count) === 9 &&
    Number(preview.execution_contract?.maximum_provider_calls) === 9 &&
    Number(preview.execution_contract?.maximum_calls_per_task) === 1 &&
    Number(preview.execution_contract?.source_regeneration_permitted) === 0 &&
    Number(preview.execution_contract?.runway_polling_permitted) === 0 &&
    Number(preview.execution_contract?.retries_permitted) === 0 &&
    Number(preview.execution_contract?.finalisation_permitted) === 0 &&
    Number(preview.execution_contract?.publication_permitted) === 0 &&
    sha256(object(preview.execution_contract)) ===
      text(preview.execution_contract_sha256),
  "REVIEW_EXECUTION_CONTRACT_INVALID",
);
requireValue(
  preview.source_audit_file_sha256 === sourceAuditFile.file_sha256 &&
    preview.dispatch_checkpoint_file_sha256 ===
      dispatchCheckpointFile.file_sha256,
  "REVIEW_PREVIEW_INPUT_HASH_INVALID",
);
requireValue(
  text(sourceAudit.decision) ===
    "REPAIR_SOURCE_9_COMPLETED_VIDEO_ASSETS_CONFIRMED" &&
    text(sourceAudit.readiness) ===
      "READY_FOR_REPLACEMENT_PERCEPTUAL_REVIEW_EXECUTION_PREVIEW" &&
    Number(sourceAudit.source_ready_count) === 9 &&
    Number(sourceAudit.source_failure_count) === 0 &&
    list(sourceAudit.blockers).length === 0,
  "SOURCE_AUDIT_NOT_READY",
);
requireValue(
  text(dispatchCheckpoint.status) === "SUBMITTED",
  "DISPATCH_CHECKPOINT_NOT_SUBMITTED",
);
requireValue(
  authorization && authorization === text(preview.expected_authorization),
  "EXACT_REVIEW_AUTHORIZATION_REQUIRED",
);

if (blockers.length) {
  throw new Error(`REPLACEMENT_REVIEW_PREFLIGHT_BLOCKED:${blockers.join(",")}`);
}

const before = await exactState({
  supabaseAdmin,
  ProductionTaskRuntime,
  organizationId,
  projectId,
  graphId,
});
const plans = list(preview.plans);
const sourceIds = new Set(plans.map((plan) => text(plan.source_task_id)));
const reviewIds = new Set(plans.map((plan) => text(plan.review_task_id)));
const protectedIds = new Set(
  before.tasks
    .map((task) => text(task.id))
    .filter((id) => !sourceIds.has(id) && !reviewIds.has(id)),
);
const protectedBefore = taskFingerprint(
  before.tasks.filter((task) => protectedIds.has(text(task.id))),
);

requireValue(before.task_count === 45, "LIVE_TASK_COUNT_INVALID");
requireValue(sourceIds.size === 9, "LIVE_SOURCE_ID_COUNT_INVALID");
requireValue(reviewIds.size === 9, "LIVE_REVIEW_ID_COUNT_INVALID");
requireValue(protectedIds.size === 27, "PROTECTED_TASK_COUNT_INVALID");
requireValue(
  before.task_state_sha256 === text(preview.exact_state_after?.task_state_sha256) &&
    before.usage_count === Number(preview.exact_state_after?.usage_count) &&
    before.wallet_balance === money(preview.exact_state_after?.wallet_balance) &&
    before.wallet_reserved_balance ===
      money(preview.exact_state_after?.wallet_reserved_balance),
  "INITIAL_LIVE_STATE_CHANGED",
);

const beforeMap = new Map(before.tasks.map((task) => [text(task.id), task]));
const assetIds = plans.map((plan) => text(plan.asset_node_id));
const assetResponse = await supabaseAdmin
  .from("creative_asset_nodes")
  .select("id,type,status,production_task_id,metadata,url,storage_path")
  .in("id", assetIds);
if (assetResponse.error) throw assetResponse.error;
const assetMap = new Map(
  list(assetResponse.data).map((asset) => [text(asset.id), asset]),
);

const preflight = [];
for (const plan of plans) {
  const source = beforeMap.get(text(plan.source_task_id));
  const review = beforeMap.get(text(plan.review_task_id));
  const asset = assetMap.get(text(plan.asset_node_id));
  const issues = [];

  if (!source || text(source.status) !== "COMPLETED") {
    issues.push("SOURCE_NOT_COMPLETED");
  }
  if (
    text(source?.metadata?.repair_payload_contract) !== SOURCE_PAYLOAD_CONTRACT
  ) {
    issues.push("SOURCE_PAYLOAD_CONTRACT_INVALID");
  }
  if (!outputMediaUrl(source?.output)) issues.push("SOURCE_MEDIA_MISSING");
  if (sourceAssetId(source) !== text(asset?.id)) {
    issues.push("SOURCE_ASSET_LINK_INVALID");
  }
  if (
    !asset ||
    text(asset.type) !== "VIDEO" ||
    text(asset.status) !== "GENERATED" ||
    text(asset.production_task_id) !== text(source?.id) ||
    text(asset.metadata?.inspection_status) !== "COMPLETE"
  ) {
    issues.push("SOURCE_ASSET_INVALID");
  }

  if (!review || !reviewUnbound(review)) {
    issues.push("REVIEW_NOT_CLEAN_UNBOUND_WAITING");
  }
  if (text(review?.metadata?.contract) !== REVIEW_GATE_CONTRACT) {
    issues.push("REVIEW_GATE_CONTRACT_INVALID");
  }
  if (
    text(review?.metadata?.repair_payload_contract) !== REVIEW_PAYLOAD_CONTRACT
  ) {
    issues.push("REVIEW_PAYLOAD_CONTRACT_INVALID");
  }
  if (
    list(review?.depends_on).length !== 1 ||
    text(review?.depends_on?.[0]) !== text(source?.id)
  ) {
    issues.push("REVIEW_DEPENDENCY_INVALID");
  }

  let resolved = null;
  try {
    resolved = await resolveReviewExecution({
      review,
      organizationId,
      resolveCreativeService,
      OrganizationServiceRuntime,
      resolveServiceCapabilities,
      resolvePrimaryExecutionCapability,
      resolveProvider,
      PricingRuntime,
      CredentialRuntime,
    });
    issues.push(...compareResolution(resolved, plan));
  } catch (error) {
    issues.push(`REVIEW_RESOLUTION_FAILED:${error.message}`);
  }

  preflight.push({
    source_task_id: source?.id || null,
    review_task_id: review?.id || null,
    asset_node_id: asset?.id || null,
    provider: resolved?.provider || null,
    model: resolved?.model || null,
    pricing_id: resolved?.pricing_id || null,
    customer_price: money(resolved?.customer_price),
    currency: resolved?.currency || null,
    credential_source: resolved?.credential_source || "NONE",
    issues,
    ready: issues.length === 0,
  });
}

requireValue(
  preflight.length === 9 &&
    preflight.every((item) => item.ready),
  "ONE_OR_MORE_REVIEW_PREFLIGHTS_INVALID",
);
if (blockers.length) {
  throw new Error(`REPLACEMENT_REVIEW_PREFLIGHT_BLOCKED:${blockers.join(",")}`);
}

let checkpoint;
let checkpointResume = false;
if (fs.existsSync(checkpointPath)) {
  checkpointResume = true;
  checkpoint = JSON.parse(fs.readFileSync(checkpointPath, "utf8"));
  requireValue(
    text(checkpoint.contract) === CHECKPOINT_CONTRACT,
    "REVIEW_CHECKPOINT_CONTRACT_INVALID",
  );
  requireValue(
    text(checkpoint.organization_id) === organizationId &&
      text(checkpoint.creative_project_id) === projectId &&
      text(checkpoint.production_graph_id) === graphId,
    "REVIEW_CHECKPOINT_SCOPE_INVALID",
  );
  requireValue(
    text(checkpoint.preview_file_sha256) === previewFile.file_sha256 &&
      text(checkpoint.execution_contract_sha256) ===
        text(preview.execution_contract_sha256) &&
      text(checkpoint.authorization_sha256) === sha256(authorization),
    "REVIEW_CHECKPOINT_BINDING_INVALID",
  );
  requireValue(
    list(checkpoint.records).length === 9 &&
      list(checkpoint.protected_task_ids).length === 27,
    "REVIEW_CHECKPOINT_COUNTS_INVALID",
  );
} else {
  checkpoint = {
    contract: CHECKPOINT_CONTRACT,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    status: "IN_PROGRESS",
    organization_id: organizationId,
    creative_project_id: projectId,
    production_graph_id: graphId,
    preview_file: previewFile.absolute,
    preview_file_sha256: previewFile.file_sha256,
    source_audit_file: sourceAuditFile.absolute,
    source_audit_file_sha256: sourceAuditFile.file_sha256,
    dispatch_checkpoint_file: dispatchCheckpointFile.absolute,
    dispatch_checkpoint_file_sha256: dispatchCheckpointFile.file_sha256,
    execution_contract_sha256: preview.execution_contract_sha256,
    authorization_sha256: sha256(authorization),
    maximum_authorized_spend: money(preview.maximum_authorized_spend),
    maximum_provider_calls: MAXIMUM_OPENAI_CALLS,
    maximum_calls_per_review: MAXIMUM_CALLS_PER_REVIEW,
    initial_task_state_sha256: before.task_state_sha256,
    initial_usage_count: before.usage_count,
    initial_wallet_balance: before.wallet_balance,
    initial_wallet_reserved_balance: before.wallet_reserved_balance,
    protected_task_ids: [...protectedIds].sort(),
    protected_task_state_sha256: protectedBefore,
    provider_call_count: 0,
    retry_count: 0,
    source_regeneration_count: 0,
    runway_poll_count: 0,
    finalisation_count: 0,
    publication_count: 0,
    records: plans.map((plan, index) => ({
      sequence: index + 1,
      source_task_id: plan.source_task_id,
      review_task_id: plan.review_task_id,
      asset_node_id: plan.asset_node_id,
      expected_model: plan.selected_model,
      expected_pricing_id: plan.selected_pricing_id,
      maximum_customer_price: money(plan.estimated_customer_price),
      currency: plan.estimated_currency,
      state: "READY_TO_BIND",
      provider_call_count: 0,
      usage_id: null,
      billing_invoice_line_id: null,
      result: null,
      error: null,
    })),
  };
  writeJson(checkpointPath, checkpoint);
}

if (blockers.length) {
  throw new Error(`REPLACEMENT_REVIEW_CHECKPOINT_BLOCKED:${blockers.join(",")}`);
}

for (const record of checkpoint.records) {
  if (TERMINAL_RECORD_STATES.has(text(record.state))) continue;
  if (text(record.state) === "REVIEW_CALL_STARTED") {
    blockers.push(`AMBIGUOUS_REVIEW_CALL_STARTED:${record.review_task_id}`);
    continue;
  }

  const plan = plans.find(
    (item) => text(item.review_task_id) === text(record.review_task_id),
  );
  let source = await ProductionTaskRuntime.get(record.source_task_id);
  let review = await ProductionTaskRuntime.get(record.review_task_id);
  const asset = assetMap.get(text(record.asset_node_id));

  if (!plan || !source || !review || !asset) {
    blockers.push(`REVIEW_RECORD_DEPENDENCY_MISSING:${record.review_task_id}`);
    continue;
  }

  if (text(record.state) === "READY_TO_BIND") {
    if (reviewBound(review, plan, preview.execution_contract_sha256)) {
      record.state = "BOUND_READY";
      record.bound_at = review.updated_at || new Date().toISOString();
      checkpoint.updated_at = new Date().toISOString();
      writeJson(checkpointPath, checkpoint);
    } else {
      if (!reviewUnbound(review)) {
        blockers.push(`REVIEW_BINDING_STATE_INVALID:${review.id}`);
        continue;
      }
      const resolved = await resolveReviewExecution({
        review,
        organizationId,
        resolveCreativeService,
        OrganizationServiceRuntime,
        resolveServiceCapabilities,
        resolvePrimaryExecutionCapability,
        resolveProvider,
        PricingRuntime,
        CredentialRuntime,
      });
      const resolutionIssues = compareResolution(resolved, plan);
      if (resolutionIssues.length) {
        blockers.push(
          `REVIEW_BINDING_RESOLUTION_CHANGED:${review.id}:${resolutionIssues.join("+")}`,
        );
        continue;
      }

      await ProductionTaskRuntime.update(review.id, {
        provider_id: "openai",
        input: {
          ...object(review.input),
          currency: plan.estimated_currency,
          quantity: 1,
          provider_policy: {
            ...object(review.input?.provider_policy),
            preferred_provider: "openai",
          },
        },
        cost: {
          ...object(review.cost),
          currency: plan.estimated_currency,
          estimated: money(plan.estimated_customer_price),
          actual: 0,
          approved: true,
        },
        metadata: {
          ...object(review.metadata),
          provider_id: "openai",
          replacement_review_execution_contract_sha256:
            preview.execution_contract_sha256,
          replacement_review_pricing_id: plan.selected_pricing_id,
          replacement_review_model: plan.selected_model,
          replacement_review_maximum_customer_price:
            money(plan.estimated_customer_price),
          replacement_review_execution_authorized: true,
          replacement_review_authorization_sha256: sha256(authorization),
        },
      });
      review = await ProductionTaskRuntime.get(review.id);
      if (!reviewBound(review, plan, preview.execution_contract_sha256)) {
        throw new Error(`REVIEW_BINDING_VERIFY_FAILED:${review.id}`);
      }
      record.state = "BOUND_READY";
      record.bound_at = new Date().toISOString();
      checkpoint.updated_at = record.bound_at;
      writeJson(checkpointPath, checkpoint);
    }
  }

  if (text(record.state) !== "BOUND_READY") {
    blockers.push(`REVIEW_RECORD_NOT_BOUND_READY:${record.review_task_id}`);
    continue;
  }

  source = await ProductionTaskRuntime.get(record.source_task_id);
  review = await ProductionTaskRuntime.get(record.review_task_id);
  if (
    text(source?.status) !== "COMPLETED" ||
    sourceAssetId(source) !== text(record.asset_node_id) ||
    !outputMediaUrl(source?.output) ||
    !reviewBound(review, plan, preview.execution_contract_sha256)
  ) {
    blockers.push(`REVIEW_PRECALL_STATE_INVALID:${record.review_task_id}`);
    continue;
  }

  const resolved = await resolveReviewExecution({
    review,
    organizationId,
    resolveCreativeService,
    OrganizationServiceRuntime,
    resolveServiceCapabilities,
    resolvePrimaryExecutionCapability,
    resolveProvider,
    PricingRuntime,
    CredentialRuntime,
  });
  const resolutionIssues = compareResolution(resolved, plan);
  if (resolutionIssues.length) {
    blockers.push(
      `REVIEW_PRECALL_RESOLUTION_CHANGED:${review.id}:${resolutionIssues.join("+")}`,
    );
    continue;
  }

  record.state = "REVIEW_CALL_STARTED";
  record.provider_call_count = 1;
  record.call_started_at = new Date().toISOString();
  record.credential_source = resolved.credential_source;
  record.secret_value_exposed = false;
  checkpoint.provider_call_count =
    Number(checkpoint.provider_call_count || 0) + 1;
  checkpoint.updated_at = record.call_started_at;
  writeJson(checkpointPath, checkpoint);

  try {
    await ProductionTaskRuntime.dispatch(record.review_task_id);
    const reviewAfter = await ProductionTaskRuntime.get(record.review_task_id);
    const sourceAfter = await ProductionTaskRuntime.get(record.source_task_id);
    record.usage_id = usageId(reviewAfter);
    record.billing_invoice_line_id = billingLineId(reviewAfter);
    record.completed_at = new Date().toISOString();

    if (
      text(reviewAfter?.status) === "COMPLETED" &&
      reviewAfter?.metadata?.automated_perceptual_validation_passed === true &&
      reviewAfter?.metadata?.generated_media_released_for_downstream === true &&
      text(sourceAfter?.status) === "COMPLETED" &&
      sourceAfter?.metadata?.automated_perceptual_validation_passed === true
    ) {
      record.state = "REVIEW_PASSED";
      record.result = {
        review_status: reviewAfter.status,
        source_status: sourceAfter.status,
        provider: reviewAfter.output?.provider ||
          reviewAfter.output?.provider_submission?.provider ||
          "openai",
        model: reviewAfter.output?.model ||
          reviewAfter.output?.provider_submission?.model ||
          null,
        settlement: reviewAfter.output?.settlement ||
          reviewAfter.output?.provider_submission?.settlement ||
          null,
        perceptual_validation_passed: true,
        source_asset_preserved:
          sourceAssetId(sourceAfter) === text(record.asset_node_id) &&
          Boolean(outputMediaUrl(sourceAfter.output)),
      };
    } else if (
      text(reviewAfter?.status) === "FAILED" &&
      text(reviewAfter?.error) === REVIEW_REJECTION &&
      text(sourceAfter?.status) === "FAILED" &&
      text(sourceAfter?.error) === REVIEW_REJECTION
    ) {
      record.state = "REVIEW_REJECTED";
      record.result = {
        review_status: reviewAfter.status,
        source_status: sourceAfter.status,
        provider: reviewAfter.output?.provider ||
          reviewAfter.output?.provider_submission?.provider ||
          "openai",
        model: reviewAfter.output?.model ||
          reviewAfter.output?.provider_submission?.model ||
          null,
        settlement: reviewAfter.output?.settlement ||
          reviewAfter.output?.provider_submission?.settlement ||
          null,
        perceptual_validation_passed: false,
        source_asset_preserved:
          sourceAssetId(sourceAfter) === text(record.asset_node_id) &&
          Boolean(outputMediaUrl(sourceAfter.output)),
      };
    } else if (text(reviewAfter?.status) === "FAILED") {
      record.state = "REVIEW_TECHNICAL_FAILED";
      record.error = text(reviewAfter.error) || "REVIEW_TECHNICAL_FAILURE";
      record.result = {
        review_status: reviewAfter.status,
        source_status: sourceAfter?.status || null,
        source_asset_preserved:
          sourceAssetId(sourceAfter) === text(record.asset_node_id) &&
          Boolean(outputMediaUrl(sourceAfter?.output)),
      };
    } else {
      record.state = "REVIEW_CALL_EXCEPTION";
      record.error = `UNEXPECTED_REVIEW_TERMINAL_STATE:${reviewAfter?.status || "MISSING"}`;
      blockers.push(
        `UNEXPECTED_REVIEW_TERMINAL_STATE:${record.review_task_id}:${reviewAfter?.status || "MISSING"}`,
      );
    }
  } catch (error) {
    const reviewAfter = await ProductionTaskRuntime.get(record.review_task_id);
    const sourceAfter = await ProductionTaskRuntime.get(record.source_task_id);
    record.state = "REVIEW_CALL_EXCEPTION";
    record.error = text(error?.message || error);
    record.completed_at = new Date().toISOString();
    record.result = {
      review_status: reviewAfter?.status || null,
      source_status: sourceAfter?.status || null,
      source_asset_preserved:
        sourceAssetId(sourceAfter) === text(record.asset_node_id) &&
        Boolean(outputMediaUrl(sourceAfter?.output)),
    };
    blockers.push(
      `REVIEW_CALL_EXCEPTION:${record.review_task_id}:${record.error}`,
    );
  }

  checkpoint.updated_at = new Date().toISOString();
  writeJson(checkpointPath, checkpoint);
}

const after = await exactState({
  supabaseAdmin,
  ProductionTaskRuntime,
  organizationId,
  projectId,
  graphId,
});
const protectedAfter = taskFingerprint(
  after.tasks.filter((task) => protectedIds.has(text(task.id))),
);
if (protectedAfter !== protectedBefore) {
  blockers.push("PROTECTED_TASK_STATE_CHANGED");
}
if (after.task_count !== 45) blockers.push("FINAL_TASK_COUNT_CHANGED");
if (after.usage_count - before.usage_count !==
    Number(checkpoint.provider_call_count || 0)) {
  blockers.push("USAGE_COUNT_DELTA_DOES_NOT_MATCH_PROVIDER_CALLS");
}
if (Number(checkpoint.provider_call_count || 0) > MAXIMUM_OPENAI_CALLS) {
  blockers.push("OPENAI_CALL_LIMIT_EXCEEDED");
}
if (
  checkpoint.records.some(
    (record) => Number(record.provider_call_count || 0) > MAXIMUM_CALLS_PER_REVIEW,
  )
) {
  blockers.push("PER_REVIEW_CALL_LIMIT_EXCEEDED");
}
if (checkpoint.records.some((record) => text(record.state) === "REVIEW_CALL_STARTED")) {
  blockers.push("AMBIGUOUS_STARTED_REVIEW_PRESENT");
}
if (
  checkpoint.records.some(
    (record) => record.result?.source_asset_preserved === false,
  )
) {
  blockers.push("ONE_OR_MORE_SOURCE_ASSETS_NOT_PRESERVED");
}

const finalAssetResponse = await supabaseAdmin
  .from("creative_asset_nodes")
  .select("id,type,status,production_task_id,metadata,url,storage_path")
  .in("id", assetIds);
if (finalAssetResponse.error) throw finalAssetResponse.error;
const finalAssetIds = new Set(
  list(finalAssetResponse.data).map((asset) => text(asset.id)),
);
if (finalAssetIds.size !== 9 || assetIds.some((id) => !finalAssetIds.has(id))) {
  blockers.push("SOURCE_ASSET_NODE_SET_CHANGED");
}

const stateCounts = checkpoint.records.reduce((result, record) => {
  const state = text(record.state) || "UNKNOWN";
  result[state] = Number(result[state] || 0) + 1;
  return result;
}, {});
const passedCount = Number(stateCounts.REVIEW_PASSED || 0);
const rejectedCount = Number(stateCounts.REVIEW_REJECTED || 0);
const technicalFailedCount = Number(stateCounts.REVIEW_TECHNICAL_FAILED || 0);
const exceptionCount = Number(stateCounts.REVIEW_CALL_EXCEPTION || 0);
const unattemptedCount = Number(stateCounts.READY_TO_BIND || 0) +
  Number(stateCounts.BOUND_READY || 0);
const providerCallCount = Number(checkpoint.provider_call_count || 0);
const actualSpend = money(before.wallet_balance - after.wallet_balance);
const reservedBalanceDelta = money(
  after.wallet_reserved_balance - before.wallet_reserved_balance,
);

if (actualSpend < 0 || actualSpend > money(preview.maximum_authorized_spend)) {
  blockers.push("ACTUAL_SPEND_OUTSIDE_AUTHORIZED_CEILING");
}
if (after.wallet_reserved_balance !== 0) {
  blockers.push("REVIEW_RESERVATION_BALANCE_NOT_ZERO");
}
if (
  passedCount + rejectedCount + technicalFailedCount + exceptionCount +
    unattemptedCount !== 9
) {
  blockers.push("FINAL_REVIEW_RECORD_COUNTS_INVALID");
}
if (providerCallCount !== 9) blockers.push("EXACT_NINE_OPENAI_CALLS_NOT_EXECUTED");
if (unattemptedCount !== 0) blockers.push("ONE_OR_MORE_REVIEWS_UNATTEMPTED");

checkpoint.status = blockers.length
  ? "EXECUTION_BLOCKED"
  : "EXECUTION_COMPLETED";
checkpoint.updated_at = new Date().toISOString();
checkpoint.completed_at = checkpoint.updated_at;
checkpoint.final_task_state_sha256 = after.task_state_sha256;
checkpoint.final_usage_count = after.usage_count;
checkpoint.final_wallet_balance = after.wallet_balance;
checkpoint.final_wallet_reserved_balance = after.wallet_reserved_balance;
checkpoint.passed_count = passedCount;
checkpoint.rejected_count = rejectedCount;
checkpoint.technical_failed_count = technicalFailedCount;
checkpoint.exception_count = exceptionCount;
checkpoint.actual_spend = actualSpend;
writeJson(checkpointPath, checkpoint);

const decision = blockers.length
  ? "REPLACEMENT_PERCEPTUAL_REVIEW_EXECUTION_BLOCKED"
  : "REPLACEMENT_PERCEPTUAL_REVIEW_9_TASKS_EXECUTED";
const readiness = blockers.length
  ? "REPLACEMENT_PERCEPTUAL_REVIEW_EXECUTION_BLOCKED"
  : "READY_FOR_READ_ONLY_REPLACEMENT_PERCEPTUAL_REVIEW_RESULT_AUDIT";
const instruction = blockers.length
  ? "Preserve every checkpoint and audit each blocker. Do not retry reviews, regenerate sources, poll Runway, finalise, or publish."
  : "Run one read-only review-result audit. Do not rerun any review. Passed shots may proceed toward editing after the audit; rejected shots remain isolated for a separate repair decision. Do not finalise or publish.";

const report = {
  contract: REPORT_CONTRACT,
  generated_at: new Date().toISOString(),
  organization_id: organizationId,
  creative_project_id: projectId,
  production_graph_id: graphId,
  preview_file: previewFile.absolute,
  preview_file_sha256: previewFile.file_sha256,
  source_audit_file: sourceAuditFile.absolute,
  source_audit_file_sha256: sourceAuditFile.file_sha256,
  dispatch_checkpoint_file: dispatchCheckpointFile.absolute,
  dispatch_checkpoint_file_sha256: dispatchCheckpointFile.file_sha256,
  checkpoint_file: checkpointPath,
  checkpoint_resume: checkpointResume,
  execution_contract_sha256: preview.execution_contract_sha256,
  authorization_sha256: sha256(authorization),
  source_task_count: sourceIds.size,
  review_task_count: reviewIds.size,
  provider_call_count: providerCallCount,
  maximum_provider_calls: MAXIMUM_OPENAI_CALLS,
  maximum_calls_per_review: MAXIMUM_CALLS_PER_REVIEW,
  passed_count: passedCount,
  rejected_count: rejectedCount,
  technical_failed_count: technicalFailedCount,
  exception_count: exceptionCount,
  unattempted_count: unattemptedCount,
  actual_spend: actualSpend,
  maximum_authorized_spend: money(preview.maximum_authorized_spend),
  wallet_reserved_balance_delta: reservedBalanceDelta,
  record_state_counts: stateCounts,
  records: checkpoint.records,
  protected_task_count: protectedIds.size,
  protected_task_state_sha256_before: protectedBefore,
  protected_task_state_sha256_after: protectedAfter,
  source_asset_node_count: finalAssetIds.size,
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
  database_writes_executed: providerCallCount > 0,
  provider_binding_executed: true,
  cost_approval_executed: true,
  wallet_mutations_executed: actualSpend > 0,
  provider_calls_executed: providerCallCount > 0,
  openai_calls_executed: providerCallCount,
  retries_executed: false,
  source_regeneration_executed: false,
  runway_polls_executed: false,
  finalisation_executed: false,
  publication_executed: false,
  readiness,
};

writeJson(outputPath, report);

console.log("============================================================");
console.log("GUARDED REPLACEMENT PERCEPTUAL REVIEW EXECUTION");
console.log("============================================================");
console.log(`OUTPUT=${outputPath}`);
console.log(`CHECKPOINT=${checkpointPath}`);
console.log(`CHECKPOINT_RESUME=${checkpointResume ? "YES" : "NO"}`);
console.log(`CHECKPOINT_STATUS=${checkpoint.status}`);
console.log(`SOURCE_TASK_COUNT=${sourceIds.size}`);
console.log(`REVIEW_TASK_COUNT=${reviewIds.size}`);
console.log(`OPENAI_CALL_COUNT=${providerCallCount}`);
console.log(`MAXIMUM_OPENAI_CALLS=${MAXIMUM_OPENAI_CALLS}`);
console.log(`MAXIMUM_CALLS_PER_REVIEW=${MAXIMUM_CALLS_PER_REVIEW}`);
console.log(`PASSED_COUNT=${passedCount}`);
console.log(`REJECTED_COUNT=${rejectedCount}`);
console.log(`TECHNICAL_FAILED_COUNT=${technicalFailedCount}`);
console.log(`EXCEPTION_COUNT=${exceptionCount}`);
console.log(`UNATTEMPTED_COUNT=${unattemptedCount}`);
console.log(`ACTUAL_SPEND=${actualSpend}`);
console.log(`MAXIMUM_AUTHORIZED_SPEND=${money(preview.maximum_authorized_spend)}`);

for (const record of checkpoint.records) {
  console.log([
    `REPLACEMENT_REVIEW_RESULT=${record.review_task_id}`,
    `source=${record.source_task_id}`,
    `asset=${record.asset_node_id}`,
    `state=${record.state}`,
    `calls=${record.provider_call_count || 0}`,
    `usage=${record.usage_id || ""}`,
    `invoice_line=${record.billing_invoice_line_id || ""}`,
    `source_status=${record.result?.source_status || ""}`,
    `review_status=${record.result?.review_status || ""}`,
    `settlement=${record.result?.settlement || ""}`,
    `asset_preserved=${record.result?.source_asset_preserved === true ? "YES" : "NO"}`,
    `error=${record.error || ""}`,
  ].join("|"));
}

console.log(`REVIEW_EXECUTION_BLOCKERS=${JSON.stringify(blockers)}`);
console.log(`REVIEW_EXECUTION_DECISION=${decision}`);
console.log(`REVIEW_EXECUTION_INSTRUCTION=${instruction}`);
console.log(`TASK_STATUS_COUNTS_BEFORE=${JSON.stringify(before.task_status_counts)}`);
console.log(`TASK_STATUS_COUNTS_AFTER=${JSON.stringify(after.task_status_counts)}`);
console.log(`TASK_STATE_SHA256_BEFORE=${before.task_state_sha256}`);
console.log(`TASK_STATE_SHA256_AFTER=${after.task_state_sha256}`);
console.log(`USAGE_COUNT_BEFORE=${before.usage_count}`);
console.log(`USAGE_COUNT_AFTER=${after.usage_count}`);
console.log(`WALLET_BALANCE_BEFORE=${before.wallet_balance}`);
console.log(`WALLET_BALANCE_AFTER=${after.wallet_balance}`);
console.log(`WALLET_RESERVED_BALANCE_BEFORE=${before.wallet_reserved_balance}`);
console.log(`WALLET_RESERVED_BALANCE_AFTER=${after.wallet_reserved_balance}`);
console.log(`PROTECTED_TASK_STATE_UNCHANGED=${protectedAfter === protectedBefore ? "YES" : "NO"}`);
console.log(`SOURCE_ASSET_NODE_COUNT=${finalAssetIds.size}`);
console.log("RETRIES_EXECUTED=NO");
console.log("SOURCE_REGENERATION_EXECUTED=NO");
console.log("RUNWAY_POLLS_EXECUTED=NO");
console.log("FINALISATION_EXECUTED=NO");
console.log("PUBLICATION_EXECUTED=NO");
console.log(`AUDIT_READINESS=${readiness}`);
console.log("TERMINAL_REMAINS_OPEN=YES");

if (blockers.length) process.exitCode = 2;
