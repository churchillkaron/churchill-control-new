#!/usr/bin/env node

import process from "node:process";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv({ cwd: process.cwd() });

const organizationId = String(process.env.ORGANIZATION_ID || "").trim();
const projectId = String(process.env.CREATIVE_PROJECT_ID || "").trim();
const graphId = String(process.env.PRODUCTION_GRAPH_ID || "").trim();

if (!organizationId || !projectId || !graphId) {
  throw new Error("CHARGED_RECONCILIATION_SCOPE_REQUIRED");
}

const [
  { ProductionTaskRuntime },
  { UsageRuntime },
  { GeneratedMediaPerceptualReviewRuntime },
] = await Promise.all([
  import("@/lib/operations/tasks/runtime/ProductionTaskRuntime"),
  import("@/lib/platform/service-runtime/usage/UsageRuntime"),
  import("@/lib/creative/quality/runtime/GeneratedMediaPerceptualReviewRuntime"),
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

function usageTaskId(usage = {}) {
  return text(
    usage.task_id ||
    usage.metadata?.task_id ||
    usage.metadata?.production_task_id,
  );
}

function usageTimestamp(usage = {}) {
  return Date.parse(
    usage.updated_at ||
    usage.completed_at ||
    usage.created_at ||
    "",
  ) || 0;
}

function successfulUsages(usages, taskId) {
  return usages
    .filter((usage) =>
      usageTaskId(usage) === text(taskId) &&
      ["SUCCESS", "COMPLETED", "BILLED"].includes(upper(usage.status)),
    )
    .sort((left, right) => usageTimestamp(right) - usageTimestamp(left));
}

function settlement(task = {}) {
  return upper(
    task.output?.settlement ||
    task.output?.provider_submission?.settlement ||
    task.output?.provider_poll?.settlement,
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

const reconciled = [];
const unchanged = [];
const blocked = [];

for (const task of tasks) {
  const success = successfulUsages(usages, task.id)[0] || null;
  if (!success) {
    unchanged.push(task.id);
    continue;
  }

  const needsReconciliation = Boolean(
    upper(task.status) !== "COMPLETED" ||
    settlement(task) !== "CHARGED" ||
    finite(task.cost?.actual) <= 0,
  );
  if (!needsReconciliation) {
    unchanged.push(task.id);
    continue;
  }

  try {
    if (GeneratedMediaPerceptualReviewRuntime.matches(task)) {
      await GeneratedMediaPerceptualReviewRuntime.reconcile(task, success);
    } else {
      await ProductionTaskRuntime.update(task.id, {
        status: "COMPLETED",
        error: null,
        output: {
          ...(task.output || {}),
          provider: success.provider || task.provider_id || null,
          usage: success,
          settlement: "CHARGED",
        },
        cost: {
          ...(task.cost || {}),
          actual: finite(success.customer_price),
        },
        timing: {
          ...(task.timing || {}),
          completed_at:
            task.timing?.completed_at ||
            success.completed_at ||
            success.updated_at ||
            new Date().toISOString(),
        },
        metadata: {
          ...(task.metadata || {}),
          settlement_reconciled_from_usage_id: success.id,
          settlement_reconciliation_contract:
            "CHARGED_USAGE_AUTHORITATIVE_V1",
          settlement_reconciled_at: new Date().toISOString(),
        },
      });
    }
    reconciled.push({
      id: task.id,
      title: task.title || "",
      usage_id: success.id,
      amount: finite(success.customer_price),
    });
  } catch (error) {
    blocked.push({
      id: task.id,
      title: task.title || "",
      usage_id: success.id,
      error: error?.message || String(error),
    });
  }
}

console.log("============================================================");
console.log("CHARGED PRODUCTION TASK RECONCILIATION");
console.log("============================================================");
console.log(`TASK_TOTAL=${tasks.length}`);
console.log(`RECONCILED_TASK_COUNT=${reconciled.length}`);
for (const item of reconciled) {
  console.log(
    `RECONCILED_TASK=${item.id}|${item.title}|` +
    `USAGE=${item.usage_id}|AMOUNT=${item.amount}`,
  );
}
console.log(`UNCHANGED_TASK_COUNT=${unchanged.length}`);
console.log(`BLOCKED_TASK_COUNT=${blocked.length}`);
for (const item of blocked) {
  console.log(`BLOCKED_TASK=${JSON.stringify(item)}`);
}
console.log("PROVIDER_EXECUTION_PERFORMED=NO");
console.log("WALLET_OPERATION_PERFORMED=NO");
console.log("TASK_REGENERATION_PERFORMED=NO");
console.log("PUBLICATION_AUTHORIZED=NO");

if (blocked.length) process.exitCode = 2;
