#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

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

function readJson(filePath, label) {
  const absolute = path.resolve(filePath);
  if (!fs.existsSync(absolute)) {
    throw new Error(`${label}_FILE_NOT_FOUND:${absolute}`);
  }
  return {
    absolute,
    value: JSON.parse(fs.readFileSync(absolute, "utf8")),
  };
}

const preview = readJson(process.argv[2], "GRAPH_PREVIEW");
const manifest = readJson(process.argv[3], "APPROVAL_MANIFEST");
const organizationId = text(process.env.ORGANIZATION_ID);
const projectId = text(process.env.CREATIVE_PROJECT_ID);
if (!organizationId) throw new Error("ORGANIZATION_ID_REQUIRED");
if (!projectId) throw new Error("CREATIVE_PROJECT_ID_REQUIRED");
if (list(manifest.value.blockers).length) {
  throw new Error(`APPROVAL_MANIFEST_BLOCKED:${manifest.value.blockers.join(",")}`);
}
if (preview.value.readiness !== "PASS" && preview.value.summary?.readiness !== "PASS") {
  throw new Error("GRAPH_PREVIEW_NOT_READY");
}

const [
  { supabaseAdmin },
  {
    preparePromptlessPersistence,
    persistedPromptFieldPaths,
  },
  { serializeCreativeProviderInstruction },
] = await Promise.all([
  import("@/lib/shared/supabase/admin"),
  import("@/lib/creative/execution/runtime/CreativePromptlessPersistenceRuntime"),
  import("@/lib/creative/execution/runtime/CreativeProviderInstructionSerializer"),
]);

async function count(table, filters = {}) {
  let query = supabaseAdmin
    .from(table)
    .select("id", { count: "exact", head: true });
  for (const [column, value] of Object.entries(filters)) {
    query = query.eq(column, value);
  }
  const { count: result, error } = await query;
  if (error) throw error;
  return Number(result || 0);
}

function graphFromPreview(value = {}) {
  return object(
    value.graph ||
    value.production_graph ||
    value.preview?.graph ||
    value.payload?.graph,
  );
}

function executionFromPreview(value = {}) {
  return object(
    value.execution_plan ||
    value.executionPlan ||
    value.preview?.execution_plan ||
    value.payload?.execution_plan,
  );
}

function taskPayload(step = {}, index = 0) {
  const input = object(step.input);
  const metadata = object(step.metadata);
  return {
    id: `promptless-audit-task-${index + 1}`,
    organization_id: organizationId,
    creative_project_id: projectId,
    production_graph_id: "promptless-audit-graph",
    scene_id: metadata.scene_id || null,
    shot_id: metadata.shot_id || null,
    type: metadata.task_type || "EXECUTE_CAPABILITY",
    status: "WAITING",
    title: metadata.node_title || input.title || "",
    description: input.description || "",
    service_id: step.service_code || step.capability || null,
    service_code: step.service_code || step.capability || null,
    capability: step.capability || step.service_code || null,
    provider_id:
      input.generation?.provider ||
      metadata.provider_id ||
      null,
    priority: Number(step.priority || 100),
    depends_on: list(step.depends_on),
    input,
    cost: {
      estimated: Number(step.estimated_cost || 0),
      currency: manifest.value.currency || "THB",
      approved: false,
    },
    metadata,
  };
}

const graph = graphFromPreview(preview.value);
const executionPlan = executionFromPreview(preview.value);
if (!Object.keys(graph).length) throw new Error("GRAPH_PREVIEW_GRAPH_REQUIRED");
if (!Object.keys(executionPlan).length) {
  throw new Error("GRAPH_PREVIEW_EXECUTION_PLAN_REQUIRED");
}

const before = {
  graph_count: await count("creative_production_graphs", {
    organization_id: organizationId,
    creative_project_id: projectId,
  }),
  task_count: await count("creative_production_tasks", {
    organization_id: organizationId,
    creative_project_id: projectId,
  }),
  usage_count: await count("platform_service_usage", {
    organization_id: organizationId,
  }),
};

const preparedGraph = preparePromptlessPersistence(
  graph,
  "CREATIVE_PRODUCTION_GRAPH_AUDIT",
);
const preparedExecution = preparePromptlessPersistence(
  executionPlan,
  "CREATIVE_EXECUTION_PLAN_AUDIT",
);
const preparedTasks = list(preparedExecution.steps).map((step, index) =>
  preparePromptlessPersistence(
    taskPayload(step, index),
    `CREATIVE_PRODUCTION_TASK_AUDIT_${index + 1}`,
  ),
);

const graphPromptPaths = persistedPromptFieldPaths(
  preparedGraph,
  "graph",
);
const executionPromptPaths = persistedPromptFieldPaths(
  preparedExecution,
  "execution_plan",
);
const taskPromptPaths = preparedTasks.flatMap((task, index) =>
  persistedPromptFieldPaths(task, `task_${index + 1}`),
);

const serializedInstructions = preparedTasks.map((task) =>
  serializeCreativeProviderInstruction({
    capability: task.capability,
    service_id: task.service_id,
    ...object(task.input),
    metadata: task.metadata,
  }),
);
const emptyInstructions = serializedInstructions
  .map((instruction, index) => ({ index, instruction }))
  .filter((item) => !text(item.instruction));

const after = {
  graph_count: await count("creative_production_graphs", {
    organization_id: organizationId,
    creative_project_id: projectId,
  }),
  task_count: await count("creative_production_tasks", {
    organization_id: organizationId,
    creative_project_id: projectId,
  }),
  usage_count: await count("platform_service_usage", {
    organization_id: organizationId,
  }),
};

const blockers = [];
if (graphPromptPaths.length) blockers.push("GRAPH_PERSISTENCE_NOT_PROMPTLESS");
if (executionPromptPaths.length) blockers.push("EXECUTION_PERSISTENCE_NOT_PROMPTLESS");
if (taskPromptPaths.length) blockers.push("TASK_PERSISTENCE_NOT_PROMPTLESS");
if (preparedTasks.length !== 27) blockers.push("TASK_PAYLOAD_COUNT_INVALID");
if (emptyInstructions.length) blockers.push("TRANSPORT_INSTRUCTION_SERIALIZATION_FAILED");
if (before.graph_count !== after.graph_count) blockers.push("GRAPH_DATABASE_CHANGED");
if (before.task_count !== after.task_count) blockers.push("TASK_DATABASE_CHANGED");
if (before.usage_count !== after.usage_count) blockers.push("USAGE_DATABASE_CHANGED");

const report = {
  contract: "CREATIVE_PROMPTLESS_PERSISTENCE_READ_ONLY_AUDIT_V1",
  generated_at: new Date().toISOString(),
  organization_id: organizationId,
  creative_project_id: projectId,
  approval_manifest_hash: manifest.value.manifest_hash,
  graph_preview_file: preview.absolute,
  graph_prompt_field_paths: graphPromptPaths,
  execution_prompt_field_paths: executionPromptPaths,
  task_prompt_field_paths: taskPromptPaths,
  task_payload_count: preparedTasks.length,
  transport_instruction_count: serializedInstructions.length,
  empty_transport_instruction_indexes: emptyInstructions.map((item) => item.index),
  before,
  after,
  blockers,
  readiness: blockers.length ? "FAIL" : "PASS",
  provider_calls_executed: false,
  database_writes_executed: false,
  wallet_changed: false,
  production_authorized: false,
};

const output = path.resolve(
  text(process.env.PROMPTLESS_PERSISTENCE_AUDIT_OUTPUT) ||
  "/tmp/churchill-promptless-persistence-audit.json",
);
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log("============================================================");
console.log("READ-ONLY CREATIVE PROMPTLESS PERSISTENCE AUDIT");
console.log("============================================================");
console.log(`OUTPUT=${output}`);
console.log(`GRAPH_PROMPT_FIELD_COUNT=${graphPromptPaths.length}`);
console.log(`EXECUTION_PROMPT_FIELD_COUNT=${executionPromptPaths.length}`);
console.log(`TASK_PROMPT_FIELD_COUNT=${taskPromptPaths.length}`);
console.log(`TASK_PAYLOAD_COUNT=${preparedTasks.length}`);
console.log(`TRANSPORT_INSTRUCTION_COUNT=${serializedInstructions.length}`);
console.log(`EMPTY_TRANSPORT_INSTRUCTION_COUNT=${emptyInstructions.length}`);
console.log(`GRAPH_COUNT_BEFORE=${before.graph_count}`);
console.log(`GRAPH_COUNT_AFTER=${after.graph_count}`);
console.log(`TASK_COUNT_BEFORE=${before.task_count}`);
console.log(`TASK_COUNT_AFTER=${after.task_count}`);
console.log(`USAGE_COUNT_BEFORE=${before.usage_count}`);
console.log(`USAGE_COUNT_AFTER=${after.usage_count}`);
console.log(`PROMPTLESS_PERSISTENCE_READINESS=${report.readiness}`);
console.log(`PROMPTLESS_PERSISTENCE_BLOCKER_COUNT=${blockers.length}`);
console.log(`PROMPTLESS_PERSISTENCE_BLOCKERS=${JSON.stringify(blockers)}`);
console.log("DATABASE_WRITES_EXECUTED=NO");
console.log("PROVIDER_CALLS_EXECUTED=NO");
console.log("WALLET_CHANGED=NO");
console.log("PRODUCTION_AUTHORIZED=NO");
console.log("PUBLICATION_AUTHORIZED=NO");
console.log("TERMINAL_REMAINS_OPEN=YES");

if (blockers.length) process.exitCode = 2;
