import test from "node:test";
import assert from "node:assert/strict";

import { assessMusicSourceReadiness } from "../lib/creative/music/runtime/CreativeMusicSourceReadinessRuntime.js";
import { buildMusicCapabilityReadiness } from "../lib/creative/music/runtime/CreativeMusicCapabilityReadinessRuntime.js";

test("mastered full mix is rejected before paid singing identity conversion", () => {
  const result = assessMusicSourceReadiness({
    operation: "singing_voice_identity",
    source_kind: "MASTERED_FULL_MIX",
    reference_duration_seconds: 205,
    accompaniment_ratio: 0.9,
    reverb_ratio: 0.25,
  });
  assert.equal(result.executable, false);
  assert.equal(result.reject_before_paid_execution, true);
  assert.ok(result.blockers.includes("CLEAN_ISOLATED_VOCAL_REFERENCE_REQUIRED"));
  assert.ok(result.blockers.includes("REFERENCE_QUALITY_BELOW_IDENTITY_THRESHOLD"));
});

test("clean isolated singer reference can pass source-fit preflight", () => {
  const result = assessMusicSourceReadiness({
    operation: "singing_voice_identity",
    isolated_vocal: true,
    reference_duration_seconds: 42,
    snr_db: 34,
    accompaniment_ratio: 0,
    reverb_ratio: 0.05,
    clipping_ratio: 0,
  });
  assert.equal(result.executable, true);
  assert.ok(result.quality_score >= 82);
});

test("pitch and timing correction refuse mixed program audio", () => {
  for (const operation of ["pitch_tuning", "timing_correction"]) {
    const result = assessMusicSourceReadiness({ operation, mastered_mix: true });
    assert.equal(result.executable, false);
    assert.ok(result.blockers.includes("ISOLATED_OR_MONOPHONIC_SOURCE_REQUIRED"));
  }
});

test("gated engine status and source-fit blockers are reported separately", () => {
  const readiness = buildMusicCapabilityReadiness({
    selected_capabilities: [{ id: "singing_voice_identity", status: "RESEARCH_GATED" }],
    source_evidence: { default: { source_kind: "MASTERED_FULL_MIX", reference_duration_seconds: 180 } },
  });
  assert.equal(readiness.all_execution_ready, false);
  assert.equal(readiness.blocked_capabilities.length, 1);
  assert.ok(readiness.blocked_capabilities[0].blockers.includes("CAPABILITY_STATUS_RESEARCH_GATED"));
  assert.ok(readiness.blocked_capabilities[0].blockers.includes("CLEAN_ISOLATED_VOCAL_REFERENCE_REQUIRED"));
});
