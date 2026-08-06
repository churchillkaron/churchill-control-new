#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv({ cwd: process.cwd() });
await import("./creative-runtime-bootstrap.mjs");

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

function readJson(filePath, label) {
  const absolute = path.resolve(text(filePath));
  if (!absolute || !fs.existsSync(absolute)) {
    throw new Error(`${label}_NOT_FOUND:${absolute || "MISSING"}`);
  }
  return {
    absolute,
    value: JSON.parse(fs.readFileSync(absolute, "utf8")),
  };
}

const planFile = readJson(process.argv[2], "PAIR_REPAIR_PLAN");
const plan = object(planFile.value);

const organizationId = text(process.env.ORGANIZATION_ID);
const projectId = text(process.env.CREATIVE_PROJECT_ID);
const graphId = text(process.env.PRODUCTION_GRAPH_ID);
const outputPath = path.resolve(
  text(process.env.OPENAI_PERCEPTUAL_PAIR_REPAIR_PREVIEW_OUTPUT) ||
    "/tmp/churchill-openai-perceptual-pair-repair-preview.json",
);

if (!organizationId || !projectId || !graphId) {
  throw new Error("PAIR_REPAIR_PREVIEW_SCOPE_REQUIRED");
}

const [
  { ProductionTaskRuntime },
  { CreativeGeneratedMediaPerceptualPairRepairRuntime: Runtime },
] = await Promise.all([
  import("@/lib/operations/tasks/runtime/ProductionTaskRuntime"),
  import(
    "@/lib/creative/quality/runtime/CreativeGeneratedMediaPerceptualPairRepairRuntime"
  ),
]);

const blockers = [];
const requireValue = (condition, label) => {
  if (!condition) blockers.push(label);
};

requireValue(
  text(plan.contract) ===
    "CHURCHILL_OPENAI_PERCEPTUAL_REJECTED_MEDIA_REPAIR_PLAN_V1",
  "REPAIR_PLAN_CONTRACT_INVALID",
);
requireValue(
  text(plan.organization_id) === organizationId &&
    text(plan.creative_project_id) === projectId &&
    text(plan.production_graph_id) === graphId,
  "REPAIR_PLAN_SCOPE_INVALID",
);
requireValue(
  text(plan.decision) === "PAIR_AWARE_REPAIR_PLAN_9_PAIRS_CONFIRMED" &&
    text(plan.readiness) === "READY_FOR_PAIR_AWARE_REPAIR_RUNTIME_DESIGN",
  "REPAIR_PLAN_NOT_READY",
);
requireValue(
  list(plan.blockers).length === 0 && plan.state_unchanged === true,
  "REPAIR_PLAN_NOT_CLEAN",
);
requireValue(
  Number(plan.recovered_pair_count) === 4 &&
    Number(plan.rejected_pair_count) === 9 &&
    Number(plan.recovered_source_regeneration_scope) === 0,
  "REPAIR_PLAN_COUNTS_INVALID",
);
requireValue(
  Number(plan.planned_replacement_source_tasks) === 9 &&
    Number(plan.planned_replacement_review_tasks) === 9 &&
    Number(plan.planned_downstream_rewires) === 0,
  "REPAIR_PLAN_PAYLOAD_COUNTS_INVALID",
);
requireValue(
  plan.repair_cost_authorized === false &&
    plan.provider_selection_authorized === false &&
    plan.repair_dispatch_authorized === false,
  "REPAIR_PLAN_AUTHORIZATION_INVALID",
);

const tasks = await ProductionTaskRuntime.list({
  organization_id: organizationId,
  creative_project_id: projectId,
  production_graph_id: graphId,
});
const scopedTasks = tasks.filter(
  (task) => text(task.production_graph_id) === graphId,
);
const taskMap = new Map(scopedTasks.map((task) => [task.id, task]));
const existingIds = new Set(scopedTasks.map((task) => task.id));

requireValue(scopedTasks.length === 27, "LIVE_TASK_COUNT_INVALID");

const previews = [];
for (const pairPlan of list(plan.repair_plans)) {
  const source = taskMap.get(text(pairPlan.source_task_id));
  const review = taskMap.get(text(pairPlan.review_task_id));
  if (!source || !review) {
    blockers.push(`PAIR_TASK_MISSING:${pairPlan.execution_node_id}`);
    continue;
  }
  try {
    const preview = Runtime.previewPair({
      source,
      review,
      plan: pairPlan,
    });
    const sourcePayload = preview.replacement_source_task;
    const reviewPayload = preview.replacement_review_task;
    const issues = [];

    if (existingIds.has(sourcePayload.id)) {
      issues.push("REPLACEMENT_SOURCE_ID_ALREADY_EXISTS");
    }
    if (existingIds.has(reviewPayload.id)) {
      issues.push("REPLACEMENT_REVIEW_ID_ALREADY_EXISTS");
    }
    if (sourcePayload.id === reviewPayload.id) {
      issues.push("REPLACEMENT_IDS_COLLIDE");
    }
    if (text(sourcePayload.status) !== "WAITING") {
      issues.push("REPLACEMENT_SOURCE_STATUS_INVALID");
    }
    if (text(reviewPayload.status) !== "WAITING") {
      issues.push("REPLACEMENT_REVIEW_STATUS_INVALID");
    }
    if (reviewPayload.depends_on?.length !== 1 ||
      text(reviewPayload.depends_on?.[0]) !== text(sourcePayload.id)) {
      issues.push("REPLACEMENT_REVIEW_DEPENDENCY_INVALID");
    }
    if (sourcePayload.provider_id !== null || reviewPayload.provider_id !== null) {
      issues.push("PROVIDER_SELECTION_ALREADY_BOUND");
    }
    if (sourcePayload.cost?.approved !== false ||
      reviewPayload.cost?.approved !== false) {
      issues.push("REPAIR_COST_ALREADY_APPROVED");
    }
    if (preview.promptless_persistence !== true) {
      issues.push("PROMPTLESS_PERSISTENCE_INVALID");
    }
    if (preview.provider_selection_authorized !== false ||
      preview.cost_authorized !== false ||
      preview.dispatch_authorized !== false) {
      issues.push("PREVIEW_AUTHORIZATION_INVALID");
    }
    if (text(sourcePayload.metadata?.repair_identity) !==
      text(pairPlan.repair_identity)) {
      issues.push("SOURCE_REPAIR_IDENTITY_MISMATCH");
    }
    if (text(reviewPayload.metadata?.repair_identity) !==
      text(pairPlan.repair_identity)) {
      issues.push("REVIEW_REPAIR_IDENTITY_MISMATCH");
    }
    if (text(reviewPayload.metadata?.source_generation_task_id) !==
      text(sourcePayload.id)) {
      issues.push("REVIEW_SOURCE_TASK_BINDING_INVALID");
    }
    if (text(reviewPayload.metadata?.contract) !==
      "GENERATED_MEDIA_PERCEPTUAL_REVIEW_V1") {
      issues.push("REVIEW_CONTRACT_NOT_PRESERVED");
    }

    previews.push({
      execution_node_id: text(pairPlan.execution_node_id),
      original_source_task_id: source.id,
      original_review_task_id: review.id,
      replacement_source_task_id: sourcePayload.id,
      replacement_review_task_id: reviewPayload.id,
      pair_payload_sha256: preview.pair_payload_sha256,
      replacement_source_estimated_cost: Number(
        sourcePayload.cost?.estimated || 0,
      ),
      replacement_review_estimated_cost: Number(
        reviewPayload.cost?.estimated || 0,
      ),
      source_provider_bound: sourcePayload.provider_id !== null,
      review_provider_bound: reviewPayload.provider_id !== null,
      source_cost_approved: sourcePayload.cost?.approved === true,
      review_cost_approved: reviewPayload.cost?.approved === true,
      promptless_persistence: preview.promptless_persistence === true,
      issues,
      ready: issues.length === 0,
    });
  } catch (error) {
    blockers.push(
      `PAIR_PREVIEW_FAILED:${pairPlan.execution_node_id}:${error.message}`,
    );
  }
}

if (previews.length !== 9) blockers.push("PAIR_PREVIEW_COUNT_INVALID");
if (previews.some((preview) => !preview.ready)) {
  blockers.push("ONE_OR_MORE_PAIR_PAYLOADS_INVALID");
}
const generatedIds = previews.flatMap((preview) => [
  preview.replacement_source_task_id,
  preview.replacement_review_task_id,
]);
if (new Set(generatedIds).size !== 18) {
  blockers.push("DETERMINISTIC_REPLACEMENT_ID_COLLISION");
}

const tasksAfter = await ProductionTaskRuntime.list({
  organization_id: organizationId,
  creative_project_id: projectId,
  production_graph_id: graphId,
});
const stateUnchanged =
  tasksAfter.length === scopedTasks.length &&
  tasksAfter.every((task) => existingIds.has(task.id));
if (!stateUnchanged) blockers.push("READ_ONLY_PREVIEW_CHANGED_TASK_STATE");

const decision = blockers.length
  ? "PAIR_REPAIR_RUNTIME_PREVIEW_BLOCKED"
  : "PAIR_REPAIR_RUNTIME_9_PAIR_PAYLOADS_CONFIRMED";
const readiness = blockers.length
  ? "PAIR_REPAIR_RUNTIME_PREVIEW_BLOCKED"
  : "READY_FOR_GUARDED_REPAIR_TASK_CREATION_DESIGN";
const instruction = blockers.length
  ? "Resolve every preview blocker before implementing any repair-task creation workflow."
  : "Design a guarded creation-only script that requires the exact repair-plan file, exact live task state, explicit 208.187686 THB cost authorization, and a graph-specific execution token. It may create the 18 WAITING tasks and supersession links, but must not dispatch, call providers, poll, regenerate media, finalise or publish.";

const report = {
  contract: "CHURCHILL_OPENAI_PERCEPTUAL_PAIR_REPAIR_RUNTIME_PREVIEW_V1",
  generated_at: new Date().toISOString(),
  organization_id: organizationId,
  creative_project_id: projectId,
  production_graph_id: graphId,
  repair_plan_file: planFile.absolute,
  runtime_contract: Runtime.contract,
  original_task_count: scopedTasks.length,
  preview_pair_count: previews.length,
  preview_replacement_source_count: previews.length,
  preview_replacement_review_count: previews.length,
  preview_total_task_count: generatedIds.length,
  existing_id_collision_count: previews.reduce(
    (count, preview) => count + preview.issues.filter(
      (issue) => issue.includes("ID_ALREADY_EXISTS"),
    ).length,
    0,
  ),
  deterministic_id_collision_count:
    generatedIds.length - new Set(generatedIds).size,
  promptless_pair_count: previews.filter(
    (preview) => preview.promptless_persistence,
  ).length,
  provider_bound_count: previews.reduce(
    (count, preview) => count +
      Number(preview.source_provider_bound) +
      Number(preview.review_provider_bound),
    0,
  ),
  cost_approved_count: previews.reduce(
    (count, preview) => count +
      Number(preview.source_cost_approved) +
      Number(preview.review_cost_approved),
    0,
  ),
  estimated_repair_cost: Number(plan.estimated_repair_cost || 0),
  estimated_repair_cost_currency:
    text(plan.estimated_repair_cost_currency) || "THB",
  pairs: previews,
  blockers,
  decision,
  instruction,
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
console.log("READ-ONLY OPENAI PERCEPTUAL PAIR-REPAIR RUNTIME PREVIEW");
console.log("============================================================");
console.log(`OUTPUT=${outputPath}`);
console.log(`ORIGINAL_TASK_COUNT=${report.original_task_count}`);
console.log(`PREVIEW_PAIR_COUNT=${report.preview_pair_count}`);
console.log(
  `PREVIEW_REPLACEMENT_SOURCE_COUNT=${report.preview_replacement_source_count}`,
);
console.log(
  `PREVIEW_REPLACEMENT_REVIEW_COUNT=${report.preview_replacement_review_count}`,
);
console.log(`PREVIEW_TOTAL_TASK_COUNT=${report.preview_total_task_count}`);
console.log(
  `EXISTING_ID_COLLISION_COUNT=${report.existing_id_collision_count}`,
);
console.log(
  `DETERMINISTIC_ID_COLLISION_COUNT=${report.deterministic_id_collision_count}`,
);
console.log(`PROMPTLESS_PAIR_COUNT=${report.promptless_pair_count}`);
console.log(`PROVIDER_BOUND_COUNT=${report.provider_bound_count}`);
console.log(`COST_APPROVED_COUNT=${report.cost_approved_count}`);
console.log(`ESTIMATED_REPAIR_COST=${report.estimated_repair_cost}`);
console.log(
  `ESTIMATED_REPAIR_COST_CURRENCY=${report.estimated_repair_cost_currency}`,
);

for (const preview of previews) {
  console.log([
    `PAIR_REPAIR_PAYLOAD=${preview.execution_node_id}`,
    `source=${preview.original_source_task_id}`,
    `review=${preview.original_review_task_id}`,
    `replacement_source=${preview.replacement_source_task_id}`,
    `replacement_review=${preview.replacement_review_task_id}`,
    `payload_sha256=${preview.pair_payload_sha256}`,
    `source_cost=${preview.replacement_source_estimated_cost}`,
    `review_cost=${preview.replacement_review_estimated_cost}`,
    `promptless=${preview.promptless_persistence ? "YES" : "NO"}`,
    `issues=${preview.issues.join(",")}`,
    `ready=${preview.ready ? "YES" : "NO"}`,
  ].join("|"));
}

console.log(`PAIR_REPAIR_PREVIEW_BLOCKERS=${JSON.stringify(blockers)}`);
console.log(`PAIR_REPAIR_PREVIEW_DECISION=${decision}`);
console.log(`PAIR_REPAIR_PREVIEW_INSTRUCTION=${instruction}`);
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
