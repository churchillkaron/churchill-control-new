import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildProfessionalPremasterSignalReview } from "../lib/creative/music/runtime/CreativeMusicPremasterSignalReviewRuntime.js";

test("pre-master review creates bounded repair targets from combined signal", () => {
  const review = buildProfessionalPremasterSignalReview({ metrics:{ crest_factor_db:4.5, stereo_correlation:-0.3, mono_fold_down_loss_db:-5.2, low_end_vs_body_db:7.5, harshness_vs_body_db:9.2 } }, { headroom_db:1.5, peak_dbfs:-1.5 });
  assert.equal(review.measured, true);
  assert.ok(review.failures.includes("headroom_preserved"));
  assert.ok(review.repair_targets.some((row) => row.code === "RESTORE_PREMASTER_HEADROOM"));
  assert.ok(review.repair_targets.some((row) => row.code === "RESTORE_DYNAMIC_LIFE"));
  assert.ok(review.repair_targets.some((row) => row.code === "REBALANCE_LOW_END"));
  assert.ok(review.repair_targets.some((row) => row.code === "REDUCE_UPPER_MID_HARSHNESS"));
  assert.ok(review.repair_targets.some((row) => row.code === "REPAIR_STEREO_COMPATIBILITY"));
});

test("healthy pre-master signal produces no technical repair targets", () => {
  const review = buildProfessionalPremasterSignalReview({ metrics:{ crest_factor_db:12, stereo_correlation:0.5, mono_fold_down_loss_db:-1.2, low_end_vs_body_db:-4, harshness_vs_body_db:1.5 } }, { headroom_db:6, peak_dbfs:-6 });
  assert.deepEqual(review.failures, []);
  assert.deepEqual(review.repair_targets, []);
});

test("professional release exposes repair and invalidates old pre-master lineage", () => {
  const route = fs.readFileSync(new URL("../app/api/creative/music/professional-release/route.js", import.meta.url), "utf8");
  const runtime = fs.readFileSync(new URL("../lib/creative/music/runtime/CreativeMusicProfessionalMixRuntime.js", import.meta.url), "utf8");
  const panel = fs.readFileSync(new URL("../components/creative/ProductionStudio/workspaces/MusicProfessionalReleasePanel.jsx", import.meta.url), "utf8");
  assert.match(route, /repair_premaster/);
  assert.match(runtime, /requires_new_mix_render:true/);
  assert.match(runtime, /professional_mix_passed:false/);
  assert.match(runtime, /new_revision:next\.revision/);
  assert.match(panel, /Apply safe mix repair/);
  assert.match(panel, /makes the current pre-master stale/);
});
