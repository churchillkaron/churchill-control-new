import assert from "node:assert/strict";

import {
  buildCodeAIStrategicObjective,
  CODE_AI_STRATEGIC_REASONING_CONTRACT,
  CodeAIStrategicReasoningRuntime,
} from "../lib/code/runtime/CodeAIStrategicReasoningRuntime.js";
import {
  resolveCodeAIEmployeeFastStartSeedPaths,
  resolveCodeAIEmployeeFastStartStrategicSearchTerms,
  CodeAIEmployeeFastStartRuntime,
} from "../lib/code/runtime/CodeAIEmployeeFastStartRuntime.js";
import {
  CodeAIWorkPackageRuntime,
} from "../lib/code/runtime/CodeAIWorkPackageRuntime.js";

const CONTRACT = "AVANTIQO_CODE_AI_STRATEGIC_REASONING_SELFTEST_V1";

const objective = [
  "Repair `resolveCodeAIPlannerRequest` in lib/code/runtime/CodeAIPlannerExecutionRuntime.js.",
  "The failure is CODE_AI_PLANNER_WARM_SESSION_NOT_READY and callers must remain compatible.",
].join(" ");

const seeds = resolveCodeAIEmployeeFastStartSeedPaths({ objective });
assert.deepEqual(seeds, ["lib/code/runtime/CodeAIPlannerExecutionRuntime.js"]);

const searchTerms = resolveCodeAIEmployeeFastStartStrategicSearchTerms({ objective });
assert.ok(searchTerms.length > 0);
assert.ok(searchTerms.length <= CodeAIEmployeeFastStartRuntime.max_strategic_searches);
assert.ok(searchTerms.includes("resolveCodeAIPlannerRequest"));
assert.ok(searchTerms.includes("CODE_AI_PLANNER_WARM_SESSION_NOT_READY"));
assert.ok(searchTerms.includes("CodeAIPlannerExecutionRuntime"));
assert.equal(searchTerms.includes("Repair"), false);
assert.equal(searchTerms.includes("callers"), false);

const strategic = buildCodeAIStrategicObjective({ objective });
assert.ok(strategic.includes("AVANTIQO_STRATEGIC_ENGINEERING_PROTOCOL_V1"));
assert.ok(strategic.includes("callers/consumers"));
assert.ok(strategic.includes("analogous implementations"));
assert.ok(strategic.includes("root-cause fix"));
assert.ok(strategic.includes("materially different alternative"));
assert.ok(strategic.includes("data-flow, state-machine, algorithmic, caching, batching, concurrency, lifecycle, or ownership change"));

const repeated = buildCodeAIStrategicObjective({ objective: strategic });
assert.equal(repeated, strategic, "strategic protocol must be idempotent");

const repair = buildCodeAIStrategicObjective({
  objective: "Repair the current failed verification.",
  resume_state: {
    files_changed: ["lib/example.js"],
    source_changes: [{ path: "lib/example.js", operation: "write", content: "x" }],
  },
});
assert.ok(repair.includes("repair the root cause, not merely the visible symptom"));
assert.ok(repair.includes("Do not weaken tests, types, lint, security, CI, validation"));

assert.equal(
  CODE_AI_STRATEGIC_REASONING_CONTRACT,
  "AVANTIQO_CODE_AI_STRATEGIC_REASONING_V1",
);
assert.equal(CodeAIStrategicReasoningRuntime.contract, CODE_AI_STRATEGIC_REASONING_CONTRACT);
assert.equal(CodeAIWorkPackageRuntime.strategic_reasoning, true);
assert.equal(
  CodeAIWorkPackageRuntime.strategic_reasoning_contract,
  CODE_AI_STRATEGIC_REASONING_CONTRACT,
);
assert.equal(typeof CodeAIWorkPackageRuntime.execute, "function");

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  verified: {
    explicit_file_seeded_without_reasoning: true,
    code_symbols_become_cross_repository_search_terms: true,
    generic_english_not_used_as_search_noise: true,
    strategic_protocol_idempotent: true,
    root_cause_preferred_over_symptom_patch: true,
    callers_contracts_analogues_and_tests_required: true,
    materially_different_alternative_required_in_decision_record: true,
    non_line_level_architecture_options_considered_when_relevant: true,
    repair_mode_forbids_verification_weakening: true,
    public_work_package_runtime_strategic: true,
  },
  provider_call_performed: false,
  provider_spend_performed: false,
  repository_network_call_performed: false,
  source_mutation_performed_by_selftest: false,
  production_deploy_performed: false,
}, null, 2));
console.log(`${CONTRACT}=PASS`);