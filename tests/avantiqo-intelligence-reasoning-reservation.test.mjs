import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../lib/intelligence/runtime/AvantiqoIntelligenceReasoningRuntime.js", import.meta.url),
  "utf8",
);

test("owned intelligence reserves the requested token envelope", () => {
  assert.match(source, /function reasoningReservationEstimate/);
  assert.match(source, /Math\.ceil\(characters \/ 3\) \+ 512/);
  assert.match(source, /estimated_output_tokens: Math\.max\(1, Math\.floor\(Number\(max_output_tokens\)/);
  assert.match(source, /cost_guard: \{/);
  assert.match(source, /\.\.\.reservationEstimate/);
  assert.match(source, /SERVICE_EXECUTION_COST_GUARD_V1/);
});