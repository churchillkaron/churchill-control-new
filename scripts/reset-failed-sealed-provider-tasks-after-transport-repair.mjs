#!/usr/bin/env node

import process from "node:process";

import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv({ cwd: process.cwd() });
await import("./creative-runtime-bootstrap.mjs");
await import(
  "@/lib/creative/execution/runtime/CreativeApprovedProductionTaskCostGuardRuntime"
);
await import(
  "@/lib/platform/service-runtime/execution/FalPendingQueueBindingRuntime"
);

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return String(value ?? "").trim();
}

function money(value) {
  return Number(Number(value || 0).toFixed(6));
}

function providerJobId(task = {}) {
  const output = object(task.output);
  const submission = object(output.provider_submission);
  return text(
    output.provider_job_id ||
    submission.provider_job_id ||
    submission.output?.provider_job_id,
  );
}

function taskUsage(task = {}) {
  const output = object(task.output);
  const submission = object(output.provider_submission);
  return object(output.usage || submission.usage);
}

function approvalValid(task, maximum) {
  const approval = object(task.metadata?.production_approval_contract);
  return (
    approval.contract ===
      "CREATIVE_SEALED_PRODUCTION_EXECUTION_APPROVAL_V1" &&
    approval.production_authorized === true &&
    approval.publication_authorized === false &&
    money(approval.maximum_customer_price) === maximum
  );
}

const organizationId = text(process.env.ORGANIZATION_ID);
const projectId = text(process.env.CREATIVE_PROJECT_ID);
const graphId = text(process.env.PRODUCTION_GRAPH_ID);
const approvalLiteral = text(process.env.PRODUCTION_APPROVAL_LITERAL);
const approvedMaximum = money(process.env.PRODUCTION_APPROVAL_MAXIMUM_THB);
const expectedLiteral =
  "APPROVE CHURCHILL VIDEO PRODUCTION MAX 367.366602 THB";

if (!organizationId || !projectId || !graphId) {
  throw new Error("SEALED_PROVIDER_RECOVERY_SCOPE_REQUIRED");
}
if (approvalLiteral !== expectedLiteral || approvedMaximum !== 367.366602) {
  throw new Error("SEALED_PROVIDER_RECOVERY_APPROVAL_INVALID");
}

const { ProductionTaskRuntime } = await import(
  "@/lib/operations/tasks/runtime/ProductionTaskRuntime"
);
const { UsageRuntime } = await import(
  "@/lib/platform/service-runtime/usage/UsageRuntime"
);
const { WalletRuntime } = await import(
  "@/lib/platform/service-runtime/wallet/runtime/WalletRuntime"
);
const { FalPendingQueueBindingRuntime } = await import(
  "@/lib/platform/service-runtime/execution/FalPendingQueueBindingRuntime"
);

const tasks = await ProductionTaskRuntime.list({
  organization_id: organizationId,
  creative_project_id: projectId,
  production_graph_id: graphId,
});
const graphTasks = tasks.filter((task) =>
  text(task.production_graph_id) === graphId,
);
const runwayTasks = graphTasks.filter((task) =>
  task.status === "FAILED" &&
  text(task.provider_id).toLowerCase() === "runway" &&
  text(task.capability || task.service_code).toLowerCase() ===
    "ai.video.generate" &&
  text(task.error).includes("promptImage: Invalid input"),
);
const falTasks = graphTasks.filter((task) =>
  task.status === "FAILED" &&
  text(task.provider_id).toLowerCase() === "fal" &&
  text(task.capability || task.service_code).toLowerCase() ===
    "ai.music.generate" &&
  text(task.error).includes("FAL request failed with status 405"),
);

if (graphTasks.length !== 27) {
  throw new Error(`SEALED_PROVIDER_RECOVERY_TASK_COUNT_INVALID:${graphTasks.length}`);
}
if (runwayTasks.length !== 13) {
  throw new Error(
    `SEALED_PROVIDER_RECOVERY_RUNWAY_COUNT_INVALID:${runwayTasks.length}`,
  );
}
if (falTasks.length !== 1) {
  throw new Error(
    `SEALED_PROVIDER_RECOVERY_FAL_COUNT_INVALID:${falTasks.length}`,
  );
}

for (const task of [...runwayTasks, ...falTasks]) {
  if (!approvalValid(task, approvedMaximum)) {
    throw new Error(`SEALED_PROVIDER_RECOVERY_TASK_APPROVAL_INVALID:${task.id}`);
  }
}
for (const task of runwayTasks) {
  if (providerJobId(task)) {
    throw new Error(`SEALED_PROVIDER_RECOVERY_RUNWAY_JOB_EXISTS:${task.id}`);
  }
}

const walletBefore = money(await WalletRuntime.balance({
  organization_id: organizationId,
  currency: "THB",
}));

const falTask = falTasks[0];
const falJobId = providerJobId(falTask);
if (!falJobId) {
  throw new Error("SEALED_PROVIDER_RECOVERY_FAL_JOB_ID_REQUIRED");
}
const falUsageReference = taskUsage(falTask);
if (!falUsageReference.id) {
  throw new Error("SEALED_PROVIDER_RECOVERY_FAL_USAGE_ID_REQUIRED");
}
const falUsage = await UsageRuntime.get(falUsageReference.id);
if (!falUsage || text(falUsage.organization_id) !== organizationId) {
  throw new Error("SEALED_PROVIDER_RECOVERY_FAL_USAGE_NOT_FOUND");
}
if (text(falUsage.status).toUpperCase() !== "PENDING") {
  throw new Error(
    `SEALED_PROVIDER_RECOVERY_FAL_USAGE_STATUS_INVALID:${falUsage.status}`,
  );
}
const reservedAmount = money(
  falUsage.metadata?.reservation_pricing?.customer_price ||
  falUsageReference.customer_price ||
  falTask.output?.pricing?.customer_price,
);
if (reservedAmount !== 0.546) {
  throw new Error(
    `SEALED_PROVIDER_RECOVERY_FAL_RESERVATION_INVALID:${reservedAmount}`,
  );
}

for (const task of runwayTasks) {
  await ProductionTaskRuntime.update(task.id, {
    status: "WAITING",
    error: null,
    output: {},
    timing: {
      ...object(task.timing),
      started_at: null,
      completed_at: null,
    },
    metadata: {
      ...object(task.metadata),
      runway_prompt_image_transport_retry_contract:
        "CREATIVE_RUNWAY_DATA_URI_RETRY_V1",
      runway_prompt_image_transport_retry_count:
        Number(task.metadata?.runway_prompt_image_transport_retry_count || 0) + 1,
      publication_authorized: false,
    },
  });
}

const restoredFal = await ProductionTaskRuntime.update(falTask.id, {
  status: "RUNNING",
  error: null,
  timing: {
    ...object(falTask.timing),
    completed_at: null,
  },
  output: {
    ...object(falTask.output),
    provider_job_id: falJobId,
    provider_status: "recovery_pending_poll",
    settlement: "RESERVED",
    recovery_preserved_usage_id: falUsage.id,
    recovery_preserved_reservation: reservedAmount,
  },
  metadata: {
    ...object(falTask.metadata),
    fal_authoritative_queue_resume_contract:
      "CREATIVE_FAL_EXISTING_JOB_RESUME_V1",
    fal_authoritative_queue_resume_count:
      Number(falTask.metadata?.fal_authoritative_queue_resume_count || 0) + 1,
    preserved_pending_usage_id: falUsage.id,
    preserved_reserved_amount: reservedAmount,
    publication_authorized: false,
  },
});
await FalPendingQueueBindingRuntime.bindTaskQueueReferences(restoredFal);

const walletAfter = money(await WalletRuntime.balance({
  organization_id: organizationId,
  currency: "THB",
}));
if (walletAfter !== walletBefore) {
  throw new Error(
    `SEALED_PROVIDER_RECOVERY_WALLET_CHANGED:${walletBefore}:${walletAfter}`,
  );
}

const refreshed = await ProductionTaskRuntime.list({
  organization_id: organizationId,
  creative_project_id: projectId,
  production_graph_id: graphId,
});
const refreshedGraph = refreshed.filter((task) =>
  text(task.production_graph_id) === graphId,
);
const counts = refreshedGraph.reduce((result, task) => {
  result[task.status] = (result[task.status] || 0) + 1;
  return result;
}, {});

console.log("============================================================");
console.log("SEALED PROVIDER TRANSPORT RECOVERY");
console.log("============================================================");
console.log(`GRAPH_ID=${graphId}`);
console.log(`RESET_RUNWAY_TASK_COUNT=${runwayTasks.length}`);
console.log("RESET_FAL_TASK_COUNT=0");
console.log("RESUMED_FAL_TASK_COUNT=1");
console.log(`PRESERVED_FAL_JOB_ID=${falJobId}`);
console.log(`PRESERVED_FAL_USAGE_ID=${falUsage.id}`);
console.log(`PRESERVED_FAL_RESERVATION=${reservedAmount}`);
console.log("RELEASED_FAL_RESERVATION=0");
console.log(`TASK_STATUS_COUNTS=${JSON.stringify(counts)}`);
console.log(`WALLET_BALANCE_BEFORE=${walletBefore}`);
console.log(`WALLET_BALANCE_AFTER=${walletAfter}`);
console.log("PROVIDER_CALLS_EXECUTED=NO");
console.log("PROVIDER_POLLS_EXECUTED=NO");
console.log("PUBLICATION_AUTHORIZED=NO");
console.log("RECOVERY_READINESS=PASS");
console.log("TERMINAL_REMAINS_OPEN=YES");
