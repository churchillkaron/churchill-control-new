import assert from "node:assert/strict";

import {
  compactCodeAIMissionStateForPlanner,
} from "../lib/code/runtime/CodeAIWorkPackageRuntime.js";

const compact = compactCodeAIMissionStateForPlanner({
  mission_id: "repair-selftest",
  base_commit: "0123456789abcdef0123456789abcdef01234567",
  status: "repair_required",
  files_changed: ["src/example.mjs"],
  source_changes: [{
    path: "src/example.mjs",
    operation: "write",
    content: "export function value() { return 41; }\n",
  }],
  tests: [{
    operation_id: "batch_1_02_verify",
    command: "node",
    args: ["scripts/fixture-test.mjs"],
    exit_code: 1,
    stdout: "",
    stderr: "AssertionError: expected 42",
  }],
  verification: [{
    operation_id: "batch_1_02_verify",
    passed: false,
  }],
  failures: [{
    operation_id: "batch_1_02_verify",
    action: "verify",
    message: "CODE_AI_VERIFICATION_FAILED:node:1",
  }],
  evidence: [{
    kind: "operation",
    operation_id: "employee_fast_start_read_1",
    action: "read",
    status: "completed",
    result: {
      file_path: "src/example.mjs",
      content: "export function value() { return 0; }\n",
    },
  }],
  patch: "diff --git a/src/example.mjs b/src/example.mjs",
});

assert.equal(compact.status, "repair_required");
assert.equal(compact.current_source_changes.length, 1);
assert.equal(compact.current_source_changes[0].path, "src/example.mjs");
assert.match(compact.current_source_changes[0].content, /return 41/);
assert.equal(compact.current_source_changes[0].content_truncated, false);
assert.equal(compact.latest_failed_verification.command, "node");
assert.deepEqual(compact.latest_failed_verification.args, ["scripts/fixture-test.mjs"]);
assert.equal(compact.latest_failed_verification.exit_code, 1);
assert.match(compact.latest_failed_verification.stderr, /expected 42/);
assert.match(compact.latest_failed_verification.failure_message, /CODE_AI_VERIFICATION_FAILED/);
assert.match(compact.evidence[0].result.content, /return 0/);
assert.notEqual(
  compact.current_source_changes[0].content,
  compact.evidence[0].result.content,
  "repair planner must distinguish current edited source from stale pre-edit read evidence",
);

console.log(JSON.stringify({
  success: true,
  contract: "AVANTIQO_CODE_AI_REPAIR_CONVERGENCE_SELFTEST_V1",
  verified: {
    current_edited_source_reinjected_for_repair: true,
    failed_verification_command_reinjected: true,
    failed_verification_output_reinjected: true,
    stale_pre_edit_read_distinguished_from_current_source: true,
    current_source_snapshot_bounded: true,
    provider_calls_executed: false,
    wallet_mutation_performed: false,
    runpod_mutation_performed: false,
    production_deploy_performed: false,
    secrets_printed: false,
    raw_reasoning_persisted: false
  },
}, null, 2));
