import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  evaluateTemporalSequenceIntelligence,
} from "../lib/creative/director/runtime/CreativeTemporalCinematicIntelligenceRuntime.js";

const temporal = fs.readFileSync("lib/creative/director/runtime/CreativeTemporalMasterPlanRuntime.js", "utf8");
const world = fs.readFileSync("lib/creative/world/runtime/CreativeWorldConsistencyRuntime.js", "utf8");
const worldQc = fs.readFileSync("lib/creative/world/runtime/CreativeWorldConsistencyQualityGateBootstrap.js", "utf8");
const planner = fs.readFileSync("lib/creative/production-graph/planner/ProductionGraphPlanner.js", "utf8");
const preproduction = fs.readFileSync("lib/creative/production-room/runtime/CreativeCanonicalPreproductionEvidenceRuntime.js", "utf8");

test("pursuit shots fail when environmental physical state is missing", () => {
  const shots = Array.from({ length: 4 }, (_, index) => ({
    id: "s" + index,
    title: "forest hunt",
    purpose: "drone hunts man",
    action: "man runs",
    duration_seconds: index + 1,
    tempo_role: index === 2 ? "ACCELERATE" : index === 3 ? "HOLD" : "BUILD",
    camera: { framing: index === 0 ? "wide" : index === 1 ? "close-up" : "full body", angle: index % 2 ? "profile" : "oblique" },
  }));
  const result = evaluateTemporalSequenceIntelligence({
    scene: { objective: "A hunted man flees drones through a storm forest" },
    shots,
  });
  assert.ok(result.failures.some((failure) => failure.code === "TEMPORAL_ENVIRONMENT_CONTINUITY_FIELD_REQUIRED"));
  assert.ok(result.failures.some((failure) => failure.code === "TEMPORAL_ENVIRONMENT_PERSISTENCE_REQUIRED"));
});

test("temporal shot schema carries causal environment continuity state", () => {
  assert.match(temporal, /environmental_continuity_state/);
  assert.match(temporal, /footprint_track_state/);
  assert.match(temporal, /moving_threat_state/);
  assert.match(temporal, /cuts as a change of viewpoint, not a reset of physics/);
});

test("world consistency locks dynamic physical state across cuts", () => {
  assert.match(world, /wind_direction/);
  assert.match(world, /precipitation_state/);
  assert.match(world, /wetness_state/);
  assert.match(world, /ground_deformation_state/);
  assert.match(world, /footprint_track_state/);
  assert.match(world, /wardrobe_wetness_state/);
  assert.match(world, /moving_threat_state/);
  assert.match(worldQc, /moving_threat_teleportation_detected/);
  assert.match(worldQc, /lightning_consequence_reset_detected/);
});

test("environment state survives preproduction and production graph", () => {
  assert.match(planner, /environmental_continuity_state/);
  assert.match(preproduction, /environmental_continuity_state/);
});
