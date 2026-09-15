import test from "node:test";
import assert from "node:assert/strict";
import { buildShotPhysicalWorld, evaluateShotPhysicalWorld } from "../lib/creative/video/runtime/CreativeShotPhysicalWorldRuntime.js";

test("physical world compiles existing production and material bibles into shot authority", () => {
  const value = buildShotPhysicalWorld({
    shot: {
      subject: "helicopter on offshore platform",
      production_design: { environment: "weathered North Sea platform", materials: "painted steel, glass, wet deck", texture_detail: "salt wear and micro scratches" },
      mechanical_truth: "Rotor, landing gear and body mass preserve believable inertia, support and wind interaction throughout the shot.",
    },
    creative_plan: { production: {
      production_design_bible: { surface_aging_rules: "salt, weather and service wear", props_bible: "only operational offshore equipment", set_dressing_bible: "real offshore working environment", wardrobe_bible: "offshore PPE only" },
      material_physics: { material_library: "steel, safety glass, seawater", weather_behavior: "North Sea wind and moisture remain continuous", fluid_particulate_behavior: "sea spray and mist obey wind and gravity", contact_deformation: "landing gear remains supported by deck" },
      lighting_simulation: { reflection_map: "wet steel reflections follow geometry", motivated_light_map: "overcast sky and practical deck lights" },
    } },
  });
  assert.equal(value.contract, "CREATIVE_SHOT_PHYSICAL_WORLD_V1");
  assert.equal(value.material_physics.contract, "CREATIVE_SHOT_MATERIAL_PHYSICS_V1");
  assert.equal(value.release_blocking, true);
  assert.equal(evaluateShotPhysicalWorld(value).passed, true);
  assert.match(String(value.production_design.surface_age), /salt/i);
  assert.equal(value.material_physics.aggregate_beauty_cannot_override_material_or_physics_failure, true);
});

test("physical world rejects an empty contract", () => {
  const gate = evaluateShotPhysicalWorld({});
  assert.equal(gate.passed, false);
  assert.ok(gate.failures.includes("SHOT_PHYSICAL_WORLD_CONTRACT_REQUIRED"));
});

test("physical world reuses sealed preproduction bibles and canonical shot design", () => {
  const value = buildShotPhysicalWorld({
    shot: { metadata: { master_plan_scene_index: 0, master_plan_shot_index: 0 } },
    creative_plan: {
      scenes: [{ shots: [{ production_design: { background: "wood-paneled study", table: "weathered oak" } }] }],
      production_room_bootstrap: { reports_by_stage: {
        TECHNICAL_SCOUT: [
          { requirement: 3, passed: true, evidence: { surface_aging_rules: "aged oak grain", props_bible: "quartz crystal", set_dressing_bible: "wood study" } },
          { requirement: 8, passed: true, evidence: { material_library: "oak, quartz, glass", weather_behavior: "interior stable", cloth_hair_behavior: "natural", contact_deformation: "supported contact", fluid_particulate_behavior: "none" } },
          { requirement: 5, passed: true, evidence: { reflection_map: "window reflections follow geometry", motivated_light_map: "soft window light" } },
        ],
      } },
    },
  });
  assert.equal(evaluateShotPhysicalWorld(value).passed, true);
  assert.equal(value.production_design.architecture, "wood-paneled study");
  assert.equal(value.production_design.materials, "weathered oak");
  assert.equal(value.production_design.practical_lights, "soft window light");
});