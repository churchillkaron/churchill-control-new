import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const canary = fs.readFileSync("services/avantiqo-intelligence-modal/modal_fast_snapshot_canary.py", "utf8");
const probe = fs.readFileSync("scripts/probe-avantiqo-intelligence-fast-snapshot.py", "utf8");

test("Fast snapshot canary reuses canonical Fast model and output runtime", () => {
  assert.match(canary, /base\.fast_image/);
  assert.match(canary, /base\._run\(data, model=base\.FAST_MODEL, lane="fast"\)/);
  assert.match(canary, /base\._LLM_CACHE\[base\.FAST_MODEL\] = engine/);
});

test("Fast snapshot canary scales to zero quickly with GPU snapshots", () => {
  assert.match(canary, /min_containers=0/);
  assert.match(canary, /scaledown_window=10/);
  assert.match(canary, /enable_memory_snapshot=True/);
  assert.match(canary, /enable_gpu_snapshot/);
  assert.match(canary, /engine\.sleep\(level=1\)/);
  assert.match(canary, /engine\.wake_up\(\)/);
});

test("Fast snapshot proof requires restored interactive latency without changing production routing", () => {
  assert.match(probe, /restored_under_10s/);
  assert.match(probe, /restored_under_5s/);
  assert.match(probe, /production_routing_changed/);
});
