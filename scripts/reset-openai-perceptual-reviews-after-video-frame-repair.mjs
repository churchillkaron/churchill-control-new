#!/usr/bin/env node

import process from "node:process";

import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv({ cwd: process.cwd() });
await import("./creative-runtime-bootstrap.mjs");
const {
  CreativeApprovedProductionTaskCostGuardRuntime,
} = await import(
  "@/lib/creative/execution/runtime/CreativeApprovedProductionTaskCostGuardRuntime"
);
await import(
  "@/lib/creative/quality/runtime/CreativeGeneratedMediaPerceptualExecutionGate"
);

const REVIEW_ERROR =
  "400 The image data you provided does not represent a valid image. Please check your input and try again with one of the supported image formats: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].";
const EXPECTED_APPROVAL_LITERAL =
  "APPROVE CHURCHILL VIDEO PRODUCTION MAX 367.366602 THB";
const EXPECTED_APPROVAL_MAXIMUM = 367.366602;
const MAXIMUM_ONE_SHOT_REVIEW_RETRY_PRICE = 45.523002;

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
  const nested = object(submission.output);
  return text(
    output.provider_job_id ||
    submission.provider_job_id ||
    nested.provider_job_id,
  );
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

function executionNodeId(task = {}) {
  return text(task.metadata?.execution_node_id || task.input?.node_id);
}

function isReviewTask(task = {}) {
  return (
    text(task.metadata?.contract) ===
      "GENERATED_MEDIA_PERCEPTUAL_REVIEW_V1" &&
    text(task.provider_id).toLowerCase() === "openai" &&
    text(task.capability || task.service_code).toLowerCase() ===
      "ai.image.analyze" &&
    executionNodeId(task).endsWith(":perceptual-review")
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
const preflightPath = text(process.env.OPENAI_VIDEO_REVIEW_PREFLIGHT_OUTPUT);

if (!organizationId || !projectId || !graphId) {
  throw new Error("OPENAI_VIDEO_REVIEW_RESET_SCOPE_REQUIRED");
}
if (
  approvalLiteral !== EXPECTED_APPROVAL_LITERAL ||
  approvedMaximum !== EXPECTED_APPROVAL_MAXIMUM
) {
  throw new Error("OPENAI_VIDEO_REVIEW_RESET_APPROVAL_INVALID");
}
if (!preflightPath) {
  throw new Error("OPENAI_VIDEO_REVIEW_RESET_PREFLIGHT_PATH_REQUIRED");
}

const fs = await import("node:fs");
if (!fs.existsSync(preflightPath)) {
  throw new Error(`OPENAI_VIDEO_REVIEW_RESET_PREFLIGHT_MISSING:${preflightPath}`);
}
const preflight = JSON.parse(fs.readFileSync(preflightPath, "utf8"));
if (
  preflight.contract !== "CHURCHILL_OPENAI_VIDEO_REVIEW_FRAME_PREFLIGHT_V1" ||
  preflight.organization_id !== organizationId ||
  preflight.creative_project_id !== projectId ||
  preflight.production_graph_id !== graphId ||
  preflight.task_count !== 13 ||
  preflight.pass_count !== 13 ||
  preflight.fail_count !== 0 ||
  preflight.state_unchanged !== true ||
  preflight.database_writes_executed !== false ||
  preflight.provider_calls_executed !== false ||
  preflight.provider_polls_executed !== false ||
  preflight.retries_executed !== false ||
  preflight.publication_authorized !== false
) {
  throw new Error("OPENAI_VIDEO_REVIEW_RESET_PREFLIGHT_INVALID");
}

const [
  { supabaseAdmin },
  { ProductionTaskRuntime },
  { WalletRuntime },
] = await Promise.all([
  import("@/lib/shared/supabase/admin"),
  import("@/lib/operations/tasks/runtime/ProductionTaskRuntime"),
  import("@/lib/platform/service-runtime/wallet/runtime/WalletRuntime"),
]);

const tasks = await ProductionTaskRuntime.list({
  organization_id: organizationId,
  creative_project_id: projectId,
  production_graph_id: graphId,
});
const graphTasks = tasks.filter((task) =>
  text(task.production_graph_id) === graphId,
);
const failedReviews = graphTasks.filter((task) =>
  task.status === "FAILED" &&
  isReviewTask(task) &&
  text(task.error) === REVIEW_ERROR,
);
const completedVideos = graphTasks.filter((task) =>
  task.status === "COMPLETED" &&
  text(task.provider_id).toLowerCase() === "runway" &&
  text(task.capability || task.service_code).toLowerCase() ===
    "ai.video.generate",
);
const completedSoundtracks = graphTasks.filter((task) =>
  task.status === "COMPLETED" &&
  text(task.provider_id).toLowerCase() === "fal" &&
  text(task.capability || task.service_code).toLowerCase() ===
    "ai.music.generate",
);
const unexpectedActive = graphTasks.filter((task) =>
  ["WAITING", "READY", "RUNNING", "REVIEW"].includes(
    text(task.status).toUpperCase(),
  ),
);

if (graphTasks.length !== 27) {
  throw new Error(
    `OPENAI_VIDEO_REVIEW_RESET_TASK_COUNT_INVALID:${graphTasks.length}`,
  );
}
if (failedReviews.length !== 13) {
  throw new Error(
    `OPENAI_VIDEO_REVIEW_RESET_FAILED_COUNT_INVALID:${failedReviews.length}`,
  );
}
if (completedVideos.length !== 13) {
  throw new Error(
    `OPENAI_VIDEO_REVIEW_RESET_COMPLETED_VIDEO_COUNT_INVALID:${completedVideos.length}`,
  );
}
if (completedSoundtracks.length !== 1) {
  throw new Error(
    `OPENAI_VIDEO_REVIEW_RESET_SOUNDTRACK_COUNT_INVALID:${completedSoundtracks.length}`,
  );
}
if (unexpectedActive.length) {
  throw new Error(
    `OPENAI_VIDEO_REVIEW_RESET_UNEXPECTED_ACTIVE_TASKS:${unexpectedActive.map((task) => task.id).join(",")}`,
  );
}

const completedById = new Map(
  completedVideos.map((task) => [task.id, task]),
);
let retryMaximum = 0;
for (const task of failedReviews) {
  if (!approvalValid(task, approvedMaximum)) {
    throw new Error(
      `OPENAI_VIDEO_REVIEW_RESET_TASK_APPROVAL_INVALID:${task.id}`,
    );
  }
  if (providerJobId(task)) {
    throw new Error(
      `OPENAI_VIDEO_REVIEW_RESET_PROVIDER_JOB_EXISTS:${task.id}`,
    );
  }
  if (Number(task.metadata?.openai_video_review_frame_retry_count || 0) !== 0) {
    throw new Error(
      `OPENAI_VIDEO_REVIEW_RESET_ALREADY_RETRIED:${task.id}`,
    );
  }

  const dependencies = list(task.depends_on);
  if (dependencies.length !== 1 || !completedById.has(dependencies[0])) {
    throw new Error(
      `OPENAI_VIDEO_REVIEW_RESET_DEPENDENCY_INVALID:${task.id}:${dependencies.join(",")}`,
    );
  }

  const guard = CreativeApprovedProductionTaskCostGuardRuntime.guardFromTask(task);
  if (
    guard.contract !== "CREATIVE_APPROVED_PRODUCTION_TASK_COST_GUARD_V1" ||
    guard.currency !== "THB" ||
    guard.maximum_customer_price <= 0
  ) {
    throw new Error(
      `OPENAI_VIDEO_REVIEW_RESET_COST_GUARD_INVALID:${task.id}`,
    );
  }
  retryMaximum = money(retryMaximum + guard.maximum_customer_price);
}
if (retryMaximum > MAXIMUM_ONE_SHOT_REVIEW_RETRY_PRICE) {
  throw new Error(
    `OPENAI_VIDEO_REVIEW_RESET_MAXIMUM_EXCEEDED:${retryMaximum}:${MAXIMUM_ONE_SHOT_REVIEW_RETRY_PRICE}`,
  );
}

const failedReviewIds = new Set(failedReviews.map((task) => task.id));
const usageResult = await supabaseAdmin
  .from("platform_service_usage")
  .select("*")
  .eq("organization_id", organizationId)
  .order("created_at", { ascending: false })
  .limit(1000);
if (usageResult.error) throw usageResult.error;
const relatedUsage = list(usageResult.data).filter((usage) =>
  failedReviewIds.has(text(usage.metadata?.task_id)),
);
const pendingUsage = relatedUsage.filter((usage) =>
  usageState(usage) === "PENDING",
);
const nonTerminalUsage = relatedUsage.filter((usage) =>
  !["SUCCESS", "FAILED"].includes(usageState(usage)),
);
if (pendingUsage.length || nonTerminalUsage.length) {
  throw new Error(
    `OPENAI_VIDEO_REVIEW_RESET_USAGE_NOT_TERMINAL:${[
      ...pendingUsage,
      ...nonTerminalUsage,
    ].map((usage) => `${usage.id}:${usageState(usage)}`).join(",")}`,
  );
}
for (const task of failedReviews) {
  const taskUsage = relatedUsage.filter((usage) =>
    text(usage.metadata?.task_id) === task.id,
  );
  if (!taskUsage.length) {
    throw new Error(
      `OPENAI_VIDEO_REVIEW_RESET_FAILED_USAGE_REQUIRED:${task.id}`,
    );
  }
  if (taskUsage.some((usage) => usageState(usage) !== "FAILED")) {
    throw new Error(
      `OPENAI_VIDEO_REVIEW_RESET_USAGE_STATE_INVALID:${task.id}:${taskUsage.map((usage) => usageState(usage)).join(",")}`,
    );
  }
}

const walletBefore = money(await WalletRuntime.balance({
  organization_id: organizationId,
  currency: "THB",
}));

for (const task of failedReviews) {
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
      openai_video_review_frame_retry_contract:
        "CREATIVE_OPENAI_VIDEO_REVIEW_FRAME_RETRY_V1",
      openai_video_review_frame_retry_count: 1,
      openai_video_review_frame_retry_reason:
        "VIDEO_WAS_PREVIOUSLY_SENT_AS_IMAGE;NOW_REPLACED_BY_SEVEN_DETERMINISTIC_JPEG_FRAMES",
      openai_video_review_frame_preflight_contract: preflight.contract,
      openai_video_review_frame_preflight_generated_at:
        preflight.generated_at || null,
      publication_authorized: false,
    },
  });
}

const walletAfter = money(await WalletRuntime.balance({
  organization_id: organizationId,
  currency: "THB",
}));
if (walletAfter !== walletBefore) {
  throw new Error(
    `OPENAI_VIDEO_REVIEW_RESET_WALLET_CHANGED:${walletBefore}:${walletAfter}`,
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
const resetReviews = refreshedGraph.filter((task) =>
  task.status === "WAITING" &&
  isReviewTask(task) &&
  task.metadata?.openai_video_review_frame_retry_count === 1,
);
const preservedVideos = refreshedGraph.filter((task) =>
  task.status === "COMPLETED" &&
  text(task.provider_id).toLowerCase() === "runway" &&
  text(task.capability || task.service_code).toLowerCase() ===
    "ai.video.generate",
);
const preservedSoundtracks = refreshedGraph.filter((task) =>
  task.status === "COMPLETED" &&
  text(task.provider_id).toLowerCase() === "fal" &&
  text(task.capability || task.service_code).toLowerCase() ===
    "ai.music.generate",
);
if (
  resetReviews.length !== 13 ||
  preservedVideos.length !== 13 ||
  preservedSoundtracks.length !== 1
) {
  throw new Error(
    `OPENAI_VIDEO_REVIEW_RESET_POSTCONDITION_FAILED:${resetReviews.length}:${preservedVideos.length}:${preservedSoundtracks.length}`,
  );
}

const counts = refreshedGraph.reduce((result, task) => {
  result[task.status] = (result[task.status] || 0) + 1;
  return result;
}, {});

console.log("============================================================");
console.log("BOUNDED OPENAI VIDEO PERCEPTUAL REVIEW RESET");
console.log("============================================================");
console.log(`GRAPH_ID=${graphId}`);
console.log(`RESET_REVIEW_TASK_COUNT=${resetReviews.length}`);
console.log(`PRESERVED_COMPLETED_VIDEO_COUNT=${preservedVideos.length}`);
console.log(`PRESERVED_COMPLETED_SOUNDTRACK_COUNT=${preservedSoundtracks.length}`);
console.log(`TERMINAL_FAILED_USAGE_COUNT=${relatedUsage.length}`);
console.log(`ONE_SHOT_RETRY_MAXIMUM_THB=${retryMaximum}`);
console.log(`TASK_STATUS_COUNTS=${JSON.stringify(counts)}`);
console.log(`WALLET_BALANCE_BEFORE=${walletBefore}`);
console.log(`WALLET_BALANCE_AFTER=${walletAfter}`);
console.log("DATABASE_WRITES_EXECUTED=YES_RESET_ONLY");
console.log("PROVIDER_CALLS_EXECUTED=NO");
console.log("PROVIDER_POLLS_EXECUTED=NO");
console.log("PUBLICATION_AUTHORIZED=NO");
console.log("RESET_READINESS=PASS");
console.log("TERMINAL_REMAINS_OPEN=YES");
