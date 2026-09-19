import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  evaluatePursuitSpatialChoreography,
} from "../lib/creative/quality/runtime/CreativePursuitSpatialChoreographyRuntime.js";

const temporal = fs.readFileSync("lib/creative/director/runtime/CreativeTemporalMasterPlanRuntime.js", "utf8");
const perceptual = fs.readFileSync("lib/creative/quality/runtime/CreativeGeneratedMediaPerceptualExecutionGate.js", "utf8");
const planner = fs.readFileSync("lib/creative/production-graph/planner/ProductionGraphPlanner.js", "utf8");
const preproduction = fs.readFileSync("lib/creative/production-room/runtime/CreativeCanonicalPreproductionEvidenceRuntime.js", "utf8");

test("pursuit choreography requires predator target camera geometry", () => {
  const result = evaluatePursuitSpatialChoreography({
    scene: { objective: "Drone hunts a man through forest" },
    shots: [{ id: "s1", action: "man flees drone" }],
  });
  assert.equal(result.applicable, true);
  assert.equal(result.passed, false);
  assert.ok(result.failures.some((failure) => failure.code === "PURSUIT_SPATIAL_FIELD_REQUIRED"));
  assert.ok(result.failures.some((failure) => failure.code === "PURSUIT_SPATIAL_CLEARANCE_REQUIRED"));
});

test("complete authored pursuit choreography passes", () => {
  const spatial = {
    target_position: "Runner on east side of narrow forest path beside split cedar.",
    threat_position: "Drone eight metres back-left and four metres above runner.",
    camera_position: "Camera low right of path, three metres ahead of runner.",
    line_of_action: "Runner and drone travel west to east on the established path axis.",
    target_heading: "east along path",
    threat_heading: "east closing from rear-left",
    threat_target_distance: "eight metres and closing to five metres",
    occlusion_state: "Two trunks intermittently occlude drone but not runner.",
    search_or_attack_vector: "Search beam sweeps from rear-left toward runner shoulder and path ahead.",
    entry_exit_logic: "Runner enters frame left and exits right; drone remains rear-left.",
    obstacles_and_clearance: ["low branch forces runner duck while drone climbs 1.5 metres"],
    axis_break: false,
    axis_break_motivation: "No axis break; audience orientation remains stable.",
    cut_spatial_handoff: "Next shot inherits runner moving right with drone still rear-left and closing.",
  };
  const result = evaluatePursuitSpatialChoreography({
    scene: { objective: "Drone hunts a man through forest" },
    shots: [{ id: "s1", action: "man flees drone", pursuit_spatial_choreography: spatial }],
  });
  assert.equal(result.passed, true);
});

test("studio direction and review carry pursuit geometry", () => {
  assert.match(temporal, /pursuit_spatial_choreography/);
  assert.match(temporal, /predator-target-camera triangle/);
  assert.match(temporal, /Threat choreography must be predatory rather than decorative/);
  assert.match(perceptual, /predator-target-camera triangle/);
  assert.match(perceptual, /decorative symmetric pursuers/);
  assert.match(planner, /pursuit_spatial_choreography/);
  assert.match(preproduction, /pursuit_spatial_choreography/);
});
