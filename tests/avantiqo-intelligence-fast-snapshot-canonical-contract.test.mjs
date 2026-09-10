import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const worker = await readFile(new URL("../services/avantiqo-intelligence-modal/modal_app.py", import.meta.url), "utf8");
const direct = await readFile(new URL("../lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceModalDirectRuntime.js", import.meta.url), "utf8");
const provider = await readFile(new URL("../lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProvider.js", import.meta.url), "utf8");

test("canonical Fast Intelligence uses GPU snapshot scale-to-zero transport", () => {
  assert.match(worker, /class FastSnapshotWorker/);
  assert.match(worker, /enable_memory_snapshot=True/);
  assert.match(worker, /enable_gpu_snapshot/);
  assert.match(worker, /FAST_SCALEDOWN_WINDOW_SECONDS = 10/);
  assert.doesNotMatch(worker, /def fast\(/);
  assert.match(direct, /client\.cls\.fromName\(APP_NAME, FAST_CLASS_NAME/);
  assert.match(direct, /FAST_SNAPSHOT_CONTRACT/);
  assert.match(provider, /function_name: "FastSnapshotWorker\.invoke"/);
  assert.match(provider, /scaledown_window_seconds: 10/);
});
