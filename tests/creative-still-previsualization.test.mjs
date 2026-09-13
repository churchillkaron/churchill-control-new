import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  buildCreativeStillPrevisualizationBlueprint,
  verifyCreativeStillPrevisualizationBlueprint,
} from "../lib/creative/stills/runtime/CreativeStillPrevisualizationRuntime.js";

test("still previs creates composition and negative-space zones before generation", () => {
  const blueprint = buildCreativeStillPrevisualizationBlueprint({
    deliverable: { id: "poster", type: "POSTER", purpose: "Launch campaign", channels: ["facebook"] },
    step: { id: "generate-hero", purpose: "Create hero visual" },
    output_spec: { width: 1080, height: 1350 },
    requirements: { expected_contract: { brand_expected: true } },
  });

  assert.equal(blueprint.passed, true);
  assert.equal(blueprint.payload.canvas.orientation, "PORTRAIT");
  assert.ok(blueprint.payload.zones.some((zone) => zone.role === "HERO"));
  assert.ok(blueprint.payload.zones.some((zone) => zone.role === "NEGATIVE_SPACE"));
  assert.equal(blueprint.payload.deterministic_layers.generated_text_pixels_forbidden, true);
  assert.equal(blueprint.paid_generation_authority, false);
  assert.equal(verifyCreativeStillPrevisualizationBlueprint(blueprint), true);
});
test("explicit director zones override geometry fallback and digest detects mutation", () => {
  const blueprint = buildCreativeStillPrevisualizationBlueprint({
    output_spec: { aspect_ratio: "16:9" },
    requirements: {
      composition_zones: [
        { id: "hero", role: "HERO", x: 0.04, y: 0.08, width: 0.58, height: 0.84 },
        { id: "copy-space", role: "NEGATIVE_SPACE", x: 0.66, y: 0.12, width: 0.28, height: 0.58 },
      ],
    },
  });

  assert.equal(blueprint.passed, true);
  assert.equal(blueprint.payload.zone_authority, "DIRECTOR_AUTHORED");
  const mutated = structuredClone(blueprint);
  mutated.payload.zones[0].width = 0.2;
  assert.equal(verifyCreativeStillPrevisualizationBlueprint(mutated), false);
});

test("paid still generation fails previsualization when output geometry is unknown", () => {
  const blueprint = buildCreativeStillPrevisualizationBlueprint({});
  assert.equal(blueprint.passed, false);
  assert.ok(blueprint.failures.includes("STILL_PREVIS_OUTPUT_GEOMETRY_REQUIRED"));
  assert.equal(verifyCreativeStillPrevisualizationBlueprint(blueprint), false);
});
test("STILL execution uses still previs while temporal execution retains cinematic gates", () => {
  const graph = fs.readFileSync(
    "lib/creative/production-graph/planner/UniversalProductionGraphPlanner.js",
    "utf8",
  );
  const taskRuntime = fs.readFileSync(
    "lib/operations/tasks/runtime/ProductionTaskRuntime.js",
    "utf8",
  );

  assert.ok(graph.includes("still_previsualization_blueprint"));
  assert.ok(graph.includes("buildCreativeStillPrevisualizationBlueprint"));
  assert.ok(taskRuntime.includes("verifyCreativeStillPrevisualizationBlueprint"));
  assert.ok(taskRuntime.includes("STUDIO_STILL_PREVISUALIZATION_REQUIRED"));
  assert.ok(taskRuntime.includes("STUDIO_VISUAL_GENERATION_TAKE_EXECUTION_INTENT_REQUIRED"));
  assert.ok(taskRuntime.includes("STUDIO_VISUAL_GENERATION_FROZEN_UNTIL_100_PERCENT_CERTIFIED"));
});
