import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  buildShotGenerationStrategy,
} from "../lib/creative/director/runtime/CreativeShotGenerationStrategyRuntime.js";

const route = fs.readFileSync("lib/creative/director/runtime/CreativeVisualProductionRouteRuntime.js", "utf8");
const graph = fs.readFileSync("lib/creative/production-graph/runtime/CreativeVisualProductionGraphRuntime.js", "utf8");
const multipass = fs.readFileSync("lib/creative/multipass/runtime/CreativeMultiPassShotRuntime.js", "utf8");
const recovery = fs.readFileSync("lib/creative/quality/runtime/CreativeAutonomousRecoveryOrchestratorRuntime.js", "utf8");
const temporal = fs.readFileSync("lib/creative/director/runtime/CreativeTemporalMasterPlanRuntime.js", "utf8");

test("complex pursuit shot routes to multipass with bounded candidates", () => {
  const strategy = buildShotGenerationStrategy({
    scene: { id: "forest-hunt" },
    shot: {
      id: "s1",
      subject: "terrified man hunted by drone",
      action: "runner slips in mud under search beam during lightning storm",
      actors: [{ id: "runner" }],
      pursuit_spatial_choreography: { target_position: "path", threat_position: "rear-left" },
      pursuit_performance_choreography: { body_mechanics: "slip and recover" },
      environmental_continuity_state: {
        precipitation_state: "heavy rain",
        atmosphere_density: "dense fog",
        lightning_state: "active lightning",
      },
      cinematic_motion_design: { events: [{ type: "MATERIAL_TRANSFORMATION" }] },
    },
  });
  assert.equal(strategy.mode, "MULTIPASS_COMPLEX");
  assert.equal(strategy.pass_policy.multipass_required, true);
  assert.equal(strategy.pass_policy.separate_threat_or_hero_layer_required, true);
  assert.equal(strategy.pass_policy.separate_atmosphere_layer_required, true);
  assert.equal(strategy.candidate_policy.initial_candidate_count, 1);
  assert.equal(strategy.candidate_policy.shotgun_candidate_generation_forbidden, true);
  assert.ok(strategy.candidate_policy.maximum_paid_candidates <= 3);
});

test("continuity-sensitive human shot shares approved scene state", () => {
  const strategy = buildShotGenerationStrategy({
    scene: { id: "scene-a" },
    shot: {
      id: "s2",
      subject: "runner close-up",
      actors: [{ id: "runner" }],
      performance_direction: { direction: "breath catches after seeing drone" },
    },
  });
  assert.equal(strategy.mode, "SHARED_KEYFRAME_SEQUENCE");
  assert.equal(strategy.shot_independence, "CONTINUITY_LINKED");
  assert.equal(strategy.keyframe_policy.shared_identity_world_state_required, true);
  assert.equal(strategy.shared_state_group_id, "continuity:scene-a");
});

test("creative routing no longer hard-codes provider or model", () => {
  assert.doesNotMatch(route, /gemini-3-pro-image/);
  assert.doesNotMatch(route, /veo-3\.1-generate-preview/);
  assert.match(route, /provider_selection_boundary: "SERVICE_RUNTIME_ONLY"/);
  assert.match(graph, /provider: null/);
  assert.match(graph, /model: null/);
});

test("multipass and recovery obey generation strategy", () => {
  assert.match(multipass, /strategy\.pass_policy\?\.multipass_required/);
  assert.match(multipass, /separate_physical_interaction_pass_required/);
  assert.match(multipass, /separate_threat_or_hero_layer_required/);
  assert.match(recovery, /GENERATION_CANDIDATE_BUDGET_EXHAUSTED/);
  assert.match(recovery, /new_paid_candidate_authorized: false/);
  assert.match(temporal, /Candidate generation is evidence-driven, not shotgun/);
});
