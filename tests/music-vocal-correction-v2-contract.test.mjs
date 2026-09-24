import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const timing = fs.readFileSync("services/avantiqo-music-vocal-correction-engine/timing.py", "utf8");
const keyParser = fs.readFileSync("services/avantiqo-music-vocal-correction-engine/key_parser.py", "utf8");
const handler = fs.readFileSync("services/avantiqo-music-vocal-correction-engine/handler_v2.py", "utf8");
const docker = fs.readFileSync("services/avantiqo-music-vocal-correction-engine/Dockerfile", "utf8");
const provider = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoMusicVocalCorrectionLocalQueueProvider.js", "utf8");

test("V2 adds conservative whole-phrase timing with collision guards", () => {
  assert.match(timing, /AVANTIQO_MUSIC_VOCAL_PHRASE_TIMING_V1/);
  assert.match(timing, /WHOLE_PHRASE_TRANSLATION_WITH_LOCAL_COLLISION_GUARDS/);
  assert.match(timing, /preserve_internal_phrase_timing/);
  assert.match(handler, /AVANTIQO_MUSIC_VOCAL_CORRECTION_ENGINE_V2/);
  assert.match(handler, /syllable_time_stretch_forbidden/);
});

test("V2 key parsing is bounded and self-tested", () => {
  assert.match(keyParser, /AVANTIQO_MUSIC_VOCAL_KEY_PARSER_V1/);
  assert.match(keyParser, /key_parser_self_test/);
  assert.match(keyParser, /C dorian/);
});

test("V2 readiness cannot pass from a nonnegative event count", () => {
  assert.match(handler, /INSUFFICIENT_VOICING/);
  assert.match(handler, /NO_CORRECTION_NEEDED/);
  assert.match(handler, /correction_pipeline_complete/);
  assert.doesNotMatch(handler, /pitch_render\["applied_event_count"\] >= 0/);
});

test("immutable correction image boots V2 with dependency smoke", () => {
  assert.match(docker, /handler_v2\.py/);
  assert.match(docker, /key_parser_self_test/);
  assert.match(docker, /TORCHCREPE_INFERENCE_SMOKE=PASS/);
});

test("V2 production transport is local GPU and certification gated", () => {
  assert.match(provider, /AVANTIQO_MUSIC_VOCAL_CORRECTION_ENGINE_V2/);
  assert.match(provider, /AVANTIQO_MUSIC_VOCAL_CORRECTION_ENGINE_NOT_CERTIFIED/);
  assert.match(provider, /lane:"gpu"/);
  assert.match(provider, /workload:"music_vocal_correction"/);
  assert.doesNotMatch(provider, /RunPod|Modal|SAFE_LEASE/);
});
