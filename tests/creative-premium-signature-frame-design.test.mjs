import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const temporal = fs.readFileSync("lib/creative/director/runtime/CreativeTemporalMasterPlanRuntime.js", "utf8");
const graph = fs.readFileSync("lib/creative/production-graph/planner/ProductionGraphPlanner.js", "utf8");
const benchmark = fs.readFileSync("lib/creative/quality/runtime/CreativeEliteFilmProductionBenchmarkRuntime.js", "utf8");
const review = fs.readFileSync("lib/creative/quality/runtime/CreativeGeneratedMediaPerceptualExecutionGate.js", "utf8");

test("premium temporal shots require campaign-grade signature frame design", () => {
  for (const field of [
    "hero_frame", "graphic_silhouette", "foreground_midground_background",
    "material_light_event", "controlled_palette", "natural_irregularity",
    "atmosphere_physics", "optical_character", "performance_microtruth",
    "fear_or_desire_focus", "anti_game_camera_rule", "board_comparison_test",
  ]) assert.match(temporal, new RegExp(field));
  assert.match(temporal, /SHOT_SIGNATURE_FRAME_DESIGN_REQUIRED/);
  assert.match(temporal, /A premium shot must survive as a still frame/);
});

test("temporal direction rejects videogame chase defaults", () => {
  assert.match(temporal, /Reject third-person videogame language/);
  assert.match(temporal, /centered back view/);
  assert.match(temporal, /SHOT_THIRD_PERSON_GAME_CAMERA_NOT_JUSTIFIED/);
});

test("signature-frame authority reaches production and elite benchmark", () => {
  assert.match(graph, /signature_frame_design: object\(shot\.signature_frame_design\)/);
  assert.match(benchmark, /signature_frame_design:/);
  assert.match(benchmark, /board_comparison_test/);
  assert.match(review, /signature_frame_design/);
  assert.match(review, /centered third-person chase framing/);
  assert.match(review, /approved visual-world signature board/);
  assert.match(review, /procedural roots/);
  assert.match(review, /Light must interact with matter/);
});
