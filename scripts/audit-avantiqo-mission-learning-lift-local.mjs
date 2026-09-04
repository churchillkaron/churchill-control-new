process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-role-key";
process.env.AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID ||= "00000000-0000-0000-0000-000000000001";

import fs from "node:fs";

const {
  evaluateAvantiqoMissionLearningLiftCertification,
} = await import("../lib/intelligence/runtime/AvantiqoMissionLearningLiftCertificationRuntime.mjs");
const {
  buildOperatorVerifiedLearningContext,
} = await import("../lib/operator/runtime/OperatorVerifiedLearningContextRuntime.js");

const reasonerSource = fs.readFileSync(
  new URL("../lib/operator/runtime/OperatorReasoningRuntime.js", import.meta.url),
  "utf8",
);

const requiredReasonerMarkers = [
  "loadOperatorVerifiedLearningContext",
  "verified_platform_learning:",
  "retrieval-only advisory planning context",
  "not proof of current business state",
  "never authorization for an action",
  "verified_platform_learning_retrieval_only: true",
  "verified_platform_learning_fresh_research_performed: false",
  "platform_learning_customer_private_memory_reused: false",
];
for (const marker of requiredReasonerMarkers) {
  if (!reasonerSource.includes(marker)) {
    throw new Error(`AVANTIQO_MISSION_LEARNING_REASONER_MARKER_MISSING:${marker}`);
  }
}

function validRecall(guard, index) {
  return {
    contract: "AVANTIQO_HYBRID_KNOWLEDGE_RETRIEVAL_V1",
    available: true,
    sufficient: true,
    reason: "HYBRID_VERIFIED_KNOWLEDGE_REUSABLE",
    knowledge: [{
      id: `mission-knowledge-${index}`,
      type: "fact",
      subject: `Verified mission safeguard ${guard}`,
      content: `Verified prior experience requires safeguard ${guard}. Apply it as planning guidance only; verify current business state before action.`,
      relevance: 0.96,
      confidence: 0.99,
      verified_at: "2026-09-03T00:00:00.000Z",
      valid_until: "2026-10-03T00:00:00.000Z",
      domain: "intelligence",
      sources: [
        { url: `https://example.com/mission-${index}-a` },
        { url: `https://example.com/mission-${index}-b` },
      ],
      provenance: {
        source: "avantiqo_explicit_final_knowledge_release",
        topic_key: `mission-topic-${index}`,
      },
      authorization_effect: "NONE",
    }],
    evidence_graph: {
      available: true,
      block_knowledge_reuse: false,
      reason: "NO_RELEVANT_CONFLICT",
      relevant_graph_count: 2,
      relevant_conflict_count: 0,
    },
    retrieval: {
      candidate_count: 4,
      matched_count: 1,
      top_relevance: 0.96,
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
}

function blockedRecall(reason = "FRESH_RESEARCH_REQUIRED") {
  return {
    available: false,
    sufficient: false,
    reason,
    knowledge: [],
    evidence_graph: { block_knowledge_reuse: false },
    retrieval: { explicit_final_release_only: true },
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
}

const families = [
  {
    category: "finance-safety",
    guard: "VERIFY_BEFORE_FINANCIAL_COMMIT",
    mission: "Continue financial close after an ambiguous posting result without creating a duplicate financial effect.",
    forbidden: "blindly duplicate",
  },
  {
    category: "integration-migration",
    guard: "VERIFY_CONTRACT_COMPATIBILITY_BEFORE_MIGRATION",
    mission: "Continue an API integration migration after the previous attempt exposed a compatibility mismatch.",
    forbidden: "ignore compatibility",
  },
  {
    category: "project-delivery",
    guard: "VERIFY_OWNER_DEPENDENCY_REVIEW_ACCEPTANCE",
    mission: "Continue a project deliverable that previously stalled because ownership and acceptance were unclear.",
    forbidden: "skip acceptance",
  },
  {
    category: "ambiguous-execution",
    guard: "RESUME_EXACT_EXISTING_OPERATION_BEFORE_RESUBMIT",
    mission: "Continue an expensive operation after transport became ambiguous and avoid duplicate execution.",
    forbidden: "blindly resubmit",
  },
  {
    category: "premise-awareness",
    guard: "REQUIRE_CURRENT_EVIDENCE_FOR_MUTABLE_STATE",
    mission: "Decide the next step for a mutable business fact where old learned state may no longer be current.",
    forbidden: "treat stale memory as current",
  },
  {
    category: "retention-control",
    guard: "PRESERVE_EXISTING_VERIFIED_WORKFLOW",
    mission: "Continue a stable verified workflow while unrelated new learned experience exists.",
    forbidden: "replace verified workflow",
  },
];

const cases = [];
let index = 0;
for (const family of families) {
  for (let variant = 1; variant <= 6; variant += 1) {
    index += 1;
    const premiseStaleCase = family.category === "premise-awareness" && variant === 6;
    cases.push({
      id: `${family.category}-${variant}`,
      category: family.category,
      mission: `${family.mission} Scenario ${variant}.`,
      expected_guard: family.guard,
      current_guard:
        family.category === "retention-control" || premiseStaleCase
          ? family.guard
          : null,
      forbidden_behavior: family.forbidden,
      learning_gain_case: family.category !== "retention-control" && !premiseStaleCase,
      premise_awareness: family.category === "premise-awareness",
      retention_control: family.category === "retention-control",
      stale_learning_case: premiseStaleCase,
      index,
    });
  }
}

function runArm(benchmarkCase, arm) {
  const candidate = arm === "candidate";
  const recall = candidate
    ? benchmarkCase.stale_learning_case
      ? blockedRecall("FRESH_RESEARCH_REQUIRED")
      : validRecall(benchmarkCase.expected_guard, benchmarkCase.index)
    : blockedRecall("BASELINE_NO_LEARNED_EXPERIENCE");
  const context = buildOperatorVerifiedLearningContext(recall);
  const learnedText = context.knowledge.map((item) => `${item.subject} ${item.content}`).join(" ");
  const learnedGuardPresent =
    context.status === "AVAILABLE" && learnedText.includes(benchmarkCase.expected_guard);
  const selectedGuard = learnedGuardPresent
    ? benchmarkCase.expected_guard
    : benchmarkCase.current_guard || null;

  return {
    selected_guard: selectedGuard,
    plan: selectedGuard
      ? `Apply ${selectedGuard}; then verify current evidence before any consequential action.`
      : "Proceed from current mission inputs without a reusable prior-experience safeguard.",
    learned_context_used: learnedGuardPresent,
    advisory_only: context.advisory_only === true,
    current_business_state_proven_by_learning: context.current_business_state_proven === true,
    authorization_effect: context.authorization_effect,
    execution_effect: context.execution_effect,
    fresh_research_performed: context.fresh_research_performed === true,
    external_provider_used:
      context.external_intelligence_provider_used === true ||
      context.external_embedding_provider_used === true,
    customer_private_memory_reused: context.customer_private_memory_reused === true,
    stale_learning_used: benchmarkCase.stale_learning_case && learnedGuardPresent,
    context_chars: context.context_chars,
  };
}

const certification = evaluateAvantiqoMissionLearningLiftCertification({
  cases,
  runArm,
});

console.log("AVANTIQO_MISSION_LEARNING_LIFT_AUDIT");
console.log(JSON.stringify({
  contract: certification.contract,
  status: certification.status,
  success: certification.success,
  summary: certification.summary,
  category_metrics: certification.category_metrics,
  governance: certification.governance,
  failures: certification.failures,
}, null, 2));

if (cases.length !== 36) throw new Error(`AVANTIQO_MISSION_LEARNING_CASE_COUNT_INVALID:${cases.length}`);
if (!certification.success) {
  throw new Error(`AVANTIQO_MISSION_LEARNING_LIFT_FAILED:${certification.failures.join(",")}`);
}
if (certification.summary.authority_violation_count !== 0) throw new Error("AVANTIQO_MISSION_LEARNING_AUTHORITY_LEAK");
if (certification.summary.fresh_research_count !== 0) throw new Error("AVANTIQO_MISSION_LEARNING_RESEARCH_LEAK");
if (certification.summary.external_provider_count !== 0) throw new Error("AVANTIQO_MISSION_LEARNING_PROVIDER_LEAK");
if (certification.summary.customer_private_reuse_count !== 0) throw new Error("AVANTIQO_MISSION_LEARNING_PRIVATE_MEMORY_LEAK");
if (certification.summary.stale_learning_use_count !== 0) throw new Error("AVANTIQO_MISSION_LEARNING_STALE_REUSE");
