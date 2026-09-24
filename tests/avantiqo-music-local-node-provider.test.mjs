import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const audio = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoAudioProvider.js", "utf8");
const generation = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoMusicGenerationLocalQueueProvider.js", "utf8");
const worker = fs.readFileSync("scripts/local-node/avantiqo-node01-worker.ps1", "utf8");
const runner = fs.readFileSync("services/avantiqo-music-local/ace_step_cpu_runner.py", "utf8");

test("Music generation queues on owned Node01 CPU with private output", () => {
  assert.match(audio, /AvantiqoMusicGenerationLocalQueueProvider/);
  assert.match(generation, /CAPABILITY = "ai\.music\.generate"/);
  assert.match(generation, /ACE-Step\/Ace-Step1\.5/);
  assert.match(generation, /lane:"cpu"/);
  assert.match(generation, /workload:"music_generation"/);
  assert.match(generation, /priority:42/);
  assert.match(generation, /AVANTIQO_LOCAL_NODE_V1/);
  assert.doesNotMatch(audio, /Modal|RunPod/);
});

test("tracked Node01 worker routes Music generation to the heavy CPU lane", () => {
  assert.match(worker, /ai\.music\.generate/);
  assert.match(worker, /music_generation/);
  assert.match(worker, /CPU_FLOAT32/);
  assert.match(worker, /RunMusicGenerationJob/);
});

test("tracked ACE-Step runner is CPU float32 local generation", () => {
  assert.match(runner, /device="cpu"/);
  assert.match(runner, /ACE_STEP_1_5_CPU_FLOAT32_LOCAL_V1/);
  assert.match(runner, /LOCAL_CPU_FLOAT32/);
  assert.match(runner, /supplier_cost_thb/);
});
