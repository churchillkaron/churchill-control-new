import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../lib/code/runtime/CodeAIWorkPackageRuntimeLive.js", import.meta.url), "utf8");

test("declared source evidence is deterministically loaded before first planner call", () => {
  assert.match(source, /function requiredInitialEvidencePaths/);
  assert.match(source, /normalizedContext\.evidence_path_1/);
  assert.match(source, /const boundedDeclaredEditEvidence =/);
  assert.match(source, /normalizedContext\.implementation_required === true/);
  assert.match(source, /allowed_edit_paths\)\.length <= 4/);
  assert.match(source, /\.\.\.boundedDeclaredEditEvidence/);
  assert.match(source, /action: "read"/);
  assert.match(source, /Load declared source evidence \${filePath} before the first reasoning call/);
  assert.match(source, /operations: initialOperations/);
});

test("strategic inspect resume still loads missing declared edit evidence", () => {
  assert.match(source, /function retainedObservedReadPaths/);
  assert.match(source, /if \(resumeState\?\.base_commit\)/);
  assert.match(source, /const missingEvidencePaths = declaredEvidencePaths\.filter/);
  assert.match(source, /batched_resume_evidence_/);
  assert.match(source, /Load missing declared source evidence \${filePath} before reasoning/);
  assert.match(source, /resume_state: resumeState/);
});
