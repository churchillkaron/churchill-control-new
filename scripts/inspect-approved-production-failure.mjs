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

function upper(value) {
  return text(value).toUpperCase();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
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
    task.output?.provider_poll?.usage?.id ||
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

function provider(task = {}) {
  return (
    task.provider_id ||
    task.output?.provider ||
    task.output?.provider_submission?.provider ||
    task.output?.provider_poll?.provider ||
    "NONE"
  );
}

function usageTaskId(row = {}) {
  return text(
    row.task_id ||
    row.metadata?.task_id ||
    row.metadata?.production_task_id,
  );
}

function transactionUsageId(row = {}) {
  return text(
    row.usage_id ||
    row.reference ||
    row.metadata?.usage_id,
  );
}

function transactionType(row = {}) {
  return upper(
    row.type ||
    row.transaction_type ||
    row.operation,
  );
}

function taskUsageRows(usages, taskId) {
  return usages.filter((row) => usageTaskId(row) === text(taskId));
}

function taskTransactions(transactions, usages) {
  const usageIds = new Set(usages.map((row) => text(row.id)).filter(Boolean));
  return transactions.filter((row) =>
    usageIds.has(transactionUsageId(row)),
  );
}

function transactionAmount(rows, type) {
  return rows
    .filter((row) => transactionType(row).includes(type))
    .reduce((sum, row) => sum + finite(row.amount), 0);
}

function authoritativeTaskCost(task, usages) {
  const successful = usages
    .filter((row) => ["SUCCESS", "COMPLETED", "BILLED"].includes(upper(row.status)))
    .reduce((sum, row) => sum + finite(row.customer_price), 0);
  if (successful > 0) return successful;

  for (const value of [
    task.output?.usage?.customer_price,
    task.output?.provider_poll?.usage?.customer_price,
    task.output?.provider_poll?.pricing?.customer_price,
    task.output?.provider_submission?.usage?.customer_price,
    task.output?.provider_submission?.pricing?.customer_price,
    task.output?.pricing?.customer_price,
    task.cost?.actual,
  ]) {
    const amount = Number(value);
    if (Number.isFinite(amount) && amount >= 0) return amount;
  }
  return 0;
}

function conciseError(task = {}) {
  return text(
    task.error ||
    task.output?.error ||
    task.output?.provider_poll?.error ||
    task.output?.provider_submission?.error ||
    "NONE",
  ).replace(/\s+/g, " ").slice(0, 2000);
}

function outputKeys(task = {}) {
  return Object.keys(object(task.output)).sort();
}

function printTask(label, task, usages, transactions) {
  const relatedUsages = taskUsageRows(usages, task.id);
  const relatedTransactions = taskTransactions(transactions, relatedUsages);
  const reserve = transactionAmount(relatedTransactions, "RESERVE");
  const charge = transactionAmount(relatedTransactions, "CHARGE");
  const release = transactionAmount(relatedTransactions, "RELEASE");
  const refund = transactionAmount(relatedTransactions, "REFUND");

  console.log("------------------------------------------------------------");
  console.log(`${label}_TASK_ID=${task.id}`);
  console.log(`${label}_TITLE=${task.title || ""}`);
  console.log(`${label}_STATUS=${task.status || ""}`);
  console.log(`${label}_TYPE=${task.type || ""}`);
  console.log(`${label}_CAPABILITY=${task.capability || task.service_code || task.service_id || ""}`);
  console.log(`${label}_PROVIDER=${provider(task)}`);
  console.log(`${label}_ERROR=${conciseError(task)}`);
  console.log(`${label}_PROVIDER_JOB_ID=${providerJobId(task) || "NONE"}`);
  console.log(`${label}_TASK_USAGE_ID=${usageId(task) || "NONE"}`);
  console.log(`${label}_SETTLEMENT=${settlement(task)}`);
  console.log(`${label}_DEPENDS_ON=${JSON.stringify(task.depends_on || [])}`);
  console.log(`${label}_OUTPUT_KEYS=${JSON.stringify(outputKeys(task))}`);
  console.log(`${label}_TASK_RECORDED_COST=${finite(task.cost?.actual)}`);
  console.log(`${label}_AUTHORITATIVE_COST=${authoritativeTaskCost(task, relatedUsages)}`);
  console.log(`${label}_USAGE_COUNT=${relatedUsages.length}`);
  for (const usage of relatedUsages) {
    console.log([
      `${label}_USAGE`,
      usage.id || "NONE",
      usage.status || "NONE",
      usage.provider || "NONE",
      usage.capability || usage.operation || "NONE",
      finite(usage.customer_price),
      usage.currency || "NONE",
      text(usage.error_message || usage.error) || "NONE",
    ].join("|"));
  }
  console.log(`${label}_WALLET_RESERVE=${reserve}`);
  console.log(`${label}_WALLET_CHARGE=${charge}`);
  console.log(`${label}_WALLET_RELEASE=${release}`);
  console.log(`${label}_WALLET_REFUND=${refund}`);
}

const requestedTaskId = text(process.argv[2] || process.env.TASK_ID);
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

const [
  { ProductionTaskRuntime },
  { UsageRuntime },
  { WalletRepository },
] = await Promise.all([
  import("@/lib/operations/tasks/runtime/ProductionTaskRuntime"),
  import("@/lib/platform/service-runtime/usage/UsageRuntime"),
  import("@/lib/platform/service-runtime/wallet/repositories/WalletRepository"),
]);

const [tasks, organizationUsages, organizationTransactions] = await Promise.all([
  ProductionTaskRuntime.list({
    organization_id: organizationId,
    creative_project_id: projectId,
    production_graph_id: graphId,
  }),
  UsageRuntime.organization(organizationId),
  WalletRepository.transactions(organizationId),
]);

const taskIds = new Set(tasks.map((task) => text(task.id)).filter(Boolean));
const usages = organizationUsages.filter((row) => {
  const metadata = object(row.metadata);
  return (
    text(metadata.production_graph_id) === graphId ||
    taskIds.has(usageTaskId(row))
  );
});
const usageIds = new Set(usages.map((row) => text(row.id)).filter(Boolean));
const transactions = organizationTransactions.filter((row) =>
  usageIds.has(transactionUsageId(row)),
);

const byStatus = new Map();
for (const task of tasks) {
  const status = upper(task.status) || "UNKNOWN";
  byStatus.set(status, (byStatus.get(status) || 0) + 1);
}

const failed = tasks.filter((task) => upper(task.status) === "FAILED");
const running = tasks.filter((task) => upper(task.status) === "RUNNING");
const blocked = tasks.filter((task) => upper(task.status) === "BLOCKED");
const completed = tasks.filter((task) => upper(task.status) === "COMPLETED");
const requested = requestedTaskId
  ? tasks.find((task) => text(task.id) === requestedTaskId)
  : null;

const graphAuthoritativeCost = tasks.reduce((sum, task) =>
  sum + authoritativeTaskCost(task, taskUsageRows(usages, task.id)), 0,
);
const charged = transactionAmount(transactions, "CHARGE");
const reserved = transactionAmount(transactions, "RESERVE");
const released = transactionAmount(transactions, "RELEASE");
const refunded = transactionAmount(transactions, "REFUND");

console.log("============================================================");
console.log("APPROVED PRODUCTION AUTOMATIC FAILURE INSPECTION");
console.log("============================================================");
console.log(`ORGANIZATION_ID=${organizationId}`);
console.log(`CREATIVE_PROJECT_ID=${projectId}`);
console.log(`PRODUCTION_GRAPH_ID=${graphId}`);
console.log(`TASK_TOTAL=${tasks.length}`);
for (const [status, count] of [...byStatus.entries()].sort()) {
  console.log(`TASK_STATUS_${status}=${count}`);
}
console.log(`TASK_FAILED=${failed.length}`);
console.log(`TASK_RUNNING=${running.length}`);
console.log(`TASK_BLOCKED=${blocked.length}`);
console.log(`TASK_COMPLETED=${completed.length}`);
console.log(`GRAPH_USAGE_COUNT=${usages.length}`);
console.log(`GRAPH_AUTHORITATIVE_COST=${graphAuthoritativeCost}`);
console.log(`GRAPH_WALLET_RESERVE=${reserved}`);
console.log(`GRAPH_WALLET_CHARGE=${charged}`);
console.log(`GRAPH_WALLET_RELEASE=${released}`);
console.log(`GRAPH_WALLET_REFUND=${refunded}`);
console.log(`GRAPH_OPEN_RESERVATION=${Math.max(0, reserved - charged - released - refunded)}`);

if (requestedTaskId && !requested) {
  console.log(`REQUESTED_TASK_NOT_FOUND=${requestedTaskId}`);
}
if (requested) {
  printTask("REQUESTED", requested, usages, transactions);
}
failed.forEach((task, index) =>
  printTask(`FAILED_${index + 1}`, task, usages, transactions),
);
running.forEach((task, index) =>
  printTask(`RUNNING_${index + 1}`, task, usages, transactions),
);
blocked.forEach((task, index) =>
  printTask(`BLOCKED_${index + 1}`, task, usages, transactions),
);
completed.forEach((task, index) => {
  const relatedUsages = taskUsageRows(usages, task.id);
  console.log([
    "COMPLETED_TASK",
    index + 1,
    task.id,
    task.title || "",
    provider(task),
    finite(task.cost?.actual),
    authoritativeTaskCost(task, relatedUsages),
    settlement(task),
    providerJobId(task) || "NONE",
    usageId(task) || "NONE",
  ].join("|"));
});

console.log("READ_ONLY_INSPECTION=PASS");
console.log("PRODUCTION_RESTARTED=NO");
console.log("PUBLICATION_AUTHORIZED=NO");
