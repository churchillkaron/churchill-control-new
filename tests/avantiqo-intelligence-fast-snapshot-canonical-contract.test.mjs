import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const worker = await readFile(new URL("../services/avantiqo-intelligence-modal/modal_app.py", import.meta.url), "utf8");
const direct = await readFile(new URL("../lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceModalDirectRuntime.js", import.meta.url), "utf8");
const provider = await readFile(new URL("../lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProvider.js", import.meta.url), "utf8");

test("canonical Fast Intelligence uses bounded two-minute warm reuse and always scales to zero after idle", () => {
  assert.match(worker, /def fast\(data: dict\[str, Any\]\)/);
  assert.doesNotMatch(worker, /enable_memory_snapshot=True/);
  assert.doesNotMatch(worker, /enable_gpu_snapshot/);
  assert.match(worker, /gpu_memory_snapshot_enabled.*False/);
  assert.match(worker, /distributed_snapshot_state_restored.*False/);
  assert.match(worker, /FAST_SCALEDOWN_WINDOW_SECONDS = 2 \* 60/);
  assert.match(worker, /@app\.function\([\s\S]*?min_containers=0,[\s\S]*?\)\ndef fast/);
  assert.match(worker, /@app\.function\([\s\S]*?max_containers=1,[\s\S]*?\)\ndef fast/);
  assert.match(direct, /client\.functions\.fromName/);
  assert.match(direct, /FAST_FUNCTION_NAME/);
  assert.match(direct, /FAST_RUNTIME_CONTRACT/);
  assert.match(direct, /DEFAULT_APP_NAME = "avantiqo-intelligence-owned"/);
  assert.match(direct, /NODE_ENV[^\n]+development/);
  assert.match(direct, /AVANTIQO_INTELLIGENCE_MODAL_APP_NAME/);
  assert.doesNotMatch(direct, /FAST_SNAPSHOT_CONTRACT/);
  assert.match(provider, /function_name: "fast"/);
  assert.match(provider, /gpu_memory_snapshot: false/);
  assert.match(provider, /fast_bounded_warm_idle_seconds: 120/);
  assert.match(provider, /deep_scale_to_zero: true/);
  assert.match(provider, /min_containers: 0/);
  assert.match(provider, /scaledown_window_seconds: 120/);
});
