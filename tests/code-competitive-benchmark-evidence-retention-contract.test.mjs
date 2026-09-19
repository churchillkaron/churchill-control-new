import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const runtime = fs.readFileSync(
  new URL("../lib/code/runtime/CodeAICompetitiveBenchmarkEvidenceRuntime.js", import.meta.url),
  "utf8",
);

test("competitive benchmark evidence keeps bounded recent history", () => {
  assert.match(runtime, /const MAX_EVIDENCE_HISTORY = 24/);
  assert.match(runtime, /trimCompetitiveBenchmarkEvidenceHistory/);
  assert.match(runtime, /\.eq\("organization_id", organizationId\)/);
  assert.match(runtime, /\.eq\("memory_scope", MEMORY_SCOPE\)/);
  assert.match(runtime, /\.eq\("source", MEMORY_SOURCE\)/);
  assert.match(runtime, /\.order\("updated_at", \{ ascending: false \}\)/);
  assert.match(runtime, /\.range\(MAX_EVIDENCE_HISTORY, MAX_EVIDENCE_HISTORY \+ 99\)/);
  assert.match(runtime, /\.delete\(\)/);
});
