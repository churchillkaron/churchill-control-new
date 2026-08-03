#!/usr/bin/env node

import process from "node:process";

import {
  loadAvantiqoEnv,
} from "./load-avantiqo-env.mjs";

loadAvantiqoEnv({ cwd: process.cwd() });
await import("./creative-runtime-bootstrap.mjs");

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

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function modelFrom(task = {}, usage = {}) {
  const submission = object(task.output?.provider_submission);
  const output = object(submission.output);
  const nested = object(output.output);
  return text(
    submission.model ||
    output.model ||
    nested.model ||
    submission.provider_status_input?.model ||
    output.provider_status_input?.model ||
    nested.provider_status_input?.model ||
    usage.metadata?.model ||
    task.output?.model ||
    task.input?.model ||
    task.input?.generation?.model ||
    task.input?.provider_configuration?.model ||
    task.input?.provider_configuration?.model_id ||
    task.input?.generation?.provider_configuration?.model ||
    task.input?.generation?.provider_configuration?.model_id,
  );
}

function endpointFrom(task = {}) {
  const submission = object(task.output?.provider_submission);
  const output = object(submission.output);
  const nested = object(output.output);
  return text(
    submission.endpoint ||
    submission.submit_endpoint ||
    output.endpoint ||
    output.submit_endpoint ||
    nested.endpoint ||
    nested.submit_endpoint ||
    submission.provider_status_input?.endpoint ||
    submission.provider_status_input?.submit_endpoint ||
    output.provider_status_input?.endpoint ||
    output.provider_status_input?.submit_endpoint ||
    nested.provider_status_input?.endpoint ||
    nested.provider_status_input?.submit_endpoint ||
    task.output?.endpoint ||
    task.output?.submit_endpoint ||
    task.input?.endpoint ||
    task.input?.submit_endpoint ||
    task.input?.provider_configuration?.endpoint ||
    task.input?.provider_configuration?.submit_endpoint ||
    task.input?.generation?.provider_configuration?.endpoint ||
    task.input?.generation?.provider_configuration?.submit_endpoint,
  );
}

function statusInput(task, usage, jobId) {
  const submission = object(task.output?.provider_submission);
  const output = object(submission.output);
  const nested = object(output.output);
  const model = modelFrom(task, usage);
  const endpoint = endpointFrom(task) ||
    (model ? `https://queue.fal.run/${model.replace(/^\/+|\/+$/g, "")}` : "");
  const base = endpoint.replace(/\/requests\/[^/]+(?:\/status)?$/i, "").replace(/\/$/, "");
  const statusUrl = text(
    submission.status_url ||
    submission.statusUrl ||
    output.status_url ||
    output.statusUrl ||
    nested.status_url ||
    nested.statusUrl,
  ) || (base ? `${base}/requests/${encodeURIComponent(jobId)}/status` : "");
  const responseUrl = text(
    submission.response_url ||
    submission.responseUrl ||
    output.response_url ||
    output.responseUrl ||
    nested.response_url ||
    nested.responseUrl,
  ) || (base ? `${base}/requests/${encodeURIComponent(jobId)}` : "");

  if (!model && !endpoint) {
    throw new Error("FAL_RECOVERY_MODEL_OR_ENDPOINT_REQUIRED");
  }

  return {
    ...(object(task.input?.provider_status)),
    ...(object(task.metadata?.provider_status)),
    model: model || undefined,
    endpoint: endpoint || undefined,
    submit_endpoint: endpoint || undefined,
    status_url: statusUrl || undefined,
    response_url: responseUrl || undefined,
  };
}

const organizationId = required("ORGANIZATION_ID");
const projectId = required("CREATIVE_PROJECT_ID");
const graphId = required("PRODUCTION_GRAPH_ID");
const taskId = required("FAL_RECOVERY_TASK_ID");
const expectedJobId = required("FAL_RECOVERY_PROVIDER_JOB_ID");
const expectedUsageId = required("FAL_RECOVERY_USAGE_ID");

console.log("============================================================");
console.log("EXISTING FAL SOUNDTRACK JOB RECOVERY");
console.log("============================================================");

const task = await ProductionTaskRuntime.get(taskId);
if (!task) throw new Error("FAL_RECOVERY_TASK_NOT_FOUND");
if (text(task.organization_id) !== organizationId) throw new Error("FAL_RECOVERY_ORGANIZATION_MISMATCH");
if (text(task.creative_project_id) !== projectId) throw new Error("FAL_RECOVERY_PROJECT_MISMATCH");
if (text(task.production_graph_id) !== graphId) throw new Error("FAL_RECOVERY_GRAPH_MISMATCH");
if (text(task.provider_id || task.output?.provider) !== "fal") throw new Error("FAL_RECOVERY_PROVIDER_MISMATCH");
if (text(task.status).toUpperCase() !== "FAILED") throw new Error(`FAL_RECOVERY_TASK_NOT_FAILED:${task.status}`);
if (Number(task.cost?.actual || 0) !== 0) throw new Error("FAL_RECOVERY_TASK_ALREADY_CHARGED");
if (text(task.output?.settlement).toUpperCase() !== "RESERVED") throw new Error(`FAL_RECOVERY_SETTLEMENT_NOT_RESERVED:${task.output?.settlement}`);

const actualJobId = text(
  task.output?.provider_job_id ||
  task.output?.provider_submission?.provider_job_id ||
  task.output?.provider_submission?.output?.provider_job_id ||
  task.output?.provider_submission?.output?.output?.provider_job_id,
);
if (actualJobId !== expectedJobId) throw new Error(`FAL_RECOVERY_JOB_ID_MISMATCH:${actualJobId}`);

const actualUsageId = text(
  task.output?.usage?.id ||
  task.output?.provider_submission?.usage?.id,
);
if (actualUsageId !== expectedUsageId) throw new Error(`FAL_RECOVERY_USAGE_ID_MISMATCH:${actualUsageId}`);

const usage = await UsageRuntime.get(expectedUsageId);
if (!usage) throw new Error("FAL_RECOVERY_USAGE_NOT_FOUND");
if (text(usage.organization_id) !== organizationId) throw new Error("FAL_RECOVERY_USAGE_ORGANIZATION_MISMATCH");
if (text(usage.provider) !== "fal") throw new Error("FAL_RECOVERY_USAGE_PROVIDER_MISMATCH");
if (text(usage.status).toUpperCase() !== "PENDING") throw new Error(`FAL_RECOVERY_USAGE_NOT_PENDING:${usage.status}`);
if (Number(usage.customer_price || 0) !== 0) throw new Error("FAL_RECOVERY_USAGE_ALREADY_CHARGED");

const providerStatusInput = statusInput(task, usage, expectedJobId);
const recovered = await ProductionTaskRuntime.update(task.id, {
  status: "RUNNING",
  provider_id: "fal",
  error: null,
  output: {
    ...(task.output || {}),
    provider_job_id: expectedJobId,
    provider_status: "recovered_for_polling",
    provider_status_input: providerStatusInput,
    model: providerStatusInput.model || task.output?.model || null,
    endpoint: providerStatusInput.endpoint || task.output?.endpoint || null,
    settlement: "RESERVED",
    last_polled_at: null,
  },
  metadata: {
    ...(task.metadata || {}),
    provider_poll_retry_count: 0,
    provider_poll_retry_limit: Number(process.env.CREATIVE_PROVIDER_POLL_RETRY_LIMIT || 24),
    provider_poll_last_error: null,
    provider_poll_last_error_at: null,
    existing_provider_job_recovered_at: new Date().toISOString(),
    existing_provider_job_recovery_contract: "FAL_EXISTING_REQUEST_POLL_V1",
  },
  timing: {
    ...(task.timing || {}),
    completed_at: null,
  },
});

console.log(`RECOVERED_TASK_ID=${recovered.id}`);
console.log(`RECOVERED_STATUS=${recovered.status}`);
console.log(`EXISTING_PROVIDER_JOB_ID=${expectedJobId}`);
console.log(`EXISTING_USAGE_ID=${expectedUsageId}`);
console.log(`FAL_MODEL=${providerStatusInput.model || "NONE"}`);
console.log(`FAL_ENDPOINT=${providerStatusInput.endpoint || "NONE"}`);
console.log(`FAL_STATUS_URL=${providerStatusInput.status_url || "NONE"}`);
console.log(`NEW_PROVIDER_JOB_SUBMITTED=NO`);
console.log(`NEW_WALLET_RESERVATION_CREATED=NO`);
console.log(`EXISTING_RESERVATION_PRESERVED=YES`);
console.log(`FAL_RECOVERY=PASS`);
