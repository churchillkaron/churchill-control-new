import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const technical = fs.readFileSync(
  "lib/creative/quality/runtime/CreativeVideoTechnicalQualityRuntime.js",
  "utf8",
);
const temporal = fs.readFileSync(
  "lib/creative/quality/runtime/CreativeVideoTemporalEvidenceRuntime.js",
  "utf8",
);
const gate = fs.readFileSync(
  "lib/creative/quality/runtime/CreativeShotCandidateQualityGateBootstrap.js",
  "utf8",
);
const review = fs.readFileSync(
  "lib/creative/quality/runtime/CreativeShotCandidateReviewRuntime.js",
  "utf8",
);
const selection = fs.readFileSync(
  "lib/creative/quality/runtime/CreativeShotCandidateSelectionRuntime.js",
  "utf8",
);

test("generated Video candidates cannot finalise when perceptual review is disabled", () => {
  assert.match(gate, /if \(!videos\.length\)/);
  assert.match(gate, /status:\s*"NO_VIDEO_CANDIDATES"/);
  assert.match(gate, /if \(!canonicalMode && !fallbackEnabled\)/);
  assert.match(gate, /status:\s*"BLOCKED"/);
  assert.match(gate, /passed:\s*false/);
  assert.match(gate, /PERCEPTUAL_VIDEO_REVIEW_REQUIRED_BEFORE_FINALISATION/);
  assert.doesNotMatch(
    gate,
    /NO_CANONICAL_PERCEPTUAL_EVIDENCE_AND_FALLBACK_REVIEW_DISABLED/,
    "Video review policy absence must never be treated as a passing finalisation state",
  );
});

test("deterministic technical certification runs before any paid fallback review", () => {
  const technicalIndex = gate.indexOf("CreativeVideoTechnicalQualityRuntime.assess");
  const paidReviewIndex = gate.indexOf("CreativeShotCandidateReviewRuntime.analyze");
  assert.ok(technicalIndex >= 0, "technical gate missing");
  assert.ok(paidReviewIndex > technicalIndex, "paid perceptual review must run after technical gate");
  assert.match(gate, /if \(technicalFailures\.length\)/);
  assert.match(gate, /provider_calls_executed:\s*0/);
  assert.match(gate, /mode:\s*"DETERMINISTIC_TECHNICAL_GATE"/);
});

test("technical gate verifies the actual media master against the canonical Shot Bible", () => {
  assert.match(technical, /CREATIVE_VIDEO_TECHNICAL_QUALITY_V2/);
  assert.match(technical, /CreativeShotBibleRuntime\.assert/);
  assert.match(technical, /CreativeMediaInspectionRuntime\.inspect/);
  assert.match(technical, /CreativeVideoTemporalEvidenceRuntime\.analyze/);
  assert.match(technical, /resolveCreativeFfprobePath/);
  for (const check of [
    "probe_complete",
    "video_stream",
    "resolution",
    "aspect_ratio",
    "duration",
    "frame_rate",
    "audio_delivery",
    "audio_video_timing",
    "temporal_evidence_ready",
  ]) {
    assert.match(technical, new RegExp(`"${check}"`));
  }
  assert.match(technical, /const MINIMUM_WORLD_CLASS_FRAME_RATE = 23\.9/);
  assert.match(technical, /const MINIMUM_WORLD_CLASS_AUDIO_SAMPLE_RATE = 44100/);
});

test("dense temporal evidence is CPU-only and spans motion, flicker, dynamics and AV timing", () => {
  assert.match(temporal, /CREATIVE_VIDEO_TEMPORAL_EVIDENCE_V1/);
  assert.match(temporal, /const SAMPLE_FPS = 6/);
  assert.match(temporal, /const MAX_SAMPLE_FRAMES = 180/);
  assert.match(temporal, /motion_change_percent/);
  assert.match(temporal, /motion_smoothness_proxy/);
  assert.match(temporal, /temporal_flicker_proxy/);
  assert.match(temporal, /dynamic_degree_proxy/);
  assert.match(temporal, /near_duplicate_pair_ratio/);
  assert.match(temporal, /audio_video_timing/);
  assert.match(temporal, /provider_calls_executed:\s*0/);
  assert.match(temporal, /gpu_calls_executed:\s*0/);
  assert.match(temporal, /VBench-style temporal dimensions/);
});

test("temporal heuristics inform the 94-point perceptual reviewer without pretending to be identity truth", () => {
  assert.match(temporal, /subject_or_identity_consistency_requires_perceptual_review:\s*true/);
  assert.match(temporal, /background_consistency_requires_perceptual_review:\s*true/);
  assert.match(temporal, /temporal_flicker_proxy_is_machine_evidence_not_final_verdict:\s*true/);
  assert.match(temporal, /motion_smoothness_proxy_is_machine_evidence_not_final_verdict:\s*true/);
  assert.match(technical, /technical:\s*\{[\s\S]*temporal_evidence:\s*temporal/);
  assert.match(review, /technical:\s*candidate\.technical \|\| \{\}/);
});

test("audio/video timing mismatch fails before paid perceptual review", () => {
  assert.match(temporal, /AUDIO_VIDEO_TIMING_MISMATCH/);
  assert.match(temporal, /duration_tolerance_seconds:\s*AUDIO_VIDEO_DURATION_TOLERANCE_SECONDS/);
  assert.match(temporal, /start_tolerance_seconds:\s*AUDIO_VIDEO_START_TOLERANCE_SECONDS/);
  assert.match(technical, /"audio_video_timing"/);
  assert.match(technical, /!requiresAudio \|\| temporalTiming\.passed === true/);
});

test("technical failures reject the asset and persist bounded repair evidence", () => {
  assert.match(technical, /CREATIVE_ASSET_NODE_STATUS\.REJECTED/);
  assert.match(technical, /video_technical_quality_failed_checks/);
  assert.match(technical, /video_technical_quality_repair_instructions/);
  assert.match(technical, /video_technical_quality_checks/);
  assert.match(technical, /video_temporal_evidence_contract/);
  assert.match(technical, /video_temporal_evidence_risk_flags/);
  assert.match(technical, /video_technical_quality_source_url/);
});

test("perceptual world-class selection remains weakest-link fail-closed at 94", () => {
  assert.match(review, /const CHECKS = Object\.freeze\(\[/);
  assert.match(review, /"identity_continuity"/);
  assert.match(review, /"physics_and_contact"/);
  assert.match(review, /"camera_plausibility"/);
  assert.match(review, /"motion_cadence"/);
  assert.match(review, /"continuity"/);
  assert.match(review, /"detectable_synthetic_artifacts"/);
  assert.match(selection, /const WORLD_CLASS_FLOOR = 94/);
  assert.match(selection, /score\.weakest >= WORLD_CLASS_FLOOR/);
  assert.match(selection, /score\.overall >= WORLD_CLASS_FLOOR/);
});
