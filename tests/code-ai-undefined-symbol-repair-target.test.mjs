import test from "node:test";
import assert from "node:assert/strict";
import { resolveCodeAIUndefinedSymbolRepairTarget } from "../lib/code/runtime/CodeAIWorkPackageRuntimeLive.js";

test("targets changed file named by ReferenceError stack evidence", () => {
  const state = {
    files_changed: [
      "lib/code/runtime/CodeAIAutonomyActionIdentity.js",
      "tests/code-ai-autonomy-action-identity-equivalence.test.mjs",
    ],
    tests: [{
      operation_id: "verify_1",
      command: "node",
      args: ["tests/code-ai-autonomy-action-identity-equivalence.test.mjs"],
      exit_code: 1,
      stderr: "ReferenceError: CodeAIAutonomyActionIdentity is not defined\n    at file:///tmp/work/tests/code-ai-autonomy-action-identity-equivalence.test.mjs:8:5",
    }],
    failures: [{ operation_id: "verify_1", message: "verification failed" }],
  };
  const result = resolveCodeAIUndefinedSymbolRepairTarget(state, state.files_changed);
  assert.equal(result?.symbol, "CodeAIAutonomyActionIdentity");
  assert.equal(result?.target_path, "tests/code-ai-autonomy-action-identity-equivalence.test.mjs");
});

test("does not guess a target when stack evidence does not name an allowed file", () => {
  const state = {
    tests: [{ operation_id: "verify_1", command: "node", args: [], exit_code: 1, stderr: "ReferenceError: MissingThing is not defined\n at file:///tmp/work/other.js:1:1" }],
  };
  assert.equal(resolveCodeAIUndefinedSymbolRepairTarget(state, ["tests/expected.test.mjs"]), null);
});
