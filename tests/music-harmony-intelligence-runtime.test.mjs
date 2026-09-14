import test from "node:test";
import assert from "node:assert/strict";
import { buildMusicHarmonyIntelligence } from "../lib/creative/music/runtime/CreativeMusicHarmonyIntelligenceRuntime.js";

function measured(chroma) {
  return {
    source_audio_measured: true,
    accepted: { key: "A", mode: "minor", key_label: "A minor" },
    key: { key: "A", mode: "minor", label: "A minor", confidence: 0.81 },
    harmonic_movement: {
      measured_from_audio: true,
      windows: [{ start_seconds: 0, end_seconds: 8, chroma }],
    },
  };
}

test("strong measured triad becomes a bounded chord candidate", () => {
  const result = buildMusicHarmonyIntelligence(measured([0.25,0.01,0.01,0.01,0.28,0.01,0.01,0.01,0.01,0.40,0.01,0.01]));
  assert.equal(result.tonal_center.label, "A minor");
  assert.equal(result.chord_windows[0].chord_label, "Am");
  assert.equal(result.chord_names_available, true);
  assert.equal(result.mutation_authorized, false);
  assert.equal(result.publication_authorized, false);
});
test("ambiguous chroma remains unlabeled instead of forcing a chord", () => {
  const flat = Array(12).fill(1 / 12);
  const result = buildMusicHarmonyIntelligence(measured(flat));
  assert.equal(result.chord_windows[0].chord_label, null);
  assert.equal(result.chord_windows[0].ambiguous, true);
  assert.equal(result.labelled_window_count, 0);
  assert.equal(result.chord_names_available, false);
});

test("weak key evidence does not claim a tonal center", () => {
  const source = measured([0.25,0.01,0.01,0.01,0.28,0.01,0.01,0.01,0.01,0.40,0.01,0.01]);
  source.key.confidence = 0.2;
  const result = buildMusicHarmonyIntelligence(source);
  assert.equal(result.tonal_center, null);
  assert.equal(result.metadata_guessing_forbidden, true);
  assert.equal(result.user_intent_inference_allowed, false);
});
