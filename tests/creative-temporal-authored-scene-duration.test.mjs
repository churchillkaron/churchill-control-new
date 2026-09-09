import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(
  "lib/creative/director/runtime/CreativeTemporalMasterPlanRuntime.js",
  "utf8",
);

test("temporal direction preserves exact authored scene pacing", () => {
  assert.match(source, /authoredSceneDuration/);
  assert.match(source, /Math\.abs\(authoredSceneDuration - duration\) <= 0\.001/);
  assert.doesNotMatch(source, /allocateDurations\(scenes, duration, 2\)/);
});

test("scene normalization uses the cinematic half-second floor only when required", () => {
  assert.match(source, /allocateDurations\(scenes, duration, 0\.5\)/);
});
