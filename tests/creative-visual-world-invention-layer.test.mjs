import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const temporal = fs.readFileSync("lib/creative/director/runtime/CreativeTemporalMasterPlanRuntime.js", "utf8");
const approval = fs.readFileSync("scripts/creative-direction-approval.mjs", "utf8");

test("temporal film direction invents visual worlds before scene and shot engineering", () => {
  const createStart = temporal.indexOf("export const CreativeTemporalMasterPlanRuntime");
  const pipeline = temporal.slice(createStart);
  const visual = pipeline.indexOf("const visualDevelopment = await developVisualWorld");
  const architecture = pipeline.indexOf('operation: "TEMPORAL_SCENE_ARCHITECTURE_V1"');
  const invention = pipeline.indexOf("const shotInvention = await createShotInventionMap");
  const shot = pipeline.indexOf('operation: "TEMPORAL_SCENE_SHOT_DIRECTION_V1"');
  assert.ok(visual >= 0 && architecture > visual && invention > architecture && shot > invention);
});

test("visual invention is independent, taste-gated and protected from engineering flattening", () => {
  assert.match(temporal, /VISUAL_WORLD_DIRECTORS/);
  assert.match(temporal, /ordinary coverage plus polish/);
  assert.match(temporal, /anti_flatness_rules/);
  assert.match(temporal, /Shot Invention Director/);
  assert.match(temporal, /may not collapse an invented image into ordinary coverage/);
  assert.match(temporal, /strongest description is merely a camera verb/);
});

test("direction approval budgets visual-world and shot-invention operations", () => {
  for (const operation of [
    "TEMPORAL_VISUAL_WORLD_ART_V1",
    "TEMPORAL_VISUAL_WORLD_CINEMATOGRAPHY_V1",
    "TEMPORAL_VISUAL_WORLD_VFX_MOTION_V1",
    "TEMPORAL_VISUAL_WORLD_SELECTION_V1",
    "TEMPORAL_SHOT_INVENTION_MAP_V1",
  ]) assert.ok(approval.includes(`"${operation}"`));
  assert.match(approval, /maximum_calls: 19 \+ maximumSceneCalls/);
});