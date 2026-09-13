import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const runtime = fs.readFileSync(
  new URL("../lib/operator/runtime/IntelligenceAdaptiveLearningRuntime.js", import.meta.url),
  "utf8",
);

test("recovery lessons reuse equal-or-stronger active evidence", () => {
  assert.match(runtime, /select\("id,memory_type,subject,content,memory_scope,metadata,active"\)/);
  assert.match(runtime, /existingCount >= nextCount/);
  assert.match(runtime, /if \(existing\.data\?\.active === true && existingCount >= nextCount\)/);
});

test("training candidates skip duplicate recovery evidence but can strengthen", () => {
  assert.match(runtime, /EXISTING_RECOVERY_EVIDENCE_EQUAL_OR_STRONGER/);
  assert.match(runtime, /select\("id,memory_key,subject,metadata,active"\)/);
  assert.match(runtime, /\.eq\("memory_scope", TRAINING_SCOPE\)/);
  assert.match(runtime, /\.upsert\(row, \{ onConflict: "organization_id,memory_scope,memory_key" \}\)/);
});
