import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const registry = fs.readFileSync(new URL("../lib/creative/production-room/registry/CreativeProductionRoomStageRegistry.js", import.meta.url), "utf8");
const roomRuntime = fs.readFileSync(new URL("../lib/creative/production-room/runtime/CreativeProductionRoomRuntime.js", import.meta.url), "utf8");
const bootstrap = fs.readFileSync(new URL("../lib/creative/production-room/runtime/CreativeProductionRoomBootstrapRuntime.js", import.meta.url), "utf8");
const graphPlanner = fs.readFileSync(new URL("../lib/creative/production-graph/planner/ProductionGraphPlanner.js", import.meta.url), "utf8");

test("Tribunal is explicit before technical scout", () => {
  const concept = registry.indexOf('id: "CONCEPT_COMPETITION"');
  const tribunal = registry.indexOf('id: "TRIBUNAL"');
  const scout = registry.indexOf('id: "TECHNICAL_SCOUT"');
  assert.ok(concept >= 0 && tribunal > concept && scout > tribunal);
});

test("Mastering is explicit before release", () => {
  const review = registry.indexOf('id: "MASTER_DIRECTOR_REVIEW"');
  const mastering = registry.indexOf('id: "MASTERING"');
  const release = registry.indexOf('id: "RELEASE"');
  assert.ok(review >= 0 && mastering > review && release > mastering);
});
test("Tribunal stage requires the governed passed Tribunal artifact", () => {
  assert.match(roomRuntime, /stageId === "TRIBUNAL"/);
  assert.match(roomRuntime, /CREATIVE_DYNAMIC_TRIBUNAL_V1/);
  assert.match(roomRuntime, /report\.passed !== true \|\| !report\.verdict\?\.passed/);
  assert.match(bootstrap, /TRIBUNAL:[\s\S]*master\.creative_tribunal/);
});

test("Mastering stage requires real mastering inspection", () => {
  assert.match(roomRuntime, /stageId === "MASTERING"/);
  assert.match(roomRuntime, /CREATIVE_MASTERING_INSPECTION_V1/);
  assert.match(roomRuntime, /CREATIVE_MASTERING_INSPECTION_REQUIRED/);
});

test("temporal production graph still requires sealed virtual rehearsal", () => {
  assert.match(graphPlanner, /productionEntryGate\(productionRoomPipeline\)/);
  assert.match(graphPlanner, /CREATIVE_PRODUCTION_ENTRY_GATE_REQUIRED/);
  assert.match(registry, /PREPRODUCTION_GATE_STAGE = "VIRTUAL_REHEARSAL"/);
});