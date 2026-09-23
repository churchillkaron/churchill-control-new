import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
const queue = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceLocalQueueRuntime.js", "utf8");
const modal = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceModalDirectRuntime.js", "utf8");

test("canonical Fast Intelligence is local queue first with scale-to-zero approved overflow", () => {
  assert.match(queue, /supabase-pull-queue-v1/);
  assert.match(queue, /local-intelligence:/);
  assert.match(modal, /claimIntelligenceModalOverflowExecution/);
  assert.match(modal, /automatic_fallback_allowed: false/);
  assert.match(modal, /const LANES = new Set\(\["fast", "deep"\]\)/);
  assert.match(modal, /worker\.spawn\(\[payload\]\)/);
  assert.doesNotMatch(modal, /RunPod|runpod/);
});
