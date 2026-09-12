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
