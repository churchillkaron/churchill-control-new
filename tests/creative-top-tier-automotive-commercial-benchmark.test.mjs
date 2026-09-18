import assert from "node:assert/strict";
import test from "node:test";

import {
  CreativeTopTierAutomotiveCommercialBenchmarkRuntime,
} from "../lib/creative/certification/runtime/CreativeTopTierAutomotiveCommercialBenchmarkRuntime.js";

function cinema({ includeTracking = false, includeVideo = false } = {}) {
  const ids = [...CreativeTopTierAutomotiveCommercialBenchmarkRuntime.required_engine_ids];
  if (includeTracking) ids.push("MATCHMOVE_3D", "ROTO_MATTING");
  if (includeVideo) ids.push("VIDEO_GENERATION_1080");
  return {
    engines: [...new Set(ids)].map((id) => ({ id, passed: true })),
  };
}

function automotive() {
  return {
    asset_interchange: { status: "READY" },
    cinematography: { status: "READY" },
    environment_binding: { ready: true },
  };
}

test("pure CGI automotive commercial can pass without live-action tracking engines", () => {
  const result = CreativeTopTierAutomotiveCommercialBenchmarkRuntime.evaluate({
    cinema_certification: cinema(), automotive_evidence: automotive(), usage: {},
  });
  assert.equal(result.minimum_grade_passed, true);
  assert.equal(result.minimum_status, "TOP_TIER_AUTOMOTIVE_COMMERCIAL_READY");
});
test("live-action automotive integration additionally requires matchmove and roto", () => {
  const blocked = CreativeTopTierAutomotiveCommercialBenchmarkRuntime.evaluate({
    cinema_certification: cinema(), automotive_evidence: automotive(),
    usage: { live_action_plate_integration: true },
  });
  assert.equal(blocked.minimum_grade_passed, false);
  assert.ok(blocked.minimum_blockers.includes("AUTOMOTIVE_MATCHMOVE_3D_REQUIRED"));
  assert.ok(blocked.minimum_blockers.includes("AUTOMOTIVE_ROTO_REQUIRED"));

  const ready = CreativeTopTierAutomotiveCommercialBenchmarkRuntime.evaluate({
    cinema_certification: cinema({ includeTracking: true }), automotive_evidence: automotive(),
    usage: { live_action_plate_integration: true },
  });
  assert.equal(ready.minimum_grade_passed, true);
});

test("AI generation is conditional rather than falsely mandatory for CGI work", () => {
  const blocked = CreativeTopTierAutomotiveCommercialBenchmarkRuntime.evaluate({
    cinema_certification: cinema(), automotive_evidence: automotive(),
    usage: { ai_video_generation: true },
  });
  assert.ok(blocked.minimum_blockers.includes("AUTOMOTIVE_AI_VIDEO_GENERATION_NOT_CERTIFIED"));
  const ready = CreativeTopTierAutomotiveCommercialBenchmarkRuntime.evaluate({
    cinema_certification: cinema({ includeVideo: true }), automotive_evidence: automotive(),
    usage: { ai_video_generation: true },
  });
  assert.equal(ready.minimum_grade_passed, true);
});
test("beyond-parity tier reports real advanced gaps without blocking minimum grade", () => {
  const result = CreativeTopTierAutomotiveCommercialBenchmarkRuntime.evaluate({
    cinema_certification: cinema(), automotive_evidence: automotive(),
  });
  assert.equal(result.minimum_grade_passed, true);
  assert.equal(result.beyond_parity_certified, false);
  assert.equal(result.beyond_parity_status, "UPGRADES_AVAILABLE");
  const ids = result.advanced_upgrades.map((item) => item.id);
  assert.ok(ids.includes("NATIVE_AXF_BTF_MATERIAL_INGEST"));
  assert.ok(ids.includes("NATIVE_DEEP_EXR_COMPOSITING"));
  assert.ok(ids.includes("OPENUSD_SCENE_COMPOSITION_AND_VARIANTS"));
  assert.ok(ids.includes("SURROUND_OBJECT_AUDIO_5_1_7_1_7_1_4_ATMOS"));
});

test("benchmark never claims brand affiliation", () => {
  const result = CreativeTopTierAutomotiveCommercialBenchmarkRuntime.evaluate({
    cinema_certification: cinema(), automotive_evidence: automotive(),
  });
  assert.equal(result.policy.brand_affiliation_not_claimed, true);
  assert.equal(result.benchmark_class, "TOP_TIER_AUTOMOTIVE_COMMERCIAL");
});
