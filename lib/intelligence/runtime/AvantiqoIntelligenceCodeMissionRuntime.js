import {
  AVANTIQO_PRODUCT_CONSTITUTION,
  AVANTIQO_PRODUCT_CONSTITUTION_CONTRACT,
} from "./AvantiqoProductConstitution.js";

export const AVANTIQO_INTELLIGENCE_CODE_MISSION_CONTRACT =
  "AVANTIQO_INTELLIGENCE_CODE_MISSION_V1";
export const AVANTIQO_CODE_MISSION_LEARNING_FEEDBACK_CONTRACT =
  "AVANTIQO_CODE_MISSION_LEARNING_FEEDBACK_V1";

const COMPLEXITY_CLASSES = new Set(["simple", "medium", "large"]);
const KNOWLEDGE_STATUSES = new Set([
  "REUSED_VERIFIED_KNOWLEDGE",
  "NO_RELEVANT_VERIFIED_KNOWLEDGE",
  "FRESH_RESEARCH_REQUIRED",
  "NOT_EVALUATED",
]);
const TRUSTED_KNOWLEDGE_STATES = new Set([
  "AVANTIQO_CANONICAL_PRODUCT",
  "HYBRID_VERIFIED_PLATFORM_KNOWLEDGE",
  "RELEASED_MONITORED",
  "VERIFIED_PLATFORM_KNOWLEDGE_REUSABLE",
]);
const MAX_LIST = 80;

function text(value, limit = 12000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function bounded(value, depth = 0) {
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === "string") return text(value, 12000);
  if (["number", "boolean"].includes(typeof value)) return value;
  if (depth >= 5) return "[bounded]";
  if (Array.isArray(value)) {
    return value.slice(0, MAX_LIST).map((item) => bounded(item, depth + 1));
  }
  if (typeof value !== "object") return text(value, 12000);
  return Object.fromEntries(
    Object.entries(value)
      .slice(0, MAX_LIST)
      .filter(([, item]) => item !== undefined && typeof item !== "function")
      .map(([key, item]) => [key, bounded(item, depth + 1)]),
  );
}

function strings(value, limit = MAX_LIST) {
  return [...new Set(
    list(value)
      .map((item) => text(item, 2000))
      .filter(Boolean),
  )].slice(0, limit);
}

function normalizeComplexity(value) {
  const normalized = text(value, 40).toLowerCase() || "medium";
  if (!COMPLEXITY_CLASSES.has(normalized)) {
    throw new Error(
      `AVANTIQO_INTELLIGENCE_CODE_MISSION_COMPLEXITY_INVALID:${normalized}`,
    );
  }
  return normalized;
}

function normalizeRepositoryContext(value = {}) {
  const source = object(value);
  const repositoryUrl = text(source.repository_url || source.repositoryUrl, 1000);
  const ref = text(source.ref, 240) || "main";
  const headSha = text(source.head_sha || source.headSha, 160).toLowerCase();
  const observedAt = text(source.observed_at || source.observedAt, 120);
  if (!repositoryUrl) {
    throw new Error("AVANTIQO_INTELLIGENCE_CODE_MISSION_REPOSITORY_REQUIRED");
  }
  if (!/^[a-f0-9]{7,64}$/.test(headSha)) {
    throw new Error("AVANTIQO_INTELLIGENCE_CODE_MISSION_REPOSITORY_HEAD_REQUIRED");
  }
  if (!observedAt || !Number.isFinite(Date.parse(observedAt))) {
    throw new Error(
      "AVANTIQO_INTELLIGENCE_CODE_MISSION_REPOSITORY_OBSERVED_AT_REQUIRED",
    );
  }
  return {
    repository_url: repositoryUrl,
    ref,
    head_sha: headSha,
    observed_at: observedAt,
    current_repository_is_execution_authority: true,
    reconcile_again_before_mutation: true,
  };
}

function normalizeKnowledgeItem(value = {}) {
  const source = object(value);
  const verificationStatus = text(
    source.verification_status ||
      source.release_status ||
      source.epistemic_state,
    160,
  ).toUpperCase();
  const reusable = source.reusable === true || source.reusable_platform_knowledge === true;
  const trusted = TRUSTED_KNOWLEDGE_STATES.has(verificationStatus);
  if (reusable && !trusted) {
    throw new Error(
      `AVANTIQO_INTELLIGENCE_CODE_MISSION_KNOWLEDGE_NOT_VERIFIED:${verificationStatus || "unknown"}`,
    );
  }
  return {
    id: text(source.id, 240) || null,
    subject: text(source.subject, 1000) || null,
    content: text(source.content || source.claim, 6000),
    verification_status: verificationStatus || "UNVERIFIED_CONTEXT_ONLY",
    reusable: reusable && trusted,
    confidence: Number.isFinite(Number(source.confidence))
      ? Math.max(0, Math.min(1, Number(source.confidence)))
      : null,
    verified_at: text(source.verified_at, 120) || null,
    valid_until: text(source.valid_until, 120) || null,
    freshness: text(source.freshness, 120) || null,
    provenance: bounded(source.provenance || {}),
    sources: bounded(source.sources || []),
    authorization_effect: "NONE",
  };
}

function normalizeKnowledgeContext(value = {}) {
  const source = object(value);
  const status = text(source.status, 120).toUpperCase() || "NOT_EVALUATED";
  if (!KNOWLEDGE_STATUSES.has(status)) {
    throw new Error(
      `AVANTIQO_INTELLIGENCE_CODE_MISSION_KNOWLEDGE_STATUS_INVALID:${status}`,
    );
  }
  const knowledge = list(source.knowledge).map(normalizeKnowledgeItem).slice(0, 40);
  const evaluated = source.evaluated === true || status !== "NOT_EVALUATED";
  return {
    evaluated,
    status,
    knowledge,
    provenance_contracts: strings(source.provenance_contracts, 20),
    freshness_checked: source.freshness_checked === true,
    evidence_graph_checked: source.evidence_graph_checked === true,
    fresh_research_performed: source.fresh_research_performed === true,
    stale_knowledge_reused: false,
    knowledge_authorizes_execution: false,
  };
}

function normalizeSystemReasoning(value = {}) {
  const source = object(value);
  if (!Object.keys(source).length) return null;
  return {
    reasoning_scope: strings(source.reasoning_scope || source.perspectives, 30),
    architecture_recommendation: text(source.architecture_recommendation, 8000),
    future_predictable_requirements: strings(source.future_predictable_requirements),
    impact_graph: bounded(source.impact_graph || {}),
    affected_domains: strings(source.affected_domains, 40),
    affected_capabilities: strings(source.affected_capabilities, 80),
    shared_primitives: strings(source.shared_primitives, 80),
    domain_ownership: bounded(source.domain_ownership || []),
    data_lifecycle_implications: strings(source.data_lifecycle_implications),
    api_contracts: bounded(source.api_contracts || []),
    security_permissions: strings(source.security_permissions),
    business_accounting_invariants: strings(source.business_accounting_invariants),
    integration_implications: strings(source.integration_implications),
    backward_compatibility: strings(source.backward_compatibility),
    performance_implications: strings(source.performance_implications),
    reporting_analytics_implications: strings(source.reporting_analytics_implications),
    automation_ai_hooks: strings(source.automation_ai_hooks),
    expensive_to_change_decisions: strings(source.expensive_to_change_decisions),
    invariants: strings(source.invariants),
    risks: bounded(source.risks || []),
    completion_criteria: strings(source.completion_criteria),
    verification_requirements: strings(source.verification_requirements),
    future_proof_architecture_not_feature_count: true,
  };
}

function assertSystemReasoningComplete(reasoning) {
  if (!reasoning) {
    throw new Error(
      "AVANTIQO_INTELLIGENCE_CODE_MISSION_GENERAL_SYSTEM_REASONING_REQUIRED",
    );
  }
  if (!reasoning.architecture_recommendation) {
    throw new Error(
      "AVANTIQO_INTELLIGENCE_CODE_MISSION_ARCHITECTURE_RECOMMENDATION_REQUIRED",
    );
  }
  if (!reasoning.invariants.length) {
    throw new Error("AVANTIQO_INTELLIGENCE_CODE_MISSION_INVARIANTS_REQUIRED");
  }
  if (!reasoning.completion_criteria.length) {
    throw new Error(
      "AVANTIQO_INTELLIGENCE_CODE_MISSION_COMPLETION_CRITERIA_REQUIRED",
    );
  }
  if (!reasoning.verification_requirements.length) {
    throw new Error(
      "AVANTIQO_INTELLIGENCE_CODE_MISSION_VERIFICATION_REQUIREMENTS_REQUIRED",
    );
  }
  if (!Object.keys(object(reasoning.impact_graph)).length) {
    throw new Error("AVANTIQO_INTELLIGENCE_CODE_MISSION_IMPACT_GRAPH_REQUIRED");
  }
}

export function createAvantiqoIntelligenceCodeMissionContext(input = {}) {
  const source = object(input);
  const mission = object(source.mission);
  const missionId = text(mission.id || source.mission_id, 240);
  const objective = text(mission.objective || source.objective, 8000);
  if (!missionId) {
    throw new Error("AVANTIQO_INTELLIGENCE_CODE_MISSION_ID_REQUIRED");
  }
  if (!objective) {
    throw new Error("AVANTIQO_INTELLIGENCE_CODE_MISSION_OBJECTIVE_REQUIRED");
  }

  const complexityClass = normalizeComplexity(
    source.complexity?.class || source.complexity_class,
  );
  const knowledgeContext = normalizeKnowledgeContext(source.learned_knowledge);
  const repositoryContext = normalizeRepositoryContext(source.repository_context);
  const systemReasoning = normalizeSystemReasoning(source.system_reasoning);

  const learningRequired = complexityClass !== "simple";
  const generalReasoningRequired = complexityClass === "large";
  if (learningRequired && !knowledgeContext.evaluated) {
    throw new Error(
      "AVANTIQO_INTELLIGENCE_CODE_MISSION_KNOWLEDGE_EVALUATION_REQUIRED",
    );
  }
  if (
    learningRequired &&
    knowledgeContext.status === "FRESH_RESEARCH_REQUIRED" &&
    knowledgeContext.fresh_research_performed !== true
  ) {
    throw new Error(
      "AVANTIQO_INTELLIGENCE_CODE_MISSION_FRESH_RESEARCH_REQUIRED_BEFORE_CODE",
    );
  }
  if (generalReasoningRequired) assertSystemReasoningComplete(systemReasoning);

  return {
    contract: AVANTIQO_INTELLIGENCE_CODE_MISSION_CONTRACT,
    status: "READY_FOR_CODE",
    mission: {
      id: missionId,
      objective,
      business_intent: text(mission.business_intent || source.business_intent, 6000) || null,
    },
    complexity: {
      class: complexityClass,
      classification_source: text(
        source.complexity?.classification_source || source.complexity_source,
        240,
      ) || "DETERMINISTIC_CONTROLLER",
      learned_knowledge_required: learningRequired,
      general_system_reasoning_required: generalReasoningRequired,
      classification_is_context_not_new_router: true,
    },
    canonical_context: {
      ...bounded(source.canonical_context || {}),
      product_constitution_contract: AVANTIQO_PRODUCT_CONSTITUTION_CONTRACT,
      architecture: [...AVANTIQO_PRODUCT_CONSTITUTION.architecture],
    },
    learned_knowledge: knowledgeContext,
    repository_context: repositoryContext,
    system_reasoning: systemReasoning,
    code_execution: {
      owner: "CODE_INTELLIGENCE",
      implementation_mode: "BATCHED_WORK_PACKAGES",
      normal_reasoning_call_target: { min: 1, max: 4 },
      deterministic_repository_operations_preferred: true,
      deterministic_verification_required: true,
      current_repository_reconciliation_required: true,
      broad_inspection_before_mutation: true,
      coherent_multi_file_implementation_preferred: true,
      reasoning_reentry_rule: "ONLY_WHEN_GENUINELY_NEW_REASONING_IS_REQUIRED",
      one_governed_implementation_plan: true,
    },
    governance: {
      one_avantiqo_intelligence_ecosystem: true,
      self_learning_owner: "VERIFIED_REUSABLE_KNOWLEDGE_AND_IMPROVEMENT",
      general_intelligence_owner: "SYSTEM_REASONING_AND_ARCHITECTURE",
      code_intelligence_owner: "SOFTWARE_ENGINEERING_EXECUTION",
      deterministic_controller_owner: "TOOLS_SAFETY_BUDGETS_EXECUTION_VERIFICATION",
      model_output_is_not_truth: true,
      knowledge_never_authorizes_writes: true,
      stale_architecture_context_never_overrides_current_repository: true,
      verified_result_required_before_learning_feedback: true,
      automatic_knowledge_promotion: false,
      raw_reasoning_persisted: false,
      authorization_effect: "NONE",
    },
  };
}

export function createAvantiqoCodeMissionLearningFeedback({
  mission_context,
  verified_result,
  learning = {},
} = {}) {
  const missionContext = object(mission_context);
  if (text(missionContext.contract, 200) !== AVANTIQO_INTELLIGENCE_CODE_MISSION_CONTRACT) {
    throw new Error("AVANTIQO_CODE_MISSION_LEARNING_FEEDBACK_MISSION_CONTRACT_INVALID");
  }
  const result = object(verified_result);
  const verificationEvidence = list(
    result.verification_evidence || result.verification || result.evidence,
  ).slice(0, 80).map((item) => bounded(item));
  const verified = result.verified === true && verificationEvidence.length > 0;

  const base = {
    contract: AVANTIQO_CODE_MISSION_LEARNING_FEEDBACK_CONTRACT,
    mission_id: text(missionContext.mission?.id, 240),
    verified_result: verified,
    reusable_platform_knowledge: false,
    knowledge_router_reuse_allowed: false,
    automatic_knowledge_promotion: false,
    automatic_training_effect: "NONE",
    production_model_promotion_effect: "NONE",
    authorization_effect: "NONE",
  };

  if (!verified) {
    return {
      ...base,
      status: "NOT_ELIGIBLE_UNVERIFIED_RESULT",
      eligible_for_learning_review: false,
      epistemic_state: "UNVERIFIED_EXECUTION_EVIDENCE",
      candidate: null,
    };
  }

  const source = object(learning);
  const systemReasoning = object(missionContext.system_reasoning);
  return {
    ...base,
    status: "LEARNING_EVIDENCE_CANDIDATE_READY",
    eligible_for_learning_review: true,
    epistemic_state: "EVIDENCE_CANDIDATE_NOT_RELEASED",
    candidate: {
      problem: text(source.problem || missionContext.mission?.objective, 6000),
      architecture_chosen: text(
        source.architecture_chosen || systemReasoning.architecture_recommendation,
        6000,
      ) || null,
      alternatives_rejected: strings(source.alternatives_rejected),
      dependencies_discovered: strings(source.dependencies_discovered),
      affected_domains: strings(
        source.affected_domains || systemReasoning.affected_domains,
        40,
      ),
      affected_capabilities: strings(
        source.affected_capabilities || systemReasoning.affected_capabilities,
      ),
      files_components_involved: strings(source.files_components_involved),
      tests_that_mattered: strings(source.tests_that_mattered),
      failure_repair_relationships: bounded(source.failure_repair_relationships || []),
      cross_system_consequences: strings(source.cross_system_consequences),
      reusable_implementation_pattern: text(
        source.reusable_implementation_pattern,
        6000,
      ) || null,
      final_successful_verification: bounded(verificationEvidence),
      boundary_conditions: strings(source.boundary_conditions),
      approaches_that_did_not_work: strings(source.approaches_that_did_not_work),
      repository_head_verified: text(
        result.repository_head_verified || missionContext.repository_context?.head_sha,
        160,
      ) || null,
    },
    learning_path: {
      verified_outcome_contract: "AVANTIQO_VERIFIED_OUTCOME_LEARNING_V1",
      evidence_candidate_bridge_contract:
        "AVANTIQO_LEARNING_EVIDENCE_CANDIDATE_BRIDGE_V1",
      final_release_contract: "AVANTIQO_FINAL_KNOWLEDGE_RELEASE_V1",
      direct_trusted_knowledge_write_allowed: false,
      explicit_governed_release_required: true,
    },
  };
}

export const AvantiqoIntelligenceCodeMissionRuntime = Object.freeze({
  contract: AVANTIQO_INTELLIGENCE_CODE_MISSION_CONTRACT,
  learning_feedback_contract: AVANTIQO_CODE_MISSION_LEARNING_FEEDBACK_CONTRACT,
  createContext: createAvantiqoIntelligenceCodeMissionContext,
  createLearningFeedback: createAvantiqoCodeMissionLearningFeedback,
});

export default AvantiqoIntelligenceCodeMissionRuntime;
