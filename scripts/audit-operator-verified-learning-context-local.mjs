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
    subject: `Verified lesson ${index}`,
    content: `Verified workflow lesson ${index}: resume the exact existing operation after ambiguous transport state instead of blindly submitting another operation.`,
    verification_status: "HYBRID_VERIFIED_PLATFORM_KNOWLEDGE",
    reusable: true,
    confidence: 0.98,
    verified_at: "2026-09-03T00:00:00.000Z",
    valid_until: "2026-10-03T00:00:00.000Z",
    freshness: "VERIFIED_RETRIEVAL",
    provenance: {
      source: "avantiqo_explicit_final_knowledge_release",
      topic_key: `topic-${index}`,
    },
    sources: [
      { url: `https://example.com/source-${index}-a` },
      { url: `https://example.com/source-${index}-b` },
    ],
    authorization_effect: "NONE",
    ...overrides,
  };
}

function evaluation(overrides = {}) {
  const base = {
    success: true,
    status: "REUSED_VERIFIED_KNOWLEDGE",
    route: "HYBRID_EXPLICIT_FINAL_RELEASE",
    learned_knowledge: {
      evaluated: true,
      status: "REUSED_VERIFIED_KNOWLEDGE",
      knowledge: [knowledge(1)],
      provenance_contracts: [
        "AVANTIQO_KNOWLEDGE_ROUTER_V3",
        "AVANTIQO_HYBRID_KNOWLEDGE_RETRIEVAL_V1",
      ],
      freshness_checked: true,
      evidence_graph_checked: true,
      fresh_research_performed: false,
      stale_knowledge_reused: false,
      knowledge_authorizes_execution: false,
    },
    governance: {
      platform_learning_organization_only: true,
      customer_organization_used_for_platform_knowledge: false,
      customer_private_memory_reused: false,
      explicit_final_release_only: true,
      evidence_graph_checked: true,
      internet_search_performed: false,
      fresh_research_performed: false,
      external_intelligence_provider_used: false,
      database_write_performed: false,
      knowledge_promotion_performed: false,
      authorization_effect: "NONE",
      execution_effect: "NONE",
    },
  };
  return {
    ...base,
    ...overrides,
    learned_knowledge: {
      ...base.learned_knowledge,
      ...(overrides.learned_knowledge || {}),
    },
    governance: {
      ...base.governance,
      ...(overrides.governance || {}),
    },
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

const valid = buildOperatorVerifiedLearningContext(evaluation());
check("valid released experience is available", valid.status === "AVAILABLE");
check("valid context is advisory only", valid.advisory_only === true);
check("valid context never proves current business state", valid.current_business_state_proven === false);
check("valid context never authorizes execution", valid.authorization_effect === "NONE" && valid.execution_effect === "NONE");
check("valid context excludes customer-private reuse", valid.customer_private_memory_reused === false);
check("valid context records evidence graph check", valid.evidence_graph_checked === true);

const canonical = buildOperatorVerifiedLearningContext(evaluation({
  route: "CANONICAL_PRODUCT_KNOWLEDGE",
}));
check("canonical product authority is not mixed into learned experience", canonical.status === "NONE");

const stale = buildOperatorVerifiedLearningContext(evaluation({
  learned_knowledge: { knowledge: [knowledge(1, { freshness: "STALE" })] },
}));
check("stale learned experience is rejected", stale.status === "NONE");

const privateMemory = buildOperatorVerifiedLearningContext(evaluation({
  governance: { customer_private_memory_reused: true },
}));
check("customer-private memory contamination is rejected", privateMemory.status === "NONE");

const wrongOrganization = buildOperatorVerifiedLearningContext(evaluation({
  governance: { customer_organization_used_for_platform_knowledge: true },
}));
check("customer organization cannot become platform learning source", wrongOrganization.status === "NONE");

const uncheckedGraph = buildOperatorVerifiedLearningContext(evaluation({
  governance: { evidence_graph_checked: false },
}));
check("unchecked evidence graph is rejected", uncheckedGraph.status === "NONE");

const noFinalRelease = buildOperatorVerifiedLearningContext(evaluation({
  governance: { explicit_final_release_only: false },
}));
check("non-final learning is rejected", noFinalRelease.status === "NONE");

const internetResearch = buildOperatorVerifiedLearningContext(evaluation({
  governance: { internet_search_performed: true },
}));
check("context loader cannot smuggle live internet research", internetResearch.status === "NONE");

const freshResearch = buildOperatorVerifiedLearningContext(evaluation({
  governance: { fresh_research_performed: true },
}));
check("context loader cannot smuggle fresh research fallback", freshResearch.status === "NONE");

const writeEffect = buildOperatorVerifiedLearningContext(evaluation({
  governance: { database_write_performed: true },
}));
check("learning-context read cannot perform database writes", writeEffect.status === "NONE");

const promotionEffect = buildOperatorVerifiedLearningContext(evaluation({
  governance: { knowledge_promotion_performed: true },
}));
check("learning-context read cannot promote knowledge", promotionEffect.status === "NONE");

const authorization = buildOperatorVerifiedLearningContext(evaluation({
  governance: { authorization_effect: "GRANTED" },
}));
check("authorization-bearing context is rejected", authorization.status === "NONE");

const execution = buildOperatorVerifiedLearningContext(evaluation({
  governance: { execution_effect: "EXECUTE" },
}));
check("execution-bearing context is rejected", execution.status === "NONE");

const knowledgeAuthorization = buildOperatorVerifiedLearningContext(evaluation({
  learned_knowledge: { knowledge_authorizes_execution: true },
}));
check("knowledge can never authorize a mission action", knowledgeAuthorization.status === "NONE");

const oversized = buildOperatorVerifiedLearningContext(evaluation({
  learned_knowledge: {
    knowledge: Array.from({ length: 8 }, (_, index) => knowledge(index + 1, {
      content: `Lesson ${index + 1} ${"x".repeat(850)}`,
    })),
  },
}));
check("context keeps at most four items", oversized.knowledge_count <= 4, `count=${oversized.knowledge_count}`);
check("context respects total character budget", oversized.context_chars <= 2600, `chars=${oversized.context_chars}`);

console.log("AVANTIQO_OPERATOR_VERIFIED_LEARNING_CONTEXT_AUDIT");
console.log(`CHECKS_PASSED=${passes.length}`);
console.log(`CHECKS_FAILED=${failures.length}`);
console.log(`VALID_KNOWLEDGE_COUNT=${valid.knowledge_count}`);
console.log(`VALID_CONTEXT_CHARS=${valid.context_chars}`);
for (const failure of failures) console.error(`FAIL ${failure}`);
if (failures.length) process.exit(1);
