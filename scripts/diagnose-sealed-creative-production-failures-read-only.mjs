#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv({ cwd: process.cwd() });
await import("./creative-runtime-bootstrap.mjs");

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

function sortedKeys(value) {
  return Object.keys(object(value)).sort();
}

function safeOutput(task = {}) {
  const output = object(task.output);
  const submission = object(output.provider_submission);
  const nested = object(submission.output);
  return {
    output_keys: sortedKeys(output),
    provider_submission_keys: sortedKeys(submission),
    provider_submission_output_keys: sortedKeys(nested),
    provider_job_id:
      output.provider_job_id ||
      submission.provider_job_id ||
      nested.provider_job_id ||
      null,
    provider_status:
      output.provider_status ||
      submission.provider_status ||
      null,
    settlement:
      output.settlement ||
      submission.settlement ||
      null,
    usage_id:
      output.usage?.id ||
      submission.usage?.id ||
      null,
    pricing_id:
      output.pricing?.pricing_id ||
      submission.pricing?.pricing_id ||
      null,
    error:
      output.error ||
      submission.error ||
      nested.error ||
      null,
    message:
      output.message ||
      submission.message ||
      nested.message ||
      null,
  };
}

function taskEvidence(task = {}) {
  const input = object(task.input);
  const generation = object(input.generation);
  const providerParameters = object(input.provider_parameters);
  const generationProviderParameters = object(generation.provider_parameters);
  const approval = object(task.metadata?.production_approval_contract);
  const guard = object(
    task.metadata?.approved_cost_guard || input.approved_cost_guard,
  );

  return {
    id: task.id,
    status: task.status,
    type: task.type,
    title: task.title,
    execution_node_id: task.metadata?.execution_node_id || null,
    service_id: task.service_id || task.service_code || null,
    capability: task.capability || null,
    provider_id: task.provider_id || null,
    error: task.error || null,
    depends_on: list(task.depends_on),
    cost: task.cost || null,
    timing: task.timing || null,
    approved_cost_guard: guard,
    production_approval: {
      contract: approval.contract || null,
      production_authorized: approval.production_authorized === true,
      publication_authorized: approval.publication_authorized === true,
      maximum_customer_price: approval.maximum_customer_price ?? null,
    },
    primary_source_asset_id:
      input.primary_source_asset_id ||
      generation.primary_source_asset_id ||
      generationProviderParameters.primary_source_asset_id ||
      null,
    source_binding_contract:
      input.source_binding_contract ||
      generation.source_binding_contract ||
      generationProviderParameters.source_binding_contract ||
      null,
    input_keys: sortedKeys(input),
    generation_keys: sortedKeys(generation),
    provider_parameter_keys: sortedKeys(providerParameters),
    generation_provider_parameter_keys:
      sortedKeys(generationProviderParameters),
    provider_policy: input.provider_policy || null,
    asset_scope_hash:
      task.metadata?.asset_scope_hash ||
      input.requirements?.asset_scope?.scope_hash ||
      null,
    strict_scope_verified:
      task.metadata?.strict_shot_asset_scope_verified === true,
    dossier_verified:
      task.metadata?.production_dossier_gate_passed === true,
    output: safeOutput(task),
  };
}

async function exactState(supabaseAdmin, organizationId, projectId, graphId) {
  const [tasks, usage, wallet] = await Promise.all([
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
  for (const result of [tasks, usage, wallet]) {
    if (result.error) throw result.error;
  }
  return {
    task_count: Number(tasks.count || 0),
    usage_count: Number(usage.count || 0),
    wallet_balance: Number(wallet.data?.available_balance || 0),
    wallet_currency: text(wallet.data?.currency) || "THB",
    wallet_updated_at: wallet.data?.updated_at || null,
  };
}

const organizationId = text(process.env.ORGANIZATION_ID);
const projectId = text(process.env.CREATIVE_PROJECT_ID);
const graphId = text(
  process.env.PRODUCTION_GRAPH_ID ||
    "b31d787a-dedc-4b94-9df5-dda86eb52815",
);
const outputPath = path.resolve(
  text(process.env.PRODUCTION_FAILURE_FORENSICS_OUTPUT) ||
    "/tmp/churchill-sealed-production-failure-forensics.json",
);

if (!organizationId || !projectId || !graphId) {
  throw new Error("PRODUCTION_FAILURE_FORENSIC_SCOPE_REQUIRED");
}

const { supabaseAdmin } = await import("@/lib/shared/supabase/admin");
const { ProductionTaskRuntime } = await import(
  "@/lib/operations/tasks/runtime/ProductionTaskRuntime"
);

const before = await exactState(
  supabaseAdmin,
  organizationId,
  projectId,
  graphId,
);
const tasks = await ProductionTaskRuntime.list({
  organization_id: organizationId,
  creative_project_id: projectId,
  production_graph_id: graphId,
});
const graphTasks = tasks.filter((task) =>
  text(task.production_graph_id) === graphId,
);
const failed = graphTasks.filter((task) => task.status === "FAILED");
const running = graphTasks.filter((task) => task.status === "RUNNING");
const waiting = graphTasks.filter((task) => task.status === "WAITING");
const errorGroups = new Map();
for (const task of failed) {
  const error = text(task.error) || "FAILED_WITHOUT_ERROR";
  if (!errorGroups.has(error)) errorGroups.set(error, []);
  errorGroups.get(error).push(task.id);
}

const recentUsageResult = await supabaseAdmin
  .from("platform_service_usage")
  .select("*")
  .eq("organization_id", organizationId)
  .order("created_at", { ascending: false })
  .limit(200);
if (recentUsageResult.error) throw recentUsageResult.error;
const graphTaskIds = new Set(graphTasks.map((task) => task.id));
const relatedUsage = list(recentUsageResult.data).filter((usage) =>
  graphTaskIds.has(text(usage.metadata?.task_id)),
).map((usage) => ({
  id: usage.id,
  task_id: usage.metadata?.task_id || null,
  status: usage.status || usage.state || null,
  provider: usage.provider || usage.provider_id || null,
  service_id: usage.service_id || usage.capability || null,
  quantity: usage.quantity ?? null,
  unit: usage.unit || null,
  supplier_cost: usage.supplier_cost ?? null,
  customer_price: usage.customer_price ?? null,
  currency: usage.currency || null,
  provider_job_id:
    usage.provider_job_id || usage.external_job_id || null,
  error: usage.error || usage.error_message || null,
  created_at: usage.created_at || null,
  completed_at: usage.completed_at || null,
}));

const after = await exactState(
  supabaseAdmin,
  organizationId,
  projectId,
  graphId,
);
const unchanged =
  before.task_count === after.task_count &&
  before.usage_count === after.usage_count &&
  before.wallet_balance === after.wallet_balance;

const report = {
  contract: "CREATIVE_SEALED_PRODUCTION_FAILURE_FORENSICS_V1",
  generated_at: new Date().toISOString(),
  organization_id: organizationId,
  creative_project_id: projectId,
  production_graph_id: graphId,
  task_count: graphTasks.length,
  failed_count: failed.length,
  running_count: running.length,
  waiting_count: waiting.length,
  error_group_count: errorGroups.size,
  error_groups: [...errorGroups.entries()].map(([error, taskIds]) => ({
    error,
    task_count: taskIds.length,
    task_ids: taskIds,
  })),
  failed_tasks: failed.map(taskEvidence),
  running_tasks: running.map(taskEvidence),
  waiting_tasks: waiting.map(taskEvidence),
  related_usage: relatedUsage,
  exact_state_before: before,
  exact_state_after: after,
  database_writes_executed: false,
  provider_calls_executed: false,
  provider_polls_executed: false,
  retries_executed: false,
  wallet_changed: before.wallet_balance !== after.wallet_balance,
  state_unchanged: unchanged,
  readiness: failed.length ? "FAILURES_IDENTIFIED" : "NO_FAILED_TASKS",
};

fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log("============================================================");
console.log("READ-ONLY SEALED PRODUCTION FAILURE FORENSICS");
console.log("============================================================");
console.log(`OUTPUT=${outputPath}`);
console.log(`GRAPH_ID=${graphId}`);
console.log(`TASK_COUNT=${graphTasks.length}`);
console.log(`FAILED_COUNT=${failed.length}`);
console.log(`RUNNING_COUNT=${running.length}`);
console.log(`WAITING_COUNT=${waiting.length}`);
console.log(`ERROR_GROUP_COUNT=${errorGroups.size}`);
for (const [error, taskIds] of errorGroups.entries()) {
  console.log(`ERROR_GROUP=${taskIds.length}|${error}`);
}
for (const task of failed) {
  console.log(
    `FAILED_TASK=${task.id}|${text(task.metadata?.execution_node_id)}|${text(task.capability || task.service_code)}|${text(task.provider_id)}|${text(task.error)}`,
  );
}
for (const task of running) {
  const evidence = safeOutput(task);
  console.log(
    `RUNNING_TASK=${task.id}|${text(task.metadata?.execution_node_id)}|${text(task.capability || task.service_code)}|${text(task.provider_id)}|job=${text(evidence.provider_job_id)}|usage=${text(evidence.usage_id)}|settlement=${text(evidence.settlement)}`,
  );
}
console.log(`RELATED_USAGE_COUNT=${relatedUsage.length}`);
console.log(`USAGE_COUNT_BEFORE=${before.usage_count}`);
console.log(`USAGE_COUNT_AFTER=${after.usage_count}`);
console.log(`WALLET_BALANCE_BEFORE=${before.wallet_balance}`);
console.log(`WALLET_BALANCE_AFTER=${after.wallet_balance}`);
console.log(`STATE_UNCHANGED=${unchanged ? "YES" : "NO"}`);
console.log("DATABASE_WRITES_EXECUTED=NO");
console.log("PROVIDER_CALLS_EXECUTED=NO");
console.log("PROVIDER_POLLS_EXECUTED=NO");
console.log("RETRIES_EXECUTED=NO");
console.log("PUBLICATION_AUTHORIZED=NO");
console.log("TERMINAL_REMAINS_OPEN=YES");
