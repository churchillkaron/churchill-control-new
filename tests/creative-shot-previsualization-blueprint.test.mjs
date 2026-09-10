import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { buildShotPrevisualizationBlueprint } from "../lib/creative/quality/runtime/CreativeShotPrevisualizationBlueprintRuntime.js";

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

function shot(overrides = {}) {
  return {
    id: "shot-a",
    duration_seconds: 5,
    hero_asset_truth: { mode: "REFERENCE_GROUNDED_CLASS", exact_geometry_claimed: false, limitations: ["Research-grounded class/configuration; no manufacturer CAD is claimed."] },
    technical_truth_evidence: {
      sources: [
        { uri: "source://manufacturer-or-operator-reference-a", claim: "Heavy offshore transport configuration uses twin-engine upper fuselage, wheeled landing gear and articulated main rotor architecture." },
        { uri: "source://independent-technical-reference-b", claim: "Offshore transport role, landing-gear class and rotor/transmission arrangement distinguish this subject from light skid utility helicopters." },
      ],
      validated_facts: [
        "twin-engine upper fuselage configuration",
        "wheeled rather than skid landing gear",
        "articulated rotor system connected through mast and transmission",
      ],
      prohibited_confusions: ["light single-engine skid helicopter", "small twin-engine skid utility helicopter"],
    },
    subject_identity_key: "offshore-helicopter-a",
    world_identity_key: "north-sea-rig-a",
    subject_class: "Heavy twin-engine offshore transport helicopter with wheeled landing gear and articulated main rotor",
    subject_signature: { defining_features: ["twin engine upper fuselage", "wheeled landing gear"], forbidden_substitutions: ["light skid helicopter"] },
    mechanical_truth: "Rotor mast, transmission, blade roots, engines and wheeled landing gear remain physically connected.",
    mechanical_signature: { functional_assemblies: ["main rotor", "transmission"], required_connections: ["rotor mast to transmission"], motion_constraints: ["rotor rotates around fixed mast"] },
    world_geometry_anchor: "One fixed offshore platform with unchanged helideck, crane positions and structural silhouette.",
    world_topology: ["helideck fixed to platform edge", "crane remains aft of helideck"],
    continuity_invariants: ["same helicopter", "same platform"],
    camera_feasibility: "Slow lateral tracking preserves subject scale and spatial relation throughout the complete shot.",
    camera: { movement_path: "slow lateral track" },
    virtual_camera_state: {
      start: { focal_length_mm: 50, subject_distance_m: 18, camera_height_m: 2.2, roll_degrees: 0 },
      end: { focal_length_mm: 50, subject_distance_m: 14, camera_height_m: 2.2, roll_degrees: 0 },
      zoom_or_lens_change_declared: false,
      focus_behavior: "Focus remains locked to the helicopter fuselage while distance closes gradually.",
      perspective_intent: "Natural medium-telephoto compression preserves believable aircraft and platform scale."
    },
    subject_motion_choreography: {
      required: true,
      start_state: "Heavy helicopter is airborne over open sea on a stable approach heading.",
      path: "Continuous left-to-right approach over open water while remaining clear of the offshore platform structure.",
      speed_profile: "Controlled gradual deceleration while maintaining a stable airborne approach envelope.",
      screen_direction: "left-to-right",
      clearance_and_contact_constraints: ["remain clear of platform steelwork and crane"],
      end_state: "Heavy helicopter remains airborne beside the platform on the same approach heading.",
    },
    frame_plan: { opening_frame: "Medium helicopter view", progression: "track laterally", closing_frame: "Medium-wide helicopter and platform view" },
    geography_claim: "NONE",
    ...overrides,
  };
}
test("sealed previs blueprint passes only after deterministic physical and geography checks", () => {
  const result = buildShotPrevisualizationBlueprint(shot());
  assert.equal(result.passed, true);
  assert.equal(result.zero_provider_calls, true);
  assert.equal(result.zero_media_generation, true);
  assert.match(result.blueprint_digest, /^[a-f0-9]{64}$/);
});

test("impossible camera path fails before generation", () => {
  const result = buildShotPrevisualizationBlueprint(shot({
    camera: { movement_path: "stationary locked camera" },
    frame_plan: { opening_frame: "Extreme close-up rotor mast", progression: "camera remains fixed", closing_frame: "Wide aerial of entire offshore platform" },
  }));
  assert.equal(result.passed, false);
  assert.ok(result.failures.includes("SHOT_CAMERA_PATH_CANNOT_REACH_CLOSING_FRAME"));
});

test("production graph transports newest truth fields and sealed previs", () => {
  const planner = read("lib/creative/production-graph/planner/ProductionGraphPlanner.js");
  const task = read("lib/operations/tasks/runtime/ProductionTaskRuntime.js");
  for (const token of ["subject_signature", "mechanical_signature", "world_topology", "geography_signature"]) {
    assert.match(planner, new RegExp(token));
  }
  assert.match(planner, /const previsualization = buildShotPrevisualizationBlueprint\(shot\)/);
  assert.match(planner, /previsualization_blueprint: previsualization/);
  assert.match(planner, /department_handoff_chain: departmentHandoff/);
  assert.match(task, /STUDIO_VISUAL_GENERATION_PREVISUALIZATION_REQUIRED/);
  assert.match(task, /previsualization\.blueprint_digest/);
});
