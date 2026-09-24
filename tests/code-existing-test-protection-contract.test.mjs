import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const live = await readFile(new URL("../lib/code/runtime/CodeAIWorkPackageRuntimeLive.js", import.meta.url), "utf8");
const core = await readFile(new URL("../lib/code/runtime/CodeAIWorkPackageCoreRuntime.js", import.meta.url), "utf8");

test("repair objectives deterministically require implementation", () => {
  assert.match(core, /function objectiveRequiresImplementation/);
  assert.match(core, /fix\|repair\|implement\|change\|edit\|refactor\|update\|modify\|add\|remove\|replace\|create\|build/);
  assert.match(core, /explicitlyReadOnly/);
  assert.match(core, /objectiveRequiresImplementation\(normalizedContext\)/);
});

test("existing tests are protected verification evidence unless owner explicitly requests test edits", () => {
  assert.match(live, /const protectExistingTests = explicitExistingTestEvidence && !explicitTestMutationRequest/);
  assert.match(live, /CODE_AI_WORK_PACKAGE_EXISTING_TEST_MUTATION_FORBIDDEN/);
  assert.match(live, /protected_test_mutation/);
  assert.match(live, /Leave that existing test file unchanged\. Repair the source implementation instead/);
  assert.match(live, /Existing tests are verification evidence, not a shortcut edit target/);
});
