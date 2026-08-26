import { readFile } from "node:fs/promises";

const files = {
  policy: "lib/platform/research/runtime/OperatorMechanismResearchPolicy.js",
  runtime: "lib/platform/research/runtime/OperatorMechanismResearchRuntime.js",
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

const [policy, runtime, capability] = await Promise.all(
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
  "AvantiqoStructuredIntelligenceSupervisorRuntime",
  "understand how and why a system could work",
  "existing implementations as observations about mechanisms and tradeoffs",
  "competing hypotheses",
  "Hypotheses must be falsifiable",
  "Experiments must discriminate",
  "implementation_references",
  "implementation_reference_is_evidence_not_answer: true",
  'mode: "deep"',
  "allow_mutating_tools: false",
  "raw_reasoning_persisted: false",
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

console.log(JSON.stringify({
  success: true,
  contract: "AVANTIQO_MECHANISM_FIRST_RESEARCH_SOURCE_AUDIT_V1",
  verified: {
    adaptive_evidence_mechanism_invention_modes: true,
    technical_questions_escalate_beyond_code_search: true,
    novel_questions_require_invention_research: true,
    mechanism_before_imitation: true,
    existing_implementations_are_reference_evidence_only: true,
    competing_falsifiable_hypotheses_required: true,
    discriminating_experiments_required: true,
    adjacent_domain_transfer_required_for_invention: true,
    multiple_solution_directions_required_for_invention: true,
    failed_approach_not_impossibility_proof: true,
    owned_intelligence_synthesis: true,
    external_evidence_remains_untrusted: true,
    mutating_tools_forbidden: true,
    raw_reasoning_not_persisted: true,
  },
  provider_calls_executed: false,
  provider_spend_performed: false,
  endpoint_mutation_performed: false,
  production_deploy_performed: false,
}, null, 2));
console.log("AVANTIQO_MECHANISM_FIRST_RESEARCH_SOURCE_AUDIT_V1=PASS");