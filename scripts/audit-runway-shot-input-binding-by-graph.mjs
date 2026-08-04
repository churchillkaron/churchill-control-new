#!/usr/bin/env node

import process from "node:process";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv({ cwd: process.cwd() });

function text(value) {
  return String(value ?? "").trim();
}

const graphId = text(
  process.env.PRODUCTION_GRAPH_ID ||
  process.argv[2],
);

if (!graphId) {
  throw new Error("PRODUCTION_GRAPH_ID_REQUIRED");
}

process.env.CREATIVE_ALLOW_AUTOMATIC_REPAIR = "false";
process.env.CREATIVE_APPROVED_INCREMENTAL_REPAIR_BUDGET = "0";
process.env.REPAIR_EXECUTION_AUTHORIZED = "false";
process.env.PUBLICATION_AUTHORIZED = "false";

const { ProductionGraphRuntime } = await import(
  "@/lib/creative/production-graph/runtime/ProductionGraphRuntime"
);

const graph = await ProductionGraphRuntime.get(graphId);

if (!graph || text(graph.id) !== graphId) {
  throw new Error(`PRODUCTION_GRAPH_NOT_FOUND:${graphId}`);
}

const organizationId = text(
  process.env.ORGANIZATION_ID ||
  graph.organization_id,
);

const creativeProjectId = text(
  process.env.CREATIVE_PROJECT_ID ||
  graph.creative_project_id,
);

if (!organizationId || !creativeProjectId) {
  throw new Error("PRODUCTION_GRAPH_SCOPE_INCOMPLETE");
}

process.env.ORGANIZATION_ID = organizationId;
process.env.CREATIVE_PROJECT_ID = creativeProjectId;
process.env.PRODUCTION_GRAPH_ID = graphId;
process.env.EXPECTED_VIDEO_TASK_COUNT = text(
  process.env.EXPECTED_VIDEO_TASK_COUNT || 10,
);

console.log("============================================================");
console.log("GRAPH-SCOPED READ-ONLY RUNWAY AUDIT");
console.log("============================================================");
console.log(`ORGANIZATION_ID=${organizationId}`);
console.log(`CREATIVE_PROJECT_ID=${creativeProjectId}`);
console.log(`PRODUCTION_GRAPH_ID=${graphId}`);
console.log(`GRAPH_STATUS=${text(graph.status) || "UNKNOWN"}`);
console.log("READ_ONLY_AUDIT=YES");
console.log("AUTOMATIC_REPAIR_ALLOWED=NO");
console.log("APPROVED_REPAIR_BUDGET=0");
console.log("PROVIDER_CALLS_AUTHORIZED=NO");
console.log("WALLET_CHANGES_AUTHORIZED=NO");
console.log("PUBLICATION_AUTHORIZED=NO");

await import("./audit-runway-shot-input-binding.mjs");
