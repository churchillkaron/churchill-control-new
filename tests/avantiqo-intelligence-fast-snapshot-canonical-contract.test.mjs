import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const worker = await readFile(new URL("../services/avantiqo-intelligence-modal/modal_app.py", import.meta.url), "utf8");
const direct = await readFile(new URL("../lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceModalDirectRuntime.js", import.meta.url), "utf8");
const provider = await readFile(new URL("../lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProvider.js", import.meta.url), "utf8");

test("canonical Fast Intelligence uses reliable warm-function scale-to-zero transport", () => {
  assert.match(worker, /def fast\(data: dict\[str, Any\]\)/);
  assert.doesNotMatch(worker, /enable_memory_snapshot=True/);
  assert.doesNotMatch(worker, /enable_gpu_snapshot/);
  assert.match(worker, /gpu_memory_snapshot_enabled.*False/);
  assert.match(worker, /distributed_snapshot_state_restored.*False/);
  assert.match(worker, /FAST_SCALEDOWN_WINDOW_SECONDS = 10/);
  assert.match(direct, /client\.functions\.fromName/);
  assert.match(direct, /FAST_FUNCTION_NAME/);
  assert.match(direct, /FAST_RUNTIME_CONTRACT/);
  assert.doesNotMatch(direct, /FAST_SNAPSHOT_CONTRACT/);
  assert.match(provider, /function_name: "fast"/);
  assert.match(provider, /gpu_memory_snapshot: false/);
  assert.match(provider, /scaledown_window_seconds: 10/);
});
