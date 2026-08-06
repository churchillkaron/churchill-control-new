#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv({ cwd: process.cwd() });
await import("./creative-runtime-bootstrap.mjs");

const CONTRACT = "GENERATED_MEDIA_PERCEPTUAL_REVIEW_V1";
const FAILURE = "GENERATED_MEDIA_PERCEPTUAL_VALIDATION_FAILED";
const EXPECTED_PASS_NODES = Object.freeze([
  "scene-001-shot-002:perceptual-review",
  "scene-004-shot-002:perceptual-review",
  "scene-005-shot-001:perceptual-review",
  "scene-007-shot-001:perceptual-review",
]);

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
    Object.keys(value).sort().map((key) => [key, stable(value[key])]),
  );
}

function sha256(value) {
  return crypto
    .createHash("sha256")
    .update(typeof value === "string" ? value : JSON.stringify(stable(value)))
    .digest("hex");
}

function statusCounts(tasks = []) {
  return list(tasks).reduce((counts, task) => {
    const status = text(task.status) || "UNKNOWN";
    counts[status] = Number(counts[status] || 0) + 1;
    return counts;
  }, {});
}

function executionNodeId(task = {}) {
  return text(task.metadata?.execution_node_id || task.input?.node_id);
}

function sourceTaskId(review = {}) {
  return text(
    review.metadata?.source_generation_task_id ||
      review.input?.provider_parameters?.source_generation_task_id,
  );
}

function taskFingerprint(tasks = []) {
  return sha256(
    [...tasks]
      .sort((left, right) => text(left.id).localeCompare(text(right.id)))
      .map((task) => ({
        id: task.id,
        status: task.status,
        error: task.error || null,
        depends_on: task.depends_on || [],
        review: task.review || {},
        metadata: task.metadata || {},
        output: task.output || {},
        timing: task.timing || {},
        updated_at: task.updated_at || null,
      })),
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

const organizationId = text(process.env.ORGANIZATION_ID);
const projectId = text(process.env.CREATIVE_PROJECT_ID);
const graphId = text(process.env.PRODUCTION_GRAPH_ID);
const outputPath = path.resolve(
  text(process.env.OPENAI_PERCEPTUAL_RECONCILIATION_DESIGN_OUTPUT) ||
    "/tmp/churchill-openai-perceptual-reconciliation-design.json",
);

if (!organizationId || !projectId || !graphId) {
  throw new Error("OPENAI_PERCEPTUAL_RECONCILIATION_DESIGN_SCOPE_REQUIRED");
}

const { supabaseAdmin } = await import("@/lib/shared/supabase/admin");
const { ProductionTaskRuntime } = await import(
  "@/lib/operations/tasks/runtime/ProductionTaskRuntime"
);
const { CreativeGeneratedMediaPerceptualExecutionGate } = await import(
  "@/lib/creative/quality/runtime/CreativeGeneratedMediaPerceptualExecutionGate"
);

const before = await exactState({
  supabaseAdmin,
  ProductionTaskRuntime,
  organizationId,
  projectId,
  graphId,
});
const tasks = before.tasks;
const taskMap = new Map(tasks.map((task) => [task.id, task]));
const reviews = tasks.filter(
  (task) =>
    text(task.metadata?.contract) === CONTRACT &&
    text(task.provider_id).toLowerCase() === "openai" &&
    text(task.capability || task.service_code).toLowerCase() ===
      "ai.image.analyze",
);

if (tasks.length !== 27) {
  throw new Error(
    `OPENAI_PERCEPTUAL_RECONCILIATION_DESIGN_TASK_COUNT_INVALID:${tasks.length}`,
  );
}
if (reviews.length !== 13) {
  throw new Error(
    `OPENAI_PERCEPTUAL_RECONCILIATION_DESIGN_REVIEW_COUNT_INVALID:${reviews.length}`,
  );
}

const evaluatedReviews = reviews.map((review) => ({
  review,
  evaluated: CreativeGeneratedMediaPerceptualExecutionGate.validation(review),
}));
const passing = evaluatedReviews.filter(
  ({ evaluated }) => evaluated.passed === true,
);
const rejected = evaluatedReviews.filter(
  ({ evaluated }) => evaluated.passed !== true,
);
const passNodeIds = passing
  .map(({ review }) => executionNodeId(review))
  .sort();
const rejectedNodeIds = rejected
  .map(({ review }) => executionNodeId(review))
  .sort();
const expectedPassNodeIds = [...EXPECTED_PASS_NODES].sort();
const passSetMatches =
  JSON.stringify(passNodeIds) === JSON.stringify(expectedPassNodeIds);

const blockers = [];
if (passing.length !== 4) blockers.push(`RUNTIME_PASS_COUNT_INVALID:${passing.length}`);
if (rejected.length !== 9) blockers.push(`RUNTIME_FAIL_COUNT_INVALID:${rejected.length}`);
if (!passSetMatches) blockers.push("RUNTIME_PASS_SET_MISMATCH");

const pairs = passing.map(({ review, evaluated }) => {
  const sourceId = sourceTaskId(review);
  const source = sourceId ? taskMap.get(sourceId) : null;
  const directDependents = tasks
    .filter((task) => list(task.depends_on).includes(review.id))
    .map((task) => ({
      id: task.id,
      execution_node_id: executionNodeId(task),
      status: task.status,
      error: task.error || null,
    }));
  const sourceDependents = source
    ? tasks
        .filter((task) => list(task.depends_on).includes(source.id))
        .map((task) => ({
          id: task.id,
          execution_node_id: executionNodeId(task),
          status: task.status,
          error: task.error || null,
        }))
    : [];
  const pairBlockers = [];

  if (!sourceId) pairBlockers.push("SOURCE_TASK_ID_MISSING");
  if (!source) pairBlockers.push("SOURCE_TASK_NOT_FOUND");
  if (text(review.status) !== "FAILED") {
    pairBlockers.push(`REVIEW_STATUS_INVALID:${review.status}`);
  }
  if (text(review.error) !== FAILURE) {
    pairBlockers.push(`REVIEW_ERROR_INVALID:${review.error || "MISSING"}`);
  }
  if (source && text(source.status) !== "FAILED") {
    pairBlockers.push(`SOURCE_STATUS_INVALID:${source.status}`);
  }
  if (source && text(source.error) !== FAILURE) {
    pairBlockers.push(`SOURCE_ERROR_INVALID:${source.error || "MISSING"}`);
  }
  if (
    source &&
    text(source.metadata?.perceptual_review_task_id) !== text(review.id)
  ) {
    pairBlockers.push("SOURCE_REVIEW_LINK_MISMATCH");
  }
  if (!source || !CreativeGeneratedMediaPerceptualExecutionGate.outputUrl(source.output)) {
    pairBlockers.push("SOURCE_OUTPUT_URL_MISSING");
  }
  if (evaluated.score_contract?.complete !== true) {
    pairBlockers.push("SCORE_CONTRACT_INCOMPLETE");
  }
  if (evaluated.evidence_policy?.conclusive_provider_verdict !== true) {
    pairBlockers.push("PROVIDER_VERDICT_NOT_CONCLUSIVE");
  }
  if (list(evaluated.evidence?.failures).length !== 0) {
    pairBlockers.push("PROVIDER_FAILURES_NOT_EMPTY");
  }
  if (list(evaluated.evidence?.repair_instructions).length !== 0) {
    pairBlockers.push("PROVIDER_REPAIRS_NOT_EMPTY");
  }
  if (
    directDependents.some((task) =>
      ["RUNNING", "COMPLETED", "REVIEW"].includes(text(task.status)),
    )
  ) {
    pairBlockers.push("REVIEW_DEPENDENT_ALREADY_ACTIVE_OR_COMPLETED");
  }

  return {
    execution_node_id: executionNodeId(review),
    review_task_id: review.id,
    source_task_id: sourceId || null,
    review_before: {
      status: review.status,
      error: review.error || null,
      review_required: review.review?.required === true,
      review_approved: review.review?.approved === true,
      task_sha256: sha256({
        id: review.id,
        status: review.status,
        error: review.error || null,
        review: review.review || {},
        metadata: review.metadata || {},
        output: review.output || {},
        timing: review.timing || {},
        updated_at: review.updated_at || null,
      }),
    },
    source_before: source
      ? {
          status: source.status,
          error: source.error || null,
          output_url_present: Boolean(
            CreativeGeneratedMediaPerceptualExecutionGate.outputUrl(source.output),
          ),
          task_sha256: sha256({
            id: source.id,
            status: source.status,
            error: source.error || null,
            review: source.review || {},
            metadata: source.metadata || {},
            output: source.output || {},
            timing: source.timing || {},
            updated_at: source.updated_at || null,
          }),
        }
      : null,
    runtime_validation: {
      passed: evaluated.passed === true,
      score_contract_complete: evaluated.score_contract?.complete === true,
      conclusive_provider_verdict:
        evaluated.evidence_policy?.conclusive_provider_verdict === true,
      failure_count: list(evaluated.evidence?.failures).length,
      repair_instruction_count: list(
        evaluated.evidence?.repair_instructions,
      ).length,
    },
    direct_review_dependents: directDependents,
    direct_source_dependents: sourceDependents,
    reconciliation_order: ["SOURCE", "REVIEW"],
    proposed_source_transition: {
      status: "FAILED -> COMPLETED",
      error: `${FAILURE} -> null`,
      preserve_provider_output: true,
      replace_perceptual_validation_with_current_runtime_result: true,
      clear_failure_metadata: [
        "perceptual_validation_failed",
        "rejected_before_editing",
      ],
      set_metadata: {
        automated_perceptual_validation_passed: true,
        approved_for_downstream_after_perceptual_review: true,
        targeted_perceptual_reconciliation: true,
      },
    },
    proposed_review_transition: {
      status: "FAILED -> COMPLETED",
      error: `${FAILURE} -> null`,
      preserve_provider_output: true,
      replace_perceptual_validation_with_current_runtime_result: true,
      review_required: false,
      review_approved: true,
      approved_by: "AVANTIQO_AUTOMATED_PERCEPTUAL_GATE",
      set_metadata: {
        automated_perceptual_validation_passed: true,
        generated_media_released_for_downstream: true,
        targeted_perceptual_reconciliation: true,
      },
    },
    pair_blockers: pairBlockers,
    ready: pairBlockers.length === 0,
  };
});

const rejectedContainment = rejected.map(({ review, evaluated }) => ({
  execution_node_id: executionNodeId(review),
  review_task_id: review.id,
  source_task_id: sourceTaskId(review) || null,
  status: review.status,
  error: review.error || null,
  runtime_passed: evaluated.passed === true,
  remains_untouched: true,
}));

if (pairs.some((pair) => !pair.ready)) {
  blockers.push("ONE_OR_MORE_PASS_PAIRS_NOT_READY");
}
if (
  rejectedContainment.some(
    (item) =>
      text(item.status) !== "FAILED" ||
      text(item.error) !== FAILURE ||
      item.runtime_passed === true,
  )
) {
  blockers.push("REJECTED_REVIEW_CONTAINMENT_INVALID");
}

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

if (!stateUnchanged) blockers.push("READ_ONLY_STATE_CHANGED");

const decision = blockers.length
  ? "TARGETED_RECONCILIATION_DESIGN_BLOCKED"
  : "TARGETED_RECONCILIATION_PLAN_4_PAIRS_CONFIRMED";
const readiness = blockers.length
  ? "DESIGN_BLOCKED"
  : "READY_FOR_EXPLICIT_RECONCILIATION_SCRIPT";
const repairInstruction = blockers.length
  ? "Resolve every listed blocker before creating or executing a reconciliation script."
  : "Create an idempotent reconciliation script with exact task-hash preconditions. Update each proven pair source-first and review-second, verify the four completed pairs and nine untouched failed pairs, and execute no provider calls, retries, regeneration, finalisation or publication.";

const report = {
  contract: "CHURCHILL_OPENAI_PERCEPTUAL_TARGETED_RECONCILIATION_DESIGN_V1",
  generated_at: new Date().toISOString(),
  organization_id: organizationId,
  creative_project_id: projectId,
  production_graph_id: graphId,
  task_count: tasks.length,
  review_task_count: reviews.length,
  runtime_pass_count: passing.length,
  runtime_fail_count: rejected.length,
  pass_node_ids: passNodeIds,
  rejected_node_ids: rejectedNodeIds,
  expected_pass_node_ids: expectedPassNodeIds,
  pass_set_matches: passSetMatches,
  planned_pair_count: pairs.length,
  rejected_pair_count: rejectedContainment.length,
  pairs,
  rejected_containment: rejectedContainment,
  reconciliation_scope: {
    update_source_tasks: 4,
    update_review_tasks: 4,
    update_downstream_tasks: 0,
    provider_calls: 0,
    provider_polls: 0,
    retries: 0,
    source_regeneration: 0,
    finalisation: 0,
    publication: 0,
  },
  execution_invariants: {
    source_first_review_second: true,
    exact_task_hash_preconditions_required: true,
    idempotent_partial_run_recovery_required: true,
    rejected_pairs_must_remain_failed: true,
    downstream_tasks_must_not_be_mutated: true,
  },
  blockers,
  decision,
  repair_instruction: repairInstruction,
  exact_state_before: {
    task_count: before.task_count,
    task_status_counts: before.task_status_counts,
    task_state_sha256: before.task_state_sha256,
    usage_count: before.usage_count,
    wallet_balance: before.wallet_balance,
    wallet_currency: before.wallet_currency,
    wallet_updated_at: before.wallet_updated_at,
  },
  exact_state_after: {
    task_count: after.task_count,
    task_status_counts: after.task_status_counts,
    task_state_sha256: after.task_state_sha256,
    usage_count: after.usage_count,
    wallet_balance: after.wallet_balance,
    wallet_currency: after.wallet_currency,
    wallet_updated_at: after.wallet_updated_at,
  },
  state_unchanged: stateUnchanged,
  database_writes_executed: false,
  provider_calls_executed: false,
  provider_polls_executed: false,
  retries_executed: false,
  reconciliation_executed: false,
  source_regeneration_authorized: false,
  finalisation_authorized: false,
  publication_authorized: false,
  readiness,
};

fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log("============================================================");
console.log("READ-ONLY OPENAI PERCEPTUAL TARGETED RECONCILIATION DESIGN");
console.log("============================================================");
console.log(`OUTPUT=${outputPath}`);
console.log(`TASK_COUNT=${tasks.length}`);
console.log(`REVIEW_TASK_COUNT=${reviews.length}`);
console.log(`RUNTIME_PASS_COUNT=${passing.length}`);
console.log(`RUNTIME_FAIL_COUNT=${rejected.length}`);
console.log(`PASS_SET_MATCHES=${passSetMatches ? "YES" : "NO"}`);
console.log(`PLANNED_PAIR_COUNT=${pairs.length}`);
console.log(`REJECTED_PAIR_COUNT=${rejectedContainment.length}`);

for (const pair of pairs) {
  console.log([
    `RECONCILIATION_PAIR=${pair.execution_node_id}`,
    `source=${pair.source_task_id || ""}`,
    `review=${pair.review_task_id}`,
    `source_status=${pair.source_before?.status || ""}`,
    `review_status=${pair.review_before.status}`,
    `conclusive=${pair.runtime_validation.conclusive_provider_verdict ? "YES" : "NO"}`,
    `dependents=${pair.direct_review_dependents.length}`,
    `blockers=${pair.pair_blockers.join(",")}`,
    `ready=${pair.ready ? "YES" : "NO"}`,
  ].join("|"));
}

for (const item of rejectedContainment) {
  console.log([
    `REJECTED_CONTAINMENT=${item.execution_node_id}`,
    `source=${item.source_task_id || ""}`,
    `review=${item.review_task_id}`,
    `status=${item.status}`,
    `error=${item.error || ""}`,
    `untouched=${item.remains_untouched ? "YES" : "NO"}`,
  ].join("|"));
}

console.log(`RECONCILIATION_SCOPE=${JSON.stringify(report.reconciliation_scope)}`);
console.log(`RECONCILIATION_BLOCKERS=${JSON.stringify(blockers)}`);
console.log(`RECONCILIATION_DESIGN_DECISION=${decision}`);
console.log(`RECONCILIATION_DESIGN_REPAIR_INSTRUCTION=${repairInstruction}`);
console.log(`TASK_STATE_SHA256_BEFORE=${before.task_state_sha256}`);
console.log(`TASK_STATE_SHA256_AFTER=${after.task_state_sha256}`);
console.log(`TASK_COUNT_BEFORE=${before.task_count}`);
console.log(`TASK_COUNT_AFTER=${after.task_count}`);
console.log(`USAGE_COUNT_BEFORE=${before.usage_count}`);
console.log(`USAGE_COUNT_AFTER=${after.usage_count}`);
console.log(`WALLET_BALANCE_BEFORE=${before.wallet_balance}`);
console.log(`WALLET_BALANCE_AFTER=${after.wallet_balance}`);
console.log(`STATE_UNCHANGED=${stateUnchanged ? "YES" : "NO"}`);
console.log(`AUDIT_READINESS=${readiness}`);
console.log("DATABASE_WRITES_EXECUTED=NO");
console.log("PROVIDER_CALLS_EXECUTED=NO");
console.log("PROVIDER_POLLS_EXECUTED=NO");
console.log("RETRIES_EXECUTED=NO");
console.log("RECONCILIATION_EXECUTED=NO");
console.log("SOURCE_REGENERATION_AUTHORIZED=NO");
console.log("FINALISATION_AUTHORIZED=NO");
console.log("PUBLICATION_AUTHORIZED=NO");
console.log("TERMINAL_REMAINS_OPEN=YES");

if (blockers.length || !stateUnchanged) {
  process.exitCode = 2;
}
