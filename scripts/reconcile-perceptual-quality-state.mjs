#!/usr/bin/env node

import process from "node:process";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv({ cwd: process.cwd() });

const organizationId = String(process.env.ORGANIZATION_ID || "").trim();
const projectId = String(process.env.CREATIVE_PROJECT_ID || "").trim();
const graphId = String(process.env.PRODUCTION_GRAPH_ID || "").trim();

if (!organizationId || !projectId || !graphId) {
  throw new Error("PERCEPTUAL_RECONCILIATION_SCOPE_REQUIRED");
}

const [
  { ProductionTaskRuntime },
  { UsageRuntime },
] = await Promise.all([
  import("@/lib/operations/tasks/runtime/ProductionTaskRuntime"),
  import("@/lib/platform/service-runtime/usage/UsageRuntime"),
]);

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

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function usageTaskId(usage = {}) {
  return text(
    usage.task_id ||
    usage.metadata?.task_id ||
    usage.metadata?.production_task_id,
  );
}

function usageTimestamp(usage = {}) {
  return Date.parse(
    usage.updated_at ||
    usage.completed_at ||
    usage.created_at ||
    "",
  ) || 0;
}

function successfulUsage(usages, taskId) {
  return usages
    .filter((usage) =>
      usageTaskId(usage) === text(taskId) &&
      ["SUCCESS", "COMPLETED", "BILLED"].includes(upper(usage.status)),
    )
    .sort((left, right) => usageTimestamp(right) - usageTimestamp(left))[0] || null;
}

function isPerceptualTask(task = {}) {
  return task.metadata?.contract === "GENERATED_MEDIA_PERCEPTUAL_REVIEW_V1" ||
    task.metadata?.perceptual_quality_state ||
    task.output?.perceptual_validation ||
    upper(task.error).includes("PERCEPTUAL_VALIDATION_FAILED") ||
    upper(task.error).includes("GENERATED_MEDIA_PERCEPTUAL");
}

function validation(task = {}) {
  return task.output?.perceptual_validation ||
    task.output?.review?.perceptual_validation ||
    null;
}

function rejected(task = {}) {
  const evaluated = validation(task);
  return Boolean(
    evaluated?.passed === false ||
    task.output?.passed === false ||
    task.review?.approved === false ||
    upper(task.error).includes("PERCEPTUAL_VALIDATION_FAILED") ||
    task.metadata?.perceptual_quality_state === "QUALITY_REJECTED"
  );
}

const [tasks, usages] = await Promise.all([
  ProductionTaskRuntime.list({
    organization_id: organizationId,
    creative_project_id: projectId,
    production_graph_id: graphId,
  }),
  UsageRuntime.organization(organizationId),
]);

const reconciled = [];
const skipped = [];

for (const task of tasks) {
  if (upper(task.status) !== "FAILED") continue;
  const usage = successfulUsage(usages, task.id);
  if (!usage) {
    skipped.push({ id: task.id, reason: "SUCCESS_USAGE_NOT_FOUND" });
    continue;
  }
  if (!isPerceptualTask(task)) {
    skipped.push({ id: task.id, reason: "NOT_PERCEPTUAL_FAILURE" });
    continue;
  }

  const qualityRejected = rejected(task);
  const actual = Math.max(
    finite(task.cost?.actual),
    finite(usage.customer_price),
  );
  const evaluatedAt = new Date().toISOString();

  await ProductionTaskRuntime.update(task.id, {
    status: "COMPLETED",
    error: null,
    cost: {
      ...(task.cost || {}),
      actual,
    },
    output: {
      ...(task.output || {}),
      usage: task.output?.usage || usage,
      settlement: "CHARGED",
      passed: qualityRejected ? false : task.output?.passed,
    },
    review: {
      ...(task.review || {}),
      required: qualityRejected,
      approved: qualityRejected ? false : task.review?.approved,
      approved_by:
        task.review?.approved_by ||
        "AVANTIQO_AUTOMATED_PERCEPTUAL_GATE",
    },
    metadata: {
      ...(task.metadata || {}),
      perceptual_quality_state:
        qualityRejected ? "QUALITY_REJECTED" : "QUALITY_EXECUTION_RECONCILED",
      quality_repair_required: qualityRejected,
      release_hold: qualityRejected,
      generated_media_released_for_downstream: !qualityRejected,
      settlement_reconciled_from_usage_id: usage.id,
      settlement_reconciliation_contract:
        "CHARGED_PERCEPTUAL_EXECUTION_AUTHORITATIVE_V1",
      perceptual_validation_evaluated_at: evaluatedAt,
    },
    timing: {
      ...(task.timing || {}),
      completed_at: task.timing?.completed_at || evaluatedAt,
    },
  });

  reconciled.push({
    id: task.id,
    title: task.title || "",
    usage_id: usage.id,
    actual_cost: actual,
    quality_state:
      qualityRejected ? "QUALITY_REJECTED" : "QUALITY_EXECUTION_RECONCILED",
  });
}

console.log("============================================================");
console.log("PERCEPTUAL QUALITY STATE RECONCILIATION");
console.log("============================================================");
console.log(`TASK_TOTAL=${tasks.length}`);
console.log(`RECONCILED_TASK_COUNT=${reconciled.length}`);
for (const item of reconciled) {
  console.log(
    `RECONCILED_TASK=${item.id}|${item.title}|` +
    `USAGE=${item.usage_id}|ACTUAL=${item.actual_cost}|` +
    `QUALITY_STATE=${item.quality_state}`,
  );
}
console.log(`SKIPPED_FAILED_TASK_COUNT=${skipped.length}`);
for (const item of skipped) {
  console.log(`SKIPPED_FAILED_TASK=${item.id}|${item.reason}`);
}
console.log("PROVIDER_EXECUTION_PERFORMED=NO");
console.log("WALLET_OPERATION_PERFORMED=NO");
console.log("CHARGED_TASKS_REGENERATED=NO");
console.log("PUBLICATION_AUTHORIZED=NO");

if (skipped.length) process.exitCode = 2;
