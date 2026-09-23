import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../lib/code/runtime/CodeAIWorkPackageRuntimeLive.js", import.meta.url), "utf8");

test("declared evidence prevents false completion before implementation", () => {
  assert.match(source, /function completionEligible\(state, objectiveContext = null\)/);
  assert.match(source, /policy\.declared_evidence_paths\.length > 0 && !policy\.all_declared_evidence_loaded/);
  assert.match(source, /policy\.implementation_required && !changed/);
  assert.match(source, /completionEligible\(state, objectiveContext\)/);
});
