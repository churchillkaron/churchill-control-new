import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { evaluateCinematicFrameDynamics } from "../lib/creative/quality/runtime/CreativeCinematicFrameDynamicsRuntime.js";

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("long visually flat master fails deterministic frame dynamics", () => {
  const result = evaluateCinematicFrameDynamics({
    duration_seconds: 90,
    metrics: { sample_count: 46, luminance_range: 9, mean_visual_change: 1.8, p75_visual_change: 3, longest_low_change_run_seconds: 42 },
  });
  assert.equal(result.passed, false);
  assert.ok(result.failures.includes("FRAME_DYNAMICS_VISUALLY_FLAT_LUMINANCE"));
  assert.ok(result.failures.includes("FRAME_DYNAMICS_VISUALLY_FLAT_CHANGE"));
});

test("authored whole-film dynamics pass without matching a reference template", () => {
  const result = evaluateCinematicFrameDynamics({
    duration_seconds: 90,
    metrics: { sample_count: 46, luminance_range: 42, mean_visual_change: 11, p75_visual_change: 18, longest_low_change_run_seconds: 12 },
  });
  assert.equal(result.passed, true);
  assert.equal(result.reference_provenance.threshold_strategy, "CONSERVATIVE_BELOW_REFERENCE_ENVELOPE_NOT_TEMPLATE_MATCHING");
});
test("missing frame-dynamics evidence fails closed", () => {
  const result = evaluateCinematicFrameDynamics({ duration_seconds: 60, metrics: {} });
  assert.equal(result.passed, false);
  assert.ok(result.failures.includes("FRAME_DYNAMICS_SAMPLE_EVIDENCE_REQUIRED"));
  assert.ok(result.failures.includes("FRAME_DYNAMICS_LUMINANCE_RANGE_REQUIRED"));
  assert.ok(result.failures.includes("FRAME_DYNAMICS_VISUAL_CHANGE_REQUIRED"));
});

test("short deliberate restraint is allowed but long stasis is not", () => {
  const short = evaluateCinematicFrameDynamics({
    duration_seconds: 8,
    intentional_restraint: true,
    metrics: { sample_count: 5, luminance_range: 3, mean_visual_change: 1 },
  });
  assert.equal(short.passed, true);

  const long = evaluateCinematicFrameDynamics({
    duration_seconds: 70,
    intentional_restraint: true,
    metrics: { sample_count: 36, luminance_range: 5, mean_visual_change: 1 },
  });
  assert.equal(long.passed, false);
  assert.ok(long.failures.includes("FRAME_DYNAMICS_RESTRAINT_BECAME_STASIS"));
});

test("post-production and master review require deterministic dynamics evidence", () => {
  const post = read("lib/creative/post-production/runtime/CreativePostProductionRuntime.js");
  const perceptual = read("lib/creative/quality/runtime/CreativePerceptualQualityRuntime.js");
  const master = read("lib/creative/quality/runtime/CreativeMasterFilmDirectorReviewRuntime.js");
  assert.match(post, /collect_frame_dynamics: collectFrameDynamics/);
  assert.match(perceptual, /CREATIVE_DETERMINISTIC_FRAME_DYNAMICS_EVIDENCE_V1/);
  assert.match(perceptual, /frame_dynamics_evidence/);
  assert.match(master, /semantic\.passed && finishing\.passed && frameDynamics\.passed/);
  assert.match(master, /reference_frame_dynamics_required: true/);
});
