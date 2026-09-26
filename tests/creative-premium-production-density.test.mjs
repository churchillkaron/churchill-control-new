import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const planner = fs.readFileSync("lib/creative/director/runtime/CreativeTemporalMasterPlanRuntime.js", "utf8");
const validator = fs.readFileSync("lib/creative/director/validation/CreativeMasterPlanValidator.js", "utf8");

test("premium temporal planning uses materially denser authored coverage", () => {
  assert.match(planner, /const premiumTemporal = Boolean/);
  assert.match(planner, /plan\.semantic_benchmark_floor\?\.world_class === true/);
  assert.match(planner, /plan\.world_class_concept_intelligence\?\.passed === true/);
  assert.match(planner, /\.\.\.list\(plan\.scenes\)\.flatMap/);
  assert.match(planner, /const scenePlanningPlan = \{ \.\.\.basePlan, scenes \}/);
  assert.match(planner, /shotCountRange\(scene\.duration_seconds, \{ scene, plan: scenePlanningPlan \}\)/);
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


test("temporal repair deduplicates role failures before bounded role batching", () => {
  assert.match(planner, /const uniqueFailuresByPath = \(entries = \[]\) =>/);
  assert.match(planner, /const signature = text\(entry\.path\)/);
  assert.match(planner, /const roleFailures = uniqueFailuresByPath/);
  assert.match(planner, /const roleBatch = roleFailures\.slice\(0, Math\.min\(6, MAXIMUM_CONTRACT_REPAIR_FAILURES_PER_PASS\)\)/);
});
