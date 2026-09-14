import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  buildMusicDestinationMasteringPlan,
  evaluateMusicDestinationMaster,
  resolveMusicMasteringDestination,
} from "../lib/creative/music/runtime/CreativeMusicDestinationMasteringRuntime.js";

test("destination mastering resolves supported aliases without claiming one master fits all", () => {
  assert.equal(resolveMusicMasteringDestination("Spotify").id, "streaming");
  assert.equal(resolveMusicMasteringDestination("nightclub").id, "club");
  const plan = buildMusicDestinationMasteringPlan({ mastering_destinations: ["spotify", "club"] });
  assert.equal(plan.supported, true);
  assert.equal(plan.separate_masters_required, true);
  assert.equal(plan.one_master_fits_all_claimed, false);
  assert.equal(plan.variants.length, 2);
  assert.ok(plan.variants.some((variant) => variant.target_lufs === -14 && variant.true_peak_dbtp === -1));
  assert.ok(plan.variants.some((variant) => variant.target_lufs === -9 && variant.true_peak_dbtp === -0.8));
});

test("compatible destinations share one non-destructive master variant", () => {
  const plan = buildMusicDestinationMasteringPlan({ mastering_destinations: ["streaming", "spotify", "apple_music"] });
  assert.equal(plan.variants.length, 1);
  assert.equal(plan.separate_masters_required, false);
  assert.equal(plan.variants[0].non_destructive, true);
  assert.deepEqual(plan.variants[0].destinations, ["streaming"]);
  assert.ok(plan.reasoning_brief[0].includes("-14 LUFS"));
});

test("unsupported mastering destination fails closed", () => {
  const plan = buildMusicDestinationMasteringPlan({ mastering_destinations: ["cassette-duplication-factory"] });
  assert.equal(plan.supported, false);
  assert.equal(plan.status, "UNSUPPORTED_DESTINATION");
  assert.deepEqual(plan.variants, []);
  assert.equal(plan.publication_authorized, false);
});

test("destination QC compares measured loudness and true peak to the selected variant", () => {
  const plan = buildMusicDestinationMasteringPlan({ mastering_destinations: ["streaming"] });
  const pass = evaluateMusicDestinationMaster({
    plan,
    master_report: { master: { integrated_lufs: -13.8, true_peak_dbtp: -1.05 } },
  });
  assert.equal(pass.measured, true);
  assert.equal(pass.passed, true);
  const fail = evaluateMusicDestinationMaster({
    plan,
    master_report: { master: { integrated_lufs: -11.5, true_peak_dbtp: -0.2 } },
  });
  assert.equal(fail.passed, false);
  assert.equal(fail.publication_authorized, false);
});

const finishing = fs.readFileSync("lib/creative/music/runtime/CreativeMusicFinishingRuntime.js", "utf8");
const execution = fs.readFileSync("lib/creative/music/runtime/CreativeMusicWorldClassExecutionRuntime.js", "utf8");
const planner = fs.readFileSync("lib/creative/music/capabilities/planWorldClassMusicStudio.js", "utf8");

test("Music finishing creates destination variants through the existing certified audio finishing lane", () => {
  assert.match(finishing, /buildMusicDestinationMasteringPlan/);
  assert.match(finishing, /ensureMusicMasters/);
  assert.match(finishing, /mastering_variant_id/);
  assert.match(finishing, /creative\.audio\.finish/);
  assert.match(finishing, /destination_qc_passed/);
});

test("world-class execution and Business Partner expose destination mastering state", () => {
  assert.match(execution, /CreativeMusicFinishingRuntime\.ensureMasters/);
  assert.match(execution, /master_assets:/);
  assert.match(execution, /destination_mastering:/);
  assert.match(execution, /finalTribunal\.release_ready === true && finishing\?\.destination_qc_passed === true/);
  assert.match(planner, /music_mastering_plan/);
  assert.match(planner, /mastering_destinations/);
});
