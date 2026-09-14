import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { buildMusicSemanticAnalysis } from "../lib/creative/music/runtime/CreativeMusicSemanticAnalysisRuntime.js";
import { buildMusicListeningEvidence } from "../lib/creative/music/runtime/CreativeMusicListeningEvidenceRuntime.js";
import { buildMusicListeningContext } from "../lib/creative/music/runtime/CreativeMusicListeningContextRuntime.js";

function windows() {
  const rows = [];
  const rms = [0.08, 0.09, 0.10, 0.11, 0.22, 0.24, 0.23, 0.21, 0.08, 0.09, 0.10, 0.11];
  const transient = [0.03, 0.035, 0.04, 0.045, 0.09, 0.10, 0.095, 0.085, 0.03, 0.035, 0.04, 0.045];
  for (let index = 0; index < rms.length; index += 1) {
    rows.push({
      start_seconds: index * 2,
      end_seconds: index * 2 + 2,
      rms: rms[index],
      transient_density: transient[index],
    });
  }
  return rows;
}

function analysis() {
  return {
    source_audio_measured: true,
    duration_seconds: 24,
    accepted: { bpm: 120, key_label: "D minor" },
    tempo: { confidence: 0.9 },
    key: { confidence: 0.8 },
    sections: { boundaries_seconds: [8, 16], windows: windows() },
    harmonic_movement: {
      measured_from_audio: true,
      change_points: [{ at_seconds: 8, chroma_distance: 0.12, confidence: 0.66 }],
    },
  };
}
test("semantic analysis derives measured energy and recurrence without inventing labels", () => {
  const semantic = buildMusicSemanticAnalysis(analysis());
  assert.equal(semantic.contract, "AVANTIQO_MUSIC_SEMANTIC_ANALYSIS_V1");
  assert.equal(semantic.measured_from_audio, true);
  assert.ok(semantic.energy_profile.some((row) => row.energy_state === "HIGH"));
  assert.ok(semantic.recurring_patterns.length >= 1);
  assert.equal(semantic.harmonic_change_points[0].at_seconds, 8);
  assert.equal(semantic.harmonic_change_points[0].chord_label, null);
  assert.equal(semantic.chord_analysis_ready, false);
  assert.equal(semantic.vocal_entry_analysis_ready, false);
  assert.equal(semantic.section_identity_inference_allowed, false);
  assert.equal(semantic.user_intent_inference_allowed, false);
  assert.equal(semantic.mutation_authorized, false);
});

test("listening evidence persists only compact semantic descriptors", () => {
  const evidence = buildMusicListeningEvidence({
    creative_project_id: "project-1",
    master_asset_id: "master-v1",
    analysis: analysis(),
    reviewed_at: "2026-09-14T00:00:00.000Z",
  });
  assert.equal(evidence.semantic.contract, "AVANTIQO_MUSIC_SEMANTIC_ANALYSIS_V1");
  assert.ok(evidence.semantic.energy_profile.length <= 24);
  assert.ok(evidence.semantic.recurring_patterns.length <= 12);
  assert.ok(evidence.semantic.harmonic_change_points.length <= 24);
  assert.equal(evidence.semantic.chord_analysis_ready, false);
  assert.equal(evidence.semantic.vocal_entry_analysis_ready, false);
});
test("Business Partner reasoning uses current semantic evidence but not as authority", () => {
  const evidence = buildMusicListeningEvidence({
    creative_project_id: "project-1",
    master_asset_id: "master-v1",
    analysis: analysis(),
  });
  const context = buildMusicListeningContext({
    evidence,
    current: { current_master_asset_id: "master-v1", current_version_id: "master-v1" },
    sections: [
      { start_seconds: 0, end_seconds: 8, label: "Verse", master_asset_id: "master-v1", version_id: "master-v1" },
      { start_seconds: 8, end_seconds: 16, label: "Chorus", master_asset_id: "master-v1", version_id: "master-v1" },
      { start_seconds: 16, end_seconds: 24, label: "Verse Return", master_asset_id: "master-v1", version_id: "master-v1" },
    ],
  });
  assert.equal(context.semantic_descriptors_are_measurement_grounded, true);
  assert.equal(context.chord_names_available, false);
  assert.equal(context.vocal_entry_analysis_available, false);
  assert.equal(context.mutation_authorized, false);
  assert.equal(context.may_infer_user_intent, false);
  assert.ok(context.reasoning_brief.some((item) => item.includes("harmonic movement")));
  assert.ok(context.reasoning_brief.some((item) => item.includes("recurring texture/energy pattern")));
  assert.ok(context.reasoning_brief.some((item) => item.includes("Chorus")));
});

test("semantic reasoning disappears when evidence is stale", () => {
  const evidence = buildMusicListeningEvidence({ creative_project_id: "project-1", master_asset_id: "master-v1", analysis: analysis() });
  const context = buildMusicListeningContext({
    evidence,
    current: { current_master_asset_id: "master-v2", current_version_id: "master-v2" },
  });
  assert.equal(context, null);
});

const musicalAnalysisSource = fs.readFileSync("lib/creative/music/runtime/CreativeMusicMusicalAnalysisRuntime.js", "utf8");

test("owned PCM analysis emits measured harmonic movement without chord guessing", () => {
  assert.match(musicalAnalysisSource, /AVANTIQO_MUSIC_HARMONIC_MOVEMENT_V1/);
  assert.match(musicalAnalysisSource, /harmonicMovementAnalysis/);
  assert.match(musicalAnalysisSource, /harmonic_movement_ready:\s*true/);
  assert.match(musicalAnalysisSource, /chord_labels_inferred:\s*false/);
  assert.match(musicalAnalysisSource, /chord_analysis_ready:\s*false/);
});
