#!/usr/bin/env node

import process from "node:process";

import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv({ cwd: process.cwd() });
await import("./creative-runtime-bootstrap.mjs");
await import(
  "@/lib/creative/execution/runtime/CreativeApprovedProductionTaskCostGuardRuntime"
);
await import(
  "@/lib/creative/production/dossier/runtime/CreativeProductionDossierEvidenceRuntime"
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

function usageState(usage = {}) {
  return text(
    usage.status ||
    usage.state ||
    usage.execution_status ||
    usage.settlement_status,
  ).toUpperCase();
}

const organizationId = text(process.env.ORGANIZATION_ID);
const projectId = text(process.env.CREATIVE_PROJECT_ID);
const graphId = text(process.env.PRODUCTION_GRAPH_ID);
const approvalLiteral = text(process.env.PRODUCTION_APPROVAL_LITERAL);
const approvedMaximum = money(process.env.PRODUCTION_APPROVAL_MAXIMUM_THB);
const expectedLiteral =
  "APPROVE CHURCHILL VIDEO PRODUCTION MAX 367.366602 THB";

if (!organizationId || !projectId || !graphId) {
  throw new Error("SEALED_RUNWAY_RESET_SCOPE_REQUIRED");
}
if (approvalLiteral !== expectedLiteral || approvedMaximum !== 367.366602) {
  throw new Error("SEALED_RUNWAY_RESET_APPROVAL_INVALID");
}

const { supabaseAdmin } = await import("@/lib/shared/supabase/admin");
const { ProductionTaskRuntime } = await import(
  "@/lib/operations/tasks/runtime/ProductionTaskRuntime"
);

const tasks = await ProductionTaskRuntime.list({
  organization_id: organizationId,
  creative_project_id: projectId,
  production_graph_id: graphId,
});
const graphTasks = tasks.filter((task) =>
  text(task.production_graph_id) === graphId,
);
const failedVideos = graphTasks.filter((task) =>
  task.status === "FAILED" &&
  text(task.provider_id).toLowerCase() === "runway" &&
  text(task.capability || task.service_code).toLowerCase() ===
    "ai.video.generate" &&
  text(task.error) === "Runway request failed with status 400",
);
const running = graphTasks.filter((task) => task.status === "RUNNING");
const runningNonSoundtrack = running.filter((task) =>
  text(task.capability || task.service_code).toLowerCase() !==
    "ai.music.generate",
);

if (graphTasks.length !== 27) {
  throw new Error(`SEALED_RUNWAY_RESET_TASK_COUNT_INVALID:${graphTasks.length}`);
}
if (failedVideos.length !== 13) {
  throw new Error(
    `SEALED_RUNWAY_RESET_FAILED_VIDEO_COUNT_INVALID:${failedVideos.length}`,
  );
}
if (runningNonSoundtrack.length) {
  throw new Error(
    `SEALED_RUNWAY_RESET_UNEXPECTED_RUNNING_TASKS:${runningNonSoundtrack.map((task) => task.id).join(",")}`,
  );
}

for (const task of failedVideos) {
  if (providerJobId(task)) {
    throw new Error(`SEALED_RUNWAY_RESET_PROVIDER_JOB_EXISTS:${task.id}`);
  }
  const approval = object(task.metadata?.production_approval_contract);
  if (
    approval.contract !==
      "CREATIVE_SEALED_PRODUCTION_EXECUTION_APPROVAL_V1" ||
    approval.production_authorized !== true ||
    approval.publication_authorized !== false ||
    money(approval.maximum_customer_price) !== approvedMaximum
  ) {
    throw new Error(`SEALED_RUNWAY_RESET_TASK_APPROVAL_INVALID:${task.id}`);
  }
}

const failedTaskIds = new Set(failedVideos.map((task) => task.id));
const usageResult = await supabaseAdmin
  .from("platform_service_usage")
  .select("*")
  .eq("organization_id", organizationId)
  .order("created_at", { ascending: false })
  .limit(500);
if (usageResult.error) throw usageResult.error;
const usages = list(usageResult.data).filter((usage) =>
  failedTaskIds.has(text(usage.metadata?.task_id)),
);
for (const usage of usages) {
  const state = usageState(usage);
  if (
    ["RESERVED", "RUNNING", "PENDING", "PROCESSING", "CHARGED", "COMPLETED"]
      .includes(state)
  ) {
    throw new Error(
      `SEALED_RUNWAY_RESET_USAGE_NOT_RELEASED:${usage.id}:${state}`,
    );
  }
}

const walletBeforeResult = await supabaseAdmin
  .from("organization_wallets")
  .select("available_balance,currency")
  .eq("organization_id", organizationId)
  .single();
if (walletBeforeResult.error) throw walletBeforeResult.error;
const walletBefore = money(walletBeforeResult.data?.available_balance);

for (const task of failedVideos) {
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
      runway_schema_retry_contract:
        "CREATIVE_RUNWAY_STRICT_SCHEMA_RETRY_V1",
      runway_schema_retry_count:
        Number(task.metadata?.runway_schema_retry_count || 0) + 1,
      runway_schema_retry_reason:
        "ORIGINAL_REQUEST_INCLUDED_NON_RUNWAY_CONTROL_FIELDS",
      publication_authorized: false,
    },
  });
}

const walletAfterResult = await supabaseAdmin
  .from("organization_wallets")
  .select("available_balance,currency")
  .eq("organization_id", organizationId)
  .single();
if (walletAfterResult.error) throw walletAfterResult.error;
const walletAfter = money(walletAfterResult.data?.available_balance);
if (walletAfter !== walletBefore) {
  throw new Error(
    `SEALED_RUNWAY_RESET_WALLET_CHANGED:${walletBefore}:${walletAfter}`,
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
const counts = refreshedGraph.reduce((output, task) => {
  output[task.status] = (output[task.status] || 0) + 1;
  return output;
}, {});

console.log("============================================================");
console.log("SEALED RUNWAY VIDEO TASK RESET");
console.log("============================================================");
console.log(`GRAPH_ID=${graphId}`);
console.log(`RESET_TASK_COUNT=${failedVideos.length}`);
console.log(`RESET_USAGE_COUNT=${usages.length}`);
console.log(`TASK_STATUS_COUNTS=${JSON.stringify(counts)}`);
console.log(`WALLET_BALANCE_BEFORE=${walletBefore}`);
console.log(`WALLET_BALANCE_AFTER=${walletAfter}`);
console.log("PROVIDER_CALLS_EXECUTED=NO");
console.log("PROVIDER_POLLS_EXECUTED=NO");
console.log("PUBLICATION_AUTHORIZED=NO");
console.log("RESET_READINESS=PASS");
console.log("TERMINAL_REMAINS_OPEN=YES");
