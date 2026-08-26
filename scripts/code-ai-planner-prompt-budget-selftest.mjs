import assert from "node:assert/strict";
import {
  buildCodeAIPlannerPromptTransport,
  CODE_AI_PLANNER_MAX_INSTRUCTION_CHARS,
} from "../lib/code/runtime/CodeAIPlannerPromptRuntime.js";

const huge = "SOURCE_EVIDENCE_MARKER_" + "x".repeat(12000);
const sourceRead = (index) => ({
  kind: "operation",
  operation_id: `read_${index}`,
  action: "read",
  description: `Read source ${index}`,
  status: "completed",
  result: {
    file_path: `src/module-${index}.js`,
    start_line: 1,
    end_line: 400,
    total_lines: 400,
    content: huge + index,
  },
});
const state = {
  mission_id: "code-mission-prompt-budget-selftest",
  objective_context: Object.fromEntries([
    ["repository_head_observed", "a".repeat(40)],
    ["selection_contract", "TEST_SELECTION"],
    ...Array.from({ length: 6 }, (_, i) => [`completion_criterion_${i + 1}`, `criterion-${i + 1}-${"c".repeat(650)}`]),
  ]),
  base_commit: "b".repeat(40),
  status: "running",
  completed_operation_ids: Array.from({ length: 24 }, (_, i) => `op_${i}`),
  files_changed: Array.from({ length: 40 }, (_, i) => `src/file-${i}.js`),
  tests: Array.from({ length: 8 }, (_, i) => ({
    operation_id: `verify_${i}`, command: "node", args: ["test.mjs"], exit_code: 0,
    stdout: "o".repeat(5000), stderr: "e".repeat(5000),
  })),
  failures: Array.from({ length: 8 }, (_, i) => ({ operation_id: `failed_${i}`, message: "f".repeat(3000) })),
  repairs: Array.from({ length: 8 }, (_, i) => ({ operation_id: `repair_${i}`, files: [`src/r-${i}.js`] })),
  blockers: Array.from({ length: 8 }, () => "b".repeat(3000)),
  verification: Array.from({ length: 8 }, (_, i) => ({ operation_id: `verify_${i}`, passed: true })),
  source_read_evidence: Array.from({ length: 8 }, (_, i) => sourceRead(i)),
  rejected_duplicate_actions: Array.from({ length: 6 }, (_, i) => ({ iteration: i + 1, action: "read", reason: "duplicate" })),
  duplicate_rejection_streak: 2,
  evidence: [
    { kind: "operation", operation_id: "inspect_1", action: "inspect", status: "completed", result: { repository_intelligence: { instruction_files: [{ content: huge }] } } },
    ...Array.from({ length: 8 }, (_, i) => sourceRead(i)),
  ],
  patch_present: false,
  source_change_count: 0,
  autonomy_control: { contract: "AVANTIQO_CODE_AI_AUTONOMY_CONTROL_V1", planner_iterations_used: 1, max_iterations: 16, remaining_iterations: 15, evidence_revision: 1, source_revision: 0 },
};
const repositoryGuidance = {
  contract: "AVANTIQO_CODE_REPOSITORY_GUIDANCE_V1",
  instructions_text: "i".repeat(12000),
  verification_commands_text: "v".repeat(6000),
  ci_workflows_text: "w".repeat(3000),
  monorepo_summary: "m".repeat(1000),
  instruction_scope_rule: "s".repeat(1000),
};
const result = buildCodeAIPlannerPromptTransport({
  objective: "Fix the bounded multi-file certification fixture safely. " + "q".repeat(3900),
  iteration: 1,
  state,
  repository_guidance: repositoryGuidance,
  allowed_actions: ["inspect", "search", "read", "apply_files", "run", "verify", "diff", "research", "complete", "block"],
  autonomy_contract: "AVANTIQO_CODE_AI_AUTONOMOUS_RUNTIME_V1",
});
assert.ok(result.instruction.length <= CODE_AI_PLANNER_MAX_INSTRUCTION_CHARS);
assert.ok(result.instruction.length < result.worker_instruction_hard_limit_chars);
assert.ok(result.headroom_to_worker_limit_chars >= 6000);
assert.equal(result.structured_specification.duplicate_objective_in_structured_specification, false);
assert.equal(result.structured_specification.duplicate_state_in_structured_specification, false);
assert.equal(Object.hasOwn(result.structured_specification, "objective"), false);
assert.equal(Object.hasOwn(result.structured_specification, "state"), false);
for (const marker of [
  "Read freshness is source-bound",
  "Use apply_files for every intentional source edit",
  "Use verify after source changes",
  "Never request push, deploy, publish, production, database mutation, credentials",
  "completion_criterion_N",
  "SOURCE_EVIDENCE_MARKER_",
]) assert.ok(result.instruction.includes(marker), marker);
console.log(JSON.stringify({
  success: true,
  contract: "AVANTIQO_CODE_AI_PLANNER_PROMPT_BUDGET_SELFTEST_V1",
  instruction_chars: result.instruction_chars,
  max_instruction_chars: CODE_AI_PLANNER_MAX_INSTRUCTION_CHARS,
  worker_instruction_hard_limit_chars: result.worker_instruction_hard_limit_chars,
  headroom_chars: result.headroom_to_worker_limit_chars,
  provider_calls_executed: false,
  provider_spend_approved: false,
  runpod_lease_acquired: false,
  production_deploy_performed: false,
}, null, 2));
