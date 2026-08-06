#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv({ cwd: process.cwd() });
await import("./creative-runtime-bootstrap.mjs");

const DESIGN_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_TARGETED_RECONCILIATION_DESIGN_V1";
const RECONCILIATION_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_TARGETED_RECONCILIATION_V1";
const CHECKPOINT_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_TARGETED_RECONCILIATION_CHECKPOINT_V1";
const REVIEW_CONTRACT = "GENERATED_MEDIA_PERCEPTUAL_REVIEW_V1";
const FAILURE = "GENERATED_MEDIA_PERCEPTUAL_VALIDATION_FAILED";
const APPROVED_BY = "AVANTIQO_AUTOMATED_PERCEPTUAL_GATE";

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

function statusCounts(tasks = []) {
  return list(tasks).reduce((counts, task) => {
    const status = text(task.status) || "UNKNOWN";
    counts[status] = Number(counts[status] || 0) + 1;
    return counts;
  }, {});
}

function sourceTaskId(review = {}) {
  return text(
    review.metadata?.source_generation_task_id ||
      review.input?.provider_parameters?.source_generation_task_id,
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
    task_status_counts: statusCounts(scopedTasks),
    task_state_sha256: taskFingerprint(scopedTasks),
    usage_count: Number(usage.count || 0),
    wallet_balance: money(wallet.data?.available_balance),
    wallet_currency: text(wallet.data?.currency) || "THB",
    wallet_updated_at: wallet.data?.updated_at || null,
  };
}

const designFile = readJson(
  process.argv[2],
  "POST_RECONCILIATION_DESIGN",
);
const reconciliationFile = readJson(
  process.argv[3],
  "POST_RECONCILIATION_RESULT",
);
const checkpointFile = readJson(
  process.argv[4],
  "POST_RECONCILIATION_CHECKPOINT",
);

const design = object(designFile.value);
const reconciliation = object(reconciliationFile.value);
const checkpoint = object(checkpointFile.value);

const organizationId = text(process.env.ORGANIZATION_ID);
const projectId = text(process.env.CREATIVE_PROJECT_ID);
const graphId = text(process.env.PRODUCTION_GRAPH_ID);
const outputPath = path.resolve(
  text(process.env.OPENAI_PERCEPTUAL_POST_RECONCILIATION_AUDIT_OUTPUT) ||
    "/tmp/churchill-openai-perceptual-post-reconciliation-audit.json",
);

if (!organizationId || !projectId || !graphId) {
  throw new Error("POST_RECONCILIATION_AUDIT_SCOPE_REQUIRED");
}

const { supabaseAdmin } = await import("@/lib/shared/supabase/admin");
const { ProductionTaskRuntime } = await import(
  "@/lib/operations/tasks/runtime/ProductionTaskRuntime"
);
const {
  CreativeGeneratedMediaPerceptualExecutionGate: Gate,
} = await import(
  "@/lib/creative/quality/runtime/CreativeGeneratedMediaPerceptualExecutionGate"
);

const blockers = [];
const requireValue = (condition, label) => {
  if (!condition) blockers.push(label);
};

requireValue(
  text(design.contract) === DESIGN_CONTRACT,
  "DESIGN_CONTRACT_INVALID",
);
requireValue(
  text(reconciliation.contract) === RECONCILIATION_CONTRACT,
  "RECONCILIATION_CONTRACT_INVALID",
);
requireValue(
  text(checkpoint.contract) === CHECKPOINT_CONTRACT,
  "CHECKPOINT_CONTRACT_INVALID",
);
requireValue(
  text(design.organization_id) === organizationId &&
    text(design.creative_project_id) === projectId &&
    text(design.production_graph_id) === graphId,
  "DESIGN_SCOPE_INVALID",
);
requireValue(
  text(reconciliation.organization_id) === organizationId &&
    text(reconciliation.creative_project_id) === projectId &&
    text(reconciliation.production_graph_id) === graphId,
  "RECONCILIATION_SCOPE_INVALID",
);
requireValue(
  text(checkpoint.organization_id) === organizationId &&
    text(checkpoint.creative_project_id) === projectId &&
    text(checkpoint.production_graph_id) === graphId,
  "CHECKPOINT_SCOPE_INVALID",
);
requireValue(
  text(reconciliation.design_file_sha256) === designFile.file_sha256,
  "RECONCILIATION_DESIGN_FILE_SHA_MISMATCH",
);
requireValue(
  text(checkpoint.design_file_sha256) === designFile.file_sha256,
  "CHECKPOINT_DESIGN_FILE_SHA_MISMATCH",
);
requireValue(
  text(reconciliation.reconciliation_id) ===
    text(checkpoint.reconciliation_id),
  "RECONCILIATION_ID_MISMATCH",
);
requireValue(
  text(reconciliation.design_task_state_sha256) ===
    text(checkpoint.design_task_state_sha256) &&
    text(reconciliation.design_task_state_sha256) ===
      text(design.exact_state_before?.task_state_sha256),
  "DESIGN_TASK_STATE_SHA_MISMATCH",
);
requireValue(
  reconciliation.apply_mode === true &&
    text(reconciliation.decision) ===
      "TARGETED_RECONCILIATION_4_PAIRS_APPLIED" &&
    text(reconciliation.readiness) ===
      "READY_FOR_POST_RECONCILIATION_AUDIT",
  "RECONCILIATION_RESULT_NOT_APPLIED",
);
requireValue(
  list(reconciliation.blockers).length === 0 &&
    Number(reconciliation.database_write_count) === 8,
  "RECONCILIATION_RESULT_NOT_CLEAN",
);
requireValue(
  reconciliation.provider_calls_executed === false &&
    reconciliation.provider_polls_executed === false &&
    reconciliation.retries_executed === false &&
    reconciliation.source_regeneration_executed === false &&
    Number(reconciliation.downstream_tasks_updated) === 0 &&
    reconciliation.finalisation_executed === false &&
    reconciliation.publication_executed === false,
  "RECONCILIATION_FORBIDDEN_ACTIVITY_RECORDED",
);
requireValue(
  text(checkpoint.status) === "COMPLETED" &&
    list(checkpoint.completed_pairs).length === 4 &&
    list(checkpoint.completed_pairs).every(
      (item) => text(item.state) === "APPLIED",
    ),
  "CHECKPOINT_NOT_COMPLETED",
);
requireValue(
  text(checkpoint.final_task_state_sha256) ===
    text(reconciliation.after?.task_state_sha256),
  "CHECKPOINT_FINAL_STATE_SHA_MISMATCH",
);
requireValue(
  Number(design.runtime_pass_count) === 4 &&
    Number(design.runtime_fail_count) === 9 &&
    list(design.pairs).length === 4 &&
    list(design.rejected_containment).length === 9,
  "DESIGN_PAIR_COUNTS_INVALID",
);

const before = await exactState({
  supabaseAdmin,
  ProductionTaskRuntime,
  organizationId,
  projectId,
  graphId,
});
const taskMap = new Map(before.tasks.map((task) => [task.id, task]));
const targetIds = new Set(
  list(design.pairs).flatMap((pair) => [
    text(pair.source_task_id),
    text(pair.review_task_id),
  ]),
);

requireValue(before.task_count === 27, "LIVE_TASK_COUNT_INVALID");
requireValue(
  before.task_state_sha256 === text(checkpoint.final_task_state_sha256) &&
    before.task_state_sha256 ===
      text(reconciliation.after?.task_state_sha256),
  "LIVE_FINAL_TASK_STATE_SHA_MISMATCH",
);
requireValue(
  before.usage_count === Number(reconciliation.before?.usage_count) &&
    before.usage_count === Number(reconciliation.after?.usage_count),
  "USAGE_COUNT_CHANGED",
);
requireValue(
  before.wallet_balance === money(reconciliation.before?.wallet_balance) &&
    before.wallet_balance === money(reconciliation.after?.wallet_balance) &&
    before.wallet_updated_at === reconciliation.before?.wallet_updated_at &&
    before.wallet_updated_at === reconciliation.after?.wallet_updated_at,
  "WALLET_STATE_CHANGED",
);

const liveNonTargetSha = taskFingerprint(
  before.tasks.filter((task) => !targetIds.has(task.id)),
);
requireValue(
  liveNonTargetSha ===
    text(reconciliation.before?.non_target_state_sha256) &&
    liveNonTargetSha ===
      text(reconciliation.after?.non_target_state_sha256),
  "NON_TARGET_TASK_STATE_CHANGED",
);

const recoveredPairs = list(design.pairs).map((pair) => {
  const source = taskMap.get(text(pair.source_task_id));
  const review = taskMap.get(text(pair.review_task_id));
  const evaluated = review ? Gate.validation(review) : {};
  const marker = object(
    source?.output?.targeted_perceptual_reconciliation,
  );
  const reviewMarker = object(
    review?.output?.targeted_perceptual_reconciliation,
  );
  const issues = [];

  if (!source) issues.push("SOURCE_MISSING");
  if (!review) issues.push("REVIEW_MISSING");
  if (source && text(source.status) !== "COMPLETED") {
    issues.push(`SOURCE_STATUS_INVALID:${source.status}`);
  }
  if (review && text(review.status) !== "COMPLETED") {
    issues.push(`REVIEW_STATUS_INVALID:${review.status}`);
  }
  if (source && text(source.error)) issues.push("SOURCE_ERROR_NOT_CLEARED");
  if (review && text(review.error)) issues.push("REVIEW_ERROR_NOT_CLEARED");
  if (
    review &&
    (review.review?.required !== false ||
      review.review?.approved !== true ||
      text(review.review?.approved_by) !== APPROVED_BY)
  ) {
    issues.push("REVIEW_APPROVAL_INVALID");
  }
  if (
    source &&
    (source.metadata?.targeted_perceptual_reconciliation !== true ||
      text(source.metadata?.targeted_perceptual_reconciliation_id) !==
        text(reconciliation.reconciliation_id) ||
      source.metadata?.automated_perceptual_validation_passed !== true ||
      source.metadata?.approved_for_downstream_after_perceptual_review !==
        true ||
      source.metadata?.perceptual_validation_failed === true ||
      source.metadata?.rejected_before_editing === true ||
      text(source.metadata?.perceptual_review_task_id) !== text(review?.id))
  ) {
    issues.push("SOURCE_RECONCILIATION_METADATA_INVALID");
  }
  if (
    review &&
    (review.metadata?.targeted_perceptual_reconciliation !== true ||
      text(review.metadata?.targeted_perceptual_reconciliation_id) !==
        text(reconciliation.reconciliation_id) ||
      review.metadata?.automated_perceptual_validation_passed !== true ||
      review.metadata?.generated_media_released_for_downstream !== true)
  ) {
    issues.push("REVIEW_RECONCILIATION_METADATA_INVALID");
  }
  if (
    source &&
    (!Gate.outputUrl(source.output) ||
      source.output?.perceptual_validation?.passed !== true)
  ) {
    issues.push("SOURCE_OUTPUT_OR_VALIDATION_INVALID");
  }
  if (
    review &&
    (evaluated.passed !== true ||
      evaluated.score_contract?.complete !== true ||
      evaluated.evidence_policy?.conclusive_provider_verdict !== true ||
      list(evaluated.evidence?.failures).length !== 0 ||
      list(evaluated.evidence?.repair_instructions).length !== 0)
  ) {
    issues.push("REVIEW_RUNTIME_VALIDATION_INVALID");
  }
  if (
    source &&
    (text(marker.reconciliation_id) !==
      text(reconciliation.reconciliation_id) ||
      text(marker.source_task_id) !== text(source.id) ||
      text(marker.review_task_id) !== text(review?.id))
  ) {
    issues.push("SOURCE_OUTPUT_MARKER_INVALID");
  }
  if (
    review &&
    (text(reviewMarker.reconciliation_id) !==
      text(reconciliation.reconciliation_id) ||
      text(reviewMarker.source_task_id) !== text(source?.id) ||
      text(reviewMarker.review_task_id) !== text(review.id))
  ) {
    issues.push("REVIEW_OUTPUT_MARKER_INVALID");
  }

  return {
    execution_node_id: text(pair.execution_node_id),
    source_task_id: source?.id || null,
    review_task_id: review?.id || null,
    source_status: source?.status || null,
    review_status: review?.status || null,
    runtime_passed: evaluated.passed === true,
    conclusive_provider_verdict:
      evaluated.evidence_policy?.conclusive_provider_verdict === true,
    issues,
    recovered: issues.length === 0,
  };
});

const rejectedPairs = list(design.rejected_containment).map((item) => {
  const source = taskMap.get(text(item.source_task_id));
  const review = taskMap.get(text(item.review_task_id));
  const evaluated = review ? Gate.validation(review) : {};
  const issues = [];

  if (!source) issues.push("SOURCE_MISSING");
  if (!review) issues.push("REVIEW_MISSING");
  if (source && text(source.status) !== "FAILED") {
    issues.push(`SOURCE_STATUS_INVALID:${source.status}`);
  }
  if (review && text(review.status) !== "FAILED") {
    issues.push(`REVIEW_STATUS_INVALID:${review.status}`);
  }
  if (source && text(source.error) !== FAILURE) {
    issues.push("SOURCE_FAILURE_REASON_CHANGED");
  }
  if (review && text(review.error) !== FAILURE) {
    issues.push("REVIEW_FAILURE_REASON_CHANGED");
  }
  if (review && evaluated.passed === true) {
    issues.push("REJECTED_REVIEW_NOW_PASSES");
  }
  if (review && text(review.metadata?.contract) !== REVIEW_CONTRACT) {
    issues.push("REVIEW_CONTRACT_CHANGED");
  }
  if (review && sourceTaskId(review) !== text(source?.id)) {
    issues.push("PAIR_LINK_CHANGED");
  }
  if (
    source?.metadata?.targeted_perceptual_reconciliation === true ||
    review?.metadata?.targeted_perceptual_reconciliation === true
  ) {
    issues.push("REJECTED_PAIR_WAS_RECONCILED");
  }

  return {
    execution_node_id: text(item.execution_node_id),
    source_task_id: source?.id || null,
    review_task_id: review?.id || null,
    source_status: source?.status || null,
    review_status: review?.status || null,
    runtime_passed: evaluated.passed === true,
    failed_checks: Object.entries(object(evaluated.checks))
      .filter(([, passed]) => passed !== true)
      .map(([key]) => key),
    failure_count: list(evaluated.evidence?.failures).length,
    repair_instruction_count: list(
      evaluated.evidence?.repair_instructions,
    ).length,
    issues,
    contained: issues.length === 0,
  };
});

if (recoveredPairs.some((pair) => !pair.recovered)) {
  blockers.push("ONE_OR_MORE_RECOVERED_PAIRS_INVALID");
}
if (rejectedPairs.some((pair) => !pair.contained)) {
  blockers.push("ONE_OR_MORE_REJECTED_PAIRS_NOT_CONTAINED");
}

const completedCheckpointIds = new Set(
  list(checkpoint.completed_pairs).flatMap((item) => [
    text(item.source_task_id),
    text(item.review_task_id),
  ]),
);
requireValue(
  completedCheckpointIds.size === 8 &&
    [...targetIds].every((id) => completedCheckpointIds.has(id)),
  "CHECKPOINT_COMPLETED_PAIR_SET_MISMATCH",
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

const recoveredCount = recoveredPairs.filter((pair) => pair.recovered).length;
const containedCount = rejectedPairs.filter((pair) => pair.contained).length;
const finalisationEligible = containedCount === 0;
const decision = blockers.length
  ? "POST_RECONCILIATION_AUDIT_BLOCKED"
  : "POST_RECONCILIATION_4_RECOVERED_9_REJECTED_CONFIRMED";
const readiness = blockers.length
  ? "POST_RECONCILIATION_AUDIT_BLOCKED"
  : "READY_FOR_REJECTED_MEDIA_REPAIR_PLANNING";
const instruction = blockers.length
  ? "Resolve every post-reconciliation audit blocker before any further production action."
  : "Keep finalisation and publication locked. Design a read-only repair plan for the nine genuine perceptual failures using their failed checks, provider failures and repair instructions. Do not regenerate the four recovered sources.";

const report = {
  contract: "CHURCHILL_OPENAI_PERCEPTUAL_POST_RECONCILIATION_AUDIT_V1",
  generated_at: new Date().toISOString(),
  organization_id: organizationId,
  creative_project_id: projectId,
  production_graph_id: graphId,
  design_file: designFile.absolute,
  design_file_sha256: designFile.file_sha256,
  reconciliation_file: reconciliationFile.absolute,
  reconciliation_file_sha256: reconciliationFile.file_sha256,
  checkpoint_file: checkpointFile.absolute,
  checkpoint_file_sha256: checkpointFile.file_sha256,
  reconciliation_id: text(reconciliation.reconciliation_id),
  task_count: before.task_count,
  task_status_counts: before.task_status_counts,
  recovered_pair_count: recoveredCount,
  rejected_pair_count: containedCount,
  recovered_pairs: recoveredPairs,
  rejected_pairs: rejectedPairs,
  non_target_state_sha256: liveNonTargetSha,
  expected_non_target_state_sha256:
    reconciliation.after?.non_target_state_sha256 || null,
  finalisation_eligible: finalisationEligible,
  finalisation_blocked_by_rejected_reviews: containedCount > 0,
  source_regeneration_scope: {
    recovered_sources_locked_from_regeneration: recoveredCount,
    rejected_sources_require_repair_planning: containedCount,
  },
  blockers,
  decision,
  instruction,
  exact_state_before: {
    task_count: before.task_count,
    task_state_sha256: before.task_state_sha256,
    usage_count: before.usage_count,
    wallet_balance: before.wallet_balance,
    wallet_updated_at: before.wallet_updated_at,
  },
  exact_state_after: {
    task_count: after.task_count,
    task_state_sha256: after.task_state_sha256,
    usage_count: after.usage_count,
    wallet_balance: after.wallet_balance,
    wallet_updated_at: after.wallet_updated_at,
  },
  audit_state_unchanged: auditStateUnchanged,
  database_writes_executed: false,
  provider_calls_executed: false,
  provider_polls_executed: false,
  retries_executed: false,
  source_regeneration_executed: false,
  downstream_tasks_updated: 0,
  finalisation_executed: false,
  publication_executed: false,
  readiness,
};

fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log("============================================================");
console.log("READ-ONLY OPENAI PERCEPTUAL POST-RECONCILIATION AUDIT");
console.log("============================================================");
console.log(`OUTPUT=${outputPath}`);
console.log(`TASK_COUNT=${before.task_count}`);
console.log(`TASK_STATUS_COUNTS=${JSON.stringify(before.task_status_counts)}`);
console.log(`RECOVERED_PAIR_COUNT=${recoveredCount}`);
console.log(`REJECTED_PAIR_COUNT=${containedCount}`);

for (const pair of recoveredPairs) {
  console.log([
    `RECOVERED_PAIR=${pair.execution_node_id}`,
    `source=${pair.source_task_id || ""}`,
    `review=${pair.review_task_id || ""}`,
    `source_status=${pair.source_status || ""}`,
    `review_status=${pair.review_status || ""}`,
    `runtime_passed=${pair.runtime_passed ? "YES" : "NO"}`,
    `conclusive=${pair.conclusive_provider_verdict ? "YES" : "NO"}`,
    `issues=${pair.issues.join(",")}`,
    `recovered=${pair.recovered ? "YES" : "NO"}`,
  ].join("|"));
}

for (const pair of rejectedPairs) {
  console.log([
    `REJECTED_PAIR=${pair.execution_node_id}`,
    `source=${pair.source_task_id || ""}`,
    `review=${pair.review_task_id || ""}`,
    `source_status=${pair.source_status || ""}`,
    `review_status=${pair.review_status || ""}`,
    `runtime_passed=${pair.runtime_passed ? "YES" : "NO"}`,
    `failed_checks=${pair.failed_checks.join(",")}`,
    `failures=${pair.failure_count}`,
    `repairs=${pair.repair_instruction_count}`,
    `issues=${pair.issues.join(",")}`,
    `contained=${pair.contained ? "YES" : "NO"}`,
  ].join("|"));
}

console.log(
  `NON_TARGET_STATE_SHA256_EXPECTED=${text(
    reconciliation.after?.non_target_state_sha256,
  )}`,
);
console.log(`NON_TARGET_STATE_SHA256_LIVE=${liveNonTargetSha}`);
console.log(
  `CHECKPOINT_FINAL_TASK_STATE_SHA256=${text(
    checkpoint.final_task_state_sha256,
  )}`,
);
console.log(`LIVE_TASK_STATE_SHA256=${before.task_state_sha256}`);
console.log(`USAGE_COUNT=${before.usage_count}`);
console.log(`WALLET_BALANCE=${before.wallet_balance}`);
console.log(
  `FINALISATION_ELIGIBLE=${finalisationEligible ? "YES" : "NO"}`,
);
console.log(
  `FINALISATION_BLOCKED_BY_REJECTED_REVIEWS=${
    containedCount > 0 ? "YES" : "NO"
  }`,
);
console.log(`POST_RECONCILIATION_BLOCKERS=${JSON.stringify(blockers)}`);
console.log(`POST_RECONCILIATION_DECISION=${decision}`);
console.log(`POST_RECONCILIATION_INSTRUCTION=${instruction}`);
console.log(
  `AUDIT_STATE_UNCHANGED=${auditStateUnchanged ? "YES" : "NO"}`,
);
console.log(`AUDIT_READINESS=${readiness}`);
console.log("DATABASE_WRITES_EXECUTED=NO");
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
