import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const runtime = fs.readFileSync(
  new URL("../lib/operator/runtime/IntelligenceMemoryRuntime.js", import.meta.url),
  "utf8",
);

test("project-state memory reuses exact active rows instead of refreshing them", () => {
  assert.match(runtime, /candidateKeys = \[\.\.\.new Set\(rows\.map/);
  assert.match(runtime, /candidateScopes = \[\.\.\.new Set\(rows\.map/);
  assert.match(runtime, /select\("id,memory_scope,memory_key,memory_type,subject,active"\)/);
  assert.match(runtime, /existingByKey = new Map/);
  assert.match(runtime, /row\?\.active === true/);
  assert.match(runtime, /rowsToWrite = rows\.filter/);
  assert.match(runtime, /upsert\(rowsToWrite/);
  assert.doesNotMatch(runtime, /upsert\(rows, \{ onConflict: "organization_id,memory_scope,memory_key" \}\)/);
});

test("project-state supersession can use reused replacement ids", () => {
  assert.match(runtime, /const effectiveRows = \[\.\.\.reusedRows, \.\.\.writtenRows\]/);
  assert.match(runtime, /const newGoal = effectiveRows\.find/);
  assert.match(runtime, /const replacementMemory = effectiveRows\.find/);
  assert.match(runtime, /return \{ learned: writtenRows\.length \}/);
});
