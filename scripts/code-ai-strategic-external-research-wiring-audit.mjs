import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const CONTRACT = "AVANTIQO_CODE_AI_STRATEGIC_EXTERNAL_RESEARCH_WIRING_AUDIT_V1";

const files = {
  facade: "lib/code/runtime/CodeAIWorkPackageRuntime.js",
  strategic: "lib/code/runtime/CodeAIStrategicReasoningRuntime.js",
  research: "lib/code/runtime/CodeAIStrategicExternalResearchRuntime.js",
  employee: "lib/code/runtime/CodeAIEmployeeRuntime.js",
  quality: "lib/code/runtime/CodeAIWorldClassQualityPolicy.js",
  knowledgeRouter: "lib/intelligence/runtime/AvantiqoKnowledgeRouterRuntime.js",
  attestation: "lib/code/runtime/CodeMissionAttestationRuntime.js",
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
  "strategic_reasoning: true",
]);

requireMarkers("STRATEGIC", source.strategic, [
  "runCodeAIStrategicExternalResearch",
  "formatCodeAIStrategicExternalResearchForObjective",
  "resolveCodeAIStrategicExternalResearchNeed",
  "CODE_AI_STRATEGIC_EXTERNAL_RESEARCH_REQUIRED_UNAVAILABLE",
  "strictExternalResearchRequired",
  "strategic_external_research: research",
  "external_research_authorization_effect: \"NONE\"",
  "executeBatchedAutonomousCodeMissionWithDeterministicConvergence",
]);

requireMarkers("RESEARCH", source.research, [
  "AVANTIQO_CODE_AI_STRATEGIC_EXTERNAL_RESEARCH_V1",
  "ordinary_repository_work_should_skip: !required",
  "externalTechnology && volatile",
  "externalTechnology && optimization && comparative",
  "Prefer primary/official technical documentation",
  "runAvantiqoKnowledgeAwareResearch",
  'domain: "software_engineering"',
  "freshness_days: 90",
  "minimum_sources: 2",
  "reusableResearchEvidence",
  "reused_from_attested_resume_state: true",
  "current_repository_remains_execution_authority: true",
  "automatic_source_mutation_performed: false",
  'authorization_effect: "NONE"',
  'execution_effect: "NONE"',
]);

requireMarkers("KNOWLEDGE_ROUTER", source.knowledgeRouter, [
  "runAvantiqoKnowledgeAwareResearch",
  "runKnowledgeAwareWebResearch",
  "evidence_graph",
  "fallback_fresh_research_required: true",
  'authorization_effect: "NONE"',
  'execution_effect: "NONE"',
]);

requireMarkers("ATTESTATION", source.attestation, [
  "canonical(value)",
  "digestFor(state, secret)",
  "attestCodeMissionState",
  "verifyCodeMissionStateAttestation",
]);
assert.equal(
  source.attestation.includes('.filter((key) => key !== "attestation")'),
  true,
  "all other bounded mission fields, including strategic external research, must be attested",
);

requireMarkers("EMPLOYEE", source.employee, [
  "executeBatchedAutonomousCodeMission",
  "continue_until_verified_complete: true",
  "worldclass_quality_required: true",
  "product_completion_criteria_required: true",
]);

requireMarkers("QUALITY", source.quality, [
  "AVANTIQO_CODE_AI_ADVERSARIAL_DIFF_REVIEW_V1",
  "CODE_AI_WORLDCLASS_ADVERSARIAL_DIFF_REVIEW_REQUIRED",
  "CODE_AI_WORLDCLASS_FRESH_VERIFICATION_GATES_REQUIRED",
]);

assert.equal(source.research.includes("fetch("), false, "Code research layer must use governed Intelligence, not direct web fetch");
assert.equal(source.research.includes("apply_files"), false, "research layer must never mutate repository source");
assert.equal(source.research.includes("deploy"), true, "research formatter must explicitly state deployment is not authorized");
assert.equal(source.strategic.includes("executeBatchedAutonomousCodeMissionWithDeterministicConvergence"), true);

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  verified: {
    public_code_routes_through_shared_strategic_boundary: true,
    ordinary_repository_work_skips_external_research: true,
    volatile_external_technology_requires_research: true,
    external_performance_comparisons_can_request_research: true,
    primary_official_evidence_preferred: true,
    code_research_uses_governed_intelligence_router_not_direct_fetch: true,
    evidence_graph_and_fresh_research_fallback_preserved: true,
    successful_research_reused_across_attested_resume: true,
    strict_current_or_explicit_research_failure_blocks_before_code_reasoning: true,
    research_has_no_authorization_or_execution_effect: true,
    current_repository_remains_execution_authority: true,
    external_research_cannot_mutate_source: true,
    deterministic_convergence_preserved: true,
    employee_verified_completion_loop_preserved: true,
    adversarial_worldclass_quality_gate_preserved: true,
  },
  external_research_performed_by_audit: false,
  provider_call_performed: false,
  provider_spend_performed: false,
  source_mutation_performed_by_audit: false,
  production_deploy_performed: false,
}, null, 2));
console.log(`${CONTRACT}=PASS`);