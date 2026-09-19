import assert from "node:assert/strict";
import test from "node:test";

import {
  CreativeMusicSeparatorBenchmarkRuntime,
  planMusicSeparatorBenchmark,
  scoreMusicSeparatorBenchmark,
} from "../lib/creative/music/runtime/CreativeMusicSeparatorBenchmarkRuntime.js";

test("separator benchmark keeps Demucs as production baseline", () => {
  const plan = planMusicSeparatorBenchmark({ candidate_id: "melband-roformer-kim-vocals" });
  assert.equal(plan.baseline.id, "demucs-htdemucs-ft");
  assert.equal(plan.production_baseline_preserved, true);
  assert.equal(plan.production_promotion_automatic, false);
  assert.equal(plan.human_listening_panel_required, true);
  assert.equal(plan.independent_review_required, true);
});
test("candidate promotion requires audible quality and independent review", () => {
  const failed = scoreMusicSeparatorBenchmark({ lead_vocal_leakage: 7, backing_vocal_preservation: 94, instrumental_damage: 8, transient_preservation: 95, stereo_image_integrity: 95, human_listening_quality: 95, runtime_cost_efficiency: 90, runtime_speed: 90, independent_review_passed: false });
  assert.equal(failed.promotion_eligible, false);

  const passed = scoreMusicSeparatorBenchmark({ lead_vocal_leakage: 5, backing_vocal_preservation: 96, instrumental_damage: 5, transient_preservation: 97, stereo_image_integrity: 96, human_listening_quality: 97, runtime_cost_efficiency: 92, runtime_speed: 91, independent_review_passed: true });
  assert.equal(passed.promotion_eligible, true);
  assert.ok(passed.score >= 92);
});

test("candidate catalog names MelBand-RoFormer as benchmark-only", () => {
  const candidate = CreativeMusicSeparatorBenchmarkRuntime.candidates[0];
  assert.equal(candidate.id, "melband-roformer-kim-vocals");
  assert.equal(candidate.status, "BENCHMARK_REQUIRED");
  assert.equal(candidate.license, "MIT");
});
