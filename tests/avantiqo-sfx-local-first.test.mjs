import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const provider = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoAudioProvider.js", "utf8");
const local = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoSfxLocalQueueProvider.js", "utf8");
const worker = fs.readFileSync("scripts/local-node/avantiqo-node01-worker.ps1", "utf8");
const runner = fs.readFileSync("scripts/local-node/avantiqo-node01-sfx-runner.py", "utf8");

test("SFX uses the owned local CPU lane for all production work", () => {
  assert.match(provider, /capability === "ai\.sfx\.generate"/);
  assert.match(provider, /AvantiqoSfxLocalQueueProvider/);
  assert.doesNotMatch(provider, /Modal|RunPod/);
  assert.match(local, /lane: "cpu"/);
  assert.match(local, /workload: "sfx_generate"/);
  assert.match(worker, /'ai\.sfx\.generate'/);
  assert.match(worker, /RunSfxJob/);
  assert.match(runner, /127\.0\.0\.1:8091/);
  assert.match(runner, /OPENMOSS_GGML_CPU_V1/);
});
