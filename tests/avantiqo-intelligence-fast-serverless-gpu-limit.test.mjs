import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const capacity = await readFile(
  "scripts/repair-avantiqo-intelligence-fast-volume-local-capacity-local.mjs",
  "utf8",
);

const priority = await readFile(
  "scripts/repair-avantiqo-intelligence-fast-gpu-priority-order-local.mjs",
  "utf8",
);

test("Fast Intelligence obeys RunPod Serverless three-GPU limit", () => {
  assert.match(capacity, /const MAX_GPU_FALLBACKS = 3;/);
  assert.doesNotMatch(capacity, /const MAX_GPU_FALLBACKS = 4;/);

  assert.match(
    priority,
    /TARGET_POOL_EXCEEDS_RUNPOD_SERVERLESS_LIMIT/,
  );

  assert.match(
    priority,
    /targetPool\.length > 3/,
  );
});
