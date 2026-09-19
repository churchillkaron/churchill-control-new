import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  forecastShotFeasibility,
} from "../lib/creative/quality/runtime/CreativeShotFeasibilityForecastRuntime.js";

const temporal = fs.readFileSync("lib/creative/director/runtime/CreativeTemporalMasterPlanRuntime.js", "utf8");
const physical = fs.readFileSync("lib/creative/quality/runtime/CreativeShotPhysicalPreflightRuntime.js", "utf8");
const planner = fs.readFileSync("lib/creative/production-graph/planner/ProductionGraphPlanner.js", "utf8");
const budget = fs.readFileSync("lib/creative/director/runtime/CreativeBudgetQualityOptimizationRuntime.js", "utf8");

test("complex forest hunt forecasts structural risk before generation", () => {
  const result = forecastShotFeasibility({
    scene: { id: "forest" },
    shot: {
      id: "s1",
      generation_strategy: {
        mode: "MULTIPASS_COMPLEX",
        complexity_score: 7,
        complexity_factors: {
          human_performance: true,
          moving_threat: true,
          weather_atmosphere: true,
          contact_physics: true,
          transformation_vfx: true,
          identity_continuity: true,
          reconstruction: true,
        },
      },
      camera: { movement_path: "low handheld orbit" },
      action: "runner slips in mud while drone closes under lightning",
      environmental_continuity_state: {
        precipitation_state: "heavy rain from west",
        atmosphere_density: "dense ground fog",
        lightning_state: "active storm front",
      },
      pursuit_performance_choreography: {
        body_mechanics: "slips and catches branch",
        micro_behavior_cues: ["breath catch"],
      },
    },
  });
  assert.equal(result.zero_provider_calls, true);
  assert.equal(result.zero_paid_media_generation, true);
  assert.ok(result.risk_score >= 78);
  assert.equal(result.readiness, "REDESIGN_REQUIRED");
  assert.match(result.required_action, /REDESIGN_OR_SPLIT_SHOT/);
});

test("simple controlled shot can pass with gates", () => {
  const result = forecastShotFeasibility({
    shot: {
      id: "simple",
      generation_strategy: {
        mode: "CONTROLLED_SINGLE_PASS",
        complexity_score: 1,
        complexity_factors: {
          human_performance: false,
          moving_threat: false,
          weather_atmosphere: false,
          contact_physics: false,
          transformation_vfx: false,
          identity_continuity: false,
          reconstruction: false,
        },
      },
      camera: { movement_path: "locked tripod" },
    },
  });
  assert.equal(result.readiness, "READY_WITH_GATES");
});

test("feasibility forecast blocks paid generation and reaches graph", () => {
  assert.match(temporal, /SHOT_FEASIBILITY_REDESIGN_REQUIRED/);
  assert.match(physical, /SHOT_FEASIBILITY_REDESIGN_REQUIRED/);
  assert.match(planner, /feasibility_forecast/);
});

test("budget optimizer starts one candidate and forbids shotgun spend", () => {
  assert.match(budget, /initial_candidates: 1/);
  assert.match(budget, /shotgun_generation_forbidden: true/);
  assert.match(budget, /alternate_requires_failed_review: true/);
  assert.match(budget, /START_ONE_CANDIDATE_PER_SHOT/);
});
