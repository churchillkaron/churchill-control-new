import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const runtime = fs.readFileSync(new URL(
  "../lib/intelligence/runtime/AvantiqoContinuousLearningRuntime.js",
  import.meta.url,
), "utf8");

test("continuous learning physically purges only expired run receipts", () => {
  assert.match(runtime, /async function purgeExpiredLearningRuns/);
  assert.match(runtime, /\.eq\("memory_scope", RUN_SCOPE\)/);
  assert.match(runtime, /\.eq\("source", "continuous_learning_runtime"\)/);
  assert.match(runtime, /\.not\("valid_until", "is", null\)/);
  assert.match(runtime, /\.lt\("valid_until", nowIso\)/);
});

test("run retention cleanup preserves exact daily budget accounting", () => {
  const purge = runtime.indexOf("await purgeExpiredLearningRuns(organizationId)");
  const count = runtime.indexOf("const alreadyRun = await runCountToday(organizationId)");
  assert.ok(purge >= 0 && count > purge);
  assert.match(runtime, /memory_key: `run:\$\{randomUUID\(\)\}`/);
  assert.match(runtime, /DEFAULT_DAILY_MAX_RUNS = 8/);
});
