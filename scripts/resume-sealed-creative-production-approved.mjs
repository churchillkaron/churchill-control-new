#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv({ cwd: process.cwd() });
await import("./creative-runtime-bootstrap.mjs");
await import(
  "@/lib/creative/execution/runtime/CreativeApprovedProductionTaskCostGuardRuntime"
);
const {
  CreativeSealedProductionDispatchPreparationRuntime,
} = await import(
  "@/lib/creative/execution/runtime/CreativeSealedProductionDispatchPreparationRuntime"
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

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, stable(value[key])]),
  );
}

function sha256(value) {
  return crypto
    .createHash("sha256")
    .update(typeof value === "string" ? value : JSON.stringify(stable(value)))
    .digest("hex");
}

function coreWithout(value, key) {
  const output = { ...object(value) };
  delete output[key];
  return output;
}

function readJson(filePath, label) {
  const absolute = path.resolve(text(filePath));
  if (!absolute || !fs.existsSync(absolute)) {
    throw new Error(`${label}_FILE_NOT_FOUND:${absolute || "MISSING"}`);
  }
  const raw = fs.readFileSync(absolute, "utf8");
  return {
    absolute,
    raw,
    file_sha256: sha256(raw),
    value: JSON.parse(raw),
  };
}

function money(value) {
  return Number(Number(value || 0).toFixed(6));
}

async function exactState(supabaseAdmin, organizationId, projectId, graphId) {
  const [graphs, projectTasks, graphTasks, usage, wallet] = await Promise.all([
    supabaseAdmin
      .from("creative_production_graphs")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("creative_project_id", projectId),
    supabaseAdmin
      .from("creative_production_tasks")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("creative_project_id", projectId),
    supabaseAdmin
      .from("creative_production_tasks")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("creative_project_id", projectId)
      .eq("production_graph_id", graphId),
    supabaseAdmin
      .from("platform_service_usage")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId),
    supabaseAdmin
      .from("organization_wallets")
      .select("available_balance,currency,updated_at")
      .eq("organization_id", organizationId)
      .single(),
  ]);
  for (const result of [graphs, projectTasks, graphTasks, usage, wallet]) {
    if (result.error) throw result.error;
  }
  return {
    graph_count: Number(graphs.count || 0),
    project_task_count: Number(projectTasks.count || 0),
    approved_graph_task_count: Number(graphTasks.count || 0),
    usage_count: Number(usage.count || 0),
    wallet_balance: Number(wallet.data?.available_balance || 0),
    wallet_currency: text(wallet.data?.currency) || "THB",
    wallet_updated_at: wallet.data?.updated_at || null,
  };
}

function providerJob(task = {}) {
  return text(
    task.output?.provider_job_id ||
      task.output?.provider_submission?.provider_job_id ||
      task.output?.provider_submission?.output?.provider_job_id ||
      task.output?.provider_submission?.output?.output?.provider_job_id,
  );
}

function statusCounts(tasks = []) {
  return list(tasks).reduce((output, task) => {
    output[task.status] = (output[task.status] || 0) + 1;
    return output;
  }, {});
}

const manifest = readJson(process.argv[2], "SEALED_APPROVAL_MANIFEST");
const gate = readJson(process.argv[3], "SEALED_PREPRODUCTION_GATE");
const preview = readJson(process.argv[4], "SEALED_GRAPH_PREVIEW");
const cost = readJson(process.argv[5], "SEALED_COST_ESTIMATE");

const organizationId = text(process.env.ORGANIZATION_ID);
const projectId = text(process.env.CREATIVE_PROJECT_ID);
const missionId = text(process.env.CREATIVE_MISSION_ID);
const approvalLiteral = text(process.env.PRODUCTION_APPROVAL_LITERAL);
const approvedMaximum = money(process.env.PRODUCTION_APPROVAL_MAXIMUM_THB);
const expectedLiteral =
  "APPROVE CHURCHILL VIDEO PRODUCTION MAX 367.366602 THB";
if (!organizationId || !projectId || !missionId) {
  throw new Error("PRODUCTION_SCOPE_REQUIRED");
}

const manifestValue = object(manifest.value);
const gateValue = object(gate.value);
const previewValue = object(preview.value);
const costValue = object(cost.value);
const manifestSha = sha256(coreWithout(manifestValue, "manifest_sha256"));
const gateSha = sha256(coreWithout(gateValue, "gate_sha256"));
const previewSha = sha256(coreWithout(previewValue, "preview_sha256"));
const costSha = sha256(
  coreWithout(costValue, "sealed_cost_estimate_sha256"),
);
const blockers = [];

if (approvalLiteral !== expectedLiteral) {
  blockers.push("EXPLICIT_PRODUCTION_APPROVAL_LITERAL_INVALID");
}
if (approvedMaximum !== 367.366602) {
  blockers.push("EXPLICIT_PRODUCTION_APPROVAL_MAXIMUM_INVALID");
}
if (
  manifestValue.readiness !== "PASS" ||
  manifestSha !== text(manifestValue.manifest_sha256)
) {
  blockers.push("SEALED_MANIFEST_INVALID");
}
if (
  gateValue.readiness !== "PASS" ||
  gateSha !== text(gateValue.gate_sha256)
) {
  blockers.push("SEALED_PREPRODUCTION_GATE_INVALID");
}
if (
  previewValue.readiness !== "PASS" ||
  previewSha !== text(previewValue.preview_sha256)
) {
  blockers.push("SEALED_GRAPH_PREVIEW_INVALID");
}
if (
  costValue.readiness !== "PASS" ||
  costSha !== text(costValue.sealed_cost_estimate_sha256)
) {
  blockers.push("SEALED_COST_ESTIMATE_INVALID");
}
if (text(gateValue.manifest_sha256) !== manifestSha) {
  blockers.push("GATE_MANIFEST_SHA_MISMATCH");
}
if (text(gateValue.graph_preview_sha256) !== previewSha) {
  blockers.push("GATE_GRAPH_PREVIEW_SHA_MISMATCH");
}
if (money(manifestValue.authorization?.maximum_customer_price) !== approvedMaximum) {
  blockers.push("MANIFEST_APPROVAL_CEILING_MISMATCH");
}
if (Number(gateValue.counts?.execution_step_count) !== 27) {
  blockers.push("APPROVED_EXECUTION_STEP_COUNT_INVALID");
}
if (manifestValue.authorization?.publication_authorized !== false) {
  blockers.push("PUBLICATION_MUST_REMAIN_UNAUTHORIZED");
}
if (blockers.length) {
  throw new Error(`SEALED_PRODUCTION_RESUME_BLOCKED:${blockers.join(",")}`);
}

const [
  { supabaseAdmin },
  { ProductionGraphRuntime },
  { ProductionTaskRuntime },
  { ProductionQueueRuntime },
] = await Promise.all([
  import("@/lib/shared/supabase/admin"),
  import("@/lib/creative/production-graph/runtime/ProductionGraphRuntime"),
  import("@/lib/operations/tasks/runtime/ProductionTaskRuntime"),
  import("@/lib/creative/production/queue/runtime/ProductionQueueRuntime"),
]);

const executionReference = `churchill:${manifestSha}:${gateSha}`;
const graphs = await ProductionGraphRuntime.list({
  organization_id: organizationId,
  creative_project_id: projectId,
});
const candidates = graphs.filter((item) =>
  text(item.metadata?.sealed_execution_reference) === executionReference,
);
if (candidates.length !== 1) {
  throw new Error(
    `SEALED_PRODUCTION_GRAPH_COUNT_INVALID:${candidates.length}:1`,
  );
}
const graph = candidates[0];
const graphApproval = object(graph.metadata?.production_approval_contract);
if (
  graphApproval.contract !==
    "CREATIVE_SEALED_PRODUCTION_EXECUTION_APPROVAL_V1" ||
  graphApproval.production_authorized !== true ||
  graphApproval.publication_authorized !== false ||
  text(graphApproval.manifest_sha256) !== manifestSha ||
  text(graphApproval.preproduction_gate_sha256) !== gateSha ||
  text(graphApproval.graph_preview_sha256) !== previewSha ||
  money(graphApproval.maximum_customer_price) !== approvedMaximum
) {
  throw new Error("SEALED_PRODUCTION_GRAPH_APPROVAL_INVALID");
}

const before = await exactState(
  supabaseAdmin,
  organizationId,
  projectId,
  graph.id,
);
if (before.wallet_balance < approvedMaximum) {
  throw new Error("PRODUCTION_WALLET_INSUFFICIENT");
}
if (before.approved_graph_task_count !== 27) {
  throw new Error(
    `SEALED_PRODUCTION_GRAPH_TASK_COUNT_INVALID:${before.approved_graph_task_count}:27`,
  );
}

console.log("============================================================");
console.log("1. PREPARE AND VERIFY ALL 27 SEALED TASKS");
console.log("============================================================");
const preparation =
  await CreativeSealedProductionDispatchPreparationRuntime.prepareGraphTasks({
    organization_id: organizationId,
    creative_project_id: projectId,
    production_graph_id: graph.id,
    expected_task_count: 27,
  });
if (preparation.readiness !== "PASS") {
  throw new Error("SEALED_PRODUCTION_TASK_PREPARATION_FAILED");
}
if (
  preparation.prepared_task_count !== 27 ||
  preparation.verified_scope_count !== 27 ||
  preparation.verified_dossier_count !== 27
) {
  throw new Error(
    `SEALED_PRODUCTION_PREPARATION_COUNTS_INVALID:${JSON.stringify(preparation)}`,
  );
}

console.log(`PREPARED_TASK_COUNT=${preparation.prepared_task_count}`);
console.log(`VERIFIED_ASSET_SCOPE_COUNT=${preparation.verified_scope_count}`);
console.log(`VERIFIED_DOSSIER_COUNT=${preparation.verified_dossier_count}`);
console.log(`PRIMARY_SOURCE_BOUND_COUNT=${preparation.primary_source_bound_count}`);
console.log(`TOTAL_ESTIMATED_COST=${preparation.total_estimated_cost}`);
console.log(`APPROVED_CEILING=${preparation.approved_ceiling}`);
console.log("PREPARATION_PROVIDER_CALLS_EXECUTED=NO");
console.log("PREPARATION_WALLET_CHANGED=NO");

const scope = {
  organization_id: organizationId,
  creative_project_id: projectId,
  production_graph_id: graph.id,
};

console.log("============================================================");
console.log("2. POLL EXISTING PROVIDER JOBS");
console.log("============================================================");
const poll = await ProductionQueueRuntime.pollRunning(scope, {
  maxTasks: 27,
});

console.log("============================================================");
console.log("3. DISPATCH GRAPH-READY TASKS");
console.log("============================================================");
const dispatched = [];
for (let pass = 0; pass < 27; pass += 1) {
  const next = await ProductionQueueRuntime.dispatchNext(scope);
  if (!next) break;
  dispatched.push({
    id: next.id,
    status: next.status,
    provider_id: next.provider_id || null,
    provider_job_id: providerJob(next) || null,
    capability: next.capability || next.service_code || null,
  });
}

const queue = await ProductionQueueRuntime.build(scope);
if (queue.graph_scoped !== true || text(queue.production_graph_id) !== text(graph.id)) {
  throw new Error("SEALED_PRODUCTION_QUEUE_NOT_GRAPH_SCOPED");
}
if (queue.total !== 27) {
  throw new Error(`SEALED_PRODUCTION_QUEUE_TOTAL_INVALID:${queue.total}:27`);
}

const tasksAfter = await ProductionTaskRuntime.list({
  organization_id: organizationId,
  creative_project_id: projectId,
  production_graph_id: graph.id,
});
const counts = statusCounts(tasksAfter);
const after = await exactState(
  supabaseAdmin,
  organizationId,
  projectId,
  graph.id,
);
const walletDelta = money(before.wallet_balance - after.wallet_balance);
if (walletDelta > approvedMaximum) {
  throw new Error(
    `PRODUCTION_APPROVAL_CEILING_EXCEEDED:${walletDelta}:${approvedMaximum}`,
  );
}
if (after.approved_graph_task_count !== 27) {
  throw new Error("SEALED_PRODUCTION_TASK_COUNT_CHANGED");
}

const settled =
  queue.total === 27 &&
  queue.ready.length === 0 &&
  queue.running.length === 0 &&
  queue.waiting.length === 0 &&
  queue.review.length === 0;
const failed = queue.failed.length > 0 || queue.blocked.length > 0;
const readiness = failed
  ? "FAIL"
  : settled && queue.completed.length === 27
    ? "READY_FOR_GRAPH_SCOPED_FINALISATION"
    : "IN_PROGRESS";

const reportCore = {
  contract: "CREATIVE_SEALED_PRODUCTION_RESUME_V2",
  generated_at: new Date().toISOString(),
  organization_id: organizationId,
  creative_project_id: projectId,
  creative_mission_id: missionId,
  execution_reference: executionReference,
  graph_id: graph.id,
  preparation,
  polled_count: poll.total,
  dispatched_count: dispatched.length,
  dispatched,
  task_count: tasksAfter.length,
  task_status_counts: counts,
  queue: {
    graph_scoped: queue.graph_scoped,
    production_graph_id: queue.production_graph_id,
    total: queue.total,
    waiting: queue.waiting.length,
    ready: queue.ready.length,
    running: queue.running.length,
    review: queue.review.length,
    completed: queue.completed.length,
    failed: queue.failed.length,
    blocked: queue.blocked.length,
  },
  exact_state_before: before,
  exact_state_after: after,
  wallet_delta: walletDelta,
  maximum_customer_price: approvedMaximum,
  production_authorized: true,
  finalisation_executed: false,
  publication_authorized: false,
  readiness,
};
const report = {
  ...reportCore,
  execution_sha256: sha256(reportCore),
};
const outputPath = path.resolve(
  text(process.env.PRODUCTION_EXECUTION_OUTPUT) ||
    "/tmp/churchill-evidence-constrained-production-execution.json",
);
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log("============================================================");
console.log("SEALED CHURCHILL VIDEO PRODUCTION RESUME RESULT");
console.log("============================================================");
console.log(`OUTPUT=${outputPath}`);
console.log(`EXECUTION_SHA256=${report.execution_sha256}`);
console.log(`GRAPH_ID=${graph.id}`);
console.log("GRAPH_CREATED=NO");
console.log("TASKS_CREATED=0");
console.log(`TASK_COUNT=${tasksAfter.length}`);
console.log(`TASK_STATUS_COUNTS=${JSON.stringify(counts)}`);
console.log(`POLLED_COUNT=${poll.total}`);
console.log(`DISPATCHED_COUNT=${dispatched.length}`);
console.log(`QUEUE_GRAPH_SCOPED=${queue.graph_scoped ? "YES" : "NO"}`);
console.log(`QUEUE_WAITING=${report.queue.waiting}`);
console.log(`QUEUE_READY=${report.queue.ready}`);
console.log(`QUEUE_RUNNING=${report.queue.running}`);
console.log(`QUEUE_REVIEW=${report.queue.review}`);
console.log(`QUEUE_COMPLETED=${report.queue.completed}`);
console.log(`QUEUE_FAILED=${report.queue.failed}`);
console.log(`QUEUE_BLOCKED=${report.queue.blocked}`);
console.log(`PROJECT_TASK_COUNT=${after.project_task_count}`);
console.log(`APPROVED_GRAPH_TASK_COUNT=${after.approved_graph_task_count}`);
console.log(`WALLET_BALANCE_BEFORE=${before.wallet_balance}`);
console.log(`WALLET_BALANCE_AFTER=${after.wallet_balance}`);
console.log(`WALLET_DELTA=${walletDelta}`);
console.log(`MAXIMUM_CUSTOMER_PRICE=${approvedMaximum}`);
console.log(`PRODUCTION_EXECUTION_READINESS=${readiness}`);
console.log("PRODUCTION_AUTHORIZED=YES");
console.log("FINALISATION_EXECUTED=NO");
console.log("PUBLICATION_AUTHORIZED=NO");
console.log("TERMINAL_REMAINS_OPEN=YES");

if (readiness === "FAIL") process.exitCode = 2;
