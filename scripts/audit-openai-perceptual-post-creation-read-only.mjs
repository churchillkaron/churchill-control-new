#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv({ cwd: process.cwd() });
await import("./creative-runtime-bootstrap.mjs");

const PLAN_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_REJECTED_MEDIA_REPAIR_PLAN_V1";
const PREVIEW_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_PAIR_REPAIR_RUNTIME_PREVIEW_V1";
const CHECKPOINT_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_PAIR_REPAIR_TASK_CREATION_CHECKPOINT_V1";
const RECOVERY_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_PAIR_REPAIR_TASK_CREATION_RECOVERY_V1";
const POST_RECONCILIATION_AUDIT_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_POST_RECONCILIATION_AUDIT_V1";
const REPORT_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_POST_CREATION_AUDIT_V1";
const FAILURE = "GENERATED_MEDIA_PERCEPTUAL_VALIDATION_FAILED";

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

function taskCore(task = {}) {
  return {
    id: task.id,
    organization_id: task.organization_id,
    creative_project_id: task.creative_project_id ?? null,
    production_graph_id: task.production_graph_id ?? null,
    scene_id: task.scene_id ?? null,
    shot_id: task.shot_id ?? null,
    type: task.type,
    status: task.status,
    title: task.title ?? "",
    description: task.description ?? "",
    service_id: task.service_id ?? null,
    provider_id: task.provider_id ?? null,
    service_code: task.service_code ?? task.service_id ?? null,
    capability: task.capability ?? null,
    priority: Number(task.priority ?? 100),
    depends_on: task.depends_on ?? [],
    input: task.input ?? {},
    output: task.output ?? {},
    cost: {
      currency: task.cost?.currency ?? null,
      estimated: Number(task.cost?.estimated ?? 0),
      actual: Number(task.cost?.actual ?? 0),
      approved: task.cost?.approved ?? false,
    },
    timing: {
      estimated_seconds: Number(task.timing?.estimated_seconds ?? 0),
      started_at: task.timing?.started_at ?? null,
      completed_at: task.timing?.completed_at ?? null,
    },
    review: {
      required: task.review?.required ?? true,
      approved: task.review?.approved ?? false,
      approved_by: task.review?.approved_by ?? null,
      notes: task.review?.notes ?? "",
    },
    error: task.error ?? null,
    metadata: task.metadata ?? {},
    created_by: task.created_by ?? null,
  };
}

function sameSet(left = [], right = []) {
  const a = [...new Set(list(left).map(text))].sort();
  const b = [...new Set(list(right).map(text))].sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function beforeBookkeeping(task = {}) {
  const metadata = { ...object(task.metadata) };
  for (const key of [
    "superseded_by_repair_task_id",
    "superseded_by_repair_review_task_id",
    "repair_identity",
    "repair_attempt",
    "repair_attempted",
    "pair_aware_repair",
    "pair_repair_creation_id",
    "pair_repair_preview_file_sha256",
  ]) {
    delete metadata[key];
  }
  return { ...task, metadata };
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

const planFile = readJson(process.argv[2], "PAIR_REPAIR_PLAN");
const previewFile = readJson(process.argv[3], "PAIR_REPAIR_PREVIEW");
const checkpointFile = readJson(
  process.argv[4],
  "PAIR_REPAIR_CREATION_CHECKPOINT",
);
const recoveryFile = readJson(
  process.argv[5],
  "PAIR_REPAIR_CREATION_RECOVERY_RESULT",
);

const plan = object(planFile.value);
const preview = object(previewFile.value);
const checkpoint = object(checkpointFile.value);
const recovery = object(recoveryFile.value);
const postReconciliationAuditFile = readJson(
  plan.post_reconciliation_audit_file,
  "POST_RECONCILIATION_AUDIT",
);
const postReconciliationAudit = object(postReconciliationAuditFile.value);

const organizationId = text(process.env.ORGANIZATION_ID);
const projectId = text(process.env.CREATIVE_PROJECT_ID);
const graphId = text(process.env.PRODUCTION_GRAPH_ID);
const outputPath = path.resolve(
  text(process.env.OPENAI_PERCEPTUAL_POST_CREATION_AUDIT_OUTPUT) ||
    "/tmp/churchill-openai-perceptual-post-creation-audit.json",
);

if (!organizationId || !projectId || !graphId) {
  throw new Error("POST_CREATION_AUDIT_SCOPE_REQUIRED");
}

const [
  { supabaseAdmin },
  { ProductionTaskRuntime },
  { createProductionTask },
  { preparePromptlessPersistence, persistedPromptFieldPaths },
  { CreativeProductionTaskMaterializationRuntime: MaterializationRuntime },
  { CreativeGeneratedMediaPerceptualPairRepairRuntime: PairRuntime },
  { CreativeGeneratedMediaPerceptualExecutionGate: Gate },
] = await Promise.all([
  import("@/lib/shared/supabase/admin"),
  import("@/lib/operations/tasks/runtime/ProductionTaskRuntime"),
  import("@/lib/operations/tasks/documents/ProductionTask"),
  import("@/lib/creative/execution/runtime/CreativePromptlessPersistenceRuntime"),
  import("@/lib/creative/execution/runtime/CreativeProductionTaskMaterializationRuntime"),
  import("@/lib/creative/quality/runtime/CreativeGeneratedMediaPerceptualPairRepairRuntime"),
  import("@/lib/creative/quality/runtime/CreativeGeneratedMediaPerceptualExecutionGate"),
]);

function persistedVariant(payload, materialized) {
  const contract = object(
    payload.input?.requirements?.task_materialization_contract,
  );
  const normalized = materialized
    ? MaterializationRuntime.normalize(payload, contract)
    : payload;
  return preparePromptlessPersistence(
    createProductionTask(normalized),
    "POST_CREATION_AUDIT_EXPECTED_TASK",
  );
}

function taskEquivalence(live, payload) {
  if (!live || !payload) {
    return {
      equivalent: false,
      variant: "MISSING",
      prompt_paths: live
        ? persistedPromptFieldPaths(live, "live_task")
        : [],
    };
  }

  const promptPaths = persistedPromptFieldPaths(live, "live_task");
  const liveHash = sha256(taskCore(live));
  const directHash = sha256(taskCore(persistedVariant(payload, false)));
  const materializedHash = sha256(taskCore(persistedVariant(payload, true)));

  if (promptPaths.length) {
    return {
      equivalent: false,
      variant: "PERSISTED_PROMPT_FIELDS",
      prompt_paths: promptPaths,
      live_core_sha256: liveHash,
      direct_core_sha256: directHash,
      materialized_core_sha256: materializedHash,
    };
  }
  if (liveHash === directHash) {
    return {
      equivalent: true,
      variant: "DIRECT",
      prompt_paths: [],
      live_core_sha256: liveHash,
      direct_core_sha256: directHash,
      materialized_core_sha256: materializedHash,
    };
  }
  if (liveHash === materializedHash) {
    return {
      equivalent: true,
      variant: "MATERIALIZED",
      prompt_paths: [],
      live_core_sha256: liveHash,
      direct_core_sha256: directHash,
      materialized_core_sha256: materializedHash,
    };
  }
  return {
    equivalent: false,
    variant: "MISMATCH",
    prompt_paths: [],
    live_core_sha256: liveHash,
    direct_core_sha256: directHash,
    materialized_core_sha256: materializedHash,
  };
}

const blockers = [];
const requireValue = (condition, label) => {
  if (!condition) blockers.push(label);
};

requireValue(text(plan.contract) === PLAN_CONTRACT, "PLAN_CONTRACT_INVALID");
requireValue(
  text(preview.contract) === PREVIEW_CONTRACT,
  "PREVIEW_CONTRACT_INVALID",
);
requireValue(
  text(checkpoint.contract) === CHECKPOINT_CONTRACT,
  "CHECKPOINT_CONTRACT_INVALID",
);
requireValue(
  text(recovery.contract) === RECOVERY_CONTRACT,
  "RECOVERY_CONTRACT_INVALID",
);
requireValue(
  text(postReconciliationAudit.contract) ===
    POST_RECONCILIATION_AUDIT_CONTRACT,
  "POST_RECONCILIATION_AUDIT_CONTRACT_INVALID",
);

for (const [label, value] of [
  ["PLAN", plan],
  ["PREVIEW", preview],
  ["CHECKPOINT", checkpoint],
  ["RECOVERY", recovery],
  ["POST_RECONCILIATION_AUDIT", postReconciliationAudit],
]) {
  requireValue(
    text(value.organization_id) === organizationId &&
      text(value.creative_project_id) === projectId &&
      text(value.production_graph_id) === graphId,
    `${label}_SCOPE_INVALID`,
  );
}

requireValue(
  text(plan.post_reconciliation_audit_file_sha256) ===
    postReconciliationAuditFile.file_sha256,
  "POST_RECONCILIATION_AUDIT_FILE_SHA_MISMATCH",
);
requireValue(
  text(recovery.plan_file_sha256) === planFile.file_sha256 &&
    text(checkpoint.plan_file_sha256) === planFile.file_sha256,
  "PLAN_FILE_LINKAGE_INVALID",
);
requireValue(
  text(recovery.preview_file_sha256) === previewFile.file_sha256 &&
    text(checkpoint.preview_file_sha256) === previewFile.file_sha256,
  "PREVIEW_FILE_LINKAGE_INVALID",
);
requireValue(
  text(recovery.checkpoint_file) === checkpointFile.absolute,
  "RECOVERY_CHECKPOINT_PATH_INVALID",
);
requireValue(
  text(recovery.creation_id) === text(checkpoint.creation_id),
  "CREATION_ID_MISMATCH",
);

requireValue(
  text(plan.decision) === "PAIR_AWARE_REPAIR_PLAN_9_PAIRS_CONFIRMED" &&
    text(plan.readiness) === "READY_FOR_PAIR_AWARE_REPAIR_RUNTIME_DESIGN" &&
    list(plan.blockers).length === 0 &&
    plan.state_unchanged === true,
  "PLAN_NOT_READY",
);
requireValue(
  text(preview.decision) ===
    "PAIR_REPAIR_RUNTIME_9_PAIR_PAYLOADS_CONFIRMED" &&
    text(preview.readiness) ===
      "READY_FOR_GUARDED_REPAIR_TASK_CREATION_DESIGN" &&
    list(preview.blockers).length === 0 &&
    preview.state_unchanged === true,
  "PREVIEW_NOT_READY",
);
requireValue(
  recovery.apply_mode === true &&
    text(recovery.decision) === "PAIR_REPAIR_18_WAITING_TASKS_RECOVERED" &&
    text(recovery.readiness) === "READY_FOR_POST_CREATION_AUDIT" &&
    list(recovery.blockers).length === 0,
  "RECOVERY_RESULT_NOT_APPLIED",
);
requireValue(
  Number(recovery.database_write_count) === 34,
  "RECOVERY_DATABASE_WRITE_COUNT_INVALID",
);
requireValue(
  text(checkpoint.status) === "COMPLETED" &&
    list(checkpoint.completed_pairs).length === 9 &&
    list(checkpoint.completed_pairs).every(
      (item) => text(item.state) === "APPLIED",
    ) &&
    Number(checkpoint.final_task_count) === 45,
  "CHECKPOINT_NOT_COMPLETED",
);
requireValue(
  Number(plan.recovered_pair_count) === 4 &&
    Number(plan.rejected_pair_count) === 9 &&
    Number(plan.recovered_source_regeneration_scope) === 0 &&
    Number(plan.planned_replacement_source_tasks) === 9 &&
    Number(plan.planned_replacement_review_tasks) === 9 &&
    Number(plan.planned_downstream_rewires) === 0,
  "PLAN_COUNTS_INVALID",
);
requireValue(
  Number(preview.preview_pair_count) === 9 &&
    Number(preview.preview_replacement_source_count) === 9 &&
    Number(preview.preview_replacement_review_count) === 9 &&
    Number(preview.preview_total_task_count) === 18 &&
    Number(preview.existing_id_collision_count) === 0 &&
    Number(preview.deterministic_id_collision_count) === 0 &&
    Number(preview.promptless_pair_count) === 9 &&
    Number(preview.provider_bound_count) === 0 &&
    Number(preview.cost_approved_count) === 0,
  "PREVIEW_COUNTS_INVALID",
);
requireValue(
  postReconciliationAudit.recovered_pair_count === 4 &&
    postReconciliationAudit.rejected_pair_count === 9 &&
    postReconciliationAudit.audit_state_unchanged === true &&
    list(postReconciliationAudit.blockers).length === 0,
  "POST_RECONCILIATION_AUDIT_NOT_CLEAN",
);
requireValue(
  recovery.provider_selection_authorized === false &&
    recovery.provider_spend_authorized === false &&
    recovery.dispatch_authorized === false &&
    recovery.provider_calls_executed === false &&
    recovery.provider_polls_executed === false &&
    recovery.retries_executed === false &&
    recovery.source_regeneration_executed === false &&
    Number(recovery.downstream_tasks_updated) === 0 &&
    recovery.finalisation_eligible === false &&
    recovery.finalisation_executed === false &&
    recovery.publication_executed === false,
  "RECOVERY_FORBIDDEN_ACTIVITY_RECORDED",
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
  before.task_state_sha256 === text(checkpoint.final_task_state_sha256) &&
    before.task_state_sha256 === text(recovery.after?.task_state_sha256),
  "LIVE_TASK_STATE_SHA_MISMATCH",
);
requireValue(
  before.usage_count === Number(recovery.before?.usage_count) &&
    before.usage_count === Number(recovery.after?.usage_count),
  "USAGE_COUNT_CHANGED",
);
requireValue(
  before.wallet_balance === money(recovery.before?.wallet_balance) &&
    before.wallet_balance === money(recovery.after?.wallet_balance) &&
    before.wallet_updated_at === recovery.before?.wallet_updated_at &&
    before.wallet_updated_at === recovery.after?.wallet_updated_at,
  "WALLET_STATE_CHANGED",
);

const protectedIds = new Set(list(checkpoint.protected_task_ids).map(text));
const protectedStateSha = taskFingerprint(
  before.tasks.filter((task) => protectedIds.has(task.id)),
);
requireValue(protectedIds.size === 9, "PROTECTED_TASK_ID_COUNT_INVALID");
requireValue(
  protectedStateSha === text(checkpoint.protected_task_state_sha256) &&
    protectedStateSha === text(checkpoint.final_protected_task_state_sha256) &&
    protectedStateSha === text(recovery.protected_state_sha256_before) &&
    protectedStateSha === text(recovery.protected_state_sha256_after),
  "PROTECTED_TASK_STATE_CHANGED",
);

const recoveredPairs = list(postReconciliationAudit.recovered_pairs).map((pair) => {
  const source = taskMap.get(text(pair.source_task_id));
  const review = taskMap.get(text(pair.review_task_id));
  const validation = review ? Gate.validation(review) : {};
  const issues = [];

  if (!source) issues.push("SOURCE_MISSING");
  if (!review) issues.push("REVIEW_MISSING");
  if (source && text(source.status) !== "COMPLETED") {
    issues.push(`SOURCE_STATUS_INVALID:${source.status}`);
  }
  if (review && text(review.status) !== "COMPLETED") {
    issues.push(`REVIEW_STATUS_INVALID:${review.status}`);
  }
  if (review && validation.passed !== true) {
    issues.push("RUNTIME_VALIDATION_NO_LONGER_PASSES");
  }
  if (
    source &&
    (!protectedIds.has(source.id) || !protectedIds.has(review?.id))
  ) {
    issues.push("RECOVERED_PAIR_NOT_PROTECTED");
  }
  if (
    source?.metadata?.superseded_by_repair_task_id ||
    review?.metadata?.superseded_by_repair_review_task_id
  ) {
    issues.push("RECOVERED_PAIR_WAS_SUPERSEDED");
  }

  return {
    execution_node_id: text(pair.execution_node_id),
    source_task_id: source?.id || null,
    review_task_id: review?.id || null,
    source_status: source?.status || null,
    review_status: review?.status || null,
    runtime_passed: validation.passed === true,
    issues,
    immutable: issues.length === 0,
  };
});

if (recoveredPairs.length !== 4 || recoveredPairs.some((pair) => !pair.immutable)) {
  blockers.push("ONE_OR_MORE_RECOVERED_PAIRS_CHANGED");
}

const previewMap = new Map(
  list(preview.pairs).map((pair) => [text(pair.execution_node_id), pair]),
);
const replacementIds = new Set();
const originalTargetIds = new Set();
const repairPairs = [];

for (const pairPlan of list(plan.repair_plans)) {
  const originalSource = taskMap.get(text(pairPlan.source_task_id));
  const originalReview = taskMap.get(text(pairPlan.review_task_id));
  const previewRecord = previewMap.get(text(pairPlan.execution_node_id));
  const issues = [];
  let generated = null;

  originalTargetIds.add(text(pairPlan.source_task_id));
  originalTargetIds.add(text(pairPlan.review_task_id));

  if (!originalSource) issues.push("ORIGINAL_SOURCE_MISSING");
  if (!originalReview) issues.push("ORIGINAL_REVIEW_MISSING");
  if (!previewRecord) issues.push("PREVIEW_RECORD_MISSING");

  if (originalSource && originalReview) {
    try {
      generated = PairRuntime.previewPair({
        source: beforeBookkeeping(originalSource),
        review: beforeBookkeeping(originalReview),
        plan: pairPlan,
      });
    } catch (error) {
      issues.push(`PAIR_RUNTIME_FAILED:${error.message}`);
    }
  }

  const expectedSource = generated?.replacement_source_task || null;
  const expectedReview = generated?.replacement_review_task || null;
  if (expectedSource) replacementIds.add(expectedSource.id);
  if (expectedReview) replacementIds.add(expectedReview.id);

  const replacementSource = expectedSource
    ? taskMap.get(expectedSource.id)
    : null;
  const replacementReview = expectedReview
    ? taskMap.get(expectedReview.id)
    : null;
  const sourceEquivalence = taskEquivalence(replacementSource, expectedSource);
  const reviewEquivalence = taskEquivalence(replacementReview, expectedReview);
  const originalValidation = originalReview
    ? Gate.validation(originalReview)
    : {};
  const liveFailedChecks = Object.entries(object(originalValidation.checks))
    .filter(([, passed]) => passed !== true)
    .map(([key]) => key);

  if (generated && previewRecord) {
    if (expectedSource.id !== text(previewRecord.replacement_source_task_id)) {
      issues.push("REPLACEMENT_SOURCE_ID_MISMATCH");
    }
    if (expectedReview.id !== text(previewRecord.replacement_review_task_id)) {
      issues.push("REPLACEMENT_REVIEW_ID_MISMATCH");
    }
    if (
      text(generated.pair_payload_sha256) !==
      text(previewRecord.pair_payload_sha256)
    ) {
      issues.push("PAIR_PAYLOAD_SHA_MISMATCH");
    }
  }

  if (!sourceEquivalence.equivalent) {
    issues.push(`REPLACEMENT_SOURCE_PAYLOAD_INVALID:${sourceEquivalence.variant}`);
  }
  if (!reviewEquivalence.equivalent) {
    issues.push(`REPLACEMENT_REVIEW_PAYLOAD_INVALID:${reviewEquivalence.variant}`);
  }

  if (originalSource && text(originalSource.status) !== "FAILED") {
    issues.push(`ORIGINAL_SOURCE_STATUS_INVALID:${originalSource.status}`);
  }
  if (originalReview && text(originalReview.status) !== "FAILED") {
    issues.push(`ORIGINAL_REVIEW_STATUS_INVALID:${originalReview.status}`);
  }
  if (originalSource && text(originalSource.error) !== FAILURE) {
    issues.push("ORIGINAL_SOURCE_FAILURE_REASON_CHANGED");
  }
  if (originalReview && text(originalReview.error) !== FAILURE) {
    issues.push("ORIGINAL_REVIEW_FAILURE_REASON_CHANGED");
  }
  if (originalReview && originalValidation.passed === true) {
    issues.push("ORIGINAL_REVIEW_NOW_PASSES");
  }
  if (!sameSet(liveFailedChecks, pairPlan.failed_checks)) {
    issues.push("ORIGINAL_FAILED_CHECKS_CHANGED");
  }

  if (
    originalSource &&
    (text(originalSource.metadata?.superseded_by_repair_task_id) !==
      text(expectedSource?.id) ||
      text(originalSource.metadata?.repair_identity) !==
        text(pairPlan.repair_identity) ||
      Number(originalSource.metadata?.repair_attempt) !==
        Number(pairPlan.repair_attempt) ||
      originalSource.metadata?.repair_attempted !== true ||
      originalSource.metadata?.pair_aware_repair !== true ||
      text(originalSource.metadata?.pair_repair_creation_id) !==
        text(checkpoint.creation_id) ||
      text(originalSource.metadata?.pair_repair_preview_file_sha256) !==
        previewFile.file_sha256)
  ) {
    issues.push("ORIGINAL_SOURCE_SUPERSESSION_INVALID");
  }
  if (
    originalReview &&
    (text(originalReview.metadata?.superseded_by_repair_review_task_id) !==
      text(expectedReview?.id) ||
      text(originalReview.metadata?.repair_identity) !==
        text(pairPlan.repair_identity) ||
      Number(originalReview.metadata?.repair_attempt) !==
        Number(pairPlan.repair_attempt) ||
      originalReview.metadata?.repair_attempted !== true ||
      originalReview.metadata?.pair_aware_repair !== true ||
      text(originalReview.metadata?.pair_repair_creation_id) !==
        text(checkpoint.creation_id) ||
      text(originalReview.metadata?.pair_repair_preview_file_sha256) !==
        previewFile.file_sha256)
  ) {
    issues.push("ORIGINAL_REVIEW_SUPERSESSION_INVALID");
  }

  for (const [label, replacement] of [
    ["SOURCE", replacementSource],
    ["REVIEW", replacementReview],
  ]) {
    if (!replacement) continue;
    if (text(replacement.status) !== "WAITING") {
      issues.push(`REPLACEMENT_${label}_STATUS_INVALID:${replacement.status}`);
    }
    if (replacement.provider_id !== null) {
      issues.push(`REPLACEMENT_${label}_PROVIDER_BOUND`);
    }
    if (replacement.cost?.approved !== false) {
      issues.push(`REPLACEMENT_${label}_COST_APPROVED`);
    }
    if (Number(replacement.cost?.actual || 0) !== 0) {
      issues.push(`REPLACEMENT_${label}_ACTUAL_COST_NONZERO`);
    }
    if (text(replacement.error)) {
      issues.push(`REPLACEMENT_${label}_ERROR_PRESENT`);
    }
    if (replacement.timing?.started_at || replacement.timing?.completed_at) {
      issues.push(`REPLACEMENT_${label}_TIMING_STARTED`);
    }
    if (Object.keys(object(replacement.output)).length !== 0) {
      issues.push(`REPLACEMENT_${label}_OUTPUT_PRESENT`);
    }
    if (replacement.review?.approved === true) {
      issues.push(`REPLACEMENT_${label}_REVIEW_APPROVED`);
    }
  }

  if (
    replacementSource &&
    (replacementSource.metadata?.pair_aware_repair !== true ||
      replacementSource.metadata?.generated_media_perceptual_pair_repair !==
        true ||
      text(replacementSource.metadata?.repair_payload_contract) !==
        "GENERATED_MEDIA_PERCEPTUAL_REPLACEMENT_SOURCE_V1" ||
      text(replacementSource.metadata?.repair_of_task_id) !==
        text(originalSource?.id) ||
      text(replacementSource.metadata?.repair_quality_task_id) !==
        text(originalReview?.id) ||
      text(replacementSource.metadata?.repair_identity) !==
        text(pairPlan.repair_identity) ||
      Number(replacementSource.metadata?.repair_attempt) !==
        Number(pairPlan.repair_attempt))
  ) {
    issues.push("REPLACEMENT_SOURCE_METADATA_INVALID");
  }
  if (
    replacementReview &&
    (replacementReview.metadata?.pair_aware_repair !== true ||
      replacementReview.metadata?.generated_media_perceptual_pair_repair !==
        true ||
      text(replacementReview.metadata?.repair_payload_contract) !==
        "GENERATED_MEDIA_PERCEPTUAL_REPLACEMENT_REVIEW_V1" ||
      text(replacementReview.metadata?.repair_review_of_task_id) !==
        text(originalReview?.id) ||
      text(replacementReview.metadata?.repaired_source_task_id) !==
        text(replacementSource?.id) ||
      text(replacementReview.metadata?.source_generation_task_id) !==
        text(replacementSource?.id) ||
      text(replacementReview.metadata?.repair_identity) !==
        text(pairPlan.repair_identity) ||
      Number(replacementReview.metadata?.repair_attempt) !==
        Number(pairPlan.repair_attempt))
  ) {
    issues.push("REPLACEMENT_REVIEW_METADATA_INVALID");
  }
  if (
    replacementReview &&
    (list(replacementReview.depends_on).length !== 1 ||
      text(replacementReview.depends_on[0]) !== text(replacementSource?.id))
  ) {
    issues.push("REPLACEMENT_REVIEW_DEPENDENCY_INVALID");
  }

  repairPairs.push({
    execution_node_id: text(pairPlan.execution_node_id),
    original_source_task_id: originalSource?.id || null,
    original_review_task_id: originalReview?.id || null,
    replacement_source_task_id: replacementSource?.id || null,
    replacement_review_task_id: replacementReview?.id || null,
    original_failed_checks: liveFailedChecks,
    source_variant: sourceEquivalence.variant,
    review_variant: reviewEquivalence.variant,
    source_prompt_path_count: list(sourceEquivalence.prompt_paths).length,
    review_prompt_path_count: list(reviewEquivalence.prompt_paths).length,
    issues,
    confirmed: issues.length === 0,
  });
}

if (repairPairs.length !== 9 || repairPairs.some((pair) => !pair.confirmed)) {
  blockers.push("ONE_OR_MORE_REPAIR_PAIRS_INVALID");
}
requireValue(replacementIds.size === 18, "REPLACEMENT_ID_SET_INVALID");
requireValue(originalTargetIds.size === 18, "ORIGINAL_TARGET_ID_SET_INVALID");
requireValue(
  [...replacementIds].every((id) => !protectedIds.has(id)) &&
    [...replacementIds].every((id) => !originalTargetIds.has(id)),
  "REPLACEMENT_SCOPE_OVERLAP_INVALID",
);
requireValue(
  list(checkpoint.expected_task_ids).length === 18 &&
    list(checkpoint.expected_task_ids).every((id) => replacementIds.has(text(id))),
  "CHECKPOINT_EXPECTED_TASK_SET_INVALID",
);

const checkpointPairIds = new Set(
  list(checkpoint.completed_pairs).flatMap((pair) => [
    text(pair.source_task_id),
    text(pair.review_task_id),
  ]),
);
requireValue(
  checkpointPairIds.size === 18 &&
    [...originalTargetIds].every((id) => checkpointPairIds.has(id)),
  "CHECKPOINT_COMPLETED_PAIR_SET_INVALID",
);

const replacementTasks = before.tasks.filter((task) => replacementIds.has(task.id));
const waitingReplacementCount = replacementTasks.filter(
  (task) => text(task.status) === "WAITING",
).length;
const providerBoundCount = replacementTasks.filter(
  (task) => task.provider_id !== null,
).length;
const costApprovedCount = replacementTasks.filter(
  (task) => task.cost?.approved === true,
).length;
const startedCount = replacementTasks.filter(
  (task) => task.timing?.started_at || task.timing?.completed_at,
).length;
const outputPresentCount = replacementTasks.filter(
  (task) => Object.keys(object(task.output)).length !== 0,
).length;
const persistedPromptPathCount = replacementTasks.reduce(
  (count, task) =>
    count + persistedPromptFieldPaths(task, `replacement_${task.id}`).length,
  0,
);

requireValue(replacementTasks.length === 18, "LIVE_REPLACEMENT_COUNT_INVALID");
requireValue(
  waitingReplacementCount === 18,
  "LIVE_REPLACEMENT_WAITING_COUNT_INVALID",
);
requireValue(providerBoundCount === 0, "LIVE_REPLACEMENT_PROVIDER_BOUND");
requireValue(costApprovedCount === 0, "LIVE_REPLACEMENT_COST_APPROVED");
requireValue(startedCount === 0, "LIVE_REPLACEMENT_ALREADY_STARTED");
requireValue(outputPresentCount === 0, "LIVE_REPLACEMENT_OUTPUT_PRESENT");
requireValue(
  persistedPromptPathCount === 0,
  "LIVE_REPLACEMENT_PROMPTLESS_CONTRACT_INVALID",
);

const after = await exactState({
  supabaseAdmin,
  ProductionTaskRuntime,
  organizationId,
  projectId,
  graphId,
});
const auditStateUnchanged =
  before.task_count === after.task_count &&
  before.task_state_sha256 === after.task_state_sha256 &&
  before.usage_count === after.usage_count &&
  before.wallet_balance === after.wallet_balance &&
  before.wallet_updated_at === after.wallet_updated_at;
if (!auditStateUnchanged) blockers.push("READ_ONLY_AUDIT_CHANGED_STATE");

const confirmedRepairPairCount = repairPairs.filter(
  (pair) => pair.confirmed,
).length;
const immutableRecoveredPairCount = recoveredPairs.filter(
  (pair) => pair.immutable,
).length;
const finalisationEligible = false;
const decision = blockers.length
  ? "POST_CREATION_AUDIT_BLOCKED"
  : "POST_CREATION_AUDIT_18_WAITING_TASKS_CONFIRMED";
const readiness = blockers.length
  ? "POST_CREATION_AUDIT_BLOCKED"
  : "READY_FOR_GUARDED_REPAIR_SOURCE_DISPATCH_DESIGN";
const instruction = blockers.length
  ? "Resolve every post-creation audit blocker before selecting providers, approving spend or dispatching any replacement task."
  : "Keep all replacement tasks unapproved and undispatched. Design a separate read-only source-dispatch preview for exactly nine replacement source tasks, with provider selection, cost approval and dispatch authorization kept as distinct gates. Replacement perceptual reviews must remain dependency-blocked until their source tasks complete.";

const report = {
  contract: REPORT_CONTRACT,
  generated_at: new Date().toISOString(),
  organization_id: organizationId,
  creative_project_id: projectId,
  production_graph_id: graphId,
  plan_file: planFile.absolute,
  plan_file_sha256: planFile.file_sha256,
  preview_file: previewFile.absolute,
  preview_file_sha256: previewFile.file_sha256,
  checkpoint_file: checkpointFile.absolute,
  checkpoint_file_sha256: checkpointFile.file_sha256,
  recovery_file: recoveryFile.absolute,
  recovery_file_sha256: recoveryFile.file_sha256,
  post_reconciliation_audit_file: postReconciliationAuditFile.absolute,
  post_reconciliation_audit_file_sha256:
    postReconciliationAuditFile.file_sha256,
  creation_id: text(checkpoint.creation_id),
  task_count: before.task_count,
  task_status_counts: before.task_status_counts,
  protected_task_count: protectedIds.size,
  protected_task_state_sha256: protectedStateSha,
  recovered_pair_count: immutableRecoveredPairCount,
  repair_pair_count: confirmedRepairPairCount,
  replacement_task_count: replacementTasks.length,
  replacement_waiting_count: waitingReplacementCount,
  replacement_provider_bound_count: providerBoundCount,
  replacement_cost_approved_count: costApprovedCount,
  replacement_started_count: startedCount,
  replacement_output_present_count: outputPresentCount,
  persisted_prompt_path_count: persistedPromptPathCount,
  recovered_pairs: recoveredPairs,
  repair_pairs: repairPairs,
  finalisation_eligible: finalisationEligible,
  finalisation_blocked_by_waiting_repair_tasks: true,
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
  audit_state_unchanged: auditStateUnchanged,
  database_writes_executed: false,
  provider_selection_authorized: false,
  provider_spend_authorized: false,
  dispatch_authorized: false,
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
console.log("READ-ONLY OPENAI PERCEPTUAL POST-CREATION AUDIT");
console.log("============================================================");
console.log(`OUTPUT=${outputPath}`);
console.log(`TASK_COUNT=${before.task_count}`);
console.log(`TASK_STATUS_COUNTS=${JSON.stringify(before.task_status_counts)}`);
console.log(`PROTECTED_TASK_COUNT=${protectedIds.size}`);
console.log(`RECOVERED_PAIR_COUNT=${immutableRecoveredPairCount}`);
console.log(`REPAIR_PAIR_COUNT=${confirmedRepairPairCount}`);
console.log(`REPLACEMENT_TASK_COUNT=${replacementTasks.length}`);
console.log(`REPLACEMENT_WAITING_COUNT=${waitingReplacementCount}`);
console.log(`REPLACEMENT_PROVIDER_BOUND_COUNT=${providerBoundCount}`);
console.log(`REPLACEMENT_COST_APPROVED_COUNT=${costApprovedCount}`);
console.log(`REPLACEMENT_STARTED_COUNT=${startedCount}`);
console.log(`REPLACEMENT_OUTPUT_PRESENT_COUNT=${outputPresentCount}`);
console.log(`PERSISTED_PROMPT_PATH_COUNT=${persistedPromptPathCount}`);

for (const pair of recoveredPairs) {
  console.log([
    `RECOVERED_PAIR=${pair.execution_node_id}`,
    `source=${pair.source_task_id || ""}`,
    `review=${pair.review_task_id || ""}`,
    `source_status=${pair.source_status || ""}`,
    `review_status=${pair.review_status || ""}`,
    `runtime_passed=${pair.runtime_passed ? "YES" : "NO"}`,
    `issues=${pair.issues.join(",")}`,
    `immutable=${pair.immutable ? "YES" : "NO"}`,
  ].join("|"));
}

for (const pair of repairPairs) {
  console.log([
    `REPAIR_PAIR=${pair.execution_node_id}`,
    `source=${pair.original_source_task_id || ""}`,
    `review=${pair.original_review_task_id || ""}`,
    `replacement_source=${pair.replacement_source_task_id || ""}`,
    `replacement_review=${pair.replacement_review_task_id || ""}`,
    `source_variant=${pair.source_variant}`,
    `review_variant=${pair.review_variant}`,
    `failed_checks=${pair.original_failed_checks.join(",")}`,
    `source_prompt_paths=${pair.source_prompt_path_count}`,
    `review_prompt_paths=${pair.review_prompt_path_count}`,
    `issues=${pair.issues.join(",")}`,
    `confirmed=${pair.confirmed ? "YES" : "NO"}`,
  ].join("|"));
}

console.log(`POST_CREATION_AUDIT_BLOCKERS=${JSON.stringify(blockers)}`);
console.log(`POST_CREATION_AUDIT_DECISION=${decision}`);
console.log(`POST_CREATION_AUDIT_INSTRUCTION=${instruction}`);
console.log(`TASK_STATE_SHA256_BEFORE=${before.task_state_sha256}`);
console.log(`TASK_STATE_SHA256_AFTER=${after.task_state_sha256}`);
console.log(`PROTECTED_STATE_SHA256=${protectedStateSha}`);
console.log(`USAGE_COUNT_BEFORE=${before.usage_count}`);
console.log(`USAGE_COUNT_AFTER=${after.usage_count}`);
console.log(`WALLET_BALANCE_BEFORE=${before.wallet_balance}`);
console.log(`WALLET_BALANCE_AFTER=${after.wallet_balance}`);
console.log(`AUDIT_STATE_UNCHANGED=${auditStateUnchanged ? "YES" : "NO"}`);
console.log(`FINALISATION_ELIGIBLE=${finalisationEligible ? "YES" : "NO"}`);
console.log(`AUDIT_READINESS=${readiness}`);
console.log("DATABASE_WRITES_EXECUTED=NO");
console.log("PROVIDER_SELECTION_AUTHORIZED=NO");
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

if (blockers.length || !auditStateUnchanged) {
  process.exitCode = 2;
}
