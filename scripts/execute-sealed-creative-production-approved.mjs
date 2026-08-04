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
function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
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
  const result = { ...object(value) };
  delete result[key];
  return result;
}
function readJson(filePath, label) {
  const absolute = path.resolve(text(filePath));
  if (!absolute || !fs.existsSync(absolute)) {
    throw new Error(`${label}_FILE_NOT_FOUND:${absolute || "MISSING"}`);
  }
  const raw = fs.readFileSync(absolute, "utf8");
  return { absolute, raw, file_sha256: sha256(raw), value: JSON.parse(raw) };
}
function money(value) {
  return Number(Number(value || 0).toFixed(6));
}
function deterministicUuid(seed) {
  const hex = sha256(seed).slice(0, 32).split("");
  hex[12] = "4";
  hex[16] = ["8", "9", "a", "b"][parseInt(hex[16], 16) % 4];
  const raw = hex.join("");
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`;
}
function serviceKind(step = {}) {
  const capability = text(step.capability || step.service_code).toLowerCase();
  if (capability === "ai.video.generate") return "SHOT_GENERATION";
  if (capability === "ai.image.analyze") return "PERCEPTUAL_REVIEW";
  if (capability === "ai.music.generate") return "MASTER_SOUNDTRACK";
  return "UNKNOWN";
}
function quantityFor(step = {}) {
  const capability = text(step.capability || step.service_code).toLowerCase();
  if (capability === "ai.video.generate" || capability === "ai.music.generate") {
    return Math.max(
      0.001,
      finite(
        step.input?.generation?.provider_parameters?.duration_seconds ??
          step.input?.generation?.output_spec?.duration_seconds ??
          step.input?.output_spec?.duration_seconds ??
          step.estimated_seconds,
        1,
      ),
    );
  }
  return 1;
}
function taskType(step = {}) {
  const capability = text(step.capability || step.service_code).toLowerCase();
  if (capability === "ai.video.generate") return "GENERATE_VIDEO";
  if (capability === "ai.image.analyze") return "QUALITY_REVIEW";
  if (capability === "ai.music.generate") return "GENERATE_MUSIC";
  return "EXECUTE_CAPABILITY";
}
function selectedItemPrices(costValue = {}) {
  const estimates = list(
    costValue.estimate?.services ||
      costValue.estimate?.service_estimates,
  );
  if (!estimates.length) {
    throw new Error("SEALED_COST_SERVICE_ESTIMATES_REQUIRED");
  }
  return estimates.flatMap((estimate) =>
    list(estimate.selected?.item_prices).map((item) => ({
      ...item,
      service_id: estimate.service_id,
      provider: estimate.selected?.provider || null,
      model: estimate.selected?.model || null,
      pricing_id: estimate.selected?.pricing_id || null,
      currency: estimate.selected?.currency || costValue.estimate?.currency || "THB",
    })),
  );
}
function stepPriceAssignments(steps = [], costValue = {}) {
  const prices = selectedItemPrices(costValue);
  const buckets = new Map();
  for (const price of prices) {
    const key = `${price.kind}:${price.service_id}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(price);
  }
  const assignments = new Map();
  for (const step of steps) {
    const kind = serviceKind(step);
    const key = `${kind}:${text(step.service_code || step.capability)}`;
    const bucket = buckets.get(key) || [];
    const exactIndex = bucket.findIndex((price) =>
      text(price.source_id) &&
      (
        text(price.source_id) === text(step.node_id) ||
        text(price.source_id) === text(step.metadata?.source_generation_node_id) ||
        text(step.node_id).startsWith(`${text(price.source_id)}:`) ||
        text(step.node_id).startsWith(`${text(price.source_id)}-`)
      ),
    );
    const price = exactIndex >= 0
      ? bucket.splice(exactIndex, 1)[0]
      : bucket.shift();
    if (!price) throw new Error(`APPROVED_ITEM_PRICE_MISSING:${step.node_id}:${key}`);
    assignments.set(step.node_id, price);
  }
  return assignments;
}
async function exactState(supabaseAdmin, organizationId, projectId) {
  const [graphs, tasks, usage, wallet] = await Promise.all([
    supabaseAdmin.from("creative_production_graphs").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("creative_project_id", projectId),
    supabaseAdmin.from("creative_production_tasks").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("creative_project_id", projectId),
    supabaseAdmin.from("platform_service_usage").select("id", { count: "exact", head: true }).eq("organization_id", organizationId),
    supabaseAdmin.from("organization_wallets").select("available_balance,currency,updated_at").eq("organization_id", organizationId).single(),
  ]);
  for (const result of [graphs, tasks, usage, wallet]) if (result.error) throw result.error;
  return {
    graph_count: Number(graphs.count || 0),
    task_count: Number(tasks.count || 0),
    usage_count: Number(usage.count || 0),
    wallet_balance: Number(wallet.data?.available_balance || 0),
    wallet_currency: text(wallet.data?.currency) || "THB",
    wallet_updated_at: wallet.data?.updated_at || null,
  };
}

const manifest = readJson(process.argv[2], "SEALED_APPROVAL_MANIFEST");
const gate = readJson(process.argv[3], "SEALED_PREPRODUCTION_GATE");
const preview = readJson(process.argv[4], "SEALED_GRAPH_PREVIEW");
const cost = readJson(process.argv[5], "SEALED_COST_ESTIMATE");
const approvalLiteral = text(process.env.PRODUCTION_APPROVAL_LITERAL);
const approvedMaximum = money(process.env.PRODUCTION_APPROVAL_MAXIMUM_THB);
const expectedLiteral = "APPROVE CHURCHILL VIDEO PRODUCTION MAX 367.366602 THB";
const organizationId = text(process.env.ORGANIZATION_ID);
const projectId = text(process.env.CREATIVE_PROJECT_ID);
const missionId = text(process.env.CREATIVE_MISSION_ID);
if (!organizationId || !projectId || !missionId) throw new Error("PRODUCTION_SCOPE_REQUIRED");

const manifestValue = object(manifest.value);
const gateValue = object(gate.value);
const previewValue = object(preview.value);
const costValue = object(cost.value);
const manifestSha = sha256(coreWithout(manifestValue, "manifest_sha256"));
const gateSha = sha256(coreWithout(gateValue, "gate_sha256"));
const previewSha = sha256(coreWithout(previewValue, "preview_sha256"));
const costSha = sha256(coreWithout(costValue, "sealed_cost_estimate_sha256"));
const blockers = [];
if (approvalLiteral !== expectedLiteral) blockers.push("EXPLICIT_PRODUCTION_APPROVAL_LITERAL_INVALID");
if (approvedMaximum !== 367.366602) blockers.push("EXPLICIT_PRODUCTION_APPROVAL_MAXIMUM_INVALID");
if (manifestValue.readiness !== "PASS" || manifestSha !== text(manifestValue.manifest_sha256)) blockers.push("SEALED_MANIFEST_INVALID");
if (gateValue.readiness !== "PASS" || gateSha !== text(gateValue.gate_sha256)) blockers.push("SEALED_PREPRODUCTION_GATE_INVALID");
if (previewValue.readiness !== "PASS" || previewSha !== text(previewValue.preview_sha256)) blockers.push("SEALED_GRAPH_PREVIEW_INVALID");
if (costValue.readiness !== "PASS" || costSha !== text(costValue.sealed_cost_estimate_sha256)) blockers.push("SEALED_COST_ESTIMATE_INVALID");
if (text(gateValue.manifest_sha256) !== manifestSha) blockers.push("GATE_MANIFEST_SHA_MISMATCH");
if (text(gateValue.graph_preview_sha256) !== previewSha) blockers.push("GATE_PREVIEW_SHA_MISMATCH");
if (money(manifestValue.authorization?.maximum_customer_price) !== approvedMaximum) blockers.push("MANIFEST_APPROVAL_CEILING_MISMATCH");
if (Number(gateValue.counts?.execution_step_count) !== 27) blockers.push("APPROVED_EXECUTION_STEP_COUNT_INVALID");
if (manifestValue.authorization?.publication_authorized !== false) blockers.push("PUBLICATION_MUST_REMAIN_UNAUTHORIZED");
if (blockers.length) throw new Error(`SEALED_PRODUCTION_APPROVAL_BLOCKED:${blockers.join(",")}`);

const [
  { supabaseAdmin },
  { ProductionGraphRuntime },
  { ProductionTaskRuntime },
  { ProductionQueueRuntime },
  { CreativeFinalisationRouter },
  { preparePromptlessPersistence },
] = await Promise.all([
  import("@/lib/shared/supabase/admin"),
  import("@/lib/creative/production-graph/runtime/ProductionGraphRuntime"),
  import("@/lib/operations/tasks/runtime/ProductionTaskRuntime"),
  import("@/lib/creative/production/queue/runtime/ProductionQueueRuntime"),
  import("@/lib/creative/finalisation/runtime/CreativeFinalisationRouter"),
  import("@/lib/creative/execution/runtime/CreativePromptlessPersistenceRuntime"),
]);

const before = await exactState(supabaseAdmin, organizationId, projectId);
if (before.wallet_balance < approvedMaximum) throw new Error("PRODUCTION_WALLET_INSUFFICIENT");
const executionReference = `churchill:${manifestSha}:${gateSha}`;
const approvalContract = {
  contract: "CREATIVE_SEALED_PRODUCTION_EXECUTION_APPROVAL_V1",
  approval_literal: approvalLiteral,
  maximum_customer_price: approvedMaximum,
  currency: "THB",
  manifest_sha256: manifestSha,
  preproduction_gate_sha256: gateSha,
  graph_preview_sha256: previewSha,
  production_authorized: true,
  publication_authorized: false,
  approved_at: "2026-08-04T20:37:00+07:00",
};

let graphs = await ProductionGraphRuntime.list({ organization_id: organizationId, creative_project_id: projectId });
let graph = graphs.find((item) =>
  text(item.metadata?.sealed_execution_reference) === executionReference,
) || null;
let graphCreated = false;
if (!graph) {
  const sourceGraph = preparePromptlessPersistence(previewValue.graph, "APPROVED_PRODUCTION_GRAPH");
  graph = await ProductionGraphRuntime.create({
    ...sourceGraph,
    id: deterministicUuid(`graph:${executionReference}`),
    organization_id: organizationId,
    creative_project_id: projectId,
    status: "APPROVED",
    cost_plan: {
      ...object(sourceGraph.cost_plan),
      currency: "THB",
      estimated_cost: money(manifestValue.cost_estimate?.selected_baseline),
      approved_cost: approvedMaximum,
      maximum_customer_price: approvedMaximum,
      approval_required: true,
      approved: true,
    },
    metadata: {
      ...object(sourceGraph.metadata),
      sealed_execution_reference: executionReference,
      production_approval_contract: approvalContract,
      publication_authorized: false,
    },
  });
  graphCreated = true;
}

const steps = list(previewValue.execution_plan?.steps);
if (steps.length !== 27) throw new Error("SEALED_EXECUTION_PLAN_STEP_COUNT_INVALID");
const prices = stepPriceAssignments(steps, costValue);
const expectedBaseline = money([...prices.values()].reduce((sum, item) => sum + Number(item.customer_price || 0), 0));
if (expectedBaseline !== money(manifestValue.cost_estimate?.selected_baseline)) {
  throw new Error(`APPROVED_ITEM_PRICE_TOTAL_MISMATCH:${expectedBaseline}:${manifestValue.cost_estimate?.selected_baseline}`);
}

let tasks = await ProductionTaskRuntime.list({ organization_id: organizationId, creative_project_id: projectId, production_graph_id: graph.id });
const byNode = new Map(tasks.map((task) => [text(task.metadata?.execution_node_id), task]));
let createdCount = 0;
for (const [index, step] of steps.entries()) {
  if (byNode.has(text(step.node_id))) continue;
  const price = prices.get(step.node_id);
  const quantity = quantityFor(step);
  const task = await ProductionTaskRuntime.create(preparePromptlessPersistence({
    id: deterministicUuid(`task:${executionReference}:${step.node_id}`),
    organization_id: organizationId,
    creative_project_id: projectId,
    production_graph_id: graph.id,
    scene_id: step.metadata?.scene_id || null,
    shot_id: step.metadata?.shot_id || null,
    type: taskType(step),
    status: "WAITING",
    title: step.metadata?.node_title || step.input?.title || `Production step ${index + 1}`,
    description: step.input?.description || "",
    service_id: step.service_code || step.capability,
    service_code: step.service_code || step.capability,
    capability: step.capability || step.service_code,
    provider_id: price.provider || null,
    priority: Number(step.priority || 100),
    depends_on: [],
    input: {
      ...object(step.input),
      quantity,
      currency: "THB",
      provider_parameters: {
        ...object(step.input?.provider_parameters),
        ...object(step.input?.generation?.provider_parameters),
      },
      approved_cost_guard: {
        maximum_customer_price: money(price.customer_price),
        currency: "THB",
        reference: `${executionReference}:${step.node_id}`,
        estimated_quantity: quantity,
      },
    },
    cost: {
      currency: "THB",
      estimated: money(price.customer_price),
      actual: 0,
      approved: true,
    },
    timing: { estimated_seconds: Number(step.estimated_seconds || 0) },
    review: { required: false, approved: false },
    metadata: {
      ...object(step.metadata),
      execution_node_id: step.node_id,
      execution_step_index: index,
      approved_pricing_id: price.pricing_id,
      approved_provider: price.provider,
      approved_model: price.model,
      approved_quantity: quantity,
      approved_unit: price.unit,
      approved_cost_guard: {
        maximum_customer_price: money(price.customer_price),
        currency: "THB",
        reference: `${executionReference}:${step.node_id}`,
        estimated_quantity: quantity,
      },
      production_approval_contract: approvalContract,
      sealed_execution_reference: executionReference,
      publication_authorized: false,
    },
  }, `APPROVED_PRODUCTION_TASK_${index + 1}`));
  byNode.set(text(step.node_id), task);
  createdCount += 1;
}

for (const step of steps) {
  const task = byNode.get(text(step.node_id));
  const dependencyIds = list(step.depends_on).map((nodeId) => byNode.get(text(nodeId))?.id).filter(Boolean);
  if (dependencyIds.length !== list(step.depends_on).length) {
    throw new Error(`PRODUCTION_TASK_DEPENDENCY_MAPPING_FAILED:${step.node_id}`);
  }
  if (JSON.stringify(list(task.depends_on)) !== JSON.stringify(dependencyIds)) {
    await ProductionTaskRuntime.update(task.id, { depends_on: dependencyIds });
  }
}

await ProductionGraphRuntime.update(graph.id, {
  status: "IN_PRODUCTION",
  metadata: {
    ...object(graph.metadata),
    sealed_execution_reference: executionReference,
    production_approval_contract: approvalContract,
    task_count: 27,
    publication_authorized: false,
  },
});

const scope = { organization_id: organizationId, creative_project_id: projectId };
const poll = await ProductionQueueRuntime.pollRunning(scope, { maxTasks: 27 });
const dispatched = [];
for (let pass = 0; pass < 27; pass += 1) {
  const next = await ProductionQueueRuntime.dispatchNext(scope);
  if (!next) break;
  dispatched.push(next);
}
const queue = await ProductionQueueRuntime.build(scope);
let finalisation = null;
const settled = queue.total > 0 && queue.ready.length === 0 && queue.running.length === 0 && queue.waiting.length === 0;
if (settled && queue.failed.length === 0 && queue.blocked.length === 0) {
  finalisation = await CreativeFinalisationRouter.run(scope);
  await ProductionGraphRuntime.update(graph.id, {
    status: "COMPLETED",
    metadata: {
      ...object(graph.metadata),
      finalisation_completed: true,
      publication_authorized: false,
    },
  });
}

const after = await exactState(supabaseAdmin, organizationId, projectId);
const tasksAfter = await ProductionTaskRuntime.list({ organization_id: organizationId, creative_project_id: projectId, production_graph_id: graph.id });
const statusCounts = tasksAfter.reduce((output, task) => {
  output[task.status] = (output[task.status] || 0) + 1;
  return output;
}, {});
const chargedOrReserved = money(before.wallet_balance - after.wallet_balance);
if (chargedOrReserved > approvedMaximum) {
  throw new Error(`PRODUCTION_APPROVAL_CEILING_EXCEEDED:${chargedOrReserved}:${approvedMaximum}`);
}

const reportCore = {
  contract: "CREATIVE_SEALED_PRODUCTION_EXECUTION_V1",
  generated_at: new Date().toISOString(),
  organization_id: organizationId,
  creative_project_id: projectId,
  creative_mission_id: missionId,
  execution_reference: executionReference,
  approval: approvalContract,
  graph_id: graph.id,
  graph_created: graphCreated,
  tasks_created: createdCount,
  task_count: tasksAfter.length,
  task_status_counts: statusCounts,
  polled_count: poll.total,
  dispatched_count: dispatched.length,
  queue: {
    waiting: queue.waiting.length,
    ready: queue.ready.length,
    running: queue.running.length,
    review: queue.review.length,
    completed: queue.completed.length,
    failed: queue.failed.length,
    blocked: queue.blocked.length,
  },
  finalisation,
  exact_state_before: before,
  exact_state_after: after,
  wallet_delta: chargedOrReserved,
  maximum_customer_price: approvedMaximum,
  production_authorized: true,
  publication_authorized: false,
  readiness: queue.failed.length || queue.blocked.length ? "FAIL" : settled ? "COMPLETED" : "IN_PROGRESS",
};
const report = { ...reportCore, execution_sha256: sha256(reportCore) };
const outputPath = path.resolve(text(process.env.PRODUCTION_EXECUTION_OUTPUT) || "/tmp/churchill-evidence-constrained-production-execution.json");
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log("============================================================");
console.log("APPROVED SEALED CHURCHILL VIDEO PRODUCTION");
console.log("============================================================");
console.log(`OUTPUT=${outputPath}`);
console.log(`EXECUTION_SHA256=${report.execution_sha256}`);
console.log(`GRAPH_ID=${graph.id}`);
console.log(`GRAPH_CREATED=${graphCreated ? "YES" : "NO"}`);
console.log(`TASKS_CREATED=${createdCount}`);
console.log(`TASK_COUNT=${tasksAfter.length}`);
console.log(`TASK_STATUS_COUNTS=${JSON.stringify(statusCounts)}`);
console.log(`POLLED_COUNT=${poll.total}`);
console.log(`DISPATCHED_COUNT=${dispatched.length}`);
console.log(`QUEUE_WAITING=${report.queue.waiting}`);
console.log(`QUEUE_READY=${report.queue.ready}`);
console.log(`QUEUE_RUNNING=${report.queue.running}`);
console.log(`QUEUE_COMPLETED=${report.queue.completed}`);
console.log(`QUEUE_FAILED=${report.queue.failed}`);
console.log(`QUEUE_BLOCKED=${report.queue.blocked}`);
console.log(`WALLET_BALANCE_BEFORE=${before.wallet_balance}`);
console.log(`WALLET_BALANCE_AFTER=${after.wallet_balance}`);
console.log(`WALLET_DELTA=${chargedOrReserved}`);
console.log(`MAXIMUM_CUSTOMER_PRICE=${approvedMaximum}`);
console.log(`PRODUCTION_EXECUTION_READINESS=${report.readiness}`);
console.log("PRODUCTION_AUTHORIZED=YES");
console.log("PUBLICATION_AUTHORIZED=NO");
console.log("TERMINAL_REMAINS_OPEN=YES");

if (report.readiness === "FAIL") process.exitCode = 2;
