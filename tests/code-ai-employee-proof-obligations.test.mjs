import test from "node:test";
import assert from "node:assert/strict";

import {
  assessCodeAIEmployeeCompletion,
} from "../lib/code/runtime/CodeAIEmployeeRuntime.js";

function operation(operation_id, action, result = {}, description = "") {
  return {
    kind: "operation",
    operation_id,
    action,
    description,
    status: "completed",
    result,
  };
}

function sourceChange(path) {
  return {
    path,
    operation: "write",
    content: "export default true;\n",
  };
}

function completedState({
  files_changed,
  source_changes,
  evidence,
  tests,
  verification,
  patch = "diff --git a/example b/example",
}) {
  return {
    status: "completed",
    files_changed,
    source_changes,
    tests,
    verification,
    patch,
    evidence,
  };
}

test("employee completion rejects an unrelated test when repository evidence identified an impacted test", () => {
  const state = completedState({
    files_changed: ["lib/auth/AccessPolicy.js"],
    source_changes: [sourceChange("lib/auth/AccessPolicy.js")],
    tests: [{
      operation_id: "verify_unrelated",
      command: "node",
      args: ["--test", "tests/finance/invoice.test.mjs"],
      exit_code: 0,
    }],
    verification: [{ operation_id: "verify_unrelated", passed: true }],
    evidence: [
      operation("apply_1", "apply_files"),
      operation("search_1", "search", {
        query: "AccessPolicy",
        matches: [
          "lib/auth/AccessPolicy.js:1:export default true",
          "tests/auth/access-policy.test.mjs:4:import AccessPolicy from '../../lib/auth/AccessPolicy.js'",
        ],
      }),
      operation("verify_unrelated", "verify", { exit_code: 0 }),
      operation("diff_1", "diff", { patch: "diff" }),
    ],
  });

  const completion = assessCodeAIEmployeeCompletion(state);
  assert.equal(completion.behavioral_verification.required, true);
  assert.equal(completion.behavioral_verification.verified, false);
  assert.equal(completion.complete, false);
  assert.ok(completion.blockers.includes("CODE_AI_EMPLOYEE_BEHAVIORAL_VERIFICATION_REQUIRED"));
});

test("employee completion rejects changed-test-only proof for high-risk source changes", () => {
  const state = completedState({
    files_changed: [
      "lib/platform/AccessPolicy.js",
      "tests/platform/access-policy.test.mjs",
    ],
    source_changes: [
      sourceChange("lib/platform/AccessPolicy.js"),
      sourceChange("tests/platform/access-policy.test.mjs"),
    ],
    tests: [
      {
        operation_id: "verify_related",
        command: "node",
        args: ["--test", "tests/platform/access-policy.test.mjs"],
        exit_code: 0,
      },
      {
        operation_id: "verify_typecheck",
        command: "npx",
        args: ["tsc", "--noEmit"],
        exit_code: 0,
      },
    ],
    verification: [
      { operation_id: "verify_related", passed: true },
      { operation_id: "verify_typecheck", passed: true },
    ],
    evidence: [
      operation("apply_1", "apply_files"),
      operation("search_1", "search", {
        query: "AccessPolicy",
        matches: [
          "lib/platform/AccessPolicy.js:1:export default true",
          "tests/platform/access-policy.test.mjs:4:import AccessPolicy from '../../lib/platform/AccessPolicy.js'",
        ],
      }),
      operation("verify_related", "verify", { exit_code: 0 }),
      operation("verify_typecheck", "verify", { exit_code: 0 }),
      operation("diff_1", "diff", { patch: "diff" }),
    ],
  });

  const completion = assessCodeAIEmployeeCompletion(state);
  assert.equal(completion.worldclass_quality.risk, "high");
  assert.equal(completion.worldclass_quality.verified, true);
  assert.equal(completion.behavioral_verification.verified, true);
  assert.equal(completion.test_provenance.required, true);
  assert.equal(completion.test_provenance.verified, false);
  assert.equal(completion.complete, false);
  assert.ok(completion.blockers.includes("CODE_AI_EMPLOYEE_TEST_PROVENANCE_REQUIRED"));
});

test("employee completion rejects an unresolved failed verifier even when another verifier passes", () => {
  const state = completedState({
    files_changed: ["lib/example.js"],
    source_changes: [sourceChange("lib/example.js")],
    tests: [
      {
        operation_id: "verify_failed",
        command: "node",
        args: ["--test", "tests/example.test.mjs"],
        exit_code: 1,
      },
      {
        operation_id: "verify_other",
        command: "node",
        args: ["--test", "tests/other.test.mjs"],
        exit_code: 0,
      },
    ],
    verification: [
      { operation_id: "verify_failed", passed: false },
      { operation_id: "verify_other", passed: true },
    ],
    evidence: [
      operation("apply_1", "apply_files"),
      operation("verify_failed", "verify", { exit_code: 1 }),
      operation("verify_other", "verify", { exit_code: 0 }),
      operation("diff_1", "diff", { patch: "diff" }),
    ],
  });

  const completion = assessCodeAIEmployeeCompletion(state);
  assert.equal(completion.worldclass_quality.verified, true);
  assert.equal(completion.repair_closure.required, true);
  assert.equal(completion.repair_closure.verified, false);
  assert.equal(completion.repair_closure.unresolved_failed_verifier_count, 1);
  assert.equal(completion.complete, false);
  assert.ok(completion.blockers.includes("CODE_AI_EMPLOYEE_FAILED_VERIFIER_CLOSURE_REQUIRED"));
});

test("explicit read-only employee mission completes from repository evidence without requiring mutation", () => {
  const state = completedState({
    files_changed: [],
    source_changes: [],
    tests: [],
    verification: [],
    patch: "",
    evidence: [
      operation("search_1", "search", { matches: ["app/api/operator/code/mission/route.js:1"] }),
      operation("read_1", "read", { file_path: "app/api/operator/code/mission/route.js" }),
    ],
  });
  state.employee_mission = {
    owner_intent: "Read-only inspection only. Do not modify files. Finish from exact source evidence.",
  };

  const completion = assessCodeAIEmployeeCompletion(state);
  assert.equal(completion.read_only_mission, true);
  assert.equal(completion.read_only_evidence_verified, true);
  assert.equal(completion.changed, false);
  assert.equal(completion.verified, true);
  assert.equal(completion.complete, true);
  assert.deepEqual(completion.blockers, []);
});

test("repair employee mission cannot self-complete as read-only because a protected test file must not change", () => {
  const state = completedState({
    files_changed: [],
    source_changes: [],
    tests: [],
    verification: [],
    patch: "",
    evidence: [
      operation("inspect_1", "inspect", { head_sha: "abc" }),
    ],
  });
  state.employee_mission = {
    owner_intent: "Fix the broken add behavior. Do not modify the existing test file. Verify the repair.",
  };

  const completion = assessCodeAIEmployeeCompletion(state);
  assert.equal(completion.read_only_mission, false);
  assert.equal(completion.changed, false);
  assert.equal(completion.complete, false);
  assert.ok(completion.blockers.includes("CODE_AI_EMPLOYEE_IMPLEMENTATION_REQUIRED"));
});
