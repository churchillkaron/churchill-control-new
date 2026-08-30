import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const resilient = await readFile(
  "scripts/run-avantiqo-runpod-safe-lease-v2-resilient-local.mjs",
  "utf8",
);

const base = await readFile(
  "scripts/run-avantiqo-runpod-safe-lease-v2-local.mjs",
  "utf8",
);

const correct =
  /"intelligence-fast": \["RUNPOD_AVANTIQO_INTELLIGENCE_FAST_API_KEY"\]/;

const wrong =
  /"intelligence-fast": \["RUNPOD_AVANTIQO_INTELLIGENCE_API_KEY"\]/;

test("Fast Safe Lease uses the dedicated Fast queue credential everywhere", () => {
  assert.match(resilient, correct);
  assert.match(base, correct);
  assert.doesNotMatch(resilient, wrong);
});
