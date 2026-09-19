import assert from "node:assert/strict";
import test from "node:test";

import { buildMusicMeterIntelligence } from "../lib/creative/music/runtime/CreativeMusicMeterIntelligenceRuntime.js";
import { buildMusicRhythmIntelligence } from "../lib/creative/music/runtime/CreativeMusicRhythmIntelligenceRuntime.js";

function profile(pattern, repeats = 8) {
  return Array.from({ length: pattern.length * repeats }, (_, index) => ({
    beat_index: index,
    accent: pattern[index % pattern.length],
  }));
}

function analysis(beatAccentProfile, overrides = {}) {
  return {
    duration_seconds: 32,
    source_audio_measured: true,
    rhythm: {
      measured_from_audio: true,
      bpm: 120,
      pulse_ready: true,
      pulse_phase_seconds: 0.1,
      pulse_phase_confidence: 0.7,
      beat_accent_profile: beatAccentProfile,
      ...overrides,
    },
  };
}
test("strong four-beat accent pattern yields a bounded 4/4 candidate", () => {
  const result = buildMusicMeterIntelligence(analysis(profile([1, 0.3, 0.55, 0.3])));
  assert.equal(result.contract, "AVANTIQO_MUSIC_METER_INTELLIGENCE_V1");
  assert.equal(result.meter_analysis_ready, true);
  assert.equal(result.time_signature_candidate, "4/4");
  assert.equal(result.downbeat_phase_in_beats, 0);
  assert.ok(result.downbeat_confidence >= 0.5);
  assert.ok(result.bar_start_seconds.length > 4);
  assert.equal(result.mutation_authorized, false);
  assert.equal(result.publication_authorized, false);
});

test("flat accent pattern preserves meter ambiguity", () => {
  const result = buildMusicMeterIntelligence(analysis(profile([0.6, 0.6, 0.6, 0.6])));
  assert.equal(result.meter_analysis_ready, false);
  assert.equal(result.time_signature_candidate, null);
  assert.equal(result.downbeat_confidence, null);
  assert.equal(result.ambiguity_preserved, true);
});
test("rhythm intelligence exposes meter only when the meter model passes", () => {
  const result = buildMusicRhythmIntelligence({
    ...analysis(profile([1, 0.25, 0.5, 0.25])),
    sections: { windows: [] },
  });
  assert.equal(result.downbeat_analysis_ready, true);
  assert.equal(result.meter_intelligence.time_signature_candidate, "4/4");
  assert.ok(result.downbeat_confidence > 0);
  assert.equal(result.downbeat_claim_forbidden_without_meter_phase_model, false);
});

test("weak pulse prevents meter/downbeat claims even with patterned accents", () => {
  const result = buildMusicRhythmIntelligence({
    ...analysis(profile([1, 0.2, 0.5, 0.2]), { pulse_ready: false, pulse_phase_confidence: 0.04 }),
    sections: { windows: [] },
  });
  assert.equal(result.rhythm_analysis_ready, false);
  assert.equal(result.downbeat_analysis_ready, false);
  assert.equal(result.meter_intelligence.meter_analysis_ready, false);
});
test("clear three-beat grouping yields 3/4 rather than forcing 4/4", () => {
  const result = buildMusicMeterIntelligence(analysis(profile([1, 0.3, 0.4], 10)));
  assert.equal(result.meter_analysis_ready, true);
  assert.equal(result.time_signature_candidate, "3/4");
  assert.ok(result.candidate_margin >= 0.06);
});

test("compound six-beat accent pattern can yield 6/8", () => {
  const result = buildMusicMeterIntelligence(analysis(profile([1, 0.3, 0.3, 0.65, 0.3, 0.3], 10)));
  assert.equal(result.meter_analysis_ready, true);
  assert.equal(result.time_signature_candidate, "6/8");
  assert.ok(result.candidate_margin >= 0.06);
});
