import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const memoryRuntime = fs.readFileSync(new URL("../lib/operator/runtime/IntelligenceMemoryRuntime.js", import.meta.url), "utf8");
const observabilityRuntime = fs.readFileSync(new URL("../lib/operator/runtime/IntelligenceMemoryObservabilityRuntime.js", import.meta.url), "utf8");

test("consolidation preserves cold archival while narrowing normal-case scans", () => {
  assert.match(memoryRuntime, /underPressure = activeCount > activeWorkingSetTarget/);
  assert.match(memoryRuntime, /if \(!underPressure\)/);
  assert.match(memoryRuntime, /\.lt\("importance", 0\.6\)/);
  assert.match(memoryRuntime, /\.lte\("recall_count", 1\)/);
  assert.match(memoryRuntime, /\.lte\("updated_at", coldCutoff\)/);
  assert.doesNotMatch(memoryRuntime, /pressure_scan_skipped: true/);
  assert.match(memoryRuntime, /durability:metadata->>durability/);
});

test("memory observability uses bounded lightweight samples", () => {
  assert.match(observabilityRuntime, /OBSERVABILITY_SAMPLE_LIMIT = 500/);
  assert.match(observabilityRuntime, /OBSERVABILITY_METADATA_SAMPLE_LIMIT = 100/);
  assert.match(observabilityRuntime, /select\("memory_type,importance,recall_count,updated_at,created_at"\)/);
  assert.match(observabilityRuntime, /select\("metadata"\)/);
  assert.doesNotMatch(observabilityRuntime, /limit\(5000\)/);
});
