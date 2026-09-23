import assert from "node:assert/strict";
import test from "node:test";
import {
  localComputeExecutionKey,
} from "../lib/platform/service-runtime/providers/AvantiqoLocalComputeIdempotencyPolicy.js";

const base = { usage_id: "usage-1", capability: "ai.text.generate" };

test("hierarchical stages receive distinct deterministic local-compute execution keys", () => {
  const chunk1 = localComputeExecutionKey({ ...base, input: { hierarchical_stage: "chunk-1" } });
  const chunk2 = localComputeExecutionKey({ ...base, input: { hierarchical_stage: "chunk-2" } });
  const merge = localComputeExecutionKey({ ...base, input: { hierarchical_stage: "merge-1-1" } });
  const final = localComputeExecutionKey({ ...base, input: { hierarchical_stage: "final" } });
  assert.notEqual(chunk1, chunk2);
  assert.notEqual(chunk1, merge);
  assert.notEqual(merge, final);
  assert.match(chunk1, /hierarchical:chunk-1$/);
  assert.match(final, /hierarchical:final$/);
});

test("exact hierarchical stage retry remains idempotent", () => {
  const one = localComputeExecutionKey({ ...base, input: { hierarchical_stage: "chunk-3" } });
  const two = localComputeExecutionKey({ ...base, input: { hierarchical_stage: "chunk-3" } });
  assert.equal(one, two);
});

test("ordinary non-hierarchical jobs retain the original parent execution key", () => {
  assert.equal(
    localComputeExecutionKey({ ...base, input: {} }),
    "local-compute:usage-1:ai.text.generate",
  );
});
