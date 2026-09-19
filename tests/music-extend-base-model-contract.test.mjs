import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(path, "utf8");
const [configRaw, provider, benchmark, launcher, temporalContract] = await Promise.all([
  read("config/avantiqo-music-extend-engine.json"),
  read("lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoAudioProvider.js"),
  read("scripts/benchmark-avantiqo-music-extend.mjs"),
  read("scripts/run-avantiqo-music-extend-controlled-benchmark-local.mjs"),
  read("tests/music-temporal-extend-outpaint-contract.test.mjs"),
]);

const config = JSON.parse(configRaw);
assert.equal(config.semantic_scope, "ARRANGEMENT_COMPLETION_ONLY");
assert.equal(config.arrangement_completion_implemented, true);
assert.equal(config.temporal_extension_proven, false);
assert.equal(config.temporal_extend_routing_allowed, false);
assert.equal(config.superseded_for_temporal_extend, false);
assert.equal(config.temporal_extend_replacement_strategy, "XL_TURBO_REPAINT_RIGHT_OUTPAINT");
assert.equal(config.temporal_extend_replacement_lane, "MODAL_A10G_ASYNC_V1");

assert.match(provider, /AVANTIQO_AUDIO_CAPABILITY_NOT_CERTIFIED/);
assert.match(provider, /"ai\.audio\.extend"/);
assert.doesNotMatch(provider, /AvantiqoMusicExtendProvider/);

assert.match(benchmark, /AVANTIQO_MUSIC_BASE_COMPLETE_TEMPORAL_EXTEND_DEPRECATED_V1/);
assert.match(benchmark, /ACE_STEP_BASE_COMPLETE_DOES_NOT_RIGHT_PAD_SOURCE_TIMELINE/);
assert.match(benchmark, /provider_job_submitted: false/);
assert.match(benchmark, /provider_jobs_submitted: false|provider_jobs_submitted: 0/);
assert.match(benchmark, /replacement_infrastructure_provider: "MODAL_DIRECT_A10G_ASYNC_V1"/);
assert.doesNotMatch(benchmark, /SAFE_LEASE|RUNPOD|api\.runpod\.ai/i);
assert.match(benchmark, /replacement_strategy: "XL_TURBO_REPAINT_RIGHT_OUTPAINT"/);

assert.match(launcher, /AVANTIQO_MUSIC_TRANSFORM_CAPABILITY = "ai\.audio\.extend"/);
assert.match(launcher, /AVANTIQO_MUSIC_TRANSFORM_SOURCE_MODE = "MUSICAL_CONTINUITY"/);
assert.doesNotMatch(launcher, /SAFE_LEASE|RUNPOD|api\.runpod\.ai/i);
assert.match(launcher, /AVANTIQO_MUSIC_TRANSFORM_CAPABILITY = "ai\.audio\.extend"/);

assert.match(temporalContract, /MUSIC_TEMPORAL_EXTEND_OUTPAINT_CONTRACT=PASS/);

console.log("MUSIC_BASE_COMPLETE_EXTEND_SUPERSESSION_CONTRACT=PASS");
