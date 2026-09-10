import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { evaluateCinematicAudioDynamics } from "../lib/creative/quality/runtime/CreativeCinematicAudioDynamicsRuntime.js";

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("long constant-bed mix fails deterministic audio dynamics", () => {
  const result = evaluateCinematicAudioDynamics({
    duration_seconds: 90,
    metrics: { active_sample_count: 900, p90_p10_lufs_range: 2.2, active_lufs_range: 5.5 },
  });
  assert.equal(result.passed, false);
  assert.ok(result.failures.includes("AUDIO_DYNAMICS_PERCENTILE_RANGE_TOO_FLAT"));
  assert.ok(result.failures.includes("AUDIO_DYNAMICS_ACTIVE_RANGE_TOO_FLAT"));
});

test("authored dynamic final mix passes without matching Lamborghini", () => {
  const result = evaluateCinematicAudioDynamics({
    duration_seconds: 90,
    metrics: { active_sample_count: 900, p90_p10_lufs_range: 9.5, active_lufs_range: 19 },
  });
  assert.equal(result.passed, true);
  assert.equal(result.reference_provenance.threshold_strategy, "CONSERVATIVE_BELOW_REFERENCE_NOT_TEMPLATE_MATCHING");
});
test("missing audio dynamics evidence fails closed", () => {
  const result = evaluateCinematicAudioDynamics({ duration_seconds: 60, metrics: {} });
  assert.equal(result.passed, false);
  assert.ok(result.failures.includes("AUDIO_DYNAMICS_SAMPLE_EVIDENCE_REQUIRED"));
});

test("post-production and master review require deterministic audio dynamics", () => {
  const post = read("lib/creative/post-production/runtime/CreativePostProductionRuntime.js");
  const perceptual = read("lib/creative/quality/runtime/CreativePerceptualQualityRuntime.js");
  const master = read("lib/creative/quality/runtime/CreativeMasterFilmDirectorReviewRuntime.js");
  assert.match(post, /collect_audio_dynamics: collectAudioDynamics/);
  assert.match(perceptual, /CREATIVE_DETERMINISTIC_AUDIO_DYNAMICS_EVIDENCE_V1/);
  assert.match(perceptual, /audio_dynamics_evidence/);
  assert.match(master, /semantic\.passed && finishing\.passed && frameDynamics\.passed && audioDynamics\.passed/);
  assert.match(master, /reference_audio_dynamics_required: true/);
});
