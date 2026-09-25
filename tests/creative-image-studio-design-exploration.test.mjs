import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const graph = fs.readFileSync("lib/creative/image/runtime/CreativeImageAssetGraphRuntime.js", "utf8");
const exploration = fs.readFileSync("lib/creative/image/runtime/CreativeImageAssetDesignExplorationRuntime.js", "utf8");
const handoff = fs.readFileSync("lib/creative/image/runtime/CreativeImageAssetHandoffRuntime.js", "utf8");
const pack = fs.readFileSync("lib/creative/image/runtime/CreativeImageAssetPackConsistencyRuntime.js", "utf8");
const queue = fs.readFileSync("lib/creative/production/queue/runtime/ProductionQueueRuntime.js", "utf8");

test("premium image assets create controlled design variations", () => {
  assert.match(graph, /HERO_FRAME:\[/);
  assert.match(graph, /THREAT_DESIGN:\[/);
  assert.match(graph, /ENVIRONMENT_LOOKFRAME:\[/);
  assert.match(graph, /TRANSITION_LOOKFRAME:\[/);
  assert.match(graph, /identity_world_mutation_forbidden:true/);
  assert.match(graph, /CONTROLLED DESIGN EXPLORATION VARIANT/);
});

test("variation axes change design without changing identity or world", () => {
  assert.match(graph, /axis:"COMPOSITION"/);
  assert.match(graph, /axis:"LIGHTING"/);
  assert.match(graph, /axis:"SPATIAL_PRESSURE"/);
  assert.match(graph, /axis:"SILHOUETTE"/);
  assert.match(graph, /axis:"MATERIAL_LANGUAGE"/);
  assert.match(graph, /axis:"ATMOSPHERE"/);
  assert.match(graph, /axis:"MATERIAL_CAUSALITY"/);
});

test("art direction selection rejects near-duplicate candidate sets", () => {
  assert.match(exploration, /near_duplicate_rejected/);
  assert.match(exploration, /Reject a set if the three candidates are near-duplicates/);
  assert.match(exploration, /premium_visual_authorship_score/);
  assert.match(exploration, /continuity_fidelity_score/);
  assert.match(exploration, /production_usability_score/);
  assert.match(exploration, /minimum_premium_visual_authorship_score:96/);
  assert.match(exploration, /minimum_continuity_fidelity_score:97/);
  assert.match(exploration, /minimum_production_usability_score:96/);
});

test("only selected exploration asset can leave Image Studio", () => {
  assert.match(handoff, /image_asset_exploration_selected!==true/);
  assert.match(pack, /image_asset_exploration_selected!==true/);
});

test("production queue selects design before pack QC", () => {
  const selectionIndex = queue.indexOf("CreativeImageAssetDesignExplorationRuntime.ensure");
  const packIndex = queue.indexOf("CreativeImageAssetPackConsistencyRuntime.ensure");
  assert.ok(selectionIndex >= 0);
  assert.ok(packIndex > selectionIndex);
});
