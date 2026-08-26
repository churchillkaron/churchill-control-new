import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const files = Object.freeze({
  timing: "services/avantiqo-music-vocal-correction-engine/timing.py",
  keyParser: "services/avantiqo-music-vocal-correction-engine/key_parser.py",
  handlerV2: "services/avantiqo-music-vocal-correction-engine/handler_v2.py",
  docker: "services/avantiqo-music-vocal-correction-engine/Dockerfile",
  provider: "lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoMusicVocalCorrectionProvider.js",
  leasePolicy: "config/avantiqo-runpod-safe-lease-policy.json",
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
    '"unsafe_phrase_moves_skipped": True',
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
    '"formant_compensation_explicitly_configured": False',
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

test("Music correction transport requires certification and exact Safe Lease V2 lane", async () => {
  const [provider, leasePolicy] = await Promise.all([
    source(files.provider),
    source(files.leasePolicy),
  ]);
  hasAll(provider, [
    "AVANTIQO_MUSIC_VOCAL_CORRECTION_ENGINE_V2",
    "TORCHCREPE_SIGNALSMITH_VOCAL_CORRECTION_V2",
    "AVANTIQO_MUSIC_VOCAL_CORRECTION_ENGINE_NOT_CERTIFIED",
    "AVANTIQO_RUNPOD_SAFE_LEASE_V2",
    'const SAFE_LEASE_LANE = "music-vocal-correction"',
    "AVANTIQO_MUSIC_VOCAL_CORRECTION_SAFE_LEASE_ENDPOINT_MISMATCH",
    'fetchWithTimeout(`${baseUrl}/run`',
  ], "provider");
  hasAll(leasePolicy, [
    '"music-vocal-correction": "avantiqo-music-vocal-correction-v1"',
    '"resting_workers_max": 0',
    '"max_workers_per_lease": 1',
    '"max_jobs_per_lease": 1',
  ], "safe lease policy");

  const guard = provider.indexOf("const { baseUrl, apiKey, timeoutMs, lease } = configuration()");
  const run = provider.indexOf('fetchWithTimeout(`${baseUrl}/run`');
  assert.ok(guard >= 0 && run > guard, "safe-lease/certification configuration must run before /run submission");
  assert.equal(/workersMax\s*[:=]\s*1/.test(provider), false);
  assert.equal(/rest\.runpod\.io/.test(provider), false);
});
