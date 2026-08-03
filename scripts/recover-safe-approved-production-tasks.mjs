#!/usr/bin/env node

import process from "node:process";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv({ cwd: process.cwd() });

const organizationId = String(process.env.ORGANIZATION_ID || "").trim();
const projectId = String(process.env.CREATIVE_PROJECT_ID || "").trim();
const graphId = String(process.env.PRODUCTION_GRAPH_ID || "").trim();
const retryLimit = Math.max(
  1,
  Number.parseInt(process.env.CREATIVE_SAFE_TASK_RETRY_LIMIT || "3", 10),
);

if (!organizationId || !projectId || !graphId) {
  throw new Error("SAFE_RECOVERY_SCOPE_REQUIRED");
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

function providerJobId(task = {}) {
  return (
    task.output?.provider_job_id ||
    task.output?.provider_submission?.provider_job_id ||
    task.output?.provider_submission?.output?.provider_job_id ||
    task.output?.provider_submission?.output?.output?.provider_job_id ||
    null
  );
}

function settlement(task = {}) {
  return upper(
    task.output?.settlement ||
    task.output?.provider_submission?.settlement ||
    task.output?.provider_poll?.settlement,
  );
}

function retryCount(task = {}) {
  return Math.max(0, Number(task.metadata?.safe_recovery_retry_count || 0));
}

function taskUsageRows(usages, taskId) {
  return usages.filter((usage) =>
    text(
      usage.task_id ||
      usage.metadata?.task_id ||
      usage.metadata?.production_task_id,
    ) === text(taskId),
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

const failed = tasks.filter((task) => upper(task.status) === "FAILED");
const recovered = [];
const protectedTasks = [];

for (const task of failed) {
  const relatedUsages = taskUsageRows(usages, task.id);
  const hasProtectedUsage = relatedUsages.some((usage) =>
    ["PENDING", "SUCCESS", "COMPLETED", "BILLED"].includes(upper(usage.status)),
  );
  const currentRetryCount = retryCount(task);
  const unsafe = Boolean(
    providerJobId(task) ||
    finite(task.cost?.actual) > 0 ||
    ["RESERVED", "CHARGED"].includes(settlement(task)) ||
    hasProtectedUsage ||
    currentRetryCount >= retryLimit
  );

  if (unsafe) {
    protectedTasks.push({
      id: task.id,
      title: task.title,
      provider_job_id: providerJobId(task),
      actual_cost: finite(task.cost?.actual),
      settlement: settlement(task) || "NONE",
      usage_statuses: relatedUsages.map((usage) => usage.status),
      retry_count: currentRetryCount,
    });
    continue;
  }

  await ProductionTaskRuntime.update(task.id, {
    status: "READY",
    error: null,
    output: {},
    timing: {
      ...(task.timing || {}),
      started_at: null,
      completed_at: null,
    },
    metadata: {
      ...(task.metadata || {}),
      safe_recovery_retry_count: currentRetryCount + 1,
      safe_recovery_last_error: task.error || null,
      safe_recovery_at: new Date().toISOString(),
      safe_recovery_contract: "ZERO_COST_NO_PROVIDER_JOB_V1",
    },
  });

  recovered.push({
    id: task.id,
    title: task.title,
    retry_count: currentRetryCount + 1,
  });
}

console.log("============================================================");
console.log("APPROVED PRODUCTION SAFE RECOVERY");
console.log("============================================================");
console.log(`TASK_TOTAL=${tasks.length}`);
console.log(`FAILED_TASK_COUNT=${failed.length}`);
console.log(`RECOVERED_TASK_COUNT=${recovered.length}`);
for (const task of recovered) {
  console.log(`RECOVERED_TASK=${task.id}|${task.title || ""}|RETRY=${task.retry_count}`);
}
console.log(`PROTECTED_TASK_COUNT=${protectedTasks.length}`);
for (const task of protectedTasks) {
  console.log(`PROTECTED_TASK=${JSON.stringify(task)}`);
}
console.log("CHARGED_TASKS_RESET=NO");
console.log("RESERVED_TASKS_RESET=NO");
console.log("PROVIDER_JOBS_RESET=NO");
console.log("PUBLICATION_AUTHORIZED=NO");

if (protectedTasks.length) {
  process.exitCode = 2;
}
