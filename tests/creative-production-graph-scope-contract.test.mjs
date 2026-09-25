import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const route = fs.readFileSync("app/api/creative/production/queue/route.js", "utf8");
const button = fs.readFileSync("components/creative/ProductionStudio/actions/RunProductionButton.jsx", "utf8");
const queue = fs.readFileSync("lib/creative/production/queue/runtime/ProductionQueueRuntime.js", "utf8");
const repo = fs.readFileSync("lib/operations/tasks/repositories/ProductionTaskRepository.js", "utf8");

test("production queue is fail-closed to an explicit production graph", () => {
  assert.match(route, /PRODUCTION_GRAPH_SCOPE_REQUIRED/g);
  assert.match(button, /!productionGraphId/);
  assert.match(button, /productionGraphId,/);
});

test("preflight poll dispatch all propagate graph scope", () => {
  assert.match(route, /production_graph_id: graphId/g);
  assert.match(queue, /production_graph_id,/);
  assert.match(repo, /query = query\.eq\("production_graph_id", production_graph_id\)/);
});

test("browser graph resolver ignores historical no-graph tasks", () => {
  assert.match(button, /if \(!graphId\) continue;/);
  assert.match(button, /dominantProductionGraphId\(runtime\.taskRuntime\?\.items \|\| \[\]\)/);
});
