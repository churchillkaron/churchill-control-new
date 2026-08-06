#!/usr/bin/env node

import process from "node:process";

import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv({ cwd: process.cwd() });
await import("./creative-runtime-bootstrap.mjs");
await import(
  "@/lib/platform/service-runtime/execution/FalPendingQueueBindingRuntime"
);

function text(value) {
  return String(value ?? "").trim();
}

const organizationId = text(process.env.ORGANIZATION_ID);
const projectId = text(process.env.CREATIVE_PROJECT_ID);
const graphId = text(process.env.PRODUCTION_GRAPH_ID);

if (!organizationId || !projectId || !graphId) {
  throw new Error("FAL_PROVIDER_STATUS_MIGRATION_SCOPE_REQUIRED");
}

const { ProductionTaskRuntime } = await import(
  "@/lib/operations/tasks/runtime/ProductionTaskRuntime"
);
const { FalPendingQueueBindingRuntime } = await import(
  "@/lib/platform/service-runtime/execution/FalPendingQueueBindingRuntime"
);

const tasks = await ProductionTaskRuntime.list({
  organization_id: organizationId,
  creative_project_id: projectId,
  production_graph_id: graphId,
});
const falRunning = tasks.filter((task) =>
  text(task.production_graph_id) === graphId &&
  text(task.provider_id).toLowerCase() === "fal" &&
  text(task.status).toUpperCase() === "RUNNING"
);

if (falRunning.length !== 1) {
  throw new Error(
    `FAL_PROVIDER_STATUS_MIGRATION_TASK_COUNT_INVALID:${falRunning.length}`,
  );
}

const task = await FalPendingQueueBindingRuntime.bindTaskQueueReferences(
  falRunning[0],
);

if (task.input?.provider_status) {
  throw new Error("FAL_PROVIDER_STATUS_INPUT_NOT_REMOVED");
}
if (!task.metadata?.provider_status?.status_url) {
  throw new Error("FAL_PROVIDER_STATUS_METADATA_STATUS_URL_REQUIRED");
}
if (!task.metadata?.provider_status?.response_url) {
  throw new Error("FAL_PROVIDER_STATUS_METADATA_RESPONSE_URL_REQUIRED");
}

console.log("============================================================");
console.log("FAL PROVIDER STATUS CONTROL-PLANE MIGRATION");
console.log("============================================================");
console.log(`GRAPH_ID=${graphId}`);
console.log(`TASK_ID=${task.id}`);
console.log(`TASK_STATUS=${task.status}`);
console.log("INPUT_PROVIDER_STATUS_PRESENT=NO");
console.log("METADATA_PROVIDER_STATUS_PRESENT=YES");
console.log("PROVIDER_CALLS_EXECUTED=NO");
console.log("PROVIDER_POLLS_EXECUTED=NO");
console.log("WALLET_CHANGED=NO");
console.log("PUBLICATION_AUTHORIZED=NO");
console.log("MIGRATION_READINESS=PASS");
console.log("TERMINAL_REMAINS_OPEN=YES");
