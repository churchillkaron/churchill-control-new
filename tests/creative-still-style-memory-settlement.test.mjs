import test from "node:test";
import assert from "node:assert/strict";
import {
  settleCreativeStillStyleMemory,
} from "../lib/creative/stills/runtime/CreativeStillStyleMemorySettlementRuntime.js";

test("failed release does not attempt style memory persistence", async () => {
  let calls = 0;
  const result = await settleCreativeStillStyleMemory({
    project_id: "project-1",
    release_validation: { passed: false },
    persist: async () => { calls += 1; },
  });
  assert.equal(calls, 0);
  assert.equal(result.attempted, false);
  assert.equal(result.persisted, false);
  assert.equal(result.release_blocked_by_learning_failure, false);
});

test("approved release records successful style memory settlement", async () => {
  const result = await settleCreativeStillStyleMemory({
    project_id: "project-1",
    release_validation: { passed: true },
    persist: async () => ({ memory: { memory_hash: "abc" } }),
  });
  assert.equal(result.attempted, true);
  assert.equal(result.persisted, true);
  assert.equal(result.memory.memory_hash, "abc");
  assert.equal(result.error, null);
});

test("learning persistence failure never blocks approved media release", async () => {
  const result = await settleCreativeStillStyleMemory({
    project_id: "project-1",
    release_validation: { passed: true },
    persist: async () => { throw new Error("database unavailable"); },
  });
  assert.equal(result.attempted, true);
  assert.equal(result.persisted, false);
  assert.equal(result.memory, null);
  assert.equal(result.error, "database unavailable");
  assert.equal(result.release_blocked_by_learning_failure, false);
});
