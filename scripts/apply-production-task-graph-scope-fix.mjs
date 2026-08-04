#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const target = path.resolve(
  process.cwd(),
  "lib/creative/director/orchestrator/CreativePipelineOrchestrator.js",
);

const before = `  const existing = await ProductionTaskRuntime.list({
    organization_id,
    creative_project_id,
  });`;

const after = `  const existing = await ProductionTaskRuntime.list({
    organization_id,
    creative_project_id,
    production_graph_id,
  });`;

const source = fs.readFileSync(target, "utf8");
const beforeCount = source.split(before).length - 1;
const afterCount = source.split(after).length - 1;

if (afterCount === 1 && beforeCount === 0) {
  console.log("PRODUCTION_TASK_GRAPH_SCOPE_FIX=ALREADY_APPLIED");
  process.exit(0);
}

if (beforeCount !== 1 || afterCount !== 0) {
  throw new Error(
    `PRODUCTION_TASK_GRAPH_SCOPE_PATCH_TARGET_INVALID:before=${beforeCount};after=${afterCount}`,
  );
}

fs.writeFileSync(target, source.replace(before, after), "utf8");

const verified = fs.readFileSync(target, "utf8");
if (!verified.includes(after) || verified.includes(before)) {
  throw new Error("PRODUCTION_TASK_GRAPH_SCOPE_PATCH_VERIFICATION_FAILED");
}

console.log("PRODUCTION_TASK_GRAPH_SCOPE_FIX=APPLIED");
console.log(`TARGET=${target}`);
console.log("FUNCTIONAL_CHANGE=TASK_LIST_FILTERED_BY_PRODUCTION_GRAPH_ID");
