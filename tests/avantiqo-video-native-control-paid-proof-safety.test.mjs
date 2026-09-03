import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const runnerPath = "scripts/run-avantiqo-video-native-control-paid-proof.mjs";
const preflightPath = "services/avantiqo-video-engine/modal_native_control_paid_preflight.py";

const runner = fs.readFileSync(runnerPath, "utf8");
const preflight = fs.readFileSync(preflightPath, "utf8");

function positions(source, needle) {
  const found = [];
  let cursor = 0;
  while ((cursor = source.indexOf(needle, cursor)) !== -1) {
    found.push(cursor);
    cursor += needle.length;
  }
  return found;
}

test("paid proof is hard-limited to one Modal spawn", () => {
  const spawns = positions(runner, ".spawn(");
  assert.equal(spawns.length, 1, `expected exactly one .spawn(, found ${spawns.length}`);
  assert.match(runner, /maximum_paid_gpu_jobs:\s*1/);
  assert.match(runner, /AVANTIQO_VIDEO_MODAL_SPAWN_COUNT=1/);
  assert.match(runner, /gpu_generation_calls\s*===\s*1/);
});

test("durable no-upsert paid-proof lock is claimed before spawn", () => {
  const lockUpload = runner.indexOf("storage.upload(lockPath");
  const spawn = runner.indexOf(".spawn(");
  assert.ok(lockUpload >= 0, "paid-proof lock upload missing");
  assert.ok(spawn > lockUpload, "spawn must happen after paid-proof lock claim");
  const lockBlock = runner.slice(lockUpload, spawn);
  assert.match(lockBlock, /upsert:\s*false/);
  assert.match(runner, /PAID_PROOF_LOCK_EXISTS_OR_FAILED/);
});

test("polling resumes only the exact spawned FunctionCall", () => {
  assert.match(runner, /const functionCallId = text\(call\.functionCallId\)/);
  assert.match(runner, /client\.functionCalls\.fromId\(functionCallId\)/);
  assert.match(runner, /sameCall\.get\(\{ timeoutMs: 0 \}\)/);
  const spawn = runner.indexOf(".spawn(");
  const polling = runner.indexOf("client.functionCalls.fromId(functionCallId)");
  assert.ok(polling > spawn, "polling must begin after the sole spawn");
  assert.equal(positions(runner.slice(spawn + 7), ".spawn(").length, 0, "no spawn is allowed after the first submission");
});

test("paid proof requires both first and last frame controls", () => {
  assert.match(runner, /capability:\s*"ai\.video\.first_last_frame_to_video"/);
  assert.match(runner, /conditions\.length === 2/);
  assert.match(runner, /OPENING_FRAME/);
  assert.match(runner, /CLOSING_FRAME/);
  assert.match(runner, /first_frame_conditioning_used === true/);
  assert.match(runner, /last_frame_conditioning_used === true/);
});

test("paid proof rejects transformed or retried native output", () => {
  for (const flag of [
    "pixel_upscale_used",
    "learned_latent_upsampler_used",
    "learned_spatial_upscaler_used",
    "temporal_interpolation_used",
    "resize_used",
    "crop_used",
    "grading_used",
    "assembly_used",
    "delivery_transform_used",
    "automatic_paid_retry",
    "runpod_inference_performed",
    "external_provider_contacted",
  ]) {
    assert.ok(runner.includes(`"${flag}"`), `missing provenance guard ${flag}`);
  }
  assert.match(runner, /master_is_exact_model_output === true/);
  assert.match(runner, /native_master_generated === true/);
});

test("live zero-GPU preflight checks all named deployed Video execution surfaces", () => {
  assert.match(preflight, /modal\.Function\.from_name\(DEPLOYED_APP, name\)/);
  assert.match(preflight, /current = fn\.get_current_stats\(\)/);
  assert.match(preflight, /"stats_source": "named_deployed_app"/);
  assert.match(preflight, /"transport": _stats\("generate_native_job"\)/);
  assert.match(preflight, /"controlled_master": _stats\("generate_native_controlled_master"\)/);
  assert.match(preflight, /"legacy_master": _stats\("generate_native_master"\)/);
  assert.match(preflight, /VIDEO_ALREADY_ACTIVE/);
  assert.match(preflight, /"maximum_paid_gpu_jobs": 1/);
  assert.match(preflight, /"automatic_paid_retry": False/);
  assert.match(preflight, /"gpu_requested": False/);
  assert.match(preflight, /AVANTIQO_VIDEO_NAMED_DEPLOYED_IDLE_GATE=PASS/);
});

test("same master must pass technical temporal and native audio checks without another generation", () => {
  assert.match(runner, /temporalEvidence\(outputFile, true\)/);
  assert.match(runner, /NATIVE_AUDIO_STREAM_REQUIRED/);
  assert.match(runner, /AUDIO_VIDEO_TIMING_FAILED/);
  assert.match(runner, /CREATIVE_VIDEO_TEMPORAL_EVIDENCE_V1/);
  assert.equal(positions(runner, ".spawn(").length, 1);
});
