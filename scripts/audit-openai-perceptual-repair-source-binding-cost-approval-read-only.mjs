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
const APPLY_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_REPAIR_SOURCE_BINDING_COST_APPROVAL_APPLY_V1";
const CHECKPOINT_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_REPAIR_SOURCE_BINDING_COST_APPROVAL_CHECKPOINT_V1";
const REPORT_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_REPAIR_SOURCE_BINDING_COST_APPROVAL_AUDIT_V1";
const BINDING_CONTRACT =
  "CREATIVE_PERCEPTUAL_REPAIR_SOURCE_PROVIDER_BINDING_V1";
const COST_APPROVAL_CONTRACT =
  "CREATIVE_PERCEPTUAL_REPAIR_SOURCE_COST_APPROVAL_V1";

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

const previewFile = readJson(
  process.argv[2],
  "CUMULATIVE_BINDING_COST_PREVIEW",
);
const applyFile = readJson(
  process.argv[3],
  "BINDING_COST_APPLY_RESULT",
);
const checkpointFile = readJson(
  process.argv[4],
  "BINDING_COST_CHECKPOINT",
);
const preview = object(previewFile.value);
const applyResult = object(applyFile.value);
const checkpoint = object(checkpointFile.value);

const organizationId = text(process.env.ORGANIZATION_ID);
const projectId = text(process.env.CREATIVE_PROJECT_ID);
const graphId = text(process.env.PRODUCTION_GRAPH_ID);
const outputPath = path.resolve(
  text(process.env.OPENAI_PERCEPTUAL_SOURCE_BINDING_COST_AUDIT_OUTPUT) ||
    "/tmp/churchill-openai-perceptual-repair-source-binding-cost-approval-audit.json",
);

if (!organizationId || !projectId || !graphId) {
  throw new Error("SOURCE_BINDING_COST_AUDIT_SCOPE_REQUIRED");
}

const [
  { supabaseAdmin },
  { ProductionTaskRuntime },
  { persistedPromptFieldPaths },
] = await Promise.all([
  import("@/lib/shared/supabase/admin"),
  import("@/lib/operations/tasks/runtime/ProductionTaskRuntime"),
  import("@/lib/creative/execution/runtime/CreativePromptlessPersistenceRuntime"),
]);

const blockers = [];
const requireValue = (condition, label) => {
  if (!condition) blockers.push(label);
};

requireValue(
  text(preview.contract) === PREVIEW_CONTRACT,
  "PREVIEW_CONTRACT_INVALID",
);
requireValue(
  text(applyResult.contract) === APPLY_CONTRACT,
  "APPLY_RESULT_CONTRACT_INVALID",
);
requireValue(
  text(checkpoint.contract) === CHECKPOINT_CONTRACT,
  "CHECKPOINT_CONTRACT_INVALID",
);

for (const [label, value] of [
  ["PREVIEW", preview],
  ["APPLY_RESULT", applyResult],
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
  text(applyResult.preview_file_sha256) === previewFile.file_sha256 &&
    text(checkpoint.preview_file_sha256) === previewFile.file_sha256,
  "PREVIEW_FILE_LINKAGE_INVALID",
);
requireValue(
  text(applyResult.corrected_changeset_sha256) ===
    text(preview.corrected_changeset_sha256) &&
    text(checkpoint.corrected_changeset_sha256) ===
      text(preview.corrected_changeset_sha256),
  "CHANGESET_LINKAGE_INVALID",
);
requireValue(
  text(applyResult.checkpoint_file) === checkpointFile.absolute,
  "APPLY_CHECKPOINT_PATH_INVALID",
);
requireValue(
  text(preview.decision) ===
    "REPAIR_SOURCE_CUMULATIVE_BINDING_COST_PREVIEW_9_SOURCES_CONFIRMED" &&
    text(preview.readiness) ===
      "READY_FOR_CHECKPOINTED_BINDING_COST_APPROVAL_DRY_RUN_DESIGN" &&
    list(preview.blockers).length === 0 &&
    preview.state_unchanged === true,
  "PREVIEW_NOT_READY",
);
requireValue(
  applyResult.apply_mode === true &&
    text(applyResult.decision) ===
      "REPAIR_SOURCE_BINDING_COST_APPROVAL_9_SOURCES_APPLIED" &&
    text(applyResult.readiness) ===
      "READY_FOR_POST_BINDING_COST_APPROVAL_AUDIT" &&
    applyResult.provider_binding_authorized === true &&
    applyResult.cost_approval_authorized === true,
  "APPLY_RESULT_NOT_APPLIED",
);
requireValue(
  applyResult.provider_spend_authorized === false &&
    applyResult.dispatch_authorized === false &&
    applyResult.wallet_reservations_executed === false &&
    applyResult.provider_calls_executed === false &&
    applyResult.provider_polls_executed === false &&
    applyResult.retries_executed === false &&
    applyResult.source_regeneration_executed === false &&
    Number(applyResult.downstream_tasks_updated) === 0 &&
    applyResult.finalisation_eligible === false &&
    applyResult.finalisation_executed === false &&
    applyResult.publication_executed === false,
  "APPLY_RESULT_FORBIDDEN_ACTIVITY_RECORDED",
);
requireValue(
  Number(applyResult.database_write_count) === 18,
  "APPLY_DATABASE_WRITE_COUNT_INVALID",
);
requireValue(
  text(checkpoint.status) === "COMPLETED" &&
    Number(checkpoint.final_task_count) === 45 &&
    Number(checkpoint.database_write_count) === 18 &&
    list(checkpoint.completed_sources).length === 9 &&
    list(checkpoint.completed_sources).every(
      (item) => text(item.state) === "APPROVED",
    ),
  "CHECKPOINT_NOT_COMPLETED",
);
requireValue(
  Number(preview.source_task_count) === 9 &&
    Number(preview.review_task_count) === 9 &&
    Number(preview.proposed_binding_write_count) === 9 &&
    Number(preview.proposed_cost_approval_write_count) === 9 &&
    Number(preview.proposed_total_write_count) === 18 &&
    money(preview.proposed_exact_customer_price) === 47.34288 &&
    money(preview.original_task_cost_ceiling) === 208.187686 &&
    text(preview.currency) === "THB",
  "PREVIEW_COUNTS_OR_COST_INVALID",
);

const before = await exactState({
  supabaseAdmin,
  ProductionTaskRuntime,
  organizationId,
  projectId,
  graphId,
});
const taskMap = new Map(before.tasks.map((task) => [task.id, task]));
const changes = list(preview.corrected_changes);
const sourceIds = new Set(changes.map((change) => text(change.source_task_id)));
const reviewIds = new Set(changes.map((change) => text(change.review_task_id)));
const protectedIds = new Set(list(checkpoint.protected_task_ids).map(text));

requireValue(before.task_count === 45, "LIVE_TASK_COUNT_INVALID");
requireValue(
  Number(before.task_status_counts.COMPLETED || 0) === 9 &&
    Number(before.task_status_counts.WAITING || 0) === 18 &&
    Number(before.task_status_counts.FAILED || 0) === 18,
  "LIVE_TASK_STATUS_COUNTS_INVALID",
);
requireValue(sourceIds.size === 9, "LIVE_SOURCE_ID_COUNT_INVALID");
requireValue(reviewIds.size === 9, "LIVE_REVIEW_ID_COUNT_INVALID");
requireValue(protectedIds.size === 36, "PROTECTED_TASK_COUNT_INVALID");
requireValue(
  [...sourceIds].every((id) => !reviewIds.has(id)) &&
    [...sourceIds].every((id) => !protectedIds.has(id)) &&
    [...reviewIds].every((id) => protectedIds.has(id)),
  "SOURCE_REVIEW_PROTECTION_SCOPE_INVALID",
);
requireValue(
  before.task_state_sha256 === text(checkpoint.final_task_state_sha256) &&
    before.task_state_sha256 ===
      text(applyResult.exact_state_after?.task_state_sha256),
  "LIVE_TASK_STATE_SHA_MISMATCH",
);
requireValue(
  before.usage_count === Number(checkpoint.initial_usage_count) &&
    before.usage_count === Number(applyResult.exact_state_before?.usage_count) &&
    before.usage_count === Number(applyResult.exact_state_after?.usage_count),
  "USAGE_COUNT_CHANGED",
);
requireValue(
  before.wallet_balance === money(checkpoint.initial_wallet_balance) &&
    before.wallet_balance === money(applyResult.exact_state_before?.wallet_balance) &&
    before.wallet_balance === money(applyResult.exact_state_after?.wallet_balance) &&
    before.wallet_updated_at === checkpoint.initial_wallet_updated_at &&
    before.wallet_updated_at === applyResult.exact_state_before?.wallet_updated_at &&
    before.wallet_updated_at === applyResult.exact_state_after?.wallet_updated_at,
  "WALLET_STATE_CHANGED",
);

const protectedStateSha = taskFingerprint(
  before.tasks.filter((task) => protectedIds.has(task.id)),
);
requireValue(
  protectedStateSha === text(checkpoint.protected_task_state_sha256) &&
    protectedStateSha === text(checkpoint.final_protected_task_state_sha256) &&
    protectedStateSha === text(applyResult.protected_state_sha256_before) &&
    protectedStateSha === text(applyResult.protected_state_sha256_after),
  "PROTECTED_TASK_STATE_CHANGED",
);

const sourceAudits = [];

for (const change of changes) {
  const source = taskMap.get(text(change.source_task_id));
  const review = taskMap.get(text(change.review_task_id));
  const issues = [];
  const binding = object(source?.metadata?.repair_source_provider_binding);
  const approval = object(source?.metadata?.repair_source_cost_approval);
  const guard = object(
    source?.metadata?.approved_cost_guard ||
      source?.input?.approved_cost_guard,
  );
  const sealedApproval = object(source?.metadata?.production_approval_contract);

  if (!source) issues.push("SOURCE_TASK_MISSING");
  if (!review) issues.push("REVIEW_TASK_MISSING");

  if (source && mutableSha(source) !== text(change.final_cumulative_state_sha256)) {
    issues.push("SOURCE_FINAL_STATE_SHA_MISMATCH");
  }
  if (source && text(source.status) !== "WAITING") {
    issues.push(`SOURCE_STATUS_INVALID:${source.status}`);
  }
  if (source && text(source.provider_id) !== "runway") {
    issues.push("SOURCE_PROVIDER_INVALID");
  }
  if (
    source &&
    (source.cost?.approved !== true ||
      money(source.cost?.estimated) !== money(change.exact_customer_price) ||
      Number(source.cost?.actual || 0) !== 0 ||
      text(source.cost?.currency) !== "THB")
  ) {
    issues.push("SOURCE_COST_INVALID");
  }
  if (
    source &&
    (source.timing?.started_at ||
      source.timing?.completed_at ||
      Object.keys(object(source.output)).length !== 0 ||
      text(source.error))
  ) {
    issues.push("SOURCE_EXECUTION_STATE_CHANGED");
  }
  if (
    source &&
    persistedPromptFieldPaths(source, `source_${source.id}`).length
  ) {
    issues.push("SOURCE_PERSISTED_PROMPT_FIELDS_PRESENT");
  }
  if (
    binding.contract !== BINDING_CONTRACT ||
    text(binding.provider) !== "runway" ||
    text(binding.model) !== "gen4.5" ||
    !text(binding.pricing_id) ||
    money(binding.selected_customer_price) !== money(change.exact_customer_price) ||
    text(binding.currency) !== "THB" ||
    binding.reversible !== true
  ) {
    issues.push("SOURCE_BINDING_CONTRACT_INVALID");
  }
  if (
    approval.contract !== COST_APPROVAL_CONTRACT ||
    money(approval.exact_customer_price) !== money(change.exact_customer_price) ||
    money(approval.original_task_cost_ceiling) !==
      money(change.original_task_cost_ceiling) ||
    text(approval.provider) !== "runway" ||
    text(approval.model) !== "gen4.5" ||
    text(approval.pricing_id) !== text(binding.pricing_id) ||
    text(approval.currency) !== "THB" ||
    approval.reversible !== true
  ) {
    issues.push("SOURCE_COST_APPROVAL_CONTRACT_INVALID");
  }
  if (
    source &&
    (source.metadata?.provider_binding_authorized !== true ||
      source.metadata?.cost_approval_authorized !== true ||
      source.metadata?.dispatch_authorized !== false ||
      text(source.metadata?.selected_provider) !== "runway" ||
      text(source.metadata?.selected_model) !== "gen4.5" ||
      text(source.metadata?.selected_pricing_id) !== text(binding.pricing_id) ||
      text(source.metadata?.approved_provider) !== "runway" ||
      text(source.metadata?.approved_model) !== "gen4.5" ||
      text(source.metadata?.approved_pricing_id) !== text(binding.pricing_id))
  ) {
    issues.push("SOURCE_APPROVAL_METADATA_INVALID");
  }
  if (
    money(guard.maximum_customer_price) !== money(change.exact_customer_price) ||
    text(guard.currency) !== "THB" ||
    !text(guard.reference) ||
    Number(guard.estimated_quantity) !== 1
  ) {
    issues.push("SOURCE_APPROVED_COST_GUARD_INVALID");
  }
  if (
    sealedApproval.contract !==
      "CREATIVE_SEALED_PRODUCTION_EXECUTION_APPROVAL_V1" ||
    sealedApproval.production_authorized !== true ||
    sealedApproval.publication_authorized !== false
  ) {
    issues.push("SOURCE_SEALED_APPROVAL_CONTRACT_INVALID");
  }
  if (review && text(review.status) !== "WAITING") {
    issues.push(`REVIEW_STATUS_INVALID:${review.status}`);
  }
  if (review && (review.provider_id !== null || review.cost?.approved !== false)) {
    issues.push("REVIEW_WAS_BOUND_OR_APPROVED");
  }
  if (
    review &&
    (review.timing?.started_at ||
      review.timing?.completed_at ||
      Object.keys(object(review.output)).length !== 0 ||
      text(review.error))
  ) {
    issues.push("REVIEW_EXECUTION_STATE_CHANGED");
  }
  if (
    review &&
    (list(review.depends_on).length !== 1 ||
      text(review.depends_on[0]) !== text(source?.id))
  ) {
    issues.push("REVIEW_DEPENDENCY_INVALID");
  }

  sourceAudits.push({
    execution_node_id: text(change.execution_node_id),
    source_task_id: source?.id || null,
    review_task_id: review?.id || null,
    source_status: source?.status || null,
    review_status: review?.status || null,
    provider_id: source?.provider_id || null,
    approved_customer_price: money(source?.cost?.estimated),
    original_task_cost_ceiling: money(change.original_task_cost_ceiling),
    binding_contract_preserved:
      binding.contract === BINDING_CONTRACT,
    cost_approval_contract_preserved:
      approval.contract === COST_APPROVAL_CONTRACT,
    sealed_cost_guard_compatible:
      sealedApproval.contract ===
        "CREATIVE_SEALED_PRODUCTION_EXECUTION_APPROVAL_V1" &&
      sealedApproval.production_authorized === true &&
      sealedApproval.publication_authorized === false,
    dispatch_authorized: source?.metadata?.dispatch_authorized === true,
    review_dependency_blocked: Boolean(
      review &&
      source &&
      text(review.status) === "WAITING" &&
      list(review.depends_on).length === 1 &&
      text(review.depends_on[0]) === source.id,
    ),
    issues,
    confirmed: issues.length === 0,
  });
}

if (sourceAudits.length !== 9 || sourceAudits.some((item) => !item.confirmed)) {
  blockers.push("ONE_OR_MORE_SOURCE_APPROVALS_INVALID");
}

const sourceTasks = before.tasks.filter((task) => sourceIds.has(task.id));
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
const dispatchAuthorizedCount = sourceTasks.filter(
  (task) => task.metadata?.dispatch_authorized === true,
).length;
const reviewDependencyBlockedCount = sourceAudits.filter(
  (item) => item.review_dependency_blocked,
).length;
const promptPathCount = sourceTasks.reduce(
  (sum, task) =>
    sum + persistedPromptFieldPaths(task, `source_${task.id}`).length,
  0,
);

requireValue(providerBoundCount === 9, "PROVIDER_BOUND_COUNT_INVALID");
requireValue(costApprovedCount === 9, "COST_APPROVED_COUNT_INVALID");
requireValue(
  approvedEstimatedCost === 47.34288,
  "APPROVED_ESTIMATED_COST_INVALID",
);
requireValue(startedCount === 0, "SOURCE_STARTED_COUNT_INVALID");
requireValue(outputPresentCount === 0, "SOURCE_OUTPUT_COUNT_INVALID");
requireValue(dispatchAuthorizedCount === 0, "SOURCE_DISPATCH_ALREADY_AUTHORIZED");
requireValue(
  reviewDependencyBlockedCount === 9,
  "REVIEW_DEPENDENCY_BLOCKED_COUNT_INVALID",
);
requireValue(promptPathCount === 0, "SOURCE_PROMPTLESS_CONTRACT_INVALID");

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
  blockers.push("READ_ONLY_APPROVAL_AUDIT_CHANGED_STATE");
}

const decision = blockers.length
  ? "REPAIR_SOURCE_BINDING_COST_APPROVAL_AUDIT_BLOCKED"
  : "REPAIR_SOURCE_BINDING_COST_APPROVAL_AUDIT_9_SOURCES_CONFIRMED";
const readiness = blockers.length
  ? "REPAIR_SOURCE_BINDING_COST_APPROVAL_AUDIT_BLOCKED"
  : "READY_FOR_GUARDED_REPAIR_SOURCE_DISPATCH_PREVIEW_DESIGN";
const instruction = blockers.length
  ? "Resolve every post-approval audit blocker before authorizing or dispatching replacement source tasks."
  : "Keep dispatch unauthorized. Design a separate read-only dispatch preview for exactly nine approved Runway source tasks. It must verify request materialization, identity assets, provider transport inputs, per-task cost guards and expected wallet reservations without changing task state or calling Runway.";

const report = {
  contract: REPORT_CONTRACT,
  generated_at: new Date().toISOString(),
  organization_id: organizationId,
  creative_project_id: projectId,
  production_graph_id: graphId,
  preview_file: previewFile.absolute,
  preview_file_sha256: previewFile.file_sha256,
  apply_file: applyFile.absolute,
  apply_file_sha256: applyFile.file_sha256,
  checkpoint_file: checkpointFile.absolute,
  checkpoint_file_sha256: checkpointFile.file_sha256,
  corrected_changeset_sha256: preview.corrected_changeset_sha256,
  task_count: before.task_count,
  task_status_counts: before.task_status_counts,
  source_task_count: sourceIds.size,
  review_task_count: reviewIds.size,
  protected_task_count: protectedIds.size,
  protected_task_state_sha256: protectedStateSha,
  provider_bound_count: providerBoundCount,
  cost_approved_count: costApprovedCount,
  approved_estimated_cost: approvedEstimatedCost,
  source_started_count: startedCount,
  source_output_present_count: outputPresentCount,
  dispatch_authorized_count: dispatchAuthorizedCount,
  review_dependency_blocked_count: reviewDependencyBlockedCount,
  persisted_prompt_path_count: promptPathCount,
  source_audits: sourceAudits,
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
  provider_binding_authorized: true,
  cost_approval_authorized: true,
  provider_spend_authorized: false,
  dispatch_authorized: false,
  database_writes_executed: false,
  wallet_reservations_executed: false,
  provider_calls_executed: false,
  provider_polls_executed: false,
  retries_executed: false,
  source_regeneration_executed: false,
  downstream_tasks_updated: 0,
  finalisation_eligible: false,
  finalisation_executed: false,
  publication_executed: false,
  readiness,
};

writeJson(outputPath, report);

console.log("============================================================");
console.log("READ-ONLY REPAIR SOURCE BINDING / COST APPROVAL AUDIT");
console.log("============================================================");
console.log(`OUTPUT=${outputPath}`);
console.log(`TASK_COUNT=${before.task_count}`);
console.log(`TASK_STATUS_COUNTS=${JSON.stringify(before.task_status_counts)}`);
console.log(`SOURCE_TASK_COUNT=${sourceIds.size}`);
console.log(`REVIEW_TASK_COUNT=${reviewIds.size}`);
console.log(`PROTECTED_TASK_COUNT=${protectedIds.size}`);
console.log(`PROVIDER_BOUND_COUNT=${providerBoundCount}`);
console.log(`COST_APPROVED_COUNT=${costApprovedCount}`);
console.log(`APPROVED_ESTIMATED_COST=${approvedEstimatedCost}`);
console.log(`SOURCE_STARTED_COUNT=${startedCount}`);
console.log(`SOURCE_OUTPUT_PRESENT_COUNT=${outputPresentCount}`);
console.log(`DISPATCH_AUTHORIZED_COUNT=${dispatchAuthorizedCount}`);
console.log(`REVIEW_DEPENDENCY_BLOCKED_COUNT=${reviewDependencyBlockedCount}`);
console.log(`PERSISTED_PROMPT_PATH_COUNT=${promptPathCount}`);

for (const item of sourceAudits) {
  console.log([
    `SOURCE_APPROVAL_AUDIT=${item.execution_node_id}`,
    `source=${item.source_task_id || ""}`,
    `review=${item.review_task_id || ""}`,
    `source_status=${item.source_status || ""}`,
    `review_status=${item.review_status || ""}`,
    `provider=${item.provider_id || ""}`,
    `approved_price=${item.approved_customer_price}`,
    `original_ceiling=${item.original_task_cost_ceiling}`,
    `binding_contract=${item.binding_contract_preserved ? "PASS" : "FAIL"}`,
    `cost_contract=${item.cost_approval_contract_preserved ? "PASS" : "FAIL"}`,
    `sealed_guard=${item.sealed_cost_guard_compatible ? "PASS" : "FAIL"}`,
    `dispatch_authorized=${item.dispatch_authorized ? "YES" : "NO"}`,
    `review_blocked=${item.review_dependency_blocked ? "YES" : "NO"}`,
    `issues=${item.issues.join(",")}`,
    `confirmed=${item.confirmed ? "YES" : "NO"}`,
  ].join("|"));
}

console.log(`SOURCE_APPROVAL_AUDIT_BLOCKERS=${JSON.stringify(blockers)}`);
console.log(`SOURCE_APPROVAL_AUDIT_DECISION=${decision}`);
console.log(`SOURCE_APPROVAL_AUDIT_INSTRUCTION=${instruction}`);
console.log(`TASK_STATE_SHA256_BEFORE=${before.task_state_sha256}`);
console.log(`TASK_STATE_SHA256_AFTER=${after.task_state_sha256}`);
console.log(`PROTECTED_STATE_SHA256=${protectedStateSha}`);
console.log(`USAGE_COUNT_BEFORE=${before.usage_count}`);
console.log(`USAGE_COUNT_AFTER=${after.usage_count}`);
console.log(`WALLET_BALANCE_BEFORE=${before.wallet_balance}`);
console.log(`WALLET_BALANCE_AFTER=${after.wallet_balance}`);
console.log(`STATE_UNCHANGED=${stateUnchanged ? "YES" : "NO"}`);
console.log(`AUDIT_READINESS=${readiness}`);
console.log("DATABASE_WRITES_EXECUTED=NO");
console.log("PROVIDER_BINDING_AUTHORIZED=YES");
console.log("COST_APPROVAL_AUTHORIZED=YES");
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

if (blockers.length || !stateUnchanged) {
  process.exitCode = 2;
}
