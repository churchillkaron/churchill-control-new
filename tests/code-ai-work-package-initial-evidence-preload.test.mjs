import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../lib/code/runtime/CodeAIWorkPackageRuntimeLive.js", import.meta.url), "utf8");

test("declared source evidence is deterministically loaded before first planner call", () => {
  assert.match(source, /const declaredEvidencePaths = \[/);
  assert.match(source, /normalizedContext\.evidence_path_1/);
  assert.match(source, /action: "read"/);
  assert.match(source, /Load declared source evidence \${filePath} before the first reasoning call/);
  assert.match(source, /operations: initialOperations/);
});
