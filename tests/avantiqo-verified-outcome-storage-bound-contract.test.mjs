import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const runtime = fs.readFileSync(
  new URL("../lib/intelligence/runtime/AvantiqoVerifiedOutcomeLearningRuntime.js", import.meta.url),
  "utf8",
);

test("verified outcome learning uses bounded rolling storage buckets", () => {
  assert.match(runtime, /function rollingOutcomeBucket/);
  assert.match(runtime, /dayNumber % RETENTION_DAYS/);
  assert.match(runtime, /verified-outcome:\$\{fingerprint\}:slot-\$\{slot\}/);
  assert.match(runtime, /rolling_bucket: true/);
  assert.match(runtime, /retention_days: RETENTION_DAYS/);
  assert.match(runtime, /created_at: nowIso/);
  assert.match(runtime, /\.upsert\(row, \{ onConflict: "organization_id,memory_scope,memory_key"/);
  assert.doesNotMatch(runtime, /randomUUID/);
  assert.doesNotMatch(runtime, /\.insert\(row\)/);
});
