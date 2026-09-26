import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const planner = fs.readFileSync("lib/creative/director/runtime/CreativeTemporalMasterPlanRuntime.js", "utf8");
const validator = fs.readFileSync("lib/creative/director/validation/CreativeMasterPlanValidator.js", "utf8");
const registry = fs.readFileSync("lib/creative/director/registry/CreativeMasterPlanContractRegistry.js", "utf8");

test("temporal Studio authors the quality floor before generation", () => {
  assert.match(planner, /FIRST-PASS QUALITY FLOOR/);
  assert.match(planner, /Do not rely on downstream reviewers/);
  for (const key of ["story_delta","visible_event","edit_reason","continuity_anchor","sound_picture_event","predicted_failure"]) {
    assert.match(planner, new RegExp(key));
    assert.match(validator, new RegExp(key));
  }
  assert.match(planner, /Premium\/high-budget work must add purposeful inserts/);
});

test("first-pass intent is a required master-plan contract and survives recovery", () => {
  assert.match(validator, /const firstPassIntent = object\(shot\.first_pass_intent\)/);
  assert.match(registry, /Mandatory pre-generation authoring contract/);
  assert.match(registry, /downstream review is a backstop/);
  assert.match(planner, /first_pass_intent: \{/);
  assert.match(planner, /Prevent generic AI coverage, posing, floating camera, continuity drift/);
});

test("temporal contract repair can recover settled provider results from usage metadata", () => {
  const source = fs.readFileSync("lib/creative/director/runtime/CreativeTemporalMasterPlanRuntime.js", "utf8");
  assert.match(source, /current\.usage\?\.metadata\?\.provider_result/);
  assert.match(source, /current\.metadata\?\.provider_result/);
  assert.match(source, /current\.billing\?\.usage\?\.metadata\?\.provider_result/);
});
