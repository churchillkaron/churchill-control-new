import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const route = fs.readFileSync("app/api/operator/turn/route.js", "utf8");
const memory = fs.readFileSync(
  "lib/operator/runtime/IntelligenceMemoryRuntime.js",
  "utf8",
);

test("operator emits internal bounded Intelligence cost telemetry", () => {
  assert.match(route, /OPERATOR_INTELLIGENCE_COST_V1/);
  assert.match(route, /recall_candidate_rows/);
  assert.match(route, /recall_metadata_rows_hydrated/);
  assert.match(route, /recall_telemetry_writes/);
  assert.match(route, /context_estimated_input_tokens/);
  assert.match(route, /context_estimated_bytes/);
  assert.match(route, /project_state_memory_reused/);
});

test("recall telemetry is collected without extra telemetry queries", () => {
  assert.match(memory, /telemetry = null/);
  assert.match(memory, /telemetry\.recall_candidate_rows/);
  assert.match(memory, /telemetry\.recall_metadata_rows_hydrated/);
  assert.match(memory, /telemetry\.recall_telemetry_writes/);
  assert.doesNotMatch(memory, /from\(["']intelligence_memory_telemetry["']\)/);
});
