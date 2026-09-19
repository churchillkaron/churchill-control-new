import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { buildMusicFormIntelligence } from "../lib/creative/music/runtime/CreativeMusicFormIntelligenceRuntime.js";

function analysis() {
  const windows = [];
  const pattern = [
    [0.08, 0.02], [0.09, 0.021], [0.085, 0.019], [0.09, 0.02],
    [0.22, 0.08], [0.23, 0.082], [0.21, 0.078], [0.22, 0.081],
    [0.08, 0.02], [0.09, 0.021], [0.085, 0.019], [0.09, 0.02],
  ];
  pattern.forEach(([rms, transient], index) => windows.push({
    start_seconds: index * 2, end_seconds: index * 2 + 2, rms, transient_density: transient,
  }));
  return {
    source_audio_measured: true,
    duration_seconds: 24,
    accepted: { bpm: 120, key_label: "C major" },
    key: { key: "C", mode: "major", label: "C major", confidence: 0.8 },
    sections: { boundaries_seconds: [8, 16], windows },
    harmonic_movement: {
      measured_from_audio: true,
      change_points: [
        { at_seconds: 8, confidence: 0.8, chroma_distance: 0.4 },
        { at_seconds: 16, confidence: 0.82, chroma_distance: 0.42 },
      ],
      windows: [],
    },
    rhythm: {
      measured_from_audio: true,
      bpm: 120,
      pulse_ready: true,
      pulse_phase_confidence: 0.7,
      pulse_stability: 0.8,
      beat_energy_ratio: 0.55,
      offbeat_energy_ratio: 0.25,
      beat_accents: [],
    },
    melody_measurement: { melody_ready: false, phrases: [], dominant_pitch_coverage: 0.1 },
  };
}

test("form intelligence creates neutral recurring A-B-A structure", () => {
  const result = buildMusicFormIntelligence(analysis());
  assert.equal(result.contract, "AVANTIQO_MUSIC_FORM_INTELLIGENCE_V1");
  assert.equal(result.form_analysis_ready, true);
  assert.deepEqual(result.neutral_regions.map((row) => row.neutral_label), ["A", "B", "A"]);
  assert.equal(result.return_candidates.length, 1);
  assert.equal(result.semantic_section_labels_inferred, false);
});
test("form intelligence preserves neutral labels and authority boundary", () => {
  const result = buildMusicFormIntelligence(analysis());
  assert.equal(result.user_intent_inference_allowed, false);
  assert.equal(result.mutation_authorized, false);
  assert.equal(result.publication_authorized, false);
  assert.equal(result.approved_section_labels_may_overlay_neutral_regions, true);
  assert.ok(result.boundary_candidates.every((row) => Array.isArray(row.evidence)));
});

const contextSource = fs.readFileSync("lib/creative/music/runtime/CreativeMusicListeningContextRuntime.js", "utf8");
const dailiesSource = fs.readFileSync("lib/creative/music/runtime/CreativeMusicDailiesListeningRuntime.js", "utf8");
const evidenceSource = fs.readFileSync("lib/creative/music/runtime/CreativeMusicListeningEvidenceRuntime.js", "utf8");

test("Business Partner and Dailies share canonical form intelligence", () => {
  assert.match(contextSource, /form_analysis_available/);
  assert.match(contextSource, /Measured neutral form:/);
  assert.match(dailiesSource, /form_intelligence:\s*buildMusicFormIntelligence\(analysis\)/);
  assert.match(evidenceSource, /form_intelligence:\s*semantic\.form_intelligence/);
});
