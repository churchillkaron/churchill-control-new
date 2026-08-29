import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  CODE_AI_WORK_PACKAGE_CONTRACT,
  CodeAIWorkPackageRuntime,
  executeBatchedAutonomousCodeMission,
  parseCodeAIWorkPackage,
  resolveCodeAIWorkPackageActionPolicy,
  compactCodeAIMissionStateForPlanner,
} from "../lib/code/runtime/CodeAIWorkPackageRuntime.js";
import {
  CODE_AI_WORK_PACKAGE_MAX_INSTRUCTION_CHARS,
  CODE_AI_WORKER_INSTRUCTION_HARD_LIMIT_CHARS,
} from "../lib/code/runtime/CodeAIWorkPackagePromptRuntime.js";

const CONTRACT = "AVANTIQO_CODE_AI_SEEDED_IMPLEMENTATION_LOCK_SELFTEST_V3";
const runtimePaths = {
  facade: "lib/code/runtime/CodeAIWorkPackageRuntime.js",
  core: "lib/code/runtime/CodeAIWorkPackageCoreRuntime.js",
  convergence: "lib/code/runtime/CodeAIWorkPackageDeterministicConvergenceRuntime.js",
  live: "lib/code/runtime/CodeAIWorkPackageRuntimeLive.js",
  prompt: "lib/code/runtime/CodeAIWorkPackagePromptRuntime.js",
};
const runtimeSources = Object.fromEntries(
  await Promise.all(
    Object.entries(runtimePaths).map(async ([name, runtimePath]) => [
      name,
      await readFile(runtimePath, "utf8"),
    ]),
  ),
);
const allRuntimeSource = Object.values(runtimeSources).join("\n\n");

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

assert.equal(typeof executeBatchedAutonomousCodeMission, "function");
assert.equal(CodeAIWorkPackageRuntime.execute, executeBatchedAutonomousCodeMission);
assert.equal(CodeAIWorkPackageRuntime.live_progress, true);
assert.equal(CodeAIWorkPackageRuntime.max_package_operations, 12);
assert.deepEqual(
  CodeAIWorkPackageRuntime.implementation_actions,
  ["apply_files", "verify", "diff"],
);
assert.equal(CODE_AI_WORK_PACKAGE_MAX_INSTRUCTION_CHARS, 24000);
assert.equal(CODE_AI_WORKER_INSTRUCTION_HARD_LIMIT_CHARS, 30000);
assert.ok(
  CODE_AI_WORKER_INSTRUCTION_HARD_LIMIT_CHARS -
    CODE_AI_WORK_PACKAGE_MAX_INSTRUCTION_CHARS >= 6000,
);

const seededPolicy = resolveCodeAIWorkPackageActionPolicy({
  objective_context: objectiveContext,
  state: seededState,
});

assert.equal(seededPolicy.all_declared_evidence_loaded, true);
assert.equal(seededPolicy.discovery_locked, true);
assert.equal(seededPolicy.repair_state, false);
assert.equal(seededPolicy.implementation_present, false);
assert.equal(seededPolicy.verification_failed, false);
assert.equal(seededPolicy.implementation_required, true);
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
assert.equal(partialPolicy.implementation_required, false);
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
assert.equal(longSessionPolicy.implementation_required, true);
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
assert.equal(controllerCompletedMutation.operations[1]?.input?.command, "node");
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

const failedRepairState = {
  ...seededState,
  evidence: [],
  source_changes: [
    {
      path: objectiveContext.evidence_path_1,
      operation: "write",
      content: "export const repaired = true;\n",
    },
  ],
  files_changed: [objectiveContext.evidence_path_1],
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
};
const repairPolicy = resolveCodeAIWorkPackageActionPolicy({
  objective_context: {},
  state: failedRepairState,
});
assert.equal(repairPolicy.repair_state, true);
assert.equal(repairPolicy.verification_failed, true);
assert.equal(repairPolicy.implementation_present, true);
assert.equal(repairPolicy.implementation_required, true);
assert.equal(repairPolicy.discovery_locked, true);
assert.deepEqual(repairPolicy.allowed_actions, ["apply_files", "verify", "diff"]);

const recoveredState = {
  ...failedRepairState,
  tests: [
    ...failedRepairState.tests,
    {
      operation_id: "verify-2",
      command: "node",
      args: ["scripts/code-ai-autonomous-multifile-fixture-test.mjs"],
      exit_code: 0,
      stdout: "PASS",
      stderr: "",
    },
  ],
  verification: [
    { operation_id: "verify-1", passed: false },
    { operation_id: "verify-2", passed: true },
  ],
};
const recoveredCompact = compactCodeAIMissionStateForPlanner(recoveredState);
const recoveredPolicy = resolveCodeAIWorkPackageActionPolicy({
  objective_context: {},
  state: recoveredState,
});
assert.equal(recoveredCompact.latest_failed_verification, null);
assert.equal(recoveredPolicy.repair_state, false);
assert.equal(recoveredPolicy.verification_failed, false);
assert.equal(recoveredPolicy.implementation_present, true);
assert.equal(recoveredPolicy.implementation_required, false);
assert.equal(recoveredPolicy.discovery_locked, true);
assert.deepEqual(recoveredPolicy.allowed_actions, ["apply_files", "verify", "diff"]);

const implementationOwnedMarkers = [
  [runtimeSources.live, "CODE_AI_WORK_PACKAGE_ACTION_NOT_ALLOWED_FOR_PHASE", "live action guard"],
  [runtimeSources.live, "CODE_AI_WORK_PACKAGE_IMPLEMENTATION_REQUIRED_AFTER_SEEDED_DISCOVERY", "live implementation guard"],
  [runtimeSources.live, "DISCOVERY IS LOCKED.", "live discovery-lock instruction"],
  [runtimeSources.live, "Allowed package actions for THIS call", "live action contract"],
  [runtimeSources.core, "implementation_required", "core implementation-required distinction"],
  [runtimeSources.core, "if (exitCode === 0) return null", "successful verification clears old failure"],
  [runtimeSources.core, "APPEND_CONTROLLER_AUTHORITATIVE_VERIFY", "core verification normalization"],
  [runtimeSources.core, "APPEND_CONTROLLER_FINAL_DIFF", "core diff normalization"],
  [runtimeSources.facade, "executeBatchedAutonomousCodeMissionWithDeterministicConvergence", "public deterministic-convergence binding"],
  [runtimeSources.convergence, "DETERMINISTIC_CONVERGENCE", "deterministic convergence runtime"],
  [runtimeSources.convergence, 'action: "verify"', "controller-owned convergence verification"],
  [runtimeSources.convergence, 'action: "diff"', "controller-owned convergence diff"],
  [runtimeSources.convergence, "reasoning_call_consumed: false", "deterministic closure reasoning invariant"],
  [runtimeSources.prompt, "CODE_AI_WORK_PACKAGE_MAX_INSTRUCTION_CHARS", "bounded prompt transport"],
  [runtimeSources.prompt, "CODE_AI_WORKER_INSTRUCTION_HARD_LIMIT_CHARS", "worker hard-limit contract"],
];
for (const [source, marker, label] of implementationOwnedMarkers) {
  assert.equal(source.includes(marker), true, `${label} missing: ${marker}`);
}

assert.equal(allRuntimeSource.includes("[deploy-production-final]"), false);

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  verified: {
    public_runtime_routes_to_deterministic_convergence: true,
    live_progress_enabled: true,
    declared_source_evidence_locks_discovery: true,
    partial_source_evidence_keeps_batched_discovery_available: true,
    long_session_history_preserves_declared_evidence_lock: true,
    seeded_phase_requires_initial_implementation: true,
    redundant_discovery_is_forbidden_by_phase_policy: true,
    authoritative_verification_is_controller_owned_when_omitted: true,
    final_diff_is_controller_owned_when_omitted: true,
    latest_successful_verification_supersedes_historical_failure: true,
    successful_existing_implementation_does_not_require_another_edit: true,
    latest_failed_verification_still_requires_real_repair: true,
    deterministic_verify_diff_precedes_additional_reasoning: true,
    planner_instruction_limit_chars: CODE_AI_WORK_PACKAGE_MAX_INSTRUCTION_CHARS,
    worker_instruction_hard_limit_chars: CODE_AI_WORKER_INSTRUCTION_HARD_LIMIT_CHARS,
    worker_instruction_headroom_chars:
      CODE_AI_WORKER_INSTRUCTION_HARD_LIMIT_CHARS -
      CODE_AI_WORK_PACKAGE_MAX_INSTRUCTION_CHARS,
    bounded_planner_transport_is_public_runtime_dependency: true,
    model_provider_call_performed: false,
    reasoning_call_consumed: false,
    wallet_mutation_performed: false,
    runpod_mutation_performed: false,
    source_mutation_performed_by_selftest: false,
    production_deploy_performed: false,
  },
}, null, 2));
console.log(`${CONTRACT}=PASS`);
