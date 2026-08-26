import { readFile, writeFile } from "node:fs/promises";

async function patchFile(path, mutate) {
  const before = await readFile(path, "utf8");
  const after = mutate(before);
  if (after === before) throw new Error(`CODE_AI_PROMPT_BUDGET_PATCH_NO_CHANGE:${path}`);
  await writeFile(path, after);
}

await patchFile("lib/code/runtime/CodeAIAutonomousRuntime.js", (source) => {
  const importNeedle = 'import { executeCodeAIPlannerRequest } from "./CodeAIPlannerExecutionRuntime.js";';
  if (!source.includes(importNeedle)) throw new Error("CODE_AI_PROMPT_BUDGET_PLANNER_IMPORT_ANCHOR_MISSING");
  source = source.replace(
    importNeedle,
    `${importNeedle}\nimport { buildCodeAIPlannerPromptTransport } from "./CodeAIPlannerPromptRuntime.js";`,
  );

  const instructionStart = source.indexOf("function plannerInstruction({ objective, state, iteration }) {");
  const appendStart = source.indexOf("function appendEvidence(state, entry) {", instructionStart);
  if (instructionStart < 0 || appendStart <= instructionStart) {
    throw new Error("CODE_AI_PROMPT_BUDGET_LEGACY_INSTRUCTION_BLOCK_MISSING");
  }
  source = `${source.slice(0, instructionStart)}${source.slice(appendStart)}`;

  const executionStart = source.indexOf("function plannerExecutionInput({ context, objective, state, iteration }) {");
  const planNextStart = source.indexOf("async function planNext({ context, objective, state, iteration }) {", executionStart);
  if (executionStart < 0 || planNextStart <= executionStart) {
    throw new Error("CODE_AI_PROMPT_BUDGET_EXECUTION_INPUT_BLOCK_MISSING");
  }
  const replacement = `function plannerExecutionInput({ context, objective, state, iteration }) {
  const transport = buildCodeAIPlannerPromptTransport({
    objective,
    iteration,
    state: compactState(state),
    repository_guidance: state?.repository_guidance,
    allowed_actions: [...ALLOWED_ACTIONS],
    autonomy_contract: CONTRACT,
  });
  return {
    organization_id: context.organizationId,
    party_id: text(context?.metadata?.partyId || context.partyId, 200) || null,
    entity_id: text(context.entityId, 200) || null,
    service_id: PLANNER_SERVICE_ID,
    capability: PLANNER_CAPABILITY,
    category: "CODE_AI_AUTONOMY",
    input: {
      contract: "AVANTIQO_CODE_ENGINE_V1",
      capability: PLANNER_CAPABILITY,
      instruction: transport.instruction,
      structured_specification: transport.structured_specification,
      quantity: 1,
    },
    metadata: {
      code_ai_autonomy_contract: CONTRACT,
      code_ai_mission_id: state?.mission_id || null,
      code_ai_iteration: iteration,
      planner_prompt_contract: transport.contract,
      planner_instruction_chars: transport.instruction_chars,
      planner_instruction_max_chars: transport.structured_specification.planner_instruction_max_chars,
      planner_state_chars: transport.state_chars,
      worker_instruction_headroom_chars: transport.headroom_to_worker_limit_chars,
      product_objective_provenance_present:
        Boolean(text(state?.objective_context?.selection_contract, 160)),
      product_completion_criteria_count:
        objectiveCompletionCriteria(state?.objective_context).length,
      product_objective_provenance_authorization_effect: "NONE",
      owned_orchestration: true,
      raw_reasoning_persisted: false,
    },
  };
}

`;
  return `${source.slice(0, executionStart)}${replacement}${source.slice(planNextStart)}`;
});

await patchFile("scripts/code-ai-autonomy-loop-guard-audit.mjs", (source) => {
  source = source.replace(
    'const workspaceSource = await readFile(workspacePath, "utf8");',
    'const workspaceSource = await readFile(workspacePath, "utf8");\nconst promptPath = "lib/code/runtime/CodeAIPlannerPromptRuntime.js";\nconst promptSource = await readFile(promptPath, "utf8");',
  );
  const movedMarkers = [
    '  "Search mode is part of action identity",\n',
    '  "literal|regex|path|glob",\n',
    '  "path_globs",\n',
    '  "Read freshness is source-bound",\n',
    '  "The planner iteration budget is global across pending/resume cycles",\n',
    '  "Treat those file contents as observed current source and do not reread a covered range",\n',
  ];
  for (const marker of movedMarkers) source = source.replace(marker, "");
  source = source.replace(
    'const workspaceRequiredMarkers = [',
    `const promptRequiredMarkers = [
  "AVANTIQO_CODE_AI_PLANNER_PROMPT_TRANSPORT_V1",
  "CODE_AI_PLANNER_MAX_INSTRUCTION_CHARS = 24000",
  "CODE_AI_PLANNER_MAX_STATE_CHARS = 14000",
  "worker_instruction_hard_limit_chars: 30000",
  "duplicate_objective_in_structured_specification: false",
  "duplicate_state_in_structured_specification: false",
  "CODE_AI_AUTONOMOUS_PLANNER_STATE_BUDGET_EXCEEDED",
  "CODE_AI_AUTONOMOUS_PLANNER_INSTRUCTION_BUDGET_EXCEEDED",
  "Search mode is part of action identity",
  "literal|regex|path|glob",
  "path_globs",
  "Read freshness is source-bound",
  "The planner iteration budget is global across pending/resume cycles",
  "Treat those file contents as observed current source and do not reread a covered range",
  "Use apply_files for every intentional source edit",
  "Use verify after source changes",
  "Never request push, deploy, publish, production, database mutation, credentials",
];

const promptMissing = promptRequiredMarkers.filter((marker) => !promptSource.includes(marker));
if (promptMissing.length) {
  throw new Error(\`CODE_AI_AUTONOMY_PLANNER_PROMPT_MARKERS_MISSING:\${promptMissing.join(",")}\`);
}
if (!source.includes('buildCodeAIPlannerPromptTransport') || !source.includes('instruction: transport.instruction')) {
  throw new Error("CODE_AI_AUTONOMY_PLANNER_BOUNDED_TRANSPORT_NOT_WIRED");
}

const workspaceRequiredMarkers = [`,
  );

  const oldPromptCheckStart = source.indexOf('const plannerInstruction = source.indexOf("function plannerInstruction", compactState);');
  const operationObservation = source.indexOf('const operationObservation = source.indexOf("const operationObserved =");', oldPromptCheckStart);
  if (oldPromptCheckStart < 0 || operationObservation <= oldPromptCheckStart) {
    throw new Error("CODE_AI_PROMPT_BUDGET_OLD_AUDIT_BLOCK_MISSING");
  }
  source = `${source.slice(0, oldPromptCheckStart)}${source.slice(operationObservation)}`;

  source = source.replace(
    '    repeated_workspace_termination_remains_fail_closed: true,',
    '    repeated_workspace_termination_remains_fail_closed: true,\n    bounded_planner_prompt_transport: true,\n    planner_instruction_below_worker_hard_limit: true,\n    duplicate_objective_and_state_removed_from_structured_specification: true,',
  );
  return source;
});

const selftest = `import assert from "node:assert/strict";
import {
  buildCodeAIPlannerPromptTransport,
  CODE_AI_PLANNER_MAX_INSTRUCTION_CHARS,
} from "../lib/code/runtime/CodeAIPlannerPromptRuntime.js";

const huge = "SOURCE_EVIDENCE_MARKER_" + "x".repeat(12000);
const sourceRead = (index) => ({
  kind: "operation",
  operation_id: \`read_\${index}\`,
  action: "read",
  description: \`Read source \${index}\`,
  status: "completed",
  result: {
    file_path: \`src/module-\${index}.js\`,
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
    ...Array.from({ length: 6 }, (_, i) => [\`completion_criterion_\${i + 1}\`, \`criterion-\${i + 1}-\${"c".repeat(650)}\`]),
  ]),
  base_commit: "b".repeat(40),
  status: "running",
  completed_operation_ids: Array.from({ length: 24 }, (_, i) => \`op_\${i}\`),
  files_changed: Array.from({ length: 40 }, (_, i) => \`src/file-\${i}.js\`),
  tests: Array.from({ length: 8 }, (_, i) => ({
    operation_id: \`verify_\${i}\`, command: "node", args: ["test.mjs"], exit_code: 0,
    stdout: "o".repeat(5000), stderr: "e".repeat(5000),
  })),
  failures: Array.from({ length: 8 }, (_, i) => ({ operation_id: \`failed_\${i}\`, message: "f".repeat(3000) })),
  repairs: Array.from({ length: 8 }, (_, i) => ({ operation_id: \`repair_\${i}\`, files: [\`src/r-\${i}.js\`] })),
  blockers: Array.from({ length: 8 }, () => "b".repeat(3000)),
  verification: Array.from({ length: 8 }, (_, i) => ({ operation_id: \`verify_\${i}\`, passed: true })),
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
`;
await writeFile("scripts/code-ai-planner-prompt-budget-selftest.mjs", selftest);

await patchFile("package.json", (source) => {
  const needle = 'node scripts/code-ai-autonomy-loop-guard-audit.mjs && node scripts/code-ai-autonomy-action-identity-selftest.mjs';
  if (!source.includes(needle)) throw new Error("CODE_AI_PROMPT_BUDGET_PACKAGE_ANCHOR_MISSING");
  return source.replace(
    needle,
    'node scripts/code-ai-autonomy-loop-guard-audit.mjs && node scripts/code-ai-planner-prompt-budget-selftest.mjs && node scripts/code-ai-autonomy-action-identity-selftest.mjs',
  );
});

console.log("AVANTIQO_CODE_AI_PLANNER_PROMPT_BUDGET_PATCH=PASS");
