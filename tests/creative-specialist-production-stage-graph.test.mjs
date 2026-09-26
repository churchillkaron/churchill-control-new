import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const graphDocument = fs.readFileSync("lib/creative/production-graph/documents/ProductionGraph.js", "utf8");
const planner = fs.readFileSync("lib/creative/production-graph/planner/ProductionGraphPlanner.js", "utf8");
const handoff = fs.readFileSync("lib/creative/quality/runtime/CreativeDepartmentHandoffChainRuntime.js", "utf8");

test("production graph has first-class specialist department stages", () => {
  assert.match(graphDocument, /DEPARTMENT_STAGE: "DEPARTMENT_STAGE"/);
  assert.match(planner, /type: "DEPARTMENT_STAGE"/);
  assert.match(planner, /approval_required_before_downstream_handoff: true/);
  assert.match(planner, /independent_evidence_required: true/);
  assert.match(planner, /upstream_department_evidence_required: true/);
  assert.match(planner, /specialist_stage_handoffs_enforced/);
  assert.match(planner, /SHOT_IS_A_PRODUCTION_GRAPH_NOT_AN_INDEPENDENT_GENERATION/);
});

test("specialist chain explicitly covers finishing instead of generate-review-done", () => {
  for (const role of [
    "previsualization_supervisor",
    "cg_asset_supervisor",
    "simulation_physics_supervisor",
    "tracking_roto_supervisor",
    "compositing_supervisor",
    "editor",
    "color_di_supervisor",
    "sound_design_supervisor",
    "mix_finishing_engineer",
    "post_production_supervisor",
    "quality_director",
  ]) {
    assert.match(handoff, new RegExp(`"${role}"`));
  }
  assert.match(planner, /approved integrated composite/);
  assert.match(planner, /approved DI\/color state/);
  assert.match(planner, /approved final mix\/master/);
  assert.match(planner, /all upstream handoffs reconciled/);
});
