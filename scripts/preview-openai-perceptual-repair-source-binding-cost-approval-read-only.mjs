#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv({ cwd: process.cwd() });
await import("./creative-runtime-bootstrap.mjs");

const DISPATCH_PREVIEW_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_REPAIR_SOURCE_DISPATCH_PREVIEW_V1";
const CREDENTIAL_AUDIT_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_REPAIR_SOURCE_CREDENTIAL_READINESS_V1";
const REPORT_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_REPAIR_SOURCE_BINDING_COST_APPROVAL_PREVIEW_V1";
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

const dispatchPreviewFile = readJson(
  process.argv[2],
  "SOURCE_DISPATCH_PREVIEW",
);
const credentialAuditFile = readJson(
  process.argv[3],
  "SOURCE_CREDENTIAL_AUDIT",
);
const dispatchPreview = object(dispatchPreviewFile.value);
const credentialAudit = object(credentialAuditFile.value);

const organizationId = text(process.env.ORGANIZATION_ID);
const projectId = text(process.env.CREATIVE_PROJECT_ID);
const graphId = text(process.env.PRODUCTION_GRAPH_ID);
const outputPath = path.resolve(
  text(process.env.OPENAI_PERCEPTUAL_SOURCE_BINDING_COST_PREVIEW_OUTPUT) ||
    "/tmp/churchill-openai-perceptual-repair-source-binding-cost-approval-preview.json",
);

if (!organizationId || !projectId || !graphId) {
  throw new Error("SOURCE_BINDING_COST_PREVIEW_SCOPE_REQUIRED");
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
  text(dispatchPreview.contract) === DISPATCH_PREVIEW_CONTRACT,
  "SOURCE_DISPATCH_PREVIEW_CONTRACT_INVALID",
);
requireValue(
  text(credentialAudit.contract) === CREDENTIAL_AUDIT_CONTRACT,
  "SOURCE_CREDENTIAL_AUDIT_CONTRACT_INVALID",
);

for (const [label, value] of [
  ["SOURCE_DISPATCH_PREVIEW", dispatchPreview],
  ["SOURCE_CREDENTIAL_AUDIT", credentialAudit],
]) {
  requireValue(
    text(value.organization_id) === organizationId &&
      text(value.creative_project_id) === projectId &&
      text(value.production_graph_id) === graphId,
    `${label}_SCOPE_INVALID`,
  );
}

requireValue(
  text(credentialAudit.source_dispatch_preview_file_sha256) ===
    dispatchPreviewFile.file_sha256,
  "CREDENTIAL_AUDIT_DISPATCH_PREVIEW_SHA_MISMATCH",
);
requireValue(
  text(dispatchPreview.decision) ===
    "REPAIR_SOURCE_DISPATCH_PREVIEW_9_SOURCES_CONFIRMED" &&
    text(dispatchPreview.readiness) ===
      "READY_FOR_SEPARATE_PROVIDER_BINDING_COST_APPROVAL_AND_DISPATCH_DESIGN" &&
    list(dispatchPreview.blockers).length === 0 &&
    dispatchPreview.state_unchanged === true,
  "SOURCE_DISPATCH_PREVIEW_NOT_READY",
);
requireValue(
  text(credentialAudit.decision) ===
    "REPAIR_SOURCE_CREDENTIAL_READINESS_9_SOURCES_CONFIRMED" &&
    text(credentialAudit.readiness) ===
      "READY_FOR_PROVIDER_BINDING_AND_COST_APPROVAL_DRY_RUN_DESIGN" &&
    list(credentialAudit.blockers).length === 0 &&
    credentialAudit.state_unchanged === true &&
    credentialAudit.secret_values_exposed === false,
  "SOURCE_CREDENTIAL_AUDIT_NOT_READY",
);
requireValue(
  Number(dispatchPreview.source_task_count) === 9 &&
    Number(dispatchPreview.review_task_count) === 9 &&
    Number(dispatchPreview.cost_guard_passed_count) === 9 &&
    Number(dispatchPreview.review_dependency_blocked_count) === 9 &&
    Number(credentialAudit.source_task_count) === 9 &&
    Number(credentialAudit.execution_credential_ready_count) === 9,
  "SOURCE_PREVIEW_COUNTS_INVALID",
);
requireValue(
  dispatchPreview.provider_binding_authorized === false &&
    dispatchPreview.cost_approval_authorized === false &&
    dispatchPreview.provider_spend_authorized === false &&
    dispatchPreview.dispatch_authorized === false &&
    credentialAudit.provider_binding_authorized === false &&
    credentialAudit.cost_approval_authorized === false &&
    credentialAudit.provider_spend_authorized === false &&
    credentialAudit.dispatch_authorized === false,
  "SOURCE_PREVIEW_ALREADY_AUTHORIZED",
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
    text(dispatchPreview.exact_state_before?.task_state_sha256) &&
    before.task_state_sha256 ===
      text(dispatchPreview.exact_state_after?.task_state_sha256) &&
    before.task_state_sha256 ===
      text(credentialAudit.exact_state_before?.task_state_sha256) &&
    before.task_state_sha256 ===
      text(credentialAudit.exact_state_after?.task_state_sha256),
  "LIVE_TASK_STATE_SHA_MISMATCH",
);
requireValue(
  before.usage_count ===
    Number(dispatchPreview.exact_state_before?.usage_count) &&
    before.usage_count ===
      Number(dispatchPreview.exact_state_after?.usage_count) &&
    before.usage_count ===
      Number(credentialAudit.exact_state_before?.usage_count) &&
    before.usage_count ===
      Number(credentialAudit.exact_state_after?.usage_count),
  "USAGE_COUNT_CHANGED",
);
requireValue(
  before.wallet_balance ===
    money(dispatchPreview.exact_state_before?.wallet_balance) &&
    before.wallet_balance ===
      money(dispatchPreview.exact_state_after?.wallet_balance) &&
    before.wallet_balance ===
      money(credentialAudit.exact_state_before?.wallet_balance) &&
    before.wallet_balance ===
      money(credentialAudit.exact_state_after?.wallet_balance) &&
    before.wallet_updated_at ===
      dispatchPreview.exact_state_before?.wallet_updated_at &&
    before.wallet_updated_at ===
      dispatchPreview.exact_state_after?.wallet_updated_at &&
    before.wallet_updated_at ===
      credentialAudit.exact_state_before?.wallet_updated_at &&
    before.wallet_updated_at ===
      credentialAudit.exact_state_after?.wallet_updated_at,
  "WALLET_STATE_CHANGED",
);

const credentialPlanMap = new Map(
  list(credentialAudit.credential_plans).map((plan) => [
    text(plan.source_task_id),
    plan,
  ]),
);
const proposedChanges = [];
const sourceIds = new Set();
const reviewIds = new Set();

for (const dispatchPlan of list(dispatchPreview.dispatch_plans)) {
  const source = taskMap.get(text(dispatchPlan.source_task_id));
  const review = taskMap.get(text(dispatchPlan.review_task_id));
  const credentialPlan = credentialPlanMap.get(text(dispatchPlan.source_task_id));
  const issues = [];

  if (!source) issues.push("REPLACEMENT_SOURCE_MISSING");
  if (!review) issues.push("REPLACEMENT_REVIEW_MISSING");
  if (!credentialPlan) issues.push("SOURCE_CREDENTIAL_PLAN_MISSING");

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

  if (
    text(dispatchPlan.selected_provider) !== "runway" ||
    text(dispatchPlan.selected_model) !== "gen4.5" ||
    !text(dispatchPlan.selected_pricing_id) ||
    money(dispatchPlan.selected_customer_price) <= 0 ||
    money(dispatchPlan.selected_customer_price) >
      money(dispatchPlan.source_task_cost_ceiling) ||
    text(dispatchPlan.selected_currency) !== "THB" ||
    dispatchPlan.cost_guard_passed !== true ||
    dispatchPlan.review_dependency_blocked !== true
  ) {
    issues.push("SOURCE_DISPATCH_SELECTION_INVALID");
  }

  if (
    credentialPlan &&
    (credentialPlan.runway_execution_credential_ready !== true ||
      text(credentialPlan.selected_provider) !==
        text(dispatchPlan.selected_provider) ||
      text(credentialPlan.selected_model) !==
        text(dispatchPlan.selected_model) ||
      text(credentialPlan.selected_pricing_id) !==
        text(dispatchPlan.selected_pricing_id))
  ) {
    issues.push("SOURCE_CREDENTIAL_SELECTION_INVALID");
  }

  const approvedPrice = money(dispatchPlan.selected_customer_price);
  const originalCeiling = money(source?.cost?.estimated);
  const costGuard = {
    maximum_customer_price: approvedPrice,
    currency: "THB",
    reference:
      `pair-repair-source:${source?.id || "missing"}:` +
      dispatchPreview.selection_contract_sha256,
    estimated_quantity: 1,
  };
  const providerBinding = {
    contract: BINDING_CONTRACT,
    provider: "runway",
    model: "gen4.5",
    pricing_id: dispatchPlan.selected_pricing_id,
    selected_customer_price: approvedPrice,
    selected_supplier_cost: money(dispatchPlan.selected_supplier_cost),
    currency: "THB",
    source_dispatch_selection_contract_sha256:
      dispatchPreview.selection_contract_sha256,
    source_credential_readiness_contract_sha256:
      credentialAudit.credential_readiness_contract_sha256,
    reversible: true,
  };
  const costApproval = {
    contract: COST_APPROVAL_CONTRACT,
    exact_customer_price: approvedPrice,
    original_task_cost_ceiling: originalCeiling,
    currency: "THB",
    pricing_id: dispatchPlan.selected_pricing_id,
    provider: "runway",
    model: "gen4.5",
    approved_cost_guard: costGuard,
    source_dispatch_selection_contract_sha256:
      dispatchPreview.selection_contract_sha256,
    source_credential_readiness_contract_sha256:
      credentialAudit.credential_readiness_contract_sha256,
    reversible: true,
  };

  const providerBindingPatch = source
    ? {
        provider_id: "runway",
        metadata: {
          ...object(source.metadata),
          repair_source_provider_binding: providerBinding,
          selected_provider: "runway",
          selected_model: "gen4.5",
          selected_pricing_id: dispatchPlan.selected_pricing_id,
          provider_binding_authorized: true,
          dispatch_authorized: false,
        },
      }
    : null;
  const providerBindingReversePatch = source
    ? {
        provider_id: source.provider_id,
        metadata: source.metadata,
      }
    : null;
  const costApprovalPatch = source
    ? {
        input: {
          ...object(source.input),
          approved_cost_guard: costGuard,
        },
        cost: {
          currency: "THB",
          estimated: approvedPrice,
          actual: 0,
          approved: true,
        },
        metadata: {
          ...object(source.metadata),
          repair_source_cost_approval: costApproval,
          approved_cost_guard: costGuard,
          approved_pricing_id: dispatchPlan.selected_pricing_id,
          approved_provider: "runway",
          approved_model: "gen4.5",
          cost_approval_authorized: true,
          dispatch_authorized: false,
        },
      }
    : null;
  const costApprovalReversePatch = source
    ? {
        input: source.input,
        cost: source.cost,
        metadata: source.metadata,
      }
    : null;

  proposedChanges.push({
    execution_node_id: text(dispatchPlan.execution_node_id),
    source_task_id: source?.id || null,
    review_task_id: review?.id || null,
    original_provider_id: source?.provider_id ?? null,
    proposed_provider_id: "runway",
    original_cost: source?.cost || null,
    proposed_cost: costApprovalPatch?.cost || null,
    original_task_cost_ceiling: originalCeiling,
    proposed_exact_customer_price: approvedPrice,
    savings_against_original_ceiling: money(originalCeiling - approvedPrice),
    provider_binding_contract: providerBinding,
    cost_approval_contract: costApproval,
    provider_binding_patch: providerBindingPatch,
    provider_binding_reverse_patch: providerBindingReversePatch,
    cost_approval_patch: costApprovalPatch,
    cost_approval_reverse_patch: costApprovalReversePatch,
    provider_binding_patch_sha256: sha256(providerBindingPatch),
    cost_approval_patch_sha256: sha256(costApprovalPatch),
    review_task_patch: null,
    provider_binding_authorized: false,
    cost_approval_authorized: false,
    provider_spend_authorized: false,
    dispatch_authorized: false,
    issues,
    ready: issues.length === 0,
  });
}

requireValue(proposedChanges.length === 9, "PROPOSED_CHANGE_COUNT_INVALID");
requireValue(sourceIds.size === 9, "SOURCE_ID_COUNT_INVALID");
requireValue(reviewIds.size === 9, "REVIEW_ID_COUNT_INVALID");
requireValue(
  [...sourceIds].every((id) => !reviewIds.has(id)),
  "SOURCE_REVIEW_ID_OVERLAP_INVALID",
);
if (proposedChanges.some((change) => !change.ready)) {
  blockers.push("ONE_OR_MORE_BINDING_COST_CHANGES_BLOCKED");
}
if (proposedChanges.some((change) => change.review_task_patch !== null)) {
  blockers.push("REVIEW_TASK_MUTATION_PROPOSED");
}

const proposedBindingWriteCount = proposedChanges.filter(
  (change) => change.provider_binding_patch,
).length;
const proposedCostApprovalWriteCount = proposedChanges.filter(
  (change) => change.cost_approval_patch,
).length;
const proposedExactCustomerPrice = money(
  proposedChanges.reduce(
    (sum, change) => sum + change.proposed_exact_customer_price,
    0,
  ),
);
const originalTaskCostCeiling = money(
  proposedChanges.reduce(
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
  proposedExactCustomerPrice === money(dispatchPreview.selected_source_cost) &&
    proposedExactCustomerPrice === 47.34288,
  "PROPOSED_EXACT_CUSTOMER_PRICE_INVALID",
);
requireValue(
  originalTaskCostCeiling ===
    money(dispatchPreview.source_task_cost_ceiling) &&
    originalTaskCostCeiling === 208.187686,
  "ORIGINAL_TASK_COST_CEILING_INVALID",
);
requireValue(
  before.wallet_balance >= proposedExactCustomerPrice,
  "WALLET_BALANCE_INSUFFICIENT",
);

const proposedChangeContract = {
  contract: "PAIR_REPAIR_SOURCE_BINDING_COST_CHANGESET_V1",
  organization_id: organizationId,
  creative_project_id: projectId,
  production_graph_id: graphId,
  live_task_state_sha256: before.task_state_sha256,
  source_dispatch_preview_file_sha256: dispatchPreviewFile.file_sha256,
  source_credential_audit_file_sha256: credentialAuditFile.file_sha256,
  source_dispatch_selection_contract_sha256:
    dispatchPreview.selection_contract_sha256,
  source_credential_readiness_contract_sha256:
    credentialAudit.credential_readiness_contract_sha256,
  proposed_binding_write_count: proposedBindingWriteCount,
  proposed_cost_approval_write_count: proposedCostApprovalWriteCount,
  proposed_exact_customer_price: proposedExactCustomerPrice,
  currency: "THB",
  source_changes: proposedChanges.map((change) => ({
    source_task_id: change.source_task_id,
    review_task_id: change.review_task_id,
    provider_binding_patch_sha256: change.provider_binding_patch_sha256,
    cost_approval_patch_sha256: change.cost_approval_patch_sha256,
  })),
};
const proposedChangeContractSha = sha256(proposedChangeContract);
const expectedBindingAuthorization =
  `AUTHORIZE REPAIR SOURCE PROVIDER BINDING RUNWAY 9 TASKS ${proposedChangeContractSha}`;
const expectedCostApprovalAuthorization =
  `AUTHORIZE REPAIR SOURCE COST APPROVAL EXACT ${proposedExactCustomerPrice.toFixed(6)} THB ${proposedChangeContractSha}`;

const existingSealedCostGuardCompatible = proposedChanges.every((change) => {
  const source = taskMap.get(change.source_task_id);
  const approval = object(source?.metadata?.production_approval_contract);
  return (
    approval.contract ===
      "CREATIVE_SEALED_PRODUCTION_EXECUTION_APPROVAL_V1" &&
    approval.production_authorized === true &&
    approval.publication_authorized === false
  );
});
const dedicatedRepairCostGuardRequired = !existingSealedCostGuardCompatible;

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
  blockers.push("READ_ONLY_BINDING_COST_PREVIEW_CHANGED_STATE");
}

const decision = blockers.length
  ? "REPAIR_SOURCE_BINDING_COST_APPROVAL_PREVIEW_BLOCKED"
  : "REPAIR_SOURCE_BINDING_COST_APPROVAL_PREVIEW_9_SOURCES_CONFIRMED";
const readiness = blockers.length
  ? "REPAIR_SOURCE_BINDING_COST_APPROVAL_PREVIEW_BLOCKED"
  : dedicatedRepairCostGuardRequired
    ? "READY_FOR_DEDICATED_REPAIR_COST_GUARD_RUNTIME_DESIGN"
    : "READY_FOR_GUARDED_BINDING_AND_COST_APPROVAL_APPLY_DESIGN";
const instruction = blockers.length
  ? "Resolve every binding and cost-approval preview blocker before changing any replacement source task."
  : dedicatedRepairCostGuardRequired
    ? "Do not apply provider binding or cost approval yet. Implement and verify a dedicated perceptual-repair source cost guard that accepts only this repair changeset contract, enforces the exact per-task price, keeps publication unauthorized, and requires a separate later dispatch token."
    : "Design a guarded apply workflow with separate provider-binding and cost-approval authorizations. Do not dispatch, reserve wallet funds or call a provider.";

const report = {
  contract: REPORT_CONTRACT,
  generated_at: new Date().toISOString(),
  organization_id: organizationId,
  creative_project_id: projectId,
  production_graph_id: graphId,
  source_dispatch_preview_file: dispatchPreviewFile.absolute,
  source_dispatch_preview_file_sha256: dispatchPreviewFile.file_sha256,
  source_credential_audit_file: credentialAuditFile.absolute,
  source_credential_audit_file_sha256: credentialAuditFile.file_sha256,
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
  proposed_change_contract: proposedChangeContract,
  proposed_change_contract_sha256: proposedChangeContractSha,
  expected_provider_binding_authorization:
    expectedBindingAuthorization,
  expected_cost_approval_authorization:
    expectedCostApprovalAuthorization,
  existing_sealed_cost_guard_compatible:
    existingSealedCostGuardCompatible,
  dedicated_repair_cost_guard_required:
    dedicatedRepairCostGuardRequired,
  proposed_changes: proposedChanges,
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
console.log("READ-ONLY REPAIR SOURCE BINDING AND COST-APPROVAL PREVIEW");
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
console.log(
  `PROPOSED_EXACT_CUSTOMER_PRICE=${proposedExactCustomerPrice}`,
);
console.log(`ORIGINAL_TASK_COST_CEILING=${originalTaskCostCeiling}`);
console.log(
  `TOTAL_SAVINGS_AGAINST_ORIGINAL_CEILING=${
    totalSavingsAgainstOriginalCeiling
  }`,
);
console.log(`CURRENCY=THB`);
console.log(`WALLET_BALANCE=${before.wallet_balance}`);
console.log(
  `WALLET_HEADROOM_AFTER_FULL_SOURCE_RESERVATION=${money(
    before.wallet_balance - proposedExactCustomerPrice,
  )}`,
);
console.log(`PROPOSED_CHANGE_CONTRACT_SHA256=${proposedChangeContractSha}`);
console.log(
  `EXPECTED_PROVIDER_BINDING_AUTHORIZATION=${expectedBindingAuthorization}`,
);
console.log(
  `EXPECTED_COST_APPROVAL_AUTHORIZATION=${expectedCostApprovalAuthorization}`,
);
console.log(
  `EXISTING_SEALED_COST_GUARD_COMPATIBLE=${
    existingSealedCostGuardCompatible ? "YES" : "NO"
  }`,
);
console.log(
  `DEDICATED_REPAIR_COST_GUARD_REQUIRED=${
    dedicatedRepairCostGuardRequired ? "YES" : "NO"
  }`,
);

for (const change of proposedChanges) {
  console.log([
    `SOURCE_BINDING_COST_PREVIEW=${change.execution_node_id}`,
    `source=${change.source_task_id || ""}`,
    `review=${change.review_task_id || ""}`,
    `provider=${change.proposed_provider_id}`,
    `exact_price=${change.proposed_exact_customer_price}`,
    `original_ceiling=${change.original_task_cost_ceiling}`,
    `savings=${change.savings_against_original_ceiling}`,
    `binding_patch_sha=${change.provider_binding_patch_sha256}`,
    `cost_patch_sha=${change.cost_approval_patch_sha256}`,
    `review_patch=NONE`,
    `reversible=YES`,
    `issues=${change.issues.join(",")}`,
    `ready=${change.ready ? "YES" : "NO"}`,
  ].join("|"));
}

console.log(`BINDING_COST_PREVIEW_BLOCKERS=${JSON.stringify(blockers)}`);
console.log(`BINDING_COST_PREVIEW_DECISION=${decision}`);
console.log(`BINDING_COST_PREVIEW_INSTRUCTION=${instruction}`);
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
