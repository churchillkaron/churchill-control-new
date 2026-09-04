process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-role-key";
process.env.AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID ||= "00000000-0000-0000-0000-000000000001";

const {
  OPERATOR_VERIFIED_LEARNING_CONTEXT_CONTRACT,
  buildOperatorVerifiedLearningContext,
  buildOperatorVerifiedLearningQuery,
} = await import("../lib/operator/runtime/OperatorVerifiedLearningContextRuntime.js");

const failures = [];
const passes = [];

function check(name, condition, detail = "") {
  if (condition) passes.push(name);
  else failures.push(`${name}${detail ? `: ${detail}` : ""}`);
}

function knowledge(index = 1, overrides = {}) {
  return {
    id: `knowledge-${index}`,
    type: "fact",
    subject: `Verified lesson ${index}`,
    content: `Verified workflow lesson ${index}: resume the exact existing operation after ambiguous transport state instead of blindly submitting another operation.`,
    relevance: 0.91,
    confidence: 0.98,
    importance: 0.9,
    verified_at: "2026-09-03T00:00:00.000Z",
    valid_until: "2026-10-03T00:00:00.000Z",
    domain: "intelligence",
    jurisdiction: null,
    sources: [
      { url: `https://example.com/source-${index}-a` },
      { url: `https://example.com/source-${index}-b` },
    ],
    provenance: {
      source: "avantiqo_explicit_final_knowledge_release",
      topic_key: `topic-${index}`,
    },
    authorization_effect: "NONE",
    ...overrides,
  };
}

function recall(overrides = {}) {
  const base = {
    contract: "AVANTIQO_HYBRID_KNOWLEDGE_RETRIEVAL_V1",
    available: true,
    sufficient: true,
    reason: "HYBRID_VERIFIED_KNOWLEDGE_REUSABLE",
    query: "resume exact existing operation after ambiguous transport state",
    knowledge: [knowledge(1)],
    sources: [
      { url: "https://example.com/source-1-a" },
      { url: "https://example.com/source-1-b" },
    ],
    evidence_graph: {
      available: true,
      block_knowledge_reuse: false,
      reason: "NO_RELEVANT_CONFLICT",
      relevant_graph_count: 2,
      relevant_conflict_count: 0,
    },
    retrieval: {
      candidate_count: 8,
      matched_count: 1,
      top_relevance: 0.91,
      semantic_bridge_used: true,
      lexical_only: false,
      source_requirement_met: true,
      minimum_source_count: 2,
      explicit_final_release_only: true,
    },
    governance: {
      deterministic_pre_model_retrieval: true,
      external_embedding_provider_used: false,
      external_intelligence_provider_used: false,
      evidence_graph_checked: true,
      conflict_can_block_reuse: true,
      stale_current_knowledge_can_block_reuse: true,
      expired_valid_until_blocks_reuse: true,
      legacy_pre_epistemic_platform_knowledge_reused: false,
      explicit_final_release_required_for_general_knowledge_reuse: true,
      memory_never_authorizes_actions: true,
      raw_reasoning_persisted: false,
    },
  };
  return {
    ...base,
    ...overrides,
    evidence_graph: { ...base.evidence_graph, ...(overrides.evidence_graph || {}) },
    retrieval: { ...base.retrieval, ...(overrides.retrieval || {}) },
    governance: { ...base.governance, ...(overrides.governance || {}) },
  };
}

check(
  "contract is versioned",
  OPERATOR_VERIFIED_LEARNING_CONTEXT_CONTRACT ===
    "AVANTIQO_OPERATOR_VERIFIED_LEARNING_CONTEXT_V1",
);

const query = buildOperatorVerifiedLearningQuery({
  message: "Continue the finance close and avoid the failure we found last time.",
  projectState: {
    objective: "Close the month safely",
    constraints: ["Do not duplicate payments"],
    decisions: ["Use evidence-first verification"],
    progress_summary: "Bank reconciliation is complete",
    next_step: "Post verified closing entries",
  },
  currentScreen: { name: "Finance Close" },
});
check("query carries current request", query.includes("Continue the finance close"));
check("query carries durable objective", query.includes("Close the month safely"));
check("query carries prior constraint", query.includes("Do not duplicate payments"));
check("query carries current screen", query.includes("Finance Close"));
check("query is bounded", query.length <= 4000, `chars=${query.length}`);

const valid = buildOperatorVerifiedLearningContext(recall());
check("valid released experience is available", valid.status === "AVAILABLE");
check("valid context is retrieval-only", valid.retrieval_only === true);
check("valid context performs no internet search", valid.internet_search_performed === false);
check("valid context performs no fresh research", valid.fresh_research_performed === false);
check("valid context uses no external intelligence provider", valid.external_intelligence_provider_used === false);
check("valid context uses no external embedding provider", valid.external_embedding_provider_used === false);
check("valid context is advisory only", valid.advisory_only === true);
check("valid context never proves current business state", valid.current_business_state_proven === false);
check("valid context never authorizes execution", valid.authorization_effect === "NONE" && valid.execution_effect === "NONE");
check("valid context excludes customer-private reuse", valid.customer_private_memory_reused === false);
check("valid context records evidence graph check", valid.evidence_graph_checked === true);

const researchRequired = buildOperatorVerifiedLearningContext(recall({
  sufficient: false,
  reason: "FRESH_RESEARCH_REQUIRED",
}));
check("retrieval miss does not become model context", researchRequired.status === "NONE");
check("retrieval miss performs no fresh research", researchRequired.fresh_research_performed === false);
check("retrieval miss remains retrieval-only", researchRequired.retrieval_only === true);

const canonical = buildOperatorVerifiedLearningContext(recall({
  knowledge: [knowledge(1, { provenance: { source: "avantiqo_canonical_product_knowledge" } })],
}));
check("canonical product authority is not mixed into learned experience", canonical.status === "NONE");

const conflicted = buildOperatorVerifiedLearningContext(recall({
  sufficient: false,
  reason: "EVIDENCE_GRAPH_CONFLICT",
  evidence_graph: { block_knowledge_reuse: true, relevant_conflict_count: 1 },
}));
check("evidence graph conflict blocks reuse", conflicted.status === "NONE");

const noFinalRelease = buildOperatorVerifiedLearningContext(recall({
  retrieval: { explicit_final_release_only: false },
}));
check("non-final learning is rejected", noFinalRelease.status === "NONE");

const externalEmbedding = buildOperatorVerifiedLearningContext(recall({
  governance: { external_embedding_provider_used: true },
}));
check("external embedding retrieval is rejected", externalEmbedding.status === "NONE");

const externalModel = buildOperatorVerifiedLearningContext(recall({
  governance: { external_intelligence_provider_used: true },
}));
check("external intelligence retrieval is rejected", externalModel.status === "NONE");

const uncheckedGraph = buildOperatorVerifiedLearningContext(recall({
  governance: { evidence_graph_checked: false },
}));
check("unchecked evidence graph is rejected", uncheckedGraph.status === "NONE");

const authorization = buildOperatorVerifiedLearningContext(recall({
  knowledge: [knowledge(1, { authorization_effect: "GRANTED" })],
}));
check("authorization-bearing knowledge is rejected", authorization.status === "NONE");

const legacy = buildOperatorVerifiedLearningContext(recall({
  governance: { legacy_pre_epistemic_platform_knowledge_reused: true },
}));
check("legacy pre-epistemic knowledge is rejected", legacy.status === "NONE");

const weakSourceGate = buildOperatorVerifiedLearningContext(recall({
  sufficient: false,
  reason: "FRESH_RESEARCH_REQUIRED",
  retrieval: { source_requirement_met: false },
}));
check("insufficient source evidence is rejected", weakSourceGate.status === "NONE");

const oversized = buildOperatorVerifiedLearningContext(recall({
  knowledge: Array.from({ length: 8 }, (_, index) => knowledge(index + 1, {
    content: `Lesson ${index + 1} ${"x".repeat(850)}`,
  })),
}));
check("context keeps at most four items", oversized.knowledge_count <= 4, `count=${oversized.knowledge_count}`);
check("context respects total character budget", oversized.context_chars <= 2600, `chars=${oversized.context_chars}`);

console.log("AVANTIQO_OPERATOR_VERIFIED_LEARNING_CONTEXT_AUDIT");
console.log(`CHECKS_PASSED=${passes.length}`);
console.log(`CHECKS_FAILED=${failures.length}`);
console.log(`VALID_KNOWLEDGE_COUNT=${valid.knowledge_count}`);
console.log(`VALID_CONTEXT_CHARS=${valid.context_chars}`);
console.log(`RETRIEVAL_ONLY=${valid.retrieval_only}`);
for (const failure of failures) console.error(`FAIL ${failure}`);
if (failures.length) process.exit(1);
