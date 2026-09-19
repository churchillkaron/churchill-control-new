import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  buildTemporalConsistencyIntelligence,
} from "../lib/creative/quality/runtime/CreativeTemporalConsistencyIntelligenceRuntime.js";

const perceptual = fs.readFileSync("lib/creative/quality/runtime/CreativeGeneratedMediaPerceptualExecutionGate.js", "utf8");
const mastering = fs.readFileSync("lib/creative/upscale/runtime/CreativeTemporal4KMasteringRuntime.js", "utf8");
const review = fs.readFileSync("lib/creative/upscale/runtime/CreativeTemporal4KReviewTaskRuntime.js", "utf8");
const planner = fs.readFileSync("lib/creative/production-graph/planner/ProductionGraphPlanner.js", "utf8");

test("temporal consistency intelligence learns recurring temporal failures", () => {
  const result = buildTemporalConsistencyIntelligence({
    taste_memory: {
      recurring_rejection_patterns: [
        { reason: "texture boiling on wet bark", count: 4 },
        { reason: "fog continuity resets around beam", count: 3 },
        { reason: "skin detail shimmer", count: 2 },
      ],
    },
  });
  assert.ok(result.learned_failure_patterns.TEXTURE_STABILITY.length);
  assert.ok(result.learned_failure_patterns.FOG_VOLUMETRIC_CONTINUITY.length);
  assert.ok(result.learned_failure_patterns.SKIN_DETAIL_STABILITY.length);
  assert.equal(result.upscale_gate.per_frame_independent_super_resolution_forbidden, true);
});

test("temporal 4k mastering forbids framewise detail reinvention", () => {
  assert.match(mastering, /source_detail_may_not_be_reinvented_frame_to_frame/);
  assert.match(mastering, /texture_boiling_check/);
  assert.match(mastering, /rain_continuity_check/);
  assert.match(mastering, /fog_volumetric_continuity_check/);
  assert.match(mastering, /motion_blur_continuity_check/);
  assert.match(mastering, /lens_response_continuity_check/);
});

test("temporal master review explicitly rejects AI shimmer and atmosphere resets", () => {
  assert.match(perceptual, /TEMPORAL MASTER REVIEW/);
  assert.match(perceptual, /texture boiling/);
  assert.match(perceptual, /rain resets/);
  assert.match(perceptual, /fog\/volumetric resets/);
  assert.match(perceptual, /sharper master that flickers, shimmers/);
  assert.match(review, /skin_detail_pulsing_absent_required:true/);
  assert.match(review, /grain_crawl_absent_required:true/);
  assert.match(review, /minimum_continuity_score:96/);
});

test("temporal consistency authority reaches production graph", () => {
  assert.match(planner, /temporal_consistency_intelligence/);
});
