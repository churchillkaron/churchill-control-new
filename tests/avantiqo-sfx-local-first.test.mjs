import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const provider = await readFile(new URL("../lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoAudioProvider.js", import.meta.url), "utf8");
const local = await readFile(new URL("../lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoSfxLocalQueueProvider.js", import.meta.url), "utf8");
const worker = await readFile(new URL("../scripts/local-node/avantiqo-node01-worker.ps1", import.meta.url), "utf8");
const runner = await readFile(new URL("../scripts/local-node/avantiqo-node01-sfx-runner.py", import.meta.url), "utf8");
test("SFX is local CPU first with Modal fallback", () => {
  assert.match(provider, /AvantiqoSfxLocalQueueProvider\.available/);
  assert.match(provider, /AVANTIQO_SFX_LOCAL_FALLBACK_MODAL/);
  assert.match(local, /lane: "cpu"/);
  assert.match(local, /workload: "sfx_generate"/);
  assert.match(worker, /'ai\.sfx\.generate'/);
  assert.match(worker, /RunSfxJob/);
  assert.match(runner, /127\.0\.0\.1:8091/);
  assert.match(runner, /OPENMOSS_GGML_CPU_V1/);
});
