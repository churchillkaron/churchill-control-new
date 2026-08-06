#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv({ cwd: process.cwd() });
await import("./creative-runtime-bootstrap.mjs");

const INPUT_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_REPAIR_SOURCE_BINDING_COST_APPROVAL_PREVIEW_V1";
const REPORT_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_REPAIR_SOURCE_BINDING_COST_APPROVAL_PREVIEW_V2";
const CHANGESET_CONTRACT =
  "PAIR_REPAIR_SOURCE_BINDING_COST_CUMULATIVE_CHANGESET_V2";
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

function applyPatch(task = {}, patch = {}) {
  return {
    ...task,
    ...patch,
    input: Object.prototype.hasOwnProperty.call(patch, "input")
      ? patch.input
      : task.input,
    cost: Object.prototype.hasOwnProperty.call(patch, "cost")
      ? patch.cost
      : task.cost,
    metadata: Object.prototype.hasOwnProperty.call(patch, "metadata")
      ? patch.metadata
      : task.metadata,
  };
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

const priorPreviewFile = readJson(
  process.argv[2],
  "PRIOR_BINDING_COST_PREVIEW",
);
const priorPreview = object(priorPreviewFile.value);

const organizationId = text(process.env.ORGANIZATION_ID);
const projectId = text(process.env.CREATIVE_PROJECT_ID);
const graphId = text(process.env.PRODUCTION_GRAPH_ID);
const outputPath = path.resolve(
  text(process.env.OPENAI_PERCEPTUAL_SOURCE_BINDING_COST_CUMULATIVE_PREVIEW_OUTPUT) ||
    "/tmp/churchill-openai-perceptual-repair-source-binding-cost-approval-cumulative-preview.json",
);

if (!organizationId || !projectId || !graphId) {
  throw new Error("CUMULATIVE_BINDING_COST_PREVIEW_SCOPE_REQUIRED");
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
  text(priorPreview.contract) === INPUT_CONTRACT,
  "PRIOR_PREVIEW_CONTRACT_INVALID",
);
requireValue(
  text(priorPreview.organization_id) === organizationId &&
    text(priorPreview.creative_project_id) === projectId &&
    text(priorPreview.production_graph_id) === graphId,
  "PRIOR_PREVIEW_SCOPE_INVALID",
);
requireValue(
  text(priorPreview.decision) ===
    "REPAIR_SOURCE_BINDING_COST_APPROVAL_PREVIEW_9_SOURCES_CONFIRMED" &&
    text(priorPreview.readiness) ===
      "READY_FOR_GUARDED_BINDING_AND_COST_APPROVAL_APPLY_DESIGN" &&
    list(priorPreview.blockers).length === 0 &&
    priorPreview.state_unchanged === true,
  "PRIOR_PREVIEW_NOT_READY",
);
requireValue(
  Number(priorPreview.source_task_count) === 9 &&
    Number(priorPreview.review_task_count) === 9 &&
    Number(priorPreview.proposed_binding_write_count) === 9 &&
    Number(priorPreview.proposed_cost_approval_write_count) === 9 &&
    Number(priorPreview.proposed_total_write_count) === 18,
  "PRIOR_PREVIEW_COUNTS_INVALID",
);
requireValue(
  money(priorPreview.proposed_exact_customer_price) === 47.34288 &&
    money(priorPreview.original_task_cost_ceiling) === 208.187686 &&
    text(priorPreview.currency) === "THB",
  "PRIOR_PREVIEW_COST_INVALID",
);
requireValue(
  priorPreview.existing_sealed_cost_guard_compatible === true &&
    priorPreview.dedicated_repair_cost_guard_required === false,
  "PRIOR_PREVIEW_COST_GUARD_INCOMPATIBLE",
);
requireValue(
  priorPreview.provider_binding_authorized === false &&
    priorPreview.cost_approval_authorized === false &&
    priorPreview.provider_spend_authorized === false &&
    priorPreview.dispatch_authorized === false &&
    priorPreview.database_writes_executed === false &&
    priorPreview.wallet_reservations_executed === false &&
    priorPreview.provider_calls_executed === false,
  "PRIOR_PREVIEW_ALREADY_AUTHORIZED",
);

const before = await exactState({
  supabaseAdmin,
  ProductionTaskRuntime,
  organizationId,
  projectId,
  graphId,
});
const taskMap = new Map(before.tasks.map((task) => [task.id, task]));

requireValue(before.task_count === 45, "LIVE_TASK_COUNT_INVALID");
requireValue(
  Number(before.task_status_counts.COMPLETED || 0) === 9 &&
    Number(before.task_status_counts.WAITING || 0) === 18 &&
    Number(before.task_status_counts.FAILED || 0) === 18,
  "LIVE_TASK_STATUS_COUNTS_INVALID",
);
requireValue(
  before.task_state_sha256 ===
    text(priorPreview.exact_state_before?.task_state_sha256) &&
    before.task_state_sha256 ===
      text(priorPreview.exact_state_after?.task_state_sha256),
  "LIVE_TASK_STATE_SHA_MISMATCH",
);
requireValue(
  before.usage_count === Number(priorPreview.exact_state_before?.usage_count) &&
    before.usage_count === Number(priorPreview.exact_state_after?.usage_count),
  "USAGE_COUNT_CHANGED",
);
requireValue(
  before.wallet_balance ===
    money(priorPreview.exact_state_before?.wallet_balance) &&
    before.wallet_balance ===
      money(priorPreview.exact_state_after?.wallet_balance) &&
    before.wallet_updated_at ===
      priorPreview.exact_state_before?.wallet_updated_at &&
    before.wallet_updated_at ===
      priorPreview.exact_state_after?.wallet_updated_at,
  "WALLET_STATE_CHANGED",
);

const correctedChanges = [];
const sourceIds = new Set();
const reviewIds = new Set();

for (const priorChange of list(priorPreview.proposed_changes)) {
  const source = taskMap.get(text(priorChange.source_task_id));
  const review = taskMap.get(text(priorChange.review_task_id));
  const issues = [];

  if (!source) issues.push("SOURCE_TASK_MISSING");
  if (!review) issues.push("REVIEW_TASK_MISSING");

  if (source) {
    sourceIds.add(source.id);
    if (text(source.status) !== "WAITING") {
      issues.push(`SOURCE_STATUS_INVALID:${source.status}`);
    }
    if (source.provider_id !== null) issues.push("SOURCE_PROVIDER_ALREADY_BOUND");
    if (source.cost?.approved !== false) issues.push("SOURCE_COST_ALREADY_APPROVED");
    if (Number(source.cost?.actual || 0) !== 0) {
      issues.push("SOURCE_ACTUAL_COST_NONZERO");
    }
    if (source.timing?.started_at || source.timing?.completed_at) {
      issues.push("SOURCE_TIMING_STARTED");
    }
    if (Object.keys(object(source.output)).length !== 0) {
      issues.push("SOURCE_OUTPUT_PRESENT");
    }
  }

  if (review) {
    reviewIds.add(review.id);
    if (text(review.status) !== "WAITING") {
      issues.push(`REVIEW_STATUS_INVALID:${review.status}`);
    }
    if (review.provider_id !== null) issues.push("REVIEW_PROVIDER_ALREADY_BOUND");
    if (review.cost?.approved !== false) issues.push("REVIEW_COST_ALREADY_APPROVED");
    if (
      list(review.depends_on).length !== 1 ||
      text(review.depends_on[0]) !== text(source?.id)
    ) {
      issues.push("REVIEW_DEPENDENCY_INVALID");
    }
  }

  const bindingPatch = object(priorChange.provider_binding_patch);
  const priorCostPatch = object(priorChange.cost_approval_patch);
  const bindingMetadata = object(bindingPatch.metadata);
  const priorCostMetadata = object(priorCostPatch.metadata);
  const bindingContract = object(
    priorChange.provider_binding_contract ||
      bindingMetadata.repair_source_provider_binding,
  );
  const costApprovalContract = object(
    priorChange.cost_approval_contract ||
      priorCostMetadata.repair_source_cost_approval,
  );

  if (
    bindingPatch.provider_id !== "runway" ||
    bindingContract.contract !== BINDING_CONTRACT ||
    text(bindingContract.provider) !== "runway" ||
    text(bindingContract.model) !== "gen4.5" ||
    bindingMetadata.provider_binding_authorized !== true ||
    bindingMetadata.dispatch_authorized !== false
  ) {
    issues.push("PRIOR_BINDING_PATCH_INVALID");
  }
  if (
    costApprovalContract.contract !== COST_APPROVAL_CONTRACT ||
    money(priorCostPatch.cost?.estimated) !==
      money(priorChange.proposed_exact_customer_price) ||
    priorCostPatch.cost?.approved !== true ||
    Number(priorCostPatch.cost?.actual || 0) !== 0 ||
    text(priorCostPatch.cost?.currency) !== "THB" ||
    priorCostMetadata.cost_approval_authorized !== true ||
    priorCostMetadata.dispatch_authorized !== false
  ) {
    issues.push("PRIOR_COST_APPROVAL_PATCH_INVALID");
  }

  const cumulativeCostMetadata = {
    ...bindingMetadata,
    ...priorCostMetadata,
    repair_source_provider_binding: bindingContract,
    repair_source_cost_approval: costApprovalContract,
    provider_binding_authorized: true,
    cost_approval_authorized: true,
    dispatch_authorized: false,
  };
  const correctedCostApprovalPatch = source
    ? {
        input: priorCostPatch.input,
        cost: priorCostPatch.cost,
        metadata: cumulativeCostMetadata,
      }
    : null;
  const finalCumulativePatch = source
    ? {
        provider_id: "runway",
        input: priorCostPatch.input,
        cost: priorCostPatch.cost,
        metadata: cumulativeCostMetadata,
      }
    : null;
  const bindingReversePatch = source
    ? {
        provider_id: source.provider_id,
        metadata: source.metadata,
      }
    : null;
  const costApprovalReversePatch = source
    ? {
        input: source.input,
        cost: source.cost,
        metadata: bindingMetadata,
      }
    : null;
  const fullReversePatch = source
    ? {
        provider_id: source.provider_id,
        input: source.input,
        cost: source.cost,
        metadata: source.metadata,
      }
    : null;

  const bindingState = source
    ? applyPatch(source, bindingPatch)
    : null;
  const finalState = bindingState
    ? applyPatch(bindingState, correctedCostApprovalPatch)
    : null;
  const costReversedState = finalState
    ? applyPatch(finalState, costApprovalReversePatch)
    : null;
  const fullyReversedState = finalState
    ? applyPatch(finalState, fullReversePatch)
    : null;

  if (
    bindingState &&
    (bindingState.provider_id !== "runway" ||
      bindingState.metadata?.provider_binding_authorized !== true ||
      bindingState.metadata?.cost_approval_authorized === true ||
      bindingState.cost?.approved !== false)
  ) {
    issues.push("BINDING_STATE_INVALID");
  }
  if (
    finalState &&
    (finalState.provider_id !== "runway" ||
      finalState.metadata?.provider_binding_authorized !== true ||
      finalState.metadata?.cost_approval_authorized !== true ||
      finalState.metadata?.dispatch_authorized !== false ||
      finalState.cost?.approved !== true ||
      money(finalState.cost?.estimated) !==
        money(priorChange.proposed_exact_customer_price))
  ) {
    issues.push("FINAL_CUMULATIVE_STATE_INVALID");
  }
  if (
    source &&
    costReversedState &&
    (costReversedState.provider_id !== "runway" ||
      costReversedState.cost?.approved !== false ||
      sha256(costReversedState.metadata) !== sha256(bindingMetadata))
  ) {
    issues.push("COST_REVERSAL_STATE_INVALID");
  }
  if (
    source &&
    fullyReversedState &&
    sha256(mutableProjection(fullyReversedState)) !==
      sha256(mutableProjection(source))
  ) {
    issues.push("FULL_REVERSAL_STATE_INVALID");
  }

  correctedChanges.push({
    execution_node_id: text(priorChange.execution_node_id),
    source_task_id: source?.id || null,
    review_task_id: review?.id || null,
    original_mutable_state_sha256: source
      ? sha256(mutableProjection(source))
      : null,
    binding_state_sha256: bindingState
      ? sha256(mutableProjection(bindingState))
      : null,
    final_cumulative_state_sha256: finalState
      ? sha256(mutableProjection(finalState))
      : null,
    cost_reversed_binding_state_sha256: costReversedState
      ? sha256(mutableProjection(costReversedState))
      : null,
    fully_reversed_state_sha256: fullyReversedState
      ? sha256(mutableProjection(fullyReversedState))
      : null,
    provider_binding_patch: bindingPatch,
    corrected_cost_approval_patch: correctedCostApprovalPatch,
    final_cumulative_patch: finalCumulativePatch,
    provider_binding_reverse_patch: bindingReversePatch,
    cost_approval_reverse_patch: costApprovalReversePatch,
    full_reverse_patch: fullReversePatch,
    provider_binding_patch_sha256: sha256(bindingPatch),
    corrected_cost_approval_patch_sha256:
      sha256(correctedCostApprovalPatch),
    final_cumulative_patch_sha256: sha256(finalCumulativePatch),
    provider_binding_reverse_patch_sha256: sha256(bindingReversePatch),
    cost_approval_reverse_patch_sha256:
      sha256(costApprovalReversePatch),
    full_reverse_patch_sha256: sha256(fullReversePatch),
    exact_customer_price: money(
      priorChange.proposed_exact_customer_price,
    ),
    original_task_cost_ceiling: money(
      priorChange.original_task_cost_ceiling,
    ),
    review_task_patch: null,
    provider_binding_authorized: false,
    cost_approval_authorized: false,
    provider_spend_authorized: false,
    dispatch_authorized: false,
    issues,
    ready: issues.length === 0,
  });
}

requireValue(correctedChanges.length === 9, "CORRECTED_CHANGE_COUNT_INVALID");
requireValue(sourceIds.size === 9, "SOURCE_ID_COUNT_INVALID");
requireValue(reviewIds.size === 9, "REVIEW_ID_COUNT_INVALID");
requireValue(
  [...sourceIds].every((id) => !reviewIds.has(id)),
  "SOURCE_REVIEW_ID_OVERLAP_INVALID",
);
if (correctedChanges.some((change) => !change.ready)) {
  blockers.push("ONE_OR_MORE_CUMULATIVE_CHANGES_BLOCKED");
}
if (correctedChanges.some((change) => change.review_task_patch !== null)) {
  blockers.push("REVIEW_TASK_MUTATION_PROPOSED");
}

const proposedBindingWriteCount = correctedChanges.filter(
  (change) => change.provider_binding_patch,
).length;
const proposedCostApprovalWriteCount = correctedChanges.filter(
  (change) => change.corrected_cost_approval_patch,
).length;
const proposedExactCustomerPrice = money(
  correctedChanges.reduce(
    (sum, change) => sum + change.exact_customer_price,
    0,
  ),
);
const originalTaskCostCeiling = money(
  correctedChanges.reduce(
    (sum, change) => sum + change.original_task_cost_ceiling,
    0,
  ),
);
const totalSavingsAgainstOriginalCeiling = money(
  originalTaskCostCeiling - proposedExactCustomerPrice,
);

requireValue(proposedBindingWriteCount === 9, "BINDING_WRITE_COUNT_INVALID");
requireValue(
  proposedCostApprovalWriteCount === 9,
  "COST_APPROVAL_WRITE_COUNT_INVALID",
);
requireValue(
  proposedExactCustomerPrice === 47.34288,
  "EXACT_CUSTOMER_PRICE_INVALID",
);
requireValue(
  originalTaskCostCeiling === 208.187686,
  "ORIGINAL_COST_CEILING_INVALID",
);
requireValue(
  before.wallet_balance >= proposedExactCustomerPrice,
  "WALLET_BALANCE_INSUFFICIENT",
);

const correctedChangeset = {
  contract: CHANGESET_CONTRACT,
  organization_id: organizationId,
  creative_project_id: projectId,
  production_graph_id: graphId,
  live_task_state_sha256: before.task_state_sha256,
  prior_preview_file_sha256: priorPreviewFile.file_sha256,
  prior_changeset_sha256:
    text(priorPreview.proposed_change_contract_sha256),
  proposed_binding_write_count: proposedBindingWriteCount,
  proposed_cost_approval_write_count: proposedCostApprovalWriteCount,
  proposed_total_write_count:
    proposedBindingWriteCount + proposedCostApprovalWriteCount,
  proposed_exact_customer_price: proposedExactCustomerPrice,
  original_task_cost_ceiling: originalTaskCostCeiling,
  currency: "THB",
  changes: correctedChanges.map((change) => ({
    source_task_id: change.source_task_id,
    review_task_id: change.review_task_id,
    original_mutable_state_sha256:
      change.original_mutable_state_sha256,
    binding_state_sha256: change.binding_state_sha256,
    final_cumulative_state_sha256:
      change.final_cumulative_state_sha256,
    provider_binding_patch_sha256:
      change.provider_binding_patch_sha256,
    corrected_cost_approval_patch_sha256:
      change.corrected_cost_approval_patch_sha256,
    final_cumulative_patch_sha256:
      change.final_cumulative_patch_sha256,
    provider_binding_reverse_patch_sha256:
      change.provider_binding_reverse_patch_sha256,
    cost_approval_reverse_patch_sha256:
      change.cost_approval_reverse_patch_sha256,
    full_reverse_patch_sha256:
      change.full_reverse_patch_sha256,
  })),
};
const correctedChangesetSha = sha256(correctedChangeset);
const expectedBindingAuthorization =
  `AUTHORIZE REPAIR SOURCE PROVIDER BINDING RUNWAY 9 TASKS ${correctedChangesetSha}`;
const expectedCostApprovalAuthorization =
  `AUTHORIZE REPAIR SOURCE COST APPROVAL EXACT ${proposedExactCustomerPrice.toFixed(6)} THB ${correctedChangesetSha}`;

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
  blockers.push("READ_ONLY_CUMULATIVE_PREVIEW_CHANGED_STATE");
}

const decision = blockers.length
  ? "REPAIR_SOURCE_CUMULATIVE_BINDING_COST_PREVIEW_BLOCKED"
  : "REPAIR_SOURCE_CUMULATIVE_BINDING_COST_PREVIEW_9_SOURCES_CONFIRMED";
const readiness = blockers.length
  ? "REPAIR_SOURCE_CUMULATIVE_BINDING_COST_PREVIEW_BLOCKED"
  : "READY_FOR_CHECKPOINTED_BINDING_COST_APPROVAL_DRY_RUN_DESIGN";
const instruction = blockers.length
  ? "Resolve every cumulative binding and cost-approval blocker before changing replacement source tasks."
  : "Use only this V2 cumulative changeset for the next checkpointed dry run. The earlier authorization literals are stale. Keep provider binding and cost approval as distinct explicit authorizations. Do not reserve wallet funds, dispatch, poll, regenerate, finalise or publish.";

const report = {
  contract: REPORT_CONTRACT,
  generated_at: new Date().toISOString(),
  organization_id: organizationId,
  creative_project_id: projectId,
  production_graph_id: graphId,
  prior_preview_file: priorPreviewFile.absolute,
  prior_preview_file_sha256: priorPreviewFile.file_sha256,
  task_count: before.task_count,
  task_status_counts: before.task_status_counts,
  source_task_count: sourceIds.size,
  review_task_count: reviewIds.size,
  proposed_binding_write_count: proposedBindingWriteCount,
  proposed_cost_approval_write_count: proposedCostApprovalWriteCount,
  proposed_total_write_count:
    proposedBindingWriteCount + proposedCostApprovalWriteCount,
  proposed_exact_customer_price: proposedExactCustomerPrice,
  original_task_cost_ceiling: originalTaskCostCeiling,
  total_savings_against_original_ceiling:
    totalSavingsAgainstOriginalCeiling,
  currency: "THB",
  wallet_balance: before.wallet_balance,
  wallet_headroom_after_full_source_reservation: money(
    before.wallet_balance - proposedExactCustomerPrice,
  ),
  corrected_changeset: correctedChangeset,
  corrected_changeset_sha256: correctedChangesetSha,
  expected_provider_binding_authorization:
    expectedBindingAuthorization,
  expected_cost_approval_authorization:
    expectedCostApprovalAuthorization,
  existing_sealed_cost_guard_compatible: true,
  dedicated_repair_cost_guard_required: false,
  corrected_changes: correctedChanges,
  provider_binding_authorized: false,
  cost_approval_authorized: false,
  provider_spend_authorized: false,
  dispatch_authorized: false,
  finalisation_eligible: false,
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
  source_regeneration_executed: false,
  downstream_tasks_updated: 0,
  finalisation_executed: false,
  publication_executed: false,
  readiness,
};

writeJson(outputPath, report);

console.log("============================================================");
console.log("READ-ONLY CUMULATIVE REPAIR SOURCE BINDING/COST PREVIEW");
console.log("============================================================");
console.log(`OUTPUT=${outputPath}`);
console.log(`TASK_COUNT=${before.task_count}`);
console.log(`TASK_STATUS_COUNTS=${JSON.stringify(before.task_status_counts)}`);
console.log(`SOURCE_TASK_COUNT=${sourceIds.size}`);
console.log(`REVIEW_TASK_COUNT=${reviewIds.size}`);
console.log(`PROPOSED_BINDING_WRITE_COUNT=${proposedBindingWriteCount}`);
console.log(
  `PROPOSED_COST_APPROVAL_WRITE_COUNT=${proposedCostApprovalWriteCount}`,
);
console.log(
  `PROPOSED_TOTAL_WRITE_COUNT=${
    proposedBindingWriteCount + proposedCostApprovalWriteCount
  }`,
);
console.log(`PROPOSED_EXACT_CUSTOMER_PRICE=${proposedExactCustomerPrice}`);
console.log(`ORIGINAL_TASK_COST_CEILING=${originalTaskCostCeiling}`);
console.log(
  `TOTAL_SAVINGS_AGAINST_ORIGINAL_CEILING=${
    totalSavingsAgainstOriginalCeiling
  }`,
);
console.log(`CORRECTED_CHANGESET_SHA256=${correctedChangesetSha}`);
console.log(
  `EXPECTED_PROVIDER_BINDING_AUTHORIZATION=${expectedBindingAuthorization}`,
);
console.log(
  `EXPECTED_COST_APPROVAL_AUTHORIZATION=${expectedCostApprovalAuthorization}`,
);

for (const change of correctedChanges) {
  console.log([
    `CUMULATIVE_BINDING_COST_PREVIEW=${change.execution_node_id}`,
    `source=${change.source_task_id || ""}`,
    `review=${change.review_task_id || ""}`,
    `binding_state_sha=${change.binding_state_sha256 || ""}`,
    `final_state_sha=${change.final_cumulative_state_sha256 || ""}`,
    `cost_reverse_state_sha=${change.cost_reversed_binding_state_sha256 || ""}`,
    `full_reverse_state_sha=${change.fully_reversed_state_sha256 || ""}`,
    `binding_contract_preserved=YES`,
    `review_patch=NONE`,
    `reversible=YES`,
    `issues=${change.issues.join(",")}`,
    `ready=${change.ready ? "YES" : "NO"}`,
  ].join("|"));
}

console.log(`CUMULATIVE_PREVIEW_BLOCKERS=${JSON.stringify(blockers)}`);
console.log(`CUMULATIVE_PREVIEW_DECISION=${decision}`);
console.log(`CUMULATIVE_PREVIEW_INSTRUCTION=${instruction}`);
console.log(`TASK_STATE_SHA256_BEFORE=${before.task_state_sha256}`);
console.log(`TASK_STATE_SHA256_AFTER=${after.task_state_sha256}`);
console.log(`USAGE_COUNT_BEFORE=${before.usage_count}`);
console.log(`USAGE_COUNT_AFTER=${after.usage_count}`);
console.log(`WALLET_BALANCE_BEFORE=${before.wallet_balance}`);
console.log(`WALLET_BALANCE_AFTER=${after.wallet_balance}`);
console.log(`STATE_UNCHANGED=${stateUnchanged ? "YES" : "NO"}`);
console.log("FINALISATION_ELIGIBLE=NO");
console.log(`AUDIT_READINESS=${readiness}`);
console.log("DATABASE_WRITES_EXECUTED=NO");
console.log("WALLET_RESERVATIONS_EXECUTED=NO");
console.log("PROVIDER_BINDING_AUTHORIZED=NO");
console.log("COST_APPROVAL_AUTHORIZED=NO");
console.log("PROVIDER_SPEND_AUTHORIZED=NO");
console.log("DISPATCH_AUTHORIZED=NO");
console.log("PROVIDER_CALLS_EXECUTED=NO");
console.log("PROVIDER_POLLS_EXECUTED=NO");
console.log("RETRIES_EXECUTED=NO");
console.log("SOURCE_REGENERATION_EXECUTED=NO");
console.log("DOWNSTREAM_TASKS_UPDATED=0");
console.log("FINALISATION_EXECUTED=NO");
console.log("PUBLICATION_EXECUTED=NO");
console.log("TERMINAL_REMAINS_OPEN=YES");

if (blockers.length || !stateUnchanged) {
  process.exitCode = 2;
}
