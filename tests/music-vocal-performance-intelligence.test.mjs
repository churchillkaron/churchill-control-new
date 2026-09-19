import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { buildMusicVocalPerformanceEvidence } from "../lib/creative/music/runtime/CreativeMusicVocalPerformanceAnalysisRuntime.js";
import { buildMusicVocalIntelligence } from "../lib/creative/music/runtime/CreativeMusicVocalIntelligenceRuntime.js";

function syntheticPerformancePcm(sampleRate = 16000, seconds = 2) {
  const samples = new Float32Array(sampleRate * seconds);
  for (let index = 0; index < samples.length; index += 1) {
    const time = index / sampleRate;
    const base = 0.08 * Math.sin(2 * Math.PI * 220 * time);
    const burst = time > 0.7 && time < 0.82 ? 0.07 * Math.sin(2 * Math.PI * 4200 * time) : 0;
    const air = time > 1.2 && time < 1.45 ? 0.025 * Math.sin(2 * Math.PI * 1800 * time) : 0;
    samples[index] = base + burst + air;
  }
  return samples;
}
test("vocal performance evidence measures dynamics and keeps event labels conservative", () => {
  const result = buildMusicVocalPerformanceEvidence({ samples: syntheticPerformancePcm(), sample_rate: 16000 });
  assert.equal(result.contract, "AVANTIQO_MUSIC_VOCAL_PERFORMANCE_EVIDENCE_V1");
  assert.ok(result.dynamics_windows.length > 0);
  assert.ok(Number.isFinite(result.active_dynamic_range_db));
  assert.ok(Number.isFinite(result.median_crest_db));
  assert.equal(result.breath_events_confirmed, false);
  assert.equal(result.consonant_identity_inferred, false);
  assert.equal(result.signal_proxy_only, true);
  assert.equal(result.mutation_authorized, false);
  for (const event of [...result.sibilant_event_candidates, ...result.air_noise_event_candidates]) {
    assert.equal(event.measured_signal_proxy, true);
    assert.equal(event.semantic_confirmation_required, true);
  }
});

function intelligenceSession() {
  return {
    tracks: [{ id: "v1", type: "vocal", clips: [{
      id: "c1", source_asset_id: "a1", source_offset_seconds: 0, duration_seconds: 2,
      vocal_pitch_analysis: {
        contract: "AVANTIQO_MUSIC_VOCAL_PITCH_ANALYSIS_V1",
        source_asset_id: "a1", source_offset_seconds: 0, source_duration_seconds: 2,
        voiced_ratio: 0.8, mean_confidence: 0.9, note_segments: [],
        sustained_note_count: 1, vibrato_candidate_count: 1,
        vibrato_is_signal_candidate_not_artistic_intent: true,
        sustained_performance: [{
          start_seconds: 0.2, end_seconds: 1.2, note: "A3",
          pitch_stability_std_cents: 8.4, pitch_span_cents: 24.2,
          vibrato_candidate: true, vibrato_candidate_rate_hz: 5.2,
          vibrato_candidate_extent_cents: 12.1,
        }],
      },
      vocal_engineering_evidence: {
        contract: "AVANTIQO_MUSIC_VOCAL_ENGINEERING_EVIDENCE_V1",
        source_asset_id: "a1", source_offset_seconds: 0, source_duration_seconds: 2,
        source_audio_measured: true, measured: {},
        performance: {
          active_dynamic_range_db: 7.3, median_crest_db: 9.8,
          dynamics_windows: [{ start_seconds: 0, end_seconds: 0.5, rms_dbfs: -22, peak_dbfs: -5, crest_db: 17 }],
          sibilant_event_candidates: [{ type: "SIBILANT_EVENT_CANDIDATE", start_seconds: 0.7, end_seconds: 0.82, measured_signal_proxy: true, semantic_confirmation_required: true }],
          air_noise_event_candidates: [{ type: "AIR_NOISE_EVENT_CANDIDATE", start_seconds: 1.2, end_seconds: 1.45, measured_signal_proxy: true, semantic_confirmation_required: true }],
          breath_events_confirmed: false, signal_proxy_only: true,
        },
      },
    }] }],
  };
}

test("Business Partner vocal intelligence exposes bounded performance evidence", () => {
  const result = buildMusicVocalIntelligence({ multitrack_session: intelligenceSession() });
  assert.equal(result.dynamics_envelope_available, true);
  assert.equal(result.sustained_pitch_performance_available, true);
  assert.equal(result.air_noise_candidates_available, true);
  assert.equal(result.sibilant_event_candidates_available, true);
  assert.equal(result.breath_analysis_available, false);
  assert.equal(result.clips[0].pitch.vibrato_candidate_count, 1);
  assert.equal(result.clips[0].engineering.dynamics.active_dynamic_range_db, 7.3);
  assert.equal(result.clips[0].engineering.breath_events_confirmed, false);
});
test("pitch analyzer emits sustained stability and vibrato candidates without inferring intent", () => {
  const source = fs.readFileSync("lib/creative/music/runtime/CreativeMusicVocalPitchAnalysisRuntime.js", "utf8");
  assert.match(source, /sustainedPerformance/);
  assert.match(source, /pitch_stability_std_cents/);
  assert.match(source, /vibrato_candidate_rate_hz/);
  assert.match(source, /vibrato_is_signal_candidate_not_artistic_intent:\s*true/);
});
