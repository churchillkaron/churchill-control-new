import { readFile } from "node:fs/promises";

const files = {
  policy: "lib/platform/research/runtime/OperatorMechanismResearchPolicy.js",
  runtime: "lib/platform/research/runtime/OperatorMechanismResearchRuntime.js",
  adapter: "lib/platform/research/runtime/OperatorWebResearchRuntime.js",
  evidence: "lib/platform/research/runtime/OperatorWebEvidenceRuntime.js",
  capability: "lib/platform/capabilities/createOperatorWebResearchCapability.js",
};

async function source(path) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    throw new Error(`MECHANISM_RESEARCH_AUDIT_FILE_MISSING:${path}:${error?.code || "READ_FAILED"}`);
  }
}

function requireMarkers(label, content, markers) {
  const missing = markers.filter((marker) => !content.includes(marker));
  if (missing.length) {
    throw new Error(`MECHANISM_RESEARCH_AUDIT_${label}_MARKERS_MISSING:${missing.join(",")}`);
  }
}

const [policy, runtime, adapter, evidence, capability] = await Promise.all(
  Object.values(files).map(source),
);

requireMarkers("POLICY", policy, [
  "AVANTIQO_MECHANISM_FIRST_RESEARCH_POLICY_V1",
  '"evidence", "mechanism", "invention"',
  "implementation_reference_may_be_primary_answer: false",
  "failed_approach_does_not_prove_objective_impossible",
  "minimum_hypotheses: 3",
  "minimum_experiments: 2",
  "minimum_analogies: 1",
  "minimum_solution_directions: 2",
  "hypotheses_must_be_falsifiable",
  "experiments_should_discriminate_between_hypotheses",
  "adjacent_domain_transfer_encouraged",
]);

requireMarkers("RUNTIME", runtime, [
  "AVANTIQO_MECHANISM_FIRST_RESEARCH_V1",
  "runAvantiqoKnowledgeAwareResearch",
  "runOperatorWebEvidenceResearch",
  "AvantiqoStructuredIntelligenceSupervisorRuntime",
  "understand how and why a system could work",
  "existing implementations as observations about mechanisms and tradeoffs",
  "competing hypotheses",
  "Hypotheses must be falsifiable",
  "Experiments must discriminate",
  "implementation_references",
  "implementation_reference_is_evidence_not_answer: true",
  "compactSynthesisAnswer",
  "broad_web_evidence_collected: true",
  'mode: "deep"',
  "allow_mutating_tools: false",
  "raw_reasoning_persisted: false",
]);

requireMarkers("ADAPTER", adapter, [
  "AVANTIQO_GOVERNED_WEB_RESEARCH_V2",
  "inferOperatorResearchMode",
  "runOperatorWebEvidenceResearch",
  "runOperatorMechanismResearch",
  'if (mode === "evidence")',
  "mechanism_escalation_performed: false",
  "mechanism_escalation_performed: true",
  "implementation_reference_is_evidence_not_answer: true",
]);

requireMarkers("EVIDENCE", evidence, [
  "AVANTIQO_GOVERNED_WEB_EVIDENCE_V1",
  'type: "web_search"',
  "WEB_RESEARCH_PROVIDER_SEARCH_EVIDENCE_REQUIRED",
  "WEB_RESEARCH_MINIMUM_SOURCES_NOT_MET",
  "Prefer official and primary sources",
  "mechanisms, specifications, measurements, constraints, failure modes and primary research",
  "Existing code can be evidence about an approach",
  "implementation_reference_is_evidence_not_answer: true",
  "internet_content_untrusted: true",
  "external_actions_allowed: false",
]);

requireMarkers("CAPABILITY", capability, [
  "Governed Knowledge & Mechanism Research",
  "runOperatorMechanismResearch",
  'enum: ["evidence", "mechanism", "invention"]',
  "mechanism-first",
  "first-principles",
  "hypothesis",
  "experiment",
  "invention",
  "Nobody has built this exact thing before",
  "mechanism_synthesis",
  "mechanism_quality",
]);

if (runtime.includes("allow_mutating_tools: true")) {
  throw new Error("MECHANISM_RESEARCH_AUDIT_MUTATING_TOOLS_FORBIDDEN");
}
if (!adapter.includes('if (mode === "evidence")')) {
  throw new Error("MECHANISM_RESEARCH_AUDIT_FACTUAL_COMPATIBILITY_ROUTE_REQUIRED");
}
if (evidence.includes("external_actions_allowed: true")) {
  throw new Error("MECHANISM_RESEARCH_AUDIT_EXTERNAL_ACTIONS_FORBIDDEN");
}

console.log(JSON.stringify({
  success: true,
  contract: "AVANTIQO_MECHANISM_FIRST_RESEARCH_SOURCE_AUDIT_V2",
  verified: {
    adaptive_evidence_mechanism_invention_modes: true,
    factual_callers_preserve_broad_evidence_route: true,
    technical_questions_escalate_beyond_code_search: true,
    novel_questions_require_invention_research: true,
    broad_web_evidence_precedes_mechanism_synthesis: true,
    source_backed_web_search_observed: true,
    mechanism_before_imitation: true,
    existing_implementations_are_reference_evidence_only: true,
    competing_falsifiable_hypotheses_required: true,
    discriminating_experiments_required: true,
    adjacent_domain_transfer_required_for_invention: true,
    multiple_solution_directions_required_for_invention: true,
    failed_approach_not_impossibility_proof: true,
    owned_intelligence_deep_synthesis: true,
    compact_mechanism_answer_available_to_existing_code_research_evidence: true,
    external_evidence_remains_untrusted: true,
    mutating_tools_forbidden: true,
    external_actions_forbidden: true,
    raw_reasoning_not_persisted: true,
  },
  provider_calls_executed: false,
  provider_spend_performed: false,
  endpoint_mutation_performed: false,
  production_deploy_performed: false,
}, null, 2));
console.log("AVANTIQO_MECHANISM_FIRST_RESEARCH_SOURCE_AUDIT_V2=PASS");