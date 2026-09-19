import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync("lib/creative/quality/runtime/CreativeEliteFilmProductionBenchmarkRuntime.js", "utf8");

test("elite film benchmark requires observable creative execution, not department names alone", () => {
  assert.match(source, /CREATIVE_ELITE_FILM_PRODUCTION_BENCHMARK_V2/);
  assert.match(source, /creative_execution_assessed/);
  assert.match(source, /visual_taste_gate/);
  assert.match(source, /shot_invention_complete/);
  assert.match(source, /camera_choices_motivated/);
  assert.match(source, /sound_picture_authored/);
  assert.match(source, /coverage_material_world/);
  assert.match(source, /DEPARTMENT_COVERAGE_PLUS_OBSERVABLE_CREATIVE_EXECUTION/);
  assert.doesNotMatch(source, /passed:\s*missing\.length === 0/);
});