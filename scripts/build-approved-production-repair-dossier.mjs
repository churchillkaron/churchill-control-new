#!/usr/bin/env node

import process from "node:process";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv({ cwd: process.cwd() });

function text(value) {
  return String(value ?? "").trim();
}

function upper(value) {
  return text(value).toUpperCase();
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function round(value) {
  return Number(finite(value).toFixed(6));
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function isQualityTask(task = {}) {
  return upper(task.type) === "QUALITY_REVIEW" ||
    task.metadata?.quality_gate === true ||
    text(task.metadata?.contract) === "GENERATED_MEDIA_PERCEPTUAL_REVIEW_V1";
}

function sourceTaskForReview(tasks, review) {
  const explicit = [
    review.metadata?.source_generation_task_id,
    review.metadata?.perceptual_review_source_task_id,
    review.output?.source_generation_task_id,
    review.input?.requirements?.source_generation_task_id,
  ].map(text).filter(Boolean);

  for (const id of explicit) {
    const match = tasks.find((task) => text(task.id) === id);
    if (match) return match;
  }

  for (const id of list(review.depends_on)) {
    const match = tasks.find((task) => text(task.id) === text(id) && !isQualityTask(task));
    if (match) return match;
  }
  return null;
}

function scoreFrom(task = {}) {
  const candidates = [
    task.output?.overall_score,
    task.output?.output?.overall_score,
    task.output?.review?.overall_score,
    task.output?.perceptual_validation?.overall_score,
    task.output?.perceptual_validation?.evidence?.overall_score,
    task.review?.score,
  ];
  for (const value of candidates) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return 0;
}

function conciseJson(value, limit = 4000) {
  return JSON.stringify(value || [])
    .replace(/\s+/g, " ")
    .slice(0, limit);
}

const organizationId = text(process.env.ORGANIZATION_ID);
const projectId = text(process.env.CREATIVE_PROJECT_ID);
const graphId = text(process.env.PRODUCTION_GRAPH_ID);
const expectedPairCount = Number(process.env.EXPECTED_REPAIR_PAIR_COUNT || 10);

if (!organizationId || !projectId || !graphId) {
  throw new Error("REPAIR_DOSSIER_SCOPE_REQUIRED");
}

const [
  { ProductionTaskRuntime },
  {
    qualityFailures,
    qualityPassed,
    repairInstructions,
  },
] = await Promise.all([
  import("@/lib/operations/tasks/runtime/ProductionTaskRuntime"),
  import("@/lib/creative/quality/runtime/CreativeRepairContractRuntime"),
]);

const tasks = await ProductionTaskRuntime.list({
  organization_id: organizationId,
  creative_project_id: projectId,
  production_graph_id: graphId,
});

const reviews = tasks.filter((task) =>
  upper(task.status) === "COMPLETED" && isQualityTask(task),
);

const pairs = reviews.map((review) => {
  const source = sourceTaskForReview(tasks, review);
  const failures = qualityFailures(review.output);
  const instructions = repairInstructions(review.output);
  const generationEstimate = round(source?.cost?.estimated || 0);
  const reviewEstimate = round(review.cost?.estimated || 0);
  return {
    source,
    review,
    passed: qualityPassed(review.output),
    score: scoreFrom(review),
    failures,
    instructions,
    generation_estimate: generationEstimate,
    review_estimate: reviewEstimate,
    pair_estimate: round(generationEstimate + reviewEstimate),
  };
});

const rejected = pairs.filter((pair) => !pair.passed);
const missingSource = rejected.filter((pair) => !pair.source);
const missingInstructions = rejected.filter((pair) => !pair.instructions.length);
const totalGeneration = round(rejected.reduce((sum, pair) => sum + pair.generation_estimate, 0));
const totalReviews = round(rejected.reduce((sum, pair) => sum + pair.review_estimate, 0));
const totalIncremental = round(totalGeneration + totalReviews);
const highestPriority = [...rejected].sort((left, right) => left.score - right.score);

console.log("============================================================");
console.log("APPROVED PRODUCTION QUALITY REPAIR DOSSIER");
console.log("============================================================");
console.log(`ORGANIZATION_ID=${organizationId}`);
console.log(`CREATIVE_PROJECT_ID=${projectId}`);
console.log(`PRODUCTION_GRAPH_ID=${graphId}`);
console.log(`TASK_TOTAL=${tasks.length}`);
console.log(`QUALITY_REVIEW_COUNT=${reviews.length}`);
console.log(`EXPECTED_REPAIR_PAIR_COUNT=${expectedPairCount}`);
console.log(`REJECTED_PAIR_COUNT=${rejected.length}`);
console.log(`MISSING_SOURCE_COUNT=${missingSource.length}`);
console.log(`MISSING_INSTRUCTION_COUNT=${missingInstructions.length}`);
console.log(`REPAIR_GENERATION_ESTIMATE=${totalGeneration}`);
console.log(`REPAIR_REVIEW_ESTIMATE=${totalReviews}`);
console.log(`REPAIR_INCREMENTAL_BUDGET_REQUIRED=${totalIncremental}`);
console.log(`REPAIR_TASKS_CREATED=0`);
console.log(`PROVIDER_JOBS_CREATED=0`);
console.log(`WALLET_RESERVATIONS_CREATED=0`);
console.log(`PUBLICATION_AUTHORIZED=NO`);

for (const [index, pair] of highestPriority.entries()) {
  const label = `REPAIR_PAIR_${index + 1}`;
  console.log("------------------------------------------------------------");
  console.log(`${label}_SOURCE_TASK_ID=${pair.source?.id || "NONE"}`);
  console.log(`${label}_SOURCE_TITLE=${pair.source?.title || "NONE"}`);
  console.log(`${label}_SOURCE_PROVIDER=${pair.source?.provider_id || pair.source?.output?.provider || "NONE"}`);
  console.log(`${label}_SOURCE_STATUS=${pair.source?.status || "NONE"}`);
  console.log(`${label}_REVIEW_TASK_ID=${pair.review.id}`);
  console.log(`${label}_REVIEW_STATUS=${pair.review.status}`);
  console.log(`${label}_SCORE=${pair.score}`);
  console.log(`${label}_PASSED=${pair.passed ? "YES" : "NO"}`);
  console.log(`${label}_GENERATION_ESTIMATE=${pair.generation_estimate}`);
  console.log(`${label}_REVIEW_ESTIMATE=${pair.review_estimate}`);
  console.log(`${label}_PAIR_ESTIMATE=${pair.pair_estimate}`);
  console.log(`${label}_FAILURE_COUNT=${pair.failures.length}`);
  console.log(`${label}_INSTRUCTION_COUNT=${pair.instructions.length}`);
  console.log(`${label}_FAILURES=${conciseJson(pair.failures)}`);
  console.log(`${label}_REPAIR_INSTRUCTIONS=${conciseJson(pair.instructions)}`);
}

const structurallyComplete =
  reviews.length === expectedPairCount &&
  rejected.length > 0 &&
  missingSource.length === 0 &&
  missingInstructions.length === 0 &&
  totalIncremental > 0;

console.log("============================================================");
console.log("REPAIR DOSSIER RESULT");
console.log("============================================================");
console.log(`REPAIR_DOSSIER_COMPLETE=${structurallyComplete ? "YES" : "NO"}`);
console.log(`REPAIR_APPROVAL_REQUIRED=${rejected.length ? "YES" : "NO"}`);
console.log(`REPAIR_EXECUTION_AUTHORIZED=NO`);
console.log(`READ_ONLY_DOSSIER=PASS`);
console.log(`TERMINAL_REMAINS_OPEN=YES`);

if (!structurallyComplete) process.exitCode = 2;
