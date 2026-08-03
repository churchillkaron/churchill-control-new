#!/usr/bin/env node

import process from "node:process";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv({ cwd: process.cwd() });

function text(value) {
  return String(value ?? "").trim();
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

function usageId(task = {}) {
  return (
    task.output?.usage?.id ||
    task.output?.provider_submission?.usage?.id ||
    null
  );
}

function settlement(task = {}) {
  return (
    task.output?.settlement ||
    task.output?.provider_submission?.settlement ||
    task.output?.provider_poll?.settlement ||
    "NONE"
  );
}

const taskId = text(process.argv[2] || process.env.TASK_ID);
const organizationId = text(
  process.env.ORGANIZATION_ID ||
  "33336a72-acb5-474e-856b-8be0269360e2",
);
const projectId = text(
  process.env.CREATIVE_PROJECT_ID ||
  "28cba496-4cc3-42dd-8b3a-c47e73a907a1",
);
const graphId = text(
  process.env.PRODUCTION_GRAPH_ID ||
  "8cfadaae-b33c-4d07-b057-16534de73ec1",
);

if (!taskId) throw new Error("TASK_ID_REQUIRED");

const { ProductionTaskRuntime } = await import(
  "@/lib/operations/tasks/runtime/ProductionTaskRuntime"
);

const [failedTask, tasks] = await Promise.all([
  ProductionTaskRuntime.get(taskId),
  ProductionTaskRuntime.list({
    organization_id: organizationId,
    creative_project_id: projectId,
    production_graph_id: graphId,
  }),
]);

if (!failedTask) throw new Error(`TASK_NOT_FOUND:${taskId}`);

const completed = tasks.filter((task) => text(task.status).toUpperCase() === "COMPLETED");
const running = tasks.filter((task) => text(task.status).toUpperCase() === "RUNNING");
const failed = tasks.filter((task) => text(task.status).toUpperCase() === "FAILED");
const blocked = tasks.filter((task) => text(task.status).toUpperCase() === "BLOCKED");
const actualCost = tasks.reduce((sum, task) => sum + finite(task.cost?.actual), 0);

console.log("============================================================");
console.log("APPROVED PRODUCTION FAILURE INSPECTION");
console.log("============================================================");
console.log(`TASK_ID=${failedTask.id}`);
console.log(`TITLE=${failedTask.title || ""}`);
console.log(`STATUS=${failedTask.status || ""}`);
console.log(`TYPE=${failedTask.type || ""}`);
console.log(`CAPABILITY=${failedTask.capability || failedTask.service_code || failedTask.service_id || ""}`);
console.log(`PROVIDER=${failedTask.provider_id || failedTask.output?.provider || failedTask.output?.provider_submission?.provider || "NONE"}`);
console.log(`ERROR=${failedTask.error || "NONE"}`);
console.log(`ACTUAL_COST=${finite(failedTask.cost?.actual)}`);
console.log(`PROVIDER_JOB_ID=${providerJobId(failedTask) || "NONE"}`);
console.log(`USAGE_ID=${usageId(failedTask) || "NONE"}`);
console.log(`SETTLEMENT=${settlement(failedTask)}`);
console.log(`DEPENDS_ON=${JSON.stringify(failedTask.depends_on || [])}`);
console.log(`OUTPUT=${JSON.stringify(failedTask.output || {})}`);
console.log("============================================================");
console.log("CURRENT GRAPH SETTLEMENT");
console.log("============================================================");
console.log(`TASK_TOTAL=${tasks.length}`);
console.log(`TASK_COMPLETED=${completed.length}`);
console.log(`TASK_RUNNING=${running.length}`);
console.log(`TASK_FAILED=${failed.length}`);
console.log(`TASK_BLOCKED=${blocked.length}`);
console.log(`GRAPH_ACTUAL_COST=${actualCost}`);
for (const task of completed) {
  console.log([
    "COMPLETED_TASK",
    task.id,
    task.title || "",
    task.provider_id || task.output?.provider || task.output?.provider_submission?.provider || "NONE",
    finite(task.cost?.actual),
    settlement(task),
    providerJobId(task) || "NONE",
    usageId(task) || "NONE",
  ].join("|"));
}
for (const task of running) {
  console.log([
    "RUNNING_TASK",
    task.id,
    task.title || "",
    task.provider_id || task.output?.provider || task.output?.provider_submission?.provider || "NONE",
    providerJobId(task) || "NONE",
    usageId(task) || "NONE",
    settlement(task),
  ].join("|"));
}
console.log("READ_ONLY_INSPECTION=PASS");
console.log("PRODUCTION_RESTARTED=NO");
console.log("PUBLICATION_AUTHORIZED=NO");
