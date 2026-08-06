#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv({ cwd: process.cwd() });
await import("./creative-runtime-bootstrap.mjs");

const AUDIT_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_POST_RECONCILIATION_AUDIT_V1";
const REVIEW_CONTRACT = "GENERATED_MEDIA_PERCEPTUAL_REVIEW_V1";
const FAILURE = "GENERATED_MEDIA_PERCEPTUAL_VALIDATION_FAILED";
const SCORE_FIELDS = Object.freeze({
  overall: ["overall_score", "minimum_overall_score"],
  story: ["story_score", "minimum_story_score"],
  environment: ["environment_score", "minimum_environment_score"],
  camera: ["camera_score", "minimum_camera_score"],
  anatomy: ["anatomy_score", "minimum_anatomy_score"],
  identity: ["identity_score", "minimum_identity_score"],
  product: ["product_fidelity_score", "minimum_product_fidelity_score"],
  music: ["music_energy_score", "minimum_music_energy_score"],
  performance: ["performance_score", "minimum_performance_score"],
  continuity: ["continuity_score", "minimum_continuity_score"],
  physics: ["physics_score", "minimum_physics_score"],
  artifacts: ["artifact_score", "minimum_artifact_score"],
});

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

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
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

function sourceTaskId(review = {}) {
  return text(
    review.metadata?.source_generation_task_id ||
      review.input?.provider_parameters?.source_generation_task_id,
  );
}

function executionNodeId(task = {}) {
  return text(task.metadata?.execution_node_id || task.input?.node_id);
}

function expectation(task = {}) {
  return object(
    task.input?.requirements?.expected_contract ||
      task.metadata?.requirements?.expected_contract,
  );
}

function thresholds(task = {}) {
  return {
    ...object(expectation(task).thresholds),
    ...object(task.input?.requirements?.thresholds),
    ...object(task.metadata?.thresholds),
  };
}

function providerTextItems(value = []) {
  return list(value).map((item) =>
    typeof item === "string" ? item : JSON.stringify(stable(item)),
  );
}

function focusAreas(failedChecks = []) {
  const failed = new Set(failedChecks);
  const areas = [];
  if (failed.has("identity")) areas.push("IDENTITY_LOCK");
  if (failed.has("product")) areas.push("PRODUCT_FIDELITY_LOCK");
  if (failed.has("story")) areas.push("STORY_EXECUTION");
  if (failed.has("environment")) areas.push("ENVIRONMENT_EXECUTION");
  if (failed.has("camera")) areas.push("CAMERA_EXECUTION");
  if (failed.has("continuity")) areas.push("TEMPORAL_CONTINUITY");
  if (failed.has("physics")) areas.push("PHYSICS_AND_MOTION");
  if (failed.has("anatomy")) areas.push("ANATOMY_AND_PERSON_FIDELITY");
  if (failed.has("performance")) areas.push("PERFORMANCE_EXECUTION");
  if (failed.has("music")) areas.push("MUSIC_ENERGY_TRANSLATION");
  if (failed.has("artifacts")) areas.push("ARTIFACT_SUPPRESSION");
  if (failed.has("overall")) areas.push("OVERALL_QUALITY");
  return areas;
}

function scoreAnalysis(review = {}, evaluated = {}) {
  const minimum = thresholds(review);
  const evidence = object(evaluated.evidence);
  return Object.fromEntries(
    Object.entries(SCORE_FIELDS).map(([check, [scoreKey, thresholdKey]]) => {
      const score = finite(evidence[scoreKey]);
      const threshold = finite(minimum[thresholdKey]);
      return [
        check,
        {
          score,
          threshold,
          delta:
            score === null || threshold === null
              ? null
              : Number((score - threshold).toFixed(6)),
          passed: evaluated.checks?.[check] === true,
        },
      ];
    }),
  );
}

function proposedStructuredRepair({
  source,
  review,
  evaluated,
  failedChecks,
  failures,
  instructions,
  repairIdentity,
  attempt,
}) {
  const expected = expectation(review);
  return {
    contract: "GENERATED_MEDIA_PERCEPTUAL_PAIR_REPAIR_PLAN_V1",
    repair_identity: repairIdentity,
    attempt,
    source_task_id: source.id,
    quality_task_id: review.id,
    source_execution_node_id: executionNodeId(source),
    quality_execution_node_id: executionNodeId(review),
    failed_checks: failedChecks,
    provider_failures: failures,
    repair_instructions: instructions,
    focus_areas: focusAreas(failedChecks),
    preserve_approved_direction: true,
    preserve_unfailed_requirements: true,
    change_only_failed_requirements: true,
    preserve_identity_evidence:
      Boolean(expected.identity_expected) || failedChecks.includes("identity"),
    preserve_product_evidence:
      Boolean(expected.product_expected) || failedChecks.includes("product"),
    preserve_source_assets: true,
    preserve_timing_and_story_contract: true,
    promptless_source_of_truth: true,
    provider_transport_prompt_may_be_derived_only_at_final_boundary: true,
    prior_validation_contract: {
      score_contract_complete: evaluated.score_contract?.complete === true,
      analyzed_image_count: finite(evaluated.evidence?.analyzed_image_count),
      runtime_passed: evaluated.passed === true,
    },
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
    task_state_sha256: taskFingerprint(scopedTasks),
    usage_count: Number(usage.count || 0),
    wallet_balance: money(wallet.data?.available_balance),
    wallet_currency: text(wallet.data?.currency) || "THB",
    wallet_updated_at: wallet.data?.updated_at || null,
  };
}

const auditFile = readJson(process.argv[2], "POST_RECONCILIATION_AUDIT");
const audit = object(auditFile.value);

const organizationId = text(process.env.ORGANIZATION_ID);
const projectId = text(process.env.CREATIVE_PROJECT_ID);
const graphId = text(process.env.PRODUCTION_GRAPH_ID);
const outputPath = path.resolve(
  text(process.env.OPENAI_PERCEPTUAL_REJECTED_REPAIR_PLAN_OUTPUT) ||
    "/tmp/churchill-openai-perceptual-rejected-repair-plan.json",
);

if (!organizationId || !projectId || !graphId) {
  throw new Error("REJECTED_MEDIA_REPAIR_PLAN_SCOPE_REQUIRED");
}

const [
  { supabaseAdmin },
  { ProductionTaskRuntime },
  CreativeProjectRepository,
  {
    CreativeGeneratedMediaPerceptualExecutionGate: Gate,
  },
  {
    repairPolicy,
    repairAttempt,
    repairIdentity,
  },
] = await Promise.all([
  import("@/lib/shared/supabase/admin"),
  import("@/lib/operations/tasks/runtime/ProductionTaskRuntime"),
  import("@/lib/creative/projects/repositories/CreativeProjectRepository"),
  import(
    "@/lib/creative/quality/runtime/CreativeGeneratedMediaPerceptualExecutionGate"
  ),
  import("@/lib/creative/quality/runtime/CreativeRepairContractRuntime"),
]);

const project = await CreativeProjectRepository.getById(projectId);
if (!project || text(project.organization_id) !== organizationId) {
  throw new Error("REJECTED_MEDIA_REPAIR_PLAN_PROJECT_NOT_FOUND");
}
const policy = repairPolicy(project);

const directorPath = path.resolve(
  "lib/creative/quality/runtime/CreativeAutonomousRepairDirectorRuntime.js",
);
const directorSource = fs.readFileSync(directorPath, "utf8");
const directorCompatibility = {
  file: directorPath,
  file_sha256: sha256(directorSource),
  quality_failure_requires_completed_status:
    directorSource.includes(
      'task.status === "COMPLETED" && isQualityTask(task)',
    ),
  failed_non_quality_task_is_provider_failure:
    directorSource.includes(
      'task.status === "FAILED" && !isQualityTask(task)',
    ),
  repair_review_created_only_for_quality_branch:
    directorSource.includes("if (quality) {") &&
    directorSource.includes("createRepairReview"),
  stores_prompt_in_replacement:
    directorSource.includes("prompt: [") &&
    directorSource.includes("REPAIR ONLY THE FAILED REQUIREMENTS BELOW"),
};
directorCompatibility.safe_for_failed_perceptual_pairs = !(
  directorCompatibility.quality_failure_requires_completed_status &&
  directorCompatibility.failed_non_quality_task_is_provider_failure &&
  directorCompatibility.repair_review_created_only_for_quality_branch
);

directorCompatibility.blocking_reasons =
  directorCompatibility.safe_for_failed_perceptual_pairs
    ? []
    : [
        "FAILED_PERCEPTUAL_REVIEW_IS_NOT_CLASSIFIED_AS_A_QUALITY_FAILURE",
        "FAILED_GENERATED_SOURCE_WOULD_BE_CLASSIFIED_AS_GENERIC_PROVIDER_FAILURE",
        "GENERIC_PROVIDER_FAILURE_PATH_DOES_NOT_CREATE_A_REPLACEMENT_PERCEPTUAL_REVIEW",
        "PAIR_LEVEL_FAILURE_EVIDENCE_WOULD_NOT_BE_BOUND_TO_THE_REPLACEMENT_SOURCE",
      ];
if (directorCompatibility.stores_prompt_in_replacement) {
  directorCompatibility.blocking_reasons.push(
    "CURRENT_GENERIC_REPAIR_PATH_STORES_A_GENERATION_PROMPT_INSTEAD_OF_USING_A_STRUCTURED_PROMPTLESS_REPAIR_SPECIFICATION",
  );
}

const blockers = [];
const requireValue = (condition, label) => {
  if (!condition) blockers.push(label);
};

requireValue(
  text(audit.contract) === AUDIT_CONTRACT,
  "POST_RECONCILIATION_AUDIT_CONTRACT_INVALID",
);
requireValue(
  text(audit.organization_id) === organizationId &&
    text(audit.creative_project_id) === projectId &&
    text(audit.production_graph_id) === graphId,
  "POST_RECONCILIATION_AUDIT_SCOPE_INVALID",
);
requireValue(
  text(audit.decision) ===
    "POST_RECONCILIATION_4_RECOVERED_9_REJECTED_CONFIRMED" &&
    text(audit.readiness) === "READY_FOR_REJECTED_MEDIA_REPAIR_PLANNING",
  "POST_RECONCILIATION_AUDIT_NOT_READY",
);
requireValue(
  audit.audit_state_unchanged === true && list(audit.blockers).length === 0,
  "POST_RECONCILIATION_AUDIT_NOT_CLEAN",
);
requireValue(
  Number(audit.recovered_pair_count) === 4 &&
    Number(audit.rejected_pair_count) === 9,
  "POST_RECONCILIATION_PAIR_COUNTS_INVALID",
);
requireValue(
  audit.finalisation_eligible === false &&
    audit.finalisation_blocked_by_rejected_reviews === true,
  "FINALISATION_LOCK_INVALID",
);
requireValue(
  directorCompatibility.safe_for_failed_perceptual_pairs === false,
  "EXISTING_REPAIR_DIRECTOR_COMPATIBILITY_ASSUMPTION_CHANGED",
);

const before = await exactState({
  supabaseAdmin,
  ProductionTaskRuntime,
  organizationId,
  projectId,
  graphId,
});
const taskMap = new Map(before.tasks.map((task) => [task.id, task]));

requireValue(before.task_count === 27, "LIVE_TASK_COUNT_INVALID");
requireValue(
  before.task_state_sha256 ===
    text(audit.exact_state_before?.task_state_sha256),
  "LIVE_TASK_STATE_NO_LONGER_MATCHES_POST_RECONCILIATION_AUDIT",
);
requireValue(
  before.usage_count === Number(audit.exact_state_before?.usage_count) &&
    before.wallet_balance === money(audit.exact_state_before?.wallet_balance) &&
    before.wallet_updated_at === audit.exact_state_before?.wallet_updated_at,
  "LIVE_ACCOUNTING_STATE_NO_LONGER_MATCHES_POST_RECONCILIATION_AUDIT",
);

const recoveredIds = new Set(
  list(audit.recovered_pairs).flatMap((item) => [
    text(item.source_task_id),
    text(item.review_task_id),
  ]),
);
const rejectedIds = new Set(
  list(audit.rejected_pairs).flatMap((item) => [
    text(item.source_task_id),
    text(item.review_task_id),
  ]),
);
requireValue(
  recoveredIds.size === 8 && rejectedIds.size === 18,
  "PAIR_ID_SETS_INVALID",
);
requireValue(
  [...recoveredIds].every((id) => !rejectedIds.has(id)),
  "RECOVERED_AND_REJECTED_ID_SETS_OVERLAP",
);

const repairPlans = list(audit.rejected_pairs).map((auditPair) => {
  const source = taskMap.get(text(auditPair.source_task_id));
  const review = taskMap.get(text(auditPair.review_task_id));
  const evaluated = review ? Gate.validation(review) : {};
  const failures = providerTextItems(evaluated.evidence?.failures);
  const instructions = providerTextItems(
    evaluated.evidence?.repair_instructions,
  );
  const failedChecks = Object.entries(object(evaluated.checks))
    .filter(([key, passed]) =>
      !["score_contract", "frame_evidence"].includes(key) && passed !== true,
    )
    .map(([key]) => key);
  const attempt = source ? repairAttempt(source) + 1 : null;
  const identity =
    source && review && attempt !== null
      ? repairIdentity({
          source_task_id: source.id,
          quality_task_id: review.id,
          attempt,
          failures,
          instructions,
        })
      : null;
  const directReviewDependents = review
    ? before.tasks
        .filter((task) => list(task.depends_on).includes(review.id))
        .map((task) => ({
          id: task.id,
          execution_node_id: executionNodeId(task),
          status: task.status,
          error: task.error || null,
        }))
    : [];
  const directSourceDependents = source
    ? before.tasks
        .filter((task) => list(task.depends_on).includes(source.id))
        .map((task) => ({
          id: task.id,
          execution_node_id: executionNodeId(task),
          status: task.status,
          error: task.error || null,
        }))
    : [];
  const pairBlockers = [];

  if (!source) pairBlockers.push("SOURCE_TASK_MISSING");
  if (!review) pairBlockers.push("REVIEW_TASK_MISSING");
  if (source && text(source.status) !== "FAILED") {
    pairBlockers.push(`SOURCE_STATUS_INVALID:${source.status}`);
  }
  if (review && text(review.status) !== "FAILED") {
    pairBlockers.push(`REVIEW_STATUS_INVALID:${review.status}`);
  }
  if (source && text(source.error) !== FAILURE) {
    pairBlockers.push("SOURCE_FAILURE_REASON_INVALID");
  }
  if (review && text(review.error) !== FAILURE) {
    pairBlockers.push("REVIEW_FAILURE_REASON_INVALID");
  }
  if (review && text(review.metadata?.contract) !== REVIEW_CONTRACT) {
    pairBlockers.push("REVIEW_CONTRACT_INVALID");
  }
  if (source && review && sourceTaskId(review) !== text(source.id)) {
    pairBlockers.push("SOURCE_REVIEW_LINK_INVALID");
  }
  if (review && evaluated.passed === true) {
    pairBlockers.push("REJECTED_REVIEW_NOW_PASSES");
  }
  if (evaluated.score_contract?.complete !== true) {
    pairBlockers.push("SCORE_CONTRACT_INCOMPLETE");
  }
  if (!failures.length && !instructions.length && !failedChecks.length) {
    pairBlockers.push("BOUNDED_REPAIR_EVIDENCE_MISSING");
  }
  if (
    directReviewDependents.some((task) =>
      ["RUNNING", "COMPLETED", "REVIEW"].includes(text(task.status)),
    )
  ) {
    pairBlockers.push("DOWNSTREAM_REVIEW_DEPENDENT_ALREADY_ACTIVE");
  }
  if (attempt !== null && attempt > Number(policy.max_attempts || 0)) {
    pairBlockers.push("REPAIR_ATTEMPT_LIMIT_REACHED");
  }
  if (
    source &&
    policy.preserve_approved_cost_ceiling &&
    Number(source.cost?.estimated || 0) > 0 &&
    source.cost?.approved !== true
  ) {
    pairBlockers.push("REPAIR_COST_APPROVAL_REQUIRED");
  }
  if (source && recoveredIds.has(source.id)) {
    pairBlockers.push("RECOVERED_SOURCE_INCLUDED_IN_REPAIR_SCOPE");
  }
  if (review && recoveredIds.has(review.id)) {
    pairBlockers.push("RECOVERED_REVIEW_INCLUDED_IN_REPAIR_SCOPE");
  }

  const structuredRepair =
    source && review
      ? proposedStructuredRepair({
          source,
          review,
          evaluated,
          failedChecks,
          failures,
          instructions,
          repairIdentity: identity,
          attempt,
        })
      : null;

  return {
    execution_node_id: text(auditPair.execution_node_id),
    source_task_id: source?.id || null,
    review_task_id: review?.id || null,
    source_execution_node_id: executionNodeId(source),
    source_capability: text(source?.capability || source?.service_code),
    source_provider_id: source?.provider_id || null,
    source_output_url_present: Boolean(source && Gate.outputUrl(source.output)),
    source_estimated_cost: money(source?.cost?.estimated),
    source_cost_approved: source?.cost?.approved === true,
    repair_attempt: attempt,
    repair_identity: identity,
    failed_checks: failedChecks,
    score_analysis: scoreAnalysis(review, evaluated),
    provider_failures: failures,
    provider_repair_instructions: instructions,
    focus_areas: focusAreas(failedChecks),
    repair_strategy: "CREATE_REPLACEMENT_SOURCE_AND_REPLACEMENT_PERCEPTUAL_REVIEW",
    replacement_source_status: "WAITING",
    replacement_review_status: "WAITING",
    replacement_review_depends_on_replacement_source: true,
    supersede_original_source_after_replacement_creation: true,
    supersede_original_review_after_replacement_review_creation: true,
    rewire_downstream_from_original_review_to_replacement_review: true,
    do_not_rewire_downstream_directly_to_replacement_source: true,
    direct_review_dependents: directReviewDependents,
    direct_source_dependents: directSourceDependents,
    structured_repair_specification: structuredRepair,
    provider_selection_authorized: false,
    dispatch_authorized: false,
    pair_blockers: pairBlockers,
    ready_for_pair_aware_runtime: pairBlockers.length === 0,
  };
});

if (repairPlans.length !== 9) blockers.push("REPAIR_PLAN_COUNT_INVALID");
if (repairPlans.some((plan) => !plan.ready_for_pair_aware_runtime)) {
  blockers.push("ONE_OR_MORE_REPAIR_PAIRS_BLOCKED");
}
if (
  repairPlans.some(
    (plan) =>
      recoveredIds.has(text(plan.source_task_id)) ||
      recoveredIds.has(text(plan.review_task_id)),
  )
) {
  blockers.push("RECOVERED_PAIRS_INCLUDED_IN_REPAIR_PLAN");
}

const plannedDownstreamRewires = repairPlans.reduce(
  (sum, plan) => sum + plan.direct_review_dependents.length,
  0,
);
const estimatedRepairCost = money(
  repairPlans.reduce(
    (sum, plan) => sum + Number(plan.source_estimated_cost || 0),
    0,
  ),
);
const failureCheckCounts = repairPlans.reduce((counts, plan) => {
  for (const check of plan.failed_checks) {
    counts[check] = Number(counts[check] || 0) + 1;
  }
  return counts;
}, {});
const focusAreaCounts = repairPlans.reduce((counts, plan) => {
  for (const area of plan.focus_areas) {
    counts[area] = Number(counts[area] || 0) + 1;
  }
  return counts;
}, {});

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
if (!stateUnchanged) blockers.push("READ_ONLY_REPAIR_PLAN_CHANGED_STATE");

const decision = blockers.length
  ? "REJECTED_MEDIA_REPAIR_PLAN_BLOCKED"
  : "PAIR_AWARE_REPAIR_PLAN_9_PAIRS_CONFIRMED";
const readiness = blockers.length
  ? "REPAIR_PLAN_BLOCKED"
  : "READY_FOR_PAIR_AWARE_REPAIR_RUNTIME_DESIGN";
const instruction = blockers.length
  ? "Resolve every repair-plan blocker before implementing or executing any repair workflow."
  : "Implement a dedicated pair-aware generated-media repair runtime. It must consume the structured repair specifications, create exactly nine replacement source tasks and nine replacement perceptual reviews, preserve the four recovered pairs, supersede and rewire only after successful task creation, default to dry-run, require explicit cost and execution authorization, and perform no finalisation or publication.";

const report = {
  contract: "CHURCHILL_OPENAI_PERCEPTUAL_REJECTED_MEDIA_REPAIR_PLAN_V1",
  generated_at: new Date().toISOString(),
  organization_id: organizationId,
  creative_project_id: projectId,
  production_graph_id: graphId,
  post_reconciliation_audit_file: auditFile.absolute,
  post_reconciliation_audit_file_sha256: auditFile.file_sha256,
  project_repair_policy: policy,
  existing_autonomous_repair_director: directorCompatibility,
  recovered_pair_count: 4,
  rejected_pair_count: repairPlans.length,
  recovered_source_regeneration_scope: 0,
  planned_replacement_source_tasks: repairPlans.length,
  planned_replacement_review_tasks: repairPlans.length,
  planned_downstream_rewires: plannedDownstreamRewires,
  estimated_repair_cost: estimatedRepairCost,
  estimated_repair_cost_currency:
    text(before.wallet_currency) || "THB",
  repair_cost_authorized: false,
  provider_selection_authorized: false,
  repair_dispatch_authorized: false,
  failure_check_counts: failureCheckCounts,
  focus_area_counts: focusAreaCounts,
  repair_plans: repairPlans,
  required_runtime_contract: {
    runtime: "GENERATED_MEDIA_PERCEPTUAL_PAIR_REPAIR_RUNTIME_V1",
    promptless_structured_specification: true,
    source_and_review_created_as_one_pair: true,
    source_created_before_review: true,
    original_source_superseded_after_replacement_source_creation: true,
    original_review_superseded_after_replacement_review_creation: true,
    downstream_rewired_from_original_review_to_replacement_review: true,
    replacement_review_uses_original_perceptual_contract: true,
    recovered_pairs_immutable: true,
    exact_live_task_hash_preconditions_required: true,
    idempotent_checkpoint_required: true,
    explicit_cost_authorization_required: true,
    explicit_execution_token_required: true,
    provider_calls_forbidden_in_preview: true,
    finalisation_forbidden: true,
    publication_forbidden: true,
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
  state_unchanged: stateUnchanged,
  database_writes_executed: false,
  provider_calls_executed: false,
  provider_polls_executed: false,
  retries_executed: false,
  replacement_tasks_created: 0,
  source_regeneration_executed: false,
  downstream_tasks_updated: 0,
  finalisation_executed: false,
  publication_executed: false,
  readiness,
};

fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log("============================================================");
console.log("READ-ONLY OPENAI PERCEPTUAL REJECTED-MEDIA REPAIR PLAN");
console.log("============================================================");
console.log(`OUTPUT=${outputPath}`);
console.log(`RECOVERED_PAIR_COUNT=${report.recovered_pair_count}`);
console.log(`REJECTED_PAIR_COUNT=${report.rejected_pair_count}`);
console.log(
  `RECOVERED_SOURCE_REGENERATION_SCOPE=${report.recovered_source_regeneration_scope}`,
);
console.log(
  `EXISTING_AUTONOMOUS_REPAIR_DIRECTOR_SAFE=${
    directorCompatibility.safe_for_failed_perceptual_pairs ? "YES" : "NO"
  }`,
);
console.log(
  `EXISTING_AUTONOMOUS_REPAIR_DIRECTOR_BLOCKERS=${JSON.stringify(
    directorCompatibility.blocking_reasons,
  )}`,
);
console.log(
  `PLANNED_REPLACEMENT_SOURCE_TASKS=${report.planned_replacement_source_tasks}`,
);
console.log(
  `PLANNED_REPLACEMENT_REVIEW_TASKS=${report.planned_replacement_review_tasks}`,
);
console.log(
  `PLANNED_DOWNSTREAM_REWIRES=${report.planned_downstream_rewires}`,
);
console.log(`ESTIMATED_REPAIR_COST=${report.estimated_repair_cost}`);
console.log(
  `ESTIMATED_REPAIR_COST_CURRENCY=${report.estimated_repair_cost_currency}`,
);
console.log(
  `FAILURE_CHECK_COUNTS=${JSON.stringify(report.failure_check_counts)}`,
);
console.log(`FOCUS_AREA_COUNTS=${JSON.stringify(report.focus_area_counts)}`);

for (const plan of repairPlans) {
  console.log([
    `REPAIR_PLAN=${plan.execution_node_id}`,
    `source=${plan.source_task_id || ""}`,
    `review=${plan.review_task_id || ""}`,
    `capability=${plan.source_capability}`,
    `provider=${plan.source_provider_id || ""}`,
    `attempt=${plan.repair_attempt ?? ""}`,
    `failed_checks=${plan.failed_checks.join(",")}`,
    `focus=${plan.focus_areas.join(",")}`,
    `failures=${plan.provider_failures.length}`,
    `repairs=${plan.provider_repair_instructions.length}`,
    `estimated_cost=${plan.source_estimated_cost}`,
    `review_dependents=${plan.direct_review_dependents.length}`,
    `blockers=${plan.pair_blockers.join(",")}`,
    `ready=${plan.ready_for_pair_aware_runtime ? "YES" : "NO"}`,
  ].join("|"));
}

console.log(`REPAIR_PLAN_BLOCKERS=${JSON.stringify(blockers)}`);
console.log(`REPAIR_PLAN_DECISION=${decision}`);
console.log(`REPAIR_PLAN_INSTRUCTION=${instruction}`);
console.log(`TASK_STATE_SHA256_BEFORE=${before.task_state_sha256}`);
console.log(`TASK_STATE_SHA256_AFTER=${after.task_state_sha256}`);
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
console.log("REPLACEMENT_TASKS_CREATED=0");
console.log("SOURCE_REGENERATION_EXECUTED=NO");
console.log("DOWNSTREAM_TASKS_UPDATED=0");
console.log("FINALISATION_EXECUTED=NO");
console.log("PUBLICATION_EXECUTED=NO");
console.log("TERMINAL_REMAINS_OPEN=YES");

if (blockers.length || !stateUnchanged) {
  process.exitCode = 2;
}
