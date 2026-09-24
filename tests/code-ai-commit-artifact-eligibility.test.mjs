import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { isCodeAICommitArtifactEligible } from "../lib/code/runtime/CodeAICommitArtifactRuntime.js";

const capability = fs.readFileSync(
  new URL("../lib/platform/capabilities/createCodeAIAutonomousCapability.js", import.meta.url),
  "utf8",
);

function completeState(overrides = {}) {
  return {
    status: "completed",
    source_changes: [{ path: "lib/a.js", operation: "write", content: "export const a=1;" }],
    patch: "diff --git a/lib/a.js b/lib/a.js",
    verification: [{ passed: true }],
    employee_completion: { complete: true, verified: true, final_diff_observed: true },
    ...overrides,
  };
}

test("commit artifact eligibility requires verified completed implementation", () => {
  assert.equal(isCodeAICommitArtifactEligible(completeState()), true);
  assert.equal(isCodeAICommitArtifactEligible(completeState({ status: "planner_pending" })), false);
  assert.equal(isCodeAICommitArtifactEligible(completeState({ source_changes: [] })), false);
  assert.equal(isCodeAICommitArtifactEligible(completeState({ verification: [] })), false);
  assert.equal(
    isCodeAICommitArtifactEligible(completeState({
      verification: [{ passed: true }, { passed: false }],
    })),
    false,
  );
  assert.equal(
    isCodeAICommitArtifactEligible(completeState({
      blockers: ["CODE_AI_DEVICE_JOB_TIMEOUT_IN_FLIGHT_UNCERTAIN"],
    })),
    false,
  );
  assert.equal(
    isCodeAICommitArtifactEligible(completeState({
      current_operation_id: "verify_latest",
    })),
    false,
  );
});

test("autonomous capability persists checkpoints without polluting commit artifacts", () => {
  assert.match(capability, /persistCodeAIAutonomousExecutionState/);
  assert.match(capability, /const commitEligible = isCodeAICommitArtifactEligible\(result\.state\)/);
  assert.match(capability, /commit_artifact_eligible: commitEligible/);
  assert.match(capability, /commit_artifact_persisted: commitArtifact\?\.persisted === true/);
});

test("range-only source mutations are not persisted as commit artifacts until GitHub reconstruction exists", () => {
  assert.equal(
    isCodeAICommitArtifactEligible(completeState({
      range_source_changes: [{
        path: "lib/large.js",
        operation: "range",
        start_line: 10,
        end_line: 12,
        expected: "old",
        replacement: "new",
      }],
    })),
    false,
  );
});
