import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const runtime = readFileSync(
  "lib/operator/runtime/IntelligenceExplicitMemoryRuntime.js",
  "utf8",
);

test("explicit memory suppresses exact active duplicate writes", () => {
  assert.match(runtime, /\.in\("memory_key", candidateKeys\)/);
  assert.match(runtime, /reusedRows[\s\S]*row\?\.active === true/);
  assert.match(runtime, /rowsToWrite[\s\S]*active !== true/);
  assert.match(runtime, /if \(rowsToWrite\.length\)/);
  assert.match(runtime, /learned: writtenRows\.length/);
});

test("constraint revision lookup is filtered in Postgres", () => {
  assert.match(runtime, /metadata->>learned_from/);
  assert.match(runtime, /metadata->>revision_basis/);
  assert.doesNotMatch(
    runtime,
    /return \(Array\.isArray\(result\.data\)[\s\S]*\.filter\(\(row\) =>/,
  );
});
