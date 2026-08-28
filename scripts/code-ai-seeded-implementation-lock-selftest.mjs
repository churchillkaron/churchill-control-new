import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  CODE_AI_WORK_PACKAGE_CONTRACT,
  parseCodeAIWorkPackage,
  resolveCodeAIWorkPackageActionPolicy,
} from "../lib/code/runtime/CodeAIWorkPackageRuntime.js";

const CONTRACT = "AVANTIQO_CODE_AI_SEEDED_IMPLEMENTATION_LOCK_SELFTEST_V1";
const runtimePaths = [
  "lib/code/runtime/CodeAIWorkPackageRuntime.js",
  "lib/code/runtime/CodeAIWorkPackageCoreRuntime.js",
  "lib/code/runtime/CodeAIWorkPackageRuntimeLive.js",
  "lib/code/runtime/CodeAIWorkPackagePromptRuntime.js",
];
const runtimeSource = (
  await Promise.all(runtimePaths.map((runtimePath) => readFile(runtimePath, "utf8")))
).join("\n\n");

function completedRead(filePath, content = "export const observed = true;\n") {
  return {
    kind: "operation",
    operation_id: `read:${filePath}`,
    action: "read",
    status: "completed",
    result: {
      file_path: filePath,
      start_line: 1,
      end_line: 100,
      total_lines: 1,
      content,
    },
  };
}

const objectiveContext = {
  evidence_path_1: "tests/fixtures/code-ai-autonomous-multifile/normalize-money.mjs",
  evidence_path_2: "tests/fixtures/code-ai-autonomous-multifile/invoice-summary.mjs",
};

const seededState = {
  mission_id: "local-seeded-lock-selftest",
  base_commit: "local-only",
  status: "running",
  files_changed: [],
  completed_operation_ids: [],
  tests: [],
  failures: [],
  verification: [],
  source_changes: [],
  evidence: [
    completedRead(objectiveContext.evidence_path_1),
    completedRead(objectiveContext.evidence_path_2),
  ],
};

const seededPolicy = resolveCodeAIWorkPackageActionPolicy({
  objective_context: objectiveContext,
  state: seededState,
});

assert.equal(seededPolicy.all_declared_evidence_loaded, true);
assert.equal(seededPolicy.discovery_locked, true);
assert.equal(seededPolicy.repair_state, false);
assert.deepEqual(seededPolicy.allowed_actions, ["apply_files", "verify", "diff"]);
assert.deepEqual(
  new Set(seededPolicy.observed_read_paths),
  new Set([objectiveContext.evidence_path_1, objectiveContext.evidence_path_2]),
);

const partialPolicy = resolveCodeAIWorkPackageActionPolicy({
  objective_context: objectiveContext,
  state: {
    ...seededState,
    evidence: [completedRead(objectiveContext.evidence_path_1)],
  },
});
assert.equal(partialPolicy.all_declared_evidence_loaded, false);
assert.equal(partialPolicy.discovery_locked, false);
assert.equal(partialPolicy.allowed_actions.includes("read"), true);
assert.equal(partialPolicy.allowed_actions.includes("search"), true);

const longSessionEvidence = [
  completedRead(objectiveContext.evidence_path_1),
  completedRead(objectiveContext.evidence_path_2),
  ...Array.from({ length: 40 }, (_, index) => ({
    kind: "operation",
    operation_id: `later:${index + 1}`,
    action: "diff",
    status: "completed",
    result: { status: [], patch_bytes: index + 1 },
  })),
];
const longSessionPolicy = resolveCodeAIWorkPackageActionPolicy({
  objective_context: objectiveContext,
  state: {
    ...seededState,
    evidence: longSessionEvidence,
  },
});
assert.equal(longSessionPolicy.all_declared_evidence_loaded, true);
assert.equal(longSessionPolicy.discovery_locked, true);
assert.deepEqual(longSessionPolicy.allowed_actions, ["apply_files", "verify", "diff"]);

const controllerCompletedMutation = parseCodeAIWorkPackage(
  JSON.stringify({
    contract: CODE_AI_WORK_PACKAGE_CONTRACT,
    phase: "implementation",
    summary: "Apply the complete coherent source correction.",
    operations: [
      {
        action: "apply_files",
        description: "Apply all source changes together.",
        input: {
          files: [
            {
              path: objectiveContext.evidence_path_1,
              content: "export function normalizeMoney(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }\n",
            },
            {
              path: objectiveContext.evidence_path_2,
              content: "export const fixture = true;\n",
            },
          ],
        },
      },
    ],
  }),
  {
    authoritative_verification: {
      command: "node",
      args: ["scripts/code-ai-autonomous-multifile-fixture-test.mjs"],
    },
  },
);

assert.deepEqual(
  controllerCompletedMutation.operations.map((operation) => operation.action),
  ["apply_files", "verify", "diff"],
);
assert.deepEqual(
  controllerCompletedMutation.controller_normalizations.map((entry) => entry.kind),
  ["APPEND_CONTROLLER_AUTHORITATIVE_VERIFY", "APPEND_CONTROLLER_FINAL_DIFF"],
);
assert.equal(
  controllerCompletedMutation.operations[1]?.input?.command,
  "node",
);
assert.deepEqual(
  controllerCompletedMutation.operations[1]?.input?.args,
  ["scripts/code-ai-autonomous-multifile-fixture-test.mjs"],
);

const discoveryOnlyPackage = parseCodeAIWorkPackage(JSON.stringify({
  contract: CODE_AI_WORK_PACKAGE_CONTRACT,
  phase: "discovery",
  summary: "Try to read again even though Fast Start already loaded the source.",
  operations: [
    {
      action: "read",
      description: "Redundant read.",
      input: { file_path: objectiveContext.evidence_path_1, start_line: 1, end_line: 200 },
    },
  ],
}));
const forbiddenAfterSeed = discoveryOnlyPackage.operations
  .map((operation) => operation.action)
  .filter((action) => !seededPolicy.allowed_actions.includes(action));
assert.deepEqual(forbiddenAfterSeed, ["read"]);
assert.equal(
  discoveryOnlyPackage.operations.some((operation) => operation.action === "apply_files"),
  false,
);

const repairPolicy = resolveCodeAIWorkPackageActionPolicy({
  objective_context: {},
  state: {
    ...seededState,
    evidence: [],
    source_changes: [
      {
        path: objectiveContext.evidence_path_1,
        operation: "write",
        content: "export const broken = true;\n",
      },
    ],
    tests: [
      {
        operation_id: "verify-1",
        command: "node",
        args: ["scripts/code-ai-autonomous-multifile-fixture-test.mjs"],
        exit_code: 1,
        stderr: "AssertionError: expected corrected behavior",
      },
    ],
    failures: [
      {
        operation_id: "verify-1",
        action: "verify",
        message: "verification failed",
      },
    ],
  },
});
assert.equal(repairPolicy.repair_state, true);
assert.equal(repairPolicy.discovery_locked, true);
assert.deepEqual(repairPolicy.allowed_actions, ["apply_files", "verify", "diff"]);

for (const marker of [
  "executeBatchedAutonomousCodeMissionLive as executeBatchedAutonomousCodeMission",
  "CODE_AI_WORK_PACKAGE_ACTION_NOT_ALLOWED_FOR_PHASE",
  "CODE_AI_WORK_PACKAGE_IMPLEMENTATION_REQUIRED_AFTER_SEEDED_DISCOVERY",
  "DISCOVERY IS LOCKED.",
  "Allowed package actions for THIS call",
  "APPEND_CONTROLLER_AUTHORITATIVE_VERIFY",
  "APPEND_CONTROLLER_FINAL_DIFF",
  "CODE_AI_WORK_PACKAGE_MAX_INSTRUCTION_CHARS = 24000",
  "CODE_AI_WORKER_INSTRUCTION_HARD_LIMIT_CHARS = 30000",
]) {
  assert.equal(runtimeSource.includes(marker), true, `runtime marker missing: ${marker}`);
}

assert.equal(runtimeSource.includes("[deploy-production-final]"), false);

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  verified: {
    declared_source_evidence_locks_discovery: true,
    partial_source_evidence_keeps_batched_discovery_available: true,
    long_session_history_preserves_declared_evidence_lock: true,
    seeded_phase_allows_only_apply_verify_diff: true,
    redundant_discovery_is_forbidden_by_phase_policy: true,
    implementation_is_required_after_seeded_discovery: true,
    authoritative_verification_is_controller_owned_when_omitted: true,
    final_diff_is_controller_owned_when_omitted: true,
    bounded_planner_transport_is_public_runtime_dependency: true,
    repair_state_locks_discovery: true,
    model_provider_call_performed: false,
    reasoning_call_consumed: false,
    wallet_mutation_performed: false,
    runpod_mutation_performed: false,
    source_mutation_performed_by_selftest: false,
    production_deploy_performed: false,
  },
}, null, 2));
console.log(`${CONTRACT}=PASS`);
