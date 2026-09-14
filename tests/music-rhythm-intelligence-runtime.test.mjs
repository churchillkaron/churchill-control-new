import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { buildMusicRhythmIntelligence } from "../lib/creative/music/runtime/CreativeMusicRhythmIntelligenceRuntime.js";

function analysis(overrides = {}) {
  return {
    source_audio_measured: true,
    rhythm: {
      measured_from_audio: true,
      bpm: 120,
      pulse_ready: true,
      pulse_phase_confidence: 0.62,
      pulse_stability: 0.81,
      beat_energy_ratio: 0.5,
      offbeat_energy_ratio: 0.4,
      other_onset_energy_ratio: 0.1,
      half_double_time_candidate: { bpm: 60, score: 0.75, score_ratio: 0.92 },
    },
    sections: {
      windows: [
        { start_seconds: 0, end_seconds: 2, transient_density: 0.02 },
        { start_seconds: 2, end_seconds: 4, transient_density: 0.021 },
        { start_seconds: 4, end_seconds: 6, transient_density: 0.09 },
        { start_seconds: 6, end_seconds: 8, transient_density: 0.095 },
      ],
    },
    ...overrides,
  };
}
test("measured pulse becomes bounded groove intelligence", () => {
  const result = buildMusicRhythmIntelligence(analysis());
  assert.equal(result.contract, "AVANTIQO_MUSIC_RHYTHM_INTELLIGENCE_V1");
  assert.equal(result.rhythm_analysis_ready, true);
  assert.equal(result.syncopation_tendency, "MIXED");
  assert.equal(result.downbeat_analysis_ready, false);
  assert.equal(result.downbeat_confidence, null);
  assert.ok(result.groove_change_points.length >= 1);
  assert.equal(result.mutation_authorized, false);
  assert.equal(result.publication_authorized, false);
});

test("weak pulse evidence stays non-committal", () => {
  const result = buildMusicRhythmIntelligence(analysis({
    rhythm: {
      measured_from_audio: true,
      bpm: 120,
      pulse_ready: false,
      pulse_phase_confidence: 0.04,
      beat_energy_ratio: 0.34,
      offbeat_energy_ratio: 0.33,
    },
  }));
  assert.equal(result.rhythm_analysis_ready, false);
  assert.equal(result.syncopation_tendency, null);
  assert.equal(result.downbeat_analysis_ready, false);
});
const musicalSource = fs.readFileSync("lib/creative/music/runtime/CreativeMusicMusicalAnalysisRuntime.js", "utf8");
const dailiesSource = fs.readFileSync("lib/creative/music/runtime/CreativeMusicDailiesListeningRuntime.js", "utf8");
const contextSource = fs.readFileSync("lib/creative/music/runtime/CreativeMusicListeningContextRuntime.js", "utf8");

test("owned PCM analyzer emits compact rhythm measurements without claiming downbeats", () => {
  assert.match(musicalSource, /AVANTIQO_MUSIC_RHYTHM_MEASUREMENT_V1/);
  assert.match(musicalSource, /pulse_phase_confidence/);
  assert.match(musicalSource, /half_double_time_candidate/);
  assert.match(musicalSource, /downbeat_analysis_ready:\s*false/);
});

test("Dailies and Business Partner share the same bounded rhythm intelligence", () => {
  assert.match(dailiesSource, /buildMusicRhythmIntelligence\(analysis\)/);
  assert.match(contextSource, /rhythm_intelligence/);
  assert.match(contextSource, /rhythm_analysis_available/);
  assert.match(contextSource, /downbeat_analysis_available:\s*false/);
});
