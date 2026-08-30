import test from "node:test";
import assert from "node:assert/strict";

import {
  assessCodeAIRepairClosure,
} from "../lib/code/runtime/CodeAIRepairClosureRuntime.js";
import {
  assertCodeAIWorldClassCommitReady,
} from "../lib/code/runtime/CodeAIWorldClassCommitGuard.js";

function operation(operation_id, action) {
  return {
    kind: "operation",
    operation_id,
    action,
    status: "completed",
  };
}

function quality() {
  return {
    contract: "AVANTIQO_CODE_AI_WORLDCLASS_QUALITY_V1",
    verified: true,
    blockers: [],
    risk: "standard",
    changed_file_count: 1,
    explicit_final_diff_review: true,
    source_manifest_matches_workspace: true,
    adversarial_diff_review: { verified: true },
    required_verification_gates: 1,
    fresh_verification_gate_count: 1,
    fresh_verification_family_count: 1,
    fresh_verification_families: ["tests"],
    fresh_verification_operations: [{
      operation_id: "verify_after",
      command: "node",
      args: ["--test", "tests/example.test.mjs"],
      family: "tests",
    }],
  };
}

function baseState() {
  return {
    files_changed: ["lib/example.js"],
    source_changes: [{
      path: "lib/example.js",
      operation: "write",
      content: "export default true;\n",
    }],
    evidence: [
      operation("verify_before", "verify"),
      operation("apply_1", "apply_files"),
      operation("verify_after", "verify"),
      operation("diff_1", "diff"),
    ],
    worldclass_quality: quality(),
  };
}

test("a failed verifier before the final edit must be closed by the same verifier", () => {
  const state = baseState();
  state.tests = [
    {
      operation_id: "verify_before",
      command: "node",
      args: ["--test", "tests/example.test.mjs"],
      exit_code: 1,
    },
    {
      operation_id: "verify_after",
      command: "node",
      args: ["--test", "tests/other.test.mjs"],
      exit_code: 0,
    },
  ];

  const closure = assessCodeAIRepairClosure(state);
  assert.equal(closure.required, true);
  assert.equal(closure.verified, false);
  assert.equal(closure.unresolved_failed_verifier_count, 1);

  assert.throws(
    () => assertCodeAIWorldClassCommitReady(state),
    /CODE_AI_COMMIT_FAILED_VERIFIER_CLOSURE_REQUIRED:unresolved=1/,
  );
});

test("the same failed verification signature passing after the final edit closes repair proof", () => {
  const state = baseState();
  state.tests = [
    {
      operation_id: "verify_before",
      command: "node",
      args: ["--test", "tests/example.test.mjs"],
      exit_code: 1,
    },
    {
      operation_id: "verify_after",
      command: "node",
      args: ["--test", "tests/example.test.mjs"],
      exit_code: 0,
    },
  ];

  const closure = assessCodeAIRepairClosure(state);
  assert.equal(closure.required, true);
  assert.equal(closure.verified, true);
  assert.equal(closure.closed_failed_verifier_count, 1);
  assert.equal(closure.unresolved_failed_verifier_count, 0);

  const result = assertCodeAIWorldClassCommitReady(state);
  assert.equal(result.success, true);
  assert.equal(result.repair_closure_required, true);
  assert.equal(result.repair_closure_verified, true);
});

test("a verifier failure after the final edit remains unresolved until the same verifier later passes", () => {
  const state = baseState();
  state.evidence = [
    operation("apply_1", "apply_files"),
    operation("verify_failed", "verify"),
    operation("verify_after", "verify"),
    operation("diff_1", "diff"),
  ];
  state.tests = [
    {
      operation_id: "verify_failed",
      command: "node",
      args: ["--test", "tests/example.test.mjs"],
      exit_code: 1,
    },
    {
      operation_id: "verify_after",
      command: "node",
      args: ["--test", "tests/other.test.mjs"],
      exit_code: 0,
    },
  ];

  const closure = assessCodeAIRepairClosure(state);
  assert.equal(closure.required, true);
  assert.equal(closure.verified, false);
  assert.equal(closure.failed_verifier_count_after_final_edit, 1);
  assert.equal(closure.unresolved_failed_verifier_count, 1);
});

test("a post-edit verifier failure closes only when the same signature passes later", () => {
  const state = baseState();
  state.evidence = [
    operation("apply_1", "apply_files"),
    operation("verify_failed", "verify"),
    operation("verify_after", "verify"),
    operation("diff_1", "diff"),
  ];
  state.tests = [
    {
      operation_id: "verify_failed",
      command: "node",
      args: ["--test", "tests/example.test.mjs"],
      exit_code: 1,
    },
    {
      operation_id: "verify_after",
      command: "node",
      args: ["--test", "tests/example.test.mjs"],
      exit_code: 0,
    },
  ];

  const closure = assessCodeAIRepairClosure(state);
  assert.equal(closure.required, true);
  assert.equal(closure.verified, true);
  assert.equal(closure.failed_verifier_count_after_final_edit, 1);
  assert.equal(closure.closed_failed_verifier_count, 1);
});
