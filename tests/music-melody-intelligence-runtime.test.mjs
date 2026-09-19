import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { buildMusicMelodyIntelligence } from "../lib/creative/music/runtime/CreativeMusicMelodyIntelligenceRuntime.js";

function phrase(start, notes, confidence = 0.84) {
  return {
    start_seconds: start,
    end_seconds: start + notes.length * 0.4,
    confidence,
    notes: notes.map((midi, index) => ({
      midi,
      start_seconds: start + index * 0.4,
      end_seconds: start + index * 0.4 + 0.3,
    })),
  };
}

function analysis(overrides = {}) {
  return {
    melody_measurement: {
      measured_from_audio: true,
      voiced_coverage_ratio: 0.42,
      mean_pitch_confidence: 0.81,
      phrases: [phrase(0, [60, 62, 64, 67]), phrase(8, [65, 67, 69, 72])],
    },
    ...overrides,
  };
}test("strong dominant melodic line yields bounded motif intelligence", () => {
  const result = buildMusicMelodyIntelligence(analysis());
  assert.equal(result.contract, "AVANTIQO_MUSIC_MELODY_INTELLIGENCE_V1");
  assert.equal(result.melody_analysis_ready, true);
  assert.equal(result.dominant_pitch_line_claimed, true);
  assert.equal(result.phrase_candidates.length, 2);
  assert.ok(result.repeated_motif_candidates.length >= 1);
  assert.equal(result.phrase_candidates[0].contour_direction, "RISING");
  assert.equal(result.mutation_authorized, false);
  assert.equal(result.publication_authorized, false);
});

test("weak or polyphonic-like pitch evidence stays unavailable", () => {
  const result = buildMusicMelodyIntelligence(analysis({
    melody_measurement: {
      measured_from_audio: true,
      voiced_coverage_ratio: 0.05,
      mean_pitch_confidence: 0.49,
      phrases: [phrase(0, [60, 67, 55], 0.45)],
    },
  }));
  assert.equal(result.melody_analysis_ready, false);
  assert.equal(result.dominant_pitch_line_claimed, false);
  assert.deepEqual(result.phrase_candidates, []);
  assert.deepEqual(result.repeated_motif_candidates, []);
  assert.equal(result.polyphonic_uncertainty_preserved, true);
});const musicalSource = fs.readFileSync("lib/creative/music/runtime/CreativeMusicMusicalAnalysisRuntime.js", "utf8");
const semanticSource = fs.readFileSync("lib/creative/music/runtime/CreativeMusicSemanticAnalysisRuntime.js", "utf8");
const contextSource = fs.readFileSync("lib/creative/music/runtime/CreativeMusicListeningContextRuntime.js", "utf8");
const dailiesSource = fs.readFileSync("lib/creative/music/runtime/CreativeMusicDailiesListeningRuntime.js", "utf8");

test("owned musical analyzer emits bounded melody measurements", () => {
  assert.match(musicalSource, /AVANTIQO_MUSIC_MELODY_MEASUREMENT_V1/);
  assert.match(musicalSource, /raw_pitch_frames_persisted:\s*false/);
  assert.match(musicalSource, /polyphonic_source_assumed_monophonic:\s*false/);
  assert.match(musicalSource, /melody_measurement/);
  assert.match(musicalSource, /const melody_measurement = melodyMeasurement\(samples, ANALYSIS_RATE\)/);
});

test("semantic evidence, Business Partner and Dailies share melody intelligence", () => {
  assert.match(semanticSource, /buildMusicMelodyIntelligence\(analysis\)/);
  assert.match(contextSource, /melody_analysis_available/);
  assert.match(contextSource, /repeated melodic-motif candidate/);
  assert.match(dailiesSource, /melodic_intelligence:\s*buildMusicMelodyIntelligence\(analysis\)/);
});