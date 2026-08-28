import assert from "node:assert/strict";

import {
  buildCodeAIWorkPackagePromptTransport,
  CODE_AI_WORK_PACKAGE_MAX_INSTRUCTION_CHARS,
  CODE_AI_WORKER_INSTRUCTION_HARD_LIMIT_CHARS,
} from "../lib/code/runtime/CodeAIWorkPackagePromptRuntime.js";
import {
  compactCodeAIMissionStateForPlanner,
  resolveCodeAIWorkPackageActionPolicy,
  parseCodeAIWorkPackage,
  CODE_AI_WORK_PACKAGE_CONTRACT,
} from "../lib/code/runtime/CodeAIWorkPackageRuntime.js";
import { CodeAIWorkPackageRuntime } from "../lib/code/runtime/CodeAIWorkPackageRuntime.js";
import { projectCodeProductCompletionCriteria } from "../lib/code/runtime/CodeProductCompletionCriteriaRuntime.js";

const CONTRACT = "AVANTIQO_CODE_AI_LIVE_BOUNDED_WORK_PACKAGE_SELFTEST_V2";
const evidencePaths = [
  "src/a.mjs",
  "src/b.mjs",
  "scripts/verify.fixture-test.mjs",
];
const huge = "SOURCE_MARKER_" + "x".repeat(16000);

const readEvidence = (path, index, content = `${huge}:${path}`) => ({
  kind: "operation",
  operation_id: `seed_read_${index + 1}`,
  action: "read",
  status: "completed",
  result: {
    file_path: path,
    start_line: 1,
    end_line: 2400,
    total_lines: 2400,
    content,
  },
});

const state = {
  mission_id: "code-mission-live-bounded-selftest",
  base_commit: "a".repeat(40),
  status: "repair_required",
  files_changed: ["src/a.mjs", "src/b.mjs"],
  completed_operation_ids: Array.from({ length: 80 }, (_, index) => `op_${index}`),
  objective_context: {
    evidence_path_1: evidencePaths[0],
    evidence_path_2: evidencePaths[1],
    evidence_path_3: evidencePaths[2],
    authoritative_verification_command: "node",
    authoritative_verification_args: [evidencePaths[2]],
    allowed_edit_paths: [evidencePaths[0], evidencePaths[1]],
  },
  repository_guidance: {
    contract: "AVANTIQO_CODE_REPOSITORY_GUIDANCE_V1",
    instructions_text: "i".repeat(15000),
    verification_commands_text: "v".repeat(9000),
    ci_workflows_text: "w".repeat(5000),
    monorepo_summary: "m".repeat(2000),
  },
  tests: Array.from({ length: 10 }, (_, index) => ({
    operation_id: `verify_${index}`,
    command: "node",
    args: [evidencePaths[2]],
    exit_code: index === 9 ? 1 : 0,
    stdout: "o".repeat(6000),
    stderr: index === 9 ? "LATEST_FAILURE_MARKER_" + "e".repeat(6000) : "",
  })),
  verification: Array.from({ length: 10 }, (_, index) => ({
    operation_id: `verify_${index}`,
    passed: index !== 9,
  })),
  failures: [{
    operation_id: "verify_9",
    action: "verify",
    message: "LATEST_FAILURE_MARKER verification failed after current edits",
  }],
  source_changes: [
    { path: "src/a.mjs", operation: "write", content: "CURRENT_SOURCE_A_MARKER\n" + "a".repeat(12000) },
    { path: "src/b.mjs", operation: "write", content: "CURRENT_SOURCE_B_MARKER\n" + "b".repeat(12000) },
  ],
  patch: "STALE_PATCH_MARKER\n" + "p".repeat(30000),
  evidence: [
    readEvidence(evidencePaths[0], 0, "DECLARED_SOURCE_A_ORIGINAL_MARKER"),
    readEvidence(evidencePaths[1], 1, "DECLARED_SOURCE_B_ORIGINAL_MARKER"),
    readEvidence(evidencePaths[2], 2, "DECLARED_VERIFIER_MJS_MARKER"),
    ...Array.from({ length: 40 }, (_, index) => ({
      kind: "operation",
      operation_id: `noise_${index}`,
      action: index % 2 ? "search" : "diff",
      status: "completed",
      result: index % 2
        ? { query: `noise-${index}`, matches: Array.from({ length: 30 }, () => "n".repeat(1200)) }
        : { patch: "d".repeat(20000), patch_bytes: 20000 },
    })),
  ],
};

const objectiveContext = {
  ...state.objective_context,
  completion_criterion_1: `The exact command node ${evidencePaths[2]} passes after the repair.`,
  completion_criterion_2: "Only the two declared fixture source files are changed.",
  completion_criterion_3: "The final diff proves the repair.",
};
state.objective_context = objectiveContext;

const actionPolicy = resolveCodeAIWorkPackageActionPolicy({
  objective_context: objectiveContext,
  state,
});
assert.equal(actionPolicy.discovery_locked, true);
assert.equal(actionPolicy.all_declared_evidence_loaded, true);
assert.deepEqual(actionPolicy.allowed_actions, ["apply_files", "verify", "diff"]);
assert.equal(actionPolicy.declared_evidence_prompt_source, "DURABLE_COMPACT_DECLARED_READS");

const compact = compactCodeAIMissionStateForPlanner(state);
assert.equal(compact.declared_evidence_reads.length, 3);
assert.ok(compact.declared_evidence_reads.some((entry) =>
  entry.result?.file_path === evidencePaths[2] &&
  entry.result?.content?.includes("DECLARED_VERIFIER_MJS_MARKER")
));
assert.equal(
  compact.evidence.some((entry) => entry.action === "read"),
  false,
  "rolling prompt evidence should prove the declared reads already rolled out",
);

const transport = buildCodeAIWorkPackagePromptTransport({
  sections: [
    "You are Avantiqo Code. Implement from already observed evidence and do not ask for more context.",
    "MISSION: repair the bounded fixture and verify it.",
    `CONTROLLER AUTHORITATIVE VERIFICATION: ${JSON.stringify({ command: "node", args: [evidencePaths[2]] })}.`,
    "Allowed actions: apply_files, verify, diff.",
  ],
  compact_state: compact,
  objective_context: objectiveContext,
});

assert.ok(transport.instruction.length <= CODE_AI_WORK_PACKAGE_MAX_INSTRUCTION_CHARS);
assert.ok(transport.instruction.length < CODE_AI_WORKER_INSTRUCTION_HARD_LIMIT_CHARS);
assert.ok(transport.headroom_to_worker_limit_chars >= 6000);
assert.ok(transport.instruction.includes("CURRENT_SOURCE_A_MARKER"));
assert.ok(transport.instruction.includes("CURRENT_SOURCE_B_MARKER"));
assert.ok(transport.instruction.includes("LATEST_FAILURE_MARKER"));
assert.ok(transport.instruction.includes("DECLARED_VERIFIER_MJS_MARKER"));
assert.ok(transport.instruction.includes(evidencePaths[2]));
assert.equal(transport.instruction.includes("STALE_PATCH_MARKER"), false);

const exactVerifierParsed = parseCodeAIWorkPackage(JSON.stringify({
  contract: CODE_AI_WORK_PACKAGE_CONTRACT,
  phase: "implementation",
  summary: "repair with controller-owned exact verification",
  operations: [
    {
      action: "apply_files",
      input: { files: [{ path: "src/a.mjs", content: "export const ok = true;\n" }] },
    },
  ],
}), {
  authoritative_verification: {
    command: "node",
    args: [evidencePaths[2]],
  },
});
assert.deepEqual(exactVerifierParsed.operations.map((item) => item.action), ["apply_files", "verify", "diff"]);
assert.equal(exactVerifierParsed.operations[1].input.command, "node");
assert.deepEqual(exactVerifierParsed.operations[1].input.args, [evidencePaths[2]]);
assert.equal(exactVerifierParsed.operations[1].input.args[0].endsWith(".mjs"), true);

const productState = {
  ...state,
  status: "completed",
  objective: `The authoritative verification command is node ${evidencePaths[2]}. Only these source files may be edited: src/a.mjs, src/b.mjs.`,
  completed_operation_ids: ["apply_1", "verify_exact", "diff_final"],
  tests: [{
    operation_id: "verify_exact",
    command: "node",
    args: [evidencePaths[2]],
    exit_code: 0,
    stdout: "PASS",
    stderr: "",
  }],
  verification: [{ operation_id: "verify_exact", passed: true }],
  evidence: [
    {
      kind: "operation",
      operation_id: "apply_1",
      action: "apply_files",
      description: "repair fixtures",
      status: "completed",
      result: {},
    },
    {
      kind: "operation",
      operation_id: "verify_exact",
      action: "verify",
      description: "exact structured verification",
      status: "completed",
      result: {},
    },
    {
      kind: "operation",
      operation_id: "diff_final",
      action: "diff",
      description: "final diff",
      status: "completed",
      result: {},
    },
  ],
};
const productCompletion = projectCodeProductCompletionCriteria(productState);
assert.equal(productCompletion.authoritative_verification_source, "STRUCTURED_OBJECTIVE_CONTEXT");
assert.equal(productCompletion.allowed_change_paths_source, "STRUCTURED_OBJECTIVE_CONTEXT");
assert.deepEqual(productCompletion.authoritative_verification_operation_ids, ["verify_exact"]);
assert.deepEqual(productCompletion.explicit_allowed_change_paths.sort(), ["src/a.mjs", "src/b.mjs"]);
assert.equal(productCompletion.exact_allowed_change_set_observed, true);
assert.equal(productCompletion.verified, true);

const promoted = parseCodeAIWorkPackage(JSON.stringify({
  contract: CODE_AI_WORK_PACKAGE_CONTRACT,
  phase: "implementation",
  summary: "repair and verify",
  operations: [
    {
      action: "apply_files",
      input: { files: [{ path: "src/a.mjs", content: "export const ok = true;\n" }] },
    },
    {
      action: "run",
      input: { command: "node", args: [evidencePaths[2]] },
    },
  ],
}));
assert.deepEqual(promoted.operations.map((item) => item.action), ["apply_files", "verify", "diff"]);
assert.equal(CodeAIWorkPackageRuntime.live_progress, true);
assert.equal(CodeAIWorkPackageRuntime.max_package_operations, 12);
assert.ok(CodeAIWorkPackageRuntime.allowed_package_actions.includes("apply_files"));
assert.ok(CodeAIWorkPackageRuntime.implementation_actions.includes("verify"));

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  instruction_chars: transport.instruction_chars,
  max_instruction_chars: CODE_AI_WORK_PACKAGE_MAX_INSTRUCTION_CHARS,
  worker_instruction_hard_limit_chars: CODE_AI_WORKER_INSTRUCTION_HARD_LIMIT_CHARS,
  headroom_chars: transport.headroom_to_worker_limit_chars,
  state_profile: transport.state_profile,
  verified: {
    oversized_instruction_impossible_before_provider_call: true,
    current_edited_source_prioritized: true,
    latest_failed_verification_preserved: true,
    stale_patch_dropped_during_repair: true,
    declared_evidence_locks_discovery: true,
    declared_evidence_survives_rolling_history_eviction: true,
    verifier_source_survives_rolling_history_eviction: true,
    structured_authoritative_verifier_preserves_mjs_extension: true,
    structured_allowed_edit_scope_drives_completion: true,
    structured_verification_drives_completion: true,
    controller_verification_and_diff_preserved: true,
    live_progress_runtime_enabled: true,
    provider_call_performed: false,
    gpu_lease_acquired: false,
    wallet_mutation_performed: false,
    source_mutation_performed: false,
    production_deploy_performed: false,
    secrets_printed: false,
  },
}, null, 2));
