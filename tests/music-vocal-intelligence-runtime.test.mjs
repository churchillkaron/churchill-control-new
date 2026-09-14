import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { buildMusicVocalIntelligence } from "../lib/creative/music/runtime/CreativeMusicVocalIntelligenceRuntime.js";

function sessionFixture() {
  return {
    tracks: [{
      id: "track-vocal-1",
      type: "vocal",
      vocal_role: "lead",
      clips: [{
        id: "clip-vocal-1",
        source_asset_id: "asset-vocal-1",
        source_offset_seconds: 2,
        duration_seconds: 12,
        vocal_pitch_analysis: {
          contract: "AVANTIQO_MUSIC_VOCAL_PITCH_ANALYSIS_V1",
          source_asset_id: "asset-vocal-1",
          source_offset_seconds: 2,
          source_duration_seconds: 12,
          voiced_ratio: 0.71,
          mean_confidence: 0.83,
          note_segments: [
            { midi: 60, note: "C4", mean_cents_deviation: 4, confidence: 0.9 },
            { midi: 64, note: "E4", mean_cents_deviation: -18, confidence: 0.82 },
            { midi: 67, note: "G4", mean_cents_deviation: 7, confidence: 0.86 },
          ],
        },
        vocal_timing_analysis: {
          contract: "AVANTIQO_MUSIC_VOCAL_TIMING_ANALYSIS_V1",
          source_asset_id: "asset-vocal-1",
          source_offset_seconds: 2,
          source_duration_seconds: 12,
          suggested_move_count: 1,
          phrases: [
            { source_start_seconds: 0.2, source_end_seconds: 1.4, duration_seconds: 1.2, mean_rms: 0.08, raw_shift_ms: 12, proposed_shift_ms: 5, eligible: true, safety_reason: "SAFE_LOCAL_TIMING_POCKET" },
            { source_start_seconds: 2.0, source_end_seconds: 3.1, duration_seconds: 1.1, mean_rms: 0.07, raw_shift_ms: -3, proposed_shift_ms: 0, eligible: false, safety_reason: "ALREADY_CLOSE_TO_REFERENCE_GRID" },
          ],
        },
      }],
    }],
  };
}

test("vocal intelligence summarizes trusted clip-bound pitch and timing evidence", () => {
  const result = buildMusicVocalIntelligence({ multitrack_session: sessionFixture() });
  assert.equal(result.contract, "AVANTIQO_MUSIC_VOCAL_INTELLIGENCE_V1");
  assert.equal(result.clip_count, 1);
  assert.equal(result.clips[0].declared_vocal_role, "LEAD");
  assert.equal(result.clips[0].role_inferred_from_audio, false);
  assert.equal(result.clips[0].pitch.lowest_midi, 60);
  assert.equal(result.clips[0].pitch.highest_midi, 67);
  assert.equal(result.clips[0].timing.phrase_count, 2);
  assert.equal(result.clips[0].timing.grid_tendency, "EARLY");
});
test("vocal intelligence excludes stale clip analyses and never invents role relationships", () => {
  const session = sessionFixture();
  session.tracks[0].vocal_role = null;
  session.tracks[0].clips[0].vocal_pitch_analysis.source_asset_id = "old-asset";
  const result = buildMusicVocalIntelligence({ multitrack_session: session });
  assert.equal(result.clip_count, 1);
  assert.equal(result.clips[0].pitch, null);
  assert.equal(result.clips[0].declared_vocal_role, null);
  assert.equal(result.vocal_role_inference_available, false);
  assert.equal(result.lead_backing_relationship_available, false);
  assert.equal(result.sibilance_available, false);
  assert.equal(result.breath_analysis_available, false);
  assert.equal(result.mutation_authorized, false);
  assert.equal(result.publication_authorized, false);
});

const plannerSource = fs.readFileSync("lib/creative/music/capabilities/planWorldClassMusicStudio.js", "utf8");
const worldClassSource = fs.readFileSync("lib/creative/music/runtime/CreativeMusicWorldClassStudioRuntime.js", "utf8");
const creativeSource = fs.readFileSync("lib/creative/music/runtime/CreativeMusicCreativeDevelopmentRuntime.js", "utf8");
test("Business Partner and creative council receive bounded vocal intelligence only", () => {
  assert.match(plannerSource, /buildMusicVocalIntelligence/);
  assert.match(plannerSource, /music_vocal_intelligence:\s*vocalIntelligence/);
  assert.match(worldClassSource, /vocal_intelligence:\s*vocalIntelligence/);
  assert.match(worldClassSource, /vocal_intelligence_never_authorizes_mutation:\s*true/);
  assert.match(worldClassSource, /vocal_role_inference_forbidden_without_declared_role:\s*true/);
  assert.match(creativeSource, /vocal_intelligence:\s*vocalIntelligence/);
  assert.match(creativeSource, /trusted_vocal_clips_only:\s*true/);
  assert.match(creativeSource, /role_inference_forbidden:\s*true/);
});
