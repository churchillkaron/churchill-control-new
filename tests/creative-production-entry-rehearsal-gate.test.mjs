import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const planner = fs.readFileSync(
  new URL("../lib/creative/production-graph/planner/ProductionGraphPlanner.js", import.meta.url),
  "utf8",
);

test("production graph fails closed until Virtual Rehearsal is sealed", () => {
  assert.match(planner, /const productionRoomGate = productionEntryGate\(productionRoomPipeline\)/);
  assert.match(planner, /if \(!productionRoomGate\.passed\)/);
  assert.match(planner, /CREATIVE_PRODUCTION_ENTRY_GATE_REQUIRED/);
});
