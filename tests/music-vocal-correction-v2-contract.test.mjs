import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const files = Object.freeze({
  timing: "services/avantiqo-music-vocal-correction-engine/timing.py",
  keyParser: "services/avantiqo-music-vocal-correction-engine/key_parser.py",
  handlerV2: "services/avantiqo-music-vocal-correction-engine/handler_v2.py",
  docker: "services/avantiqo-music-vocal-correction-engine/Dockerfile",
  provider: "lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoMusicVocalCorrectionModalProvider.js",
  modal: "services/avantiqo-music-vocal-correction-modal/modal_app.py",
});

async function source(path) {
  return readFile(path, "utf8");
}

function hasAll(content, markers, label) {
  for (const marker of markers) {
    assert.ok(content.includes(marker), `${label}: missing ${marker}`);
  }
}

test("Music vocal correction V2 adds conservative whole-phrase timing", async () => {
  const [timing, handler] = await Promise.all([
    source(files.timing),
    source(files.handlerV2),
  ]);

  hasAll(timing, [
    "AVANTIQO_MUSIC_VOCAL_PHRASE_TIMING_V1",
    "WHOLE_PHRASE_TRANSLATION_WITH_LOCAL_COLLISION_GUARDS",
    "NEIGHBOR_PHRASE_COLLISION_RISK",
    "OUTSIDE_CONSERVATIVE_MAX_SHIFT",
    "preserve_internal_phrase_timing",
    '"time_stretch_used": False',
    '"phrase_timing_correction_complete": True',
  ], "phrase timing");
  hasAll(handler, [
    "AVANTIQO_MUSIC_VOCAL_CORRECTION_ENGINE_V2",
    "TORCHCREPE_SIGNALSMITH_VOCAL_CORRECTION_V2",
    "apply_phrase_timing_correction",
    '"whole_phrase_timing_only": True',
    '"syllable_time_stretch_forbidden": True',
    '"approved_timing_plan_exact_moves_required_when_supplied": True',
    '"automatic_timing_forbidden_with_musician_plans": True',
    '"unsafe_phrase_moves_rejected": True',
    '"human_listening_review_required_for_certification": True',
    '"production_certified": False',
  ], "V2 handler");
});

test("Music vocal key parsing accepts compact major/minor keys and rejects unsupported modes", async () => {
  const keyParser = await source(files.keyParser);
  hasAll(keyParser, [
    "AVANTIQO_MUSIC_VOCAL_KEY_PARSER_V1",
    '"Am": (9, "minor")',
    '"F#m": (6, "minor")',
    '"Bb": (10, "major")',
    '"Dbm": (1, "minor")',
    '"C dorian"',
    "key_parser_self_test",
  ], "key parser");
});

test("V2 pitch readiness is explicit and cannot pass from a nonnegative event count", async () => {
  const handler = await source(files.handlerV2);
  hasAll(handler, [
    '"INSUFFICIENT_VOICING"',
    '"NO_CORRECTION_NEEDED"',
    '"APPLIED"',
    '"FAILED"',
    '"pitch_status": pitch_readiness["status"]',
    '"pitch_correction_complete": pitch_readiness["complete"]',
    '"correction_pipeline_complete": correction_pipeline_complete',
    '"tonality_compensation_explicitly_configured": True',
    '"tonality_limit_hz": TONALITY_LIMIT_HZ',
    '"formant_preservation_claimed": False',
    '"unverified_formant_preservation_claim_forbidden": True',
    "AVANTIQO_MUSIC_VOCAL_CORRECTION_KEY_INVALID",
  ], "V2 readiness");
  assert.equal(handler.includes('pitch_render["applied_event_count"] >= 0'), false);
});

test("immutable Music correction image boots V2 and performs real dependency smoke", async () => {
  const docker = await source(files.docker);
  hasAll(docker, [
    "COPY services/avantiqo-music-vocal-correction-engine/key_parser.py /app/key_parser.py",
    "COPY services/avantiqo-music-vocal-correction-engine/timing.py /app/timing.py",
    "COPY services/avantiqo-music-vocal-correction-engine/handler_v2.py /app/handler_v2.py",
    "python3 -m py_compile /app/handler.py /app/key_parser.py /app/timing.py /app/handler_v2.py",
    "key_parser_self_test",
    "torchcrepe.predict(",
    '"tiny"',
    "AVANTIQO_MUSIC_VOCAL_CORRECTION_TORCHCREPE_INFERENCE_SMOKE=PASS",
    "AVANTIQO_MUSIC_VOCAL_KEY_PARSER_SELF_TEST=PASS",
    'CMD ["python3", "/app/handler_v2.py"]',
  ], "Dockerfile");
});

test("Music correction transport is Modal-direct and remains certification gated", async () => {
  const [provider, modal] = await Promise.all([
    source(files.provider),
    source(files.modal),
  ]);
  hasAll(provider, [
    "AVANTIQO_MUSIC_VOCAL_CORRECTION_ENGINE_V2",
    "AVANTIQO_MUSIC_VOCAL_CORRECTION_ENGINE_NOT_CERTIFIED",
    'transportMode: "direct-sdk"',
    'appName: "avantiqo-music-vocal-correction-owned"',
    'functionName: "correct"',
    'corrected_vocal_wav: "wav"',
    'correction_report_json: "json"',
  ], "provider");
  hasAll(modal, [
    "AVANTIQO_MUSIC_VOCAL_CORRECTION_ENGINE_V2",
    "TORCHCREPE_SIGNALSMITH_VOCAL_CORRECTION_V2",
    "WORKER_IMAGE",
    "raw_reasoning_persisted",
  ], "modal wrapper");
  assert.equal(/RUNPOD|SAFE_LEASE/.test(provider), false);
});
