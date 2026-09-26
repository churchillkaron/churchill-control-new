import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const planner = fs.readFileSync("lib/creative/director/runtime/CreativeTemporalMasterPlanRuntime.js", "utf8");
const validator = fs.readFileSync("lib/creative/director/validation/CreativeMasterPlanValidator.js", "utf8");

test("premium temporal planning uses materially denser authored coverage", () => {
  assert.match(planner, /const premiumTemporal = \/PREMIUM\|WORLD_CLASS\|FLAGSHIP\|ELITE\//);
  assert.match(planner, /let maxAverageSeconds = premiumTemporal \? 2\.75 : 4/);
  assert.match(planner, /premiumTemporal \? 2\.5 : 3\.75/);
  assert.match(planner, /premiumTemporal \? 1\.75 : 2\.5/);
  assert.match(planner, /kinetic \? 1\.5 : tensionDriven \? 2 : patient \? 3 : 2\.25/);
  assert.match(planner, /intentional long takes remain valid/i);
});

test("temporal validation enforces the same premium authored coverage floor", () => {
  assert.match(validator, /const premiumTemporal = Boolean/);
  assert.match(validator, /let authoredCoverageAverageSeconds = premiumTemporal \? 2\.75 : technicalMaximumAverageShotSeconds/);
  assert.match(validator, /premiumTemporal && tensionDriven\) authoredCoverageAverageSeconds = Math\.min\(authoredCoverageAverageSeconds, 2\.5\)/);
  assert.match(validator, /authored_coverage_floor_count: authoredCoverageFloorCount/);
  assert.match(validator, /TEMPORAL_SHOT_CADENCE_TOO_SPARSE/);
  assert.match(validator, /eliteFilmDepartmentActivationFailures/);
});

test("premium cadence recovery forbids fake mechanical post-hoc splitting", () => {
  assert.match(planner, /deriveTemporalCadenceContract\(\{ \.\.\.plan, scenes \}, scenes\)/);
  assert.match(planner, /validatorCadence\.premium_temporal === true && count < target/);
  assert.match(planner, /CREATIVE_PREMIUM_AUTHORED_COVERAGE_REPAIR_REQUIRED_V1/);
  assert.match(planner, /mechanical_posthoc_split_forbidden: true/);
});
