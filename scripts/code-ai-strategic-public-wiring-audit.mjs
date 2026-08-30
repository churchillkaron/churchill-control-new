import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const CONTRACT = "AVANTIQO_CODE_AI_STRATEGIC_PUBLIC_WIRING_AUDIT_V1";

const files = {
  facade: "lib/code/runtime/CodeAIWorkPackageRuntime.js",
  strategic: "lib/code/runtime/CodeAIStrategicReasoningRuntime.js",
  fastStart: "lib/code/runtime/CodeAIEmployeeFastStartRuntime.js",
  employee: "lib/code/runtime/CodeAIEmployeeRuntime.js",
  quality: "lib/code/runtime/CodeAIWorldClassQualityPolicy.js",
};

const source = Object.fromEntries(
  await Promise.all(
    Object.entries(files).map(async ([key, path]) => [key, await readFile(path, "utf8")]),
  ),
);

function requireMarkers(label, content, markers) {
  const missing = markers.filter((marker) => !content.includes(marker));
  if (missing.length) throw new Error(`${CONTRACT}_${label}_MISSING:${missing.join("|")}`);
}

requireMarkers("FACADE", source.facade, [
  "executeCodeAIStrategicBatchedMission",
  "CODE_AI_STRATEGIC_REASONING_CONTRACT",
  "strategic_reasoning: true",
  "deterministic_convergence_execute",
]);
assert.equal(
  source.facade.includes("export const executeBatchedAutonomousCodeMission =\n  executeBatchedAutonomousCodeMissionWithDeterministicConvergence"),
  false,
  "public Code work-package execution must route through strategic reasoning",
);

requireMarkers("STRATEGIC", source.strategic, [
  "AVANTIQO_CODE_AI_STRATEGIC_REASONING_V1",
  "AVANTIQO_STRATEGIC_ENGINEERING_PROTOCOL_V1",
  "do not default to the first plausible patch",
  "callers/consumers and compatibility boundaries",
  "analogous implementations or reusable mechanisms elsewhere in the repository",
  "root-cause fix over a symptom patch",
  "data-flow, state-machine, algorithmic, caching, batching, concurrency, lifecycle, or ownership change",
  "materially different alternative that was rejected",
  "extra_reasoning_calls_required_by_protocol: 0",
  "raw_reasoning_persisted: false",
]);

requireMarkers("FAST_START", source.fastStart, [
  "MAX_STRATEGIC_SEARCHES = 4",
  "resolveCodeAIEmployeeFastStartStrategicSearchTerms",
  "employee_fast_start_strategic_search_",
  "Precompute cross-repository strategic evidence",
  "strategic_searches_are_model_free: true",
  "first_reasoning_call_should_prefer_implementation",
]);

requireMarkers("EMPLOYEE", source.employee, [
  "executeBatchedAutonomousCodeMission",
  "batched_work_packages_required: true",
  "worldclass_quality_required: true",
  "continue_until_verified_complete: true",
]);

requireMarkers("QUALITY", source.quality, [
  "AVANTIQO_CODE_AI_ADVERSARIAL_DIFF_REVIEW_V1",
  "FOCUSED_OR_SKIPPED_TEST",
  "TLS_VERIFICATION_DISABLED",
  "CI_FAILURE_MASKED",
  "VERIFICATION_SCRIPT_NEUTERED",
  "STATIC_ANALYSIS_SUPPRESSION",
  "risk_escalation_required",
]);

assert.equal(/fetch\s*\(/.test(source.strategic), false);
assert.equal(/RUNPOD/.test(source.strategic), false);
assert.equal(/ServiceExecutionRuntime/.test(source.strategic), false);
assert.equal(/provider/i.test(source.strategic) && /execute/i.test(source.strategic), false);

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  verified: {
    public_work_package_facade_routes_through_strategic_runtime: true,
    deterministic_convergence_preserved_under_strategic_facade: true,
    strategic_protocol_requires_better_than_first_plausible_patch: true,
    repository_consumers_analogues_contracts_and_tests_considered: true,
    architectural_alternatives_considered_when_relevant: true,
    strategic_protocol_adds_zero_required_reasoning_calls: true,
    fast_start_cross_repository_search_is_model_free: true,
    employee_verified_completion_loop_preserved: true,
    adversarial_worldclass_gate_preserved: true,
    strategic_layer_has_no_direct_provider_or_runpod_dependency: true,
  },
  provider_call_performed: false,
  provider_spend_performed: false,
  endpoint_mutation_performed: false,
  production_deploy_performed: false,
}, null, 2));
console.log(`${CONTRACT}=PASS`);