import assert from "node:assert/strict";
import test from "node:test";

import {
  AVANTIQO_CODE_MISSION_KNOWLEDGE_UTILITY_REUSE_POLICY_CONTRACT,
  assessAvantiqoCodeMissionKnowledgeUtilityReuse,
  buildAvantiqoCodeMissionKnowledgeUtilityPattern,
  evaluateAvantiqoCodeMissionKnowledgeUtilityReuse,
} from "../lib/intelligence/runtime/AvantiqoCodeMissionKnowledgeUtilityReusePolicyRuntime.js";
import {
  prepareAvantiqoIntelligenceCodeMission,
} from "../lib/intelligence/runtime/AvantiqoIntelligenceCodeMissionPreparationRuntime.js";

const HEAD = "c".repeat(40);
const CODE_CAPABILITY = "platform.code_ai_autonomous.execute";

function hybridKnowledge() {
  return {
    evaluated: true,
    status: "REUSED_VERIFIED_KNOWLEDGE",
    knowledge: [{
      id: "released-knowledge-utility-1",
      subject: "Reuse canonical runtime primitives",
      content: "Extend the existing governed runtime rather than creating a parallel subsystem.",
      verification_status: "HYBRID_VERIFIED_PLATFORM_KNOWLEDGE",
      reusable: true,
      confidence: 0.94,
      verified_at: "2026-08-28T00:00:00.000Z",
      provenance: {
        topic_key: "code:canonical-runtime-reuse",
        source: "avantiqo_explicit_final_knowledge_release",
      },
      sources: [],
    }],
    provenance_contracts: ["AVANTIQO_KNOWLEDGE_ROUTER_V3"],
    freshness_checked: true,
    evidence_graph_checked: true,
    fresh_research_performed: false,
    stale_knowledge_reused: false,
    knowledge_authorizes_execution: false,
  };
}

function canonicalKnowledge() {
  return {
    ...hybridKnowledge(),
    knowledge: [{
      id: "canonical-product-1",
      subject: "Current Avantiqo product state",
      content: "Canonical product state remains authoritative.",
      verification_status: "AVANTIQO_CANONICAL_PRODUCT",
      reusable: true,
      confidence: 1,
      provenance: {
        authority: "AVANTIQO_CANONICAL_PRODUCT",
        internal_reference: "ERP_REGISTRY",
      },
      sources: [],
    }],
  };
}

function utilitySummaryFor(learnedKnowledge, overrides = {}) {
  const pattern = buildAvantiqoCodeMissionKnowledgeUtilityPattern({
    learned_knowledge: learnedKnowledge,
  });
  assert.equal(pattern.applicable, true);
  return {
    contract: "AVANTIQO_KNOWLEDGE_UTILITY_ATTRIBUTION_V1",
    available: true,
    summaries: [{
      receipt_fingerprint: pattern.receipt_fingerprint,
      capability_key: CODE_CAPABILITY,
      total_observations: 12,
      distinct_observation_days: 5,
      verified_success_count: 2,
      verified_failure_count: 10,
      smoothed_success_rate: 0.25,
      signal_eligible: true,
      signal: "NEGATIVE_ASSOCIATION",
      relationship: "OBSERVATIONAL_ASSOCIATION_ONLY",
      causal_attribution_allowed: false,
      ...overrides,
    }],
  };
}

function repositoryAssessment() {
  return {
    contract: "AVANTIQO_PRODUCT_REPOSITORY_ASSESSMENT_V1",
    status: "REPOSITORY_ASSESSMENT_ONLY_NOT_CERTIFICATION",
    repository_snapshot: {
      generated_at: "2026-08-29T05:45:00.000Z",
      repository_url: "https://github.com/churchillkaron/churchill-control-new.git",
      ref: "main",
      current_main_head: HEAD,
      clean_checkout: true,
      tracked_file_count: 7000,
      requested_focus: "Extend the existing governed runtime.",
      bounded_repository_evidence: true,
      dynamic_repository_evidence: true,
      cross_surface_repository_evidence: true,
      full_repository_certification: false,
      evidence_files: [],
      dynamic_evidence_expansion: { files: [] },
    },
    assessment: {
      executive_summary: "Current repository inspected.",
      repository_observations: [],
      gaps: [],
      completion_criteria: [],
    },
    objective_selection: {
      selected_objective: "Extend the existing governed runtime.",
      selected_evidence_paths: [],
      selected_completion_criteria: [],
    },
    evidence_limits: [],
  };
}

test("mature negative exact-pattern utility suppresses hybrid released knowledge for Code", () => {
  const learned = hybridKnowledge();
  const result = assessAvantiqoCodeMissionKnowledgeUtilityReuse({
    learned_knowledge: learned,
    utility_summary: utilitySummaryFor(learned),
  });

  assert.equal(result.contract, AVANTIQO_CODE_MISSION_KNOWLEDGE_UTILITY_REUSE_POLICY_CONTRACT);
  assert.equal(result.status, "MATURE_NEGATIVE_ASSOCIATION_SUPPRESSED_REUSE");
  assert.equal(result.block_reuse, true);
  assert.equal(result.matched_signal, "NEGATIVE_ASSOCIATION");
  assert.equal(result.learned_knowledge.status, "NO_RELEVANT_VERIFIED_KNOWLEDGE");
  assert.deepEqual(result.learned_knowledge.knowledge, []);
  assert.equal(result.governance.single_observation_changes_reuse, false);
  assert.equal(result.governance.canonical_product_authority_affected, false);
  assert.equal(result.governance.automatic_knowledge_promotion, false);
});

test("insufficient, positive, and mixed utility never grant authority or suppress released knowledge", () => {
  const learned = hybridKnowledge();
  const insufficient = assessAvantiqoCodeMissionKnowledgeUtilityReuse({
    learned_knowledge: learned,
    utility_summary: utilitySummaryFor(learned, {
      total_observations: 1,
      distinct_observation_days: 1,
      signal_eligible: false,
      signal: "INSUFFICIENT_OBSERVATIONS",
    }),
  });
  assert.equal(insufficient.block_reuse, false);
  assert.equal(insufficient.learned_knowledge.knowledge.length, 1);

  for (const signal of ["POSITIVE_ASSOCIATION", "MIXED_ASSOCIATION"]) {
    const result = assessAvantiqoCodeMissionKnowledgeUtilityReuse({
      learned_knowledge: learned,
      utility_summary: utilitySummaryFor(learned, { signal }),
    });
    assert.equal(result.block_reuse, false);
    assert.equal(result.learned_knowledge.knowledge.length, 1);
    assert.equal(result.governance.positive_association_grants_authority, false);
    assert.equal(result.governance.mixed_association_grants_authority, false);
  }
});

test("canonical product knowledge bypasses utility suppression", () => {
  const result = assessAvantiqoCodeMissionKnowledgeUtilityReuse({
    learned_knowledge: canonicalKnowledge(),
    utility_summary: {
      available: true,
      summaries: [{ signal_eligible: true, signal: "NEGATIVE_ASSOCIATION" }],
    },
  });
  assert.equal(result.applicable, false);
  assert.equal(result.block_reuse, false);
  assert.equal(result.status, "NOT_APPLICABLE_CANONICAL_PRODUCT_AUTHORITY");
  assert.equal(result.learned_knowledge.knowledge.length, 1);
});

test("utility read failure fails open to already governed released knowledge", async () => {
  const learned = hybridKnowledge();
  const result = await evaluateAvantiqoCodeMissionKnowledgeUtilityReuse({
    learned_knowledge: learned,
    summarize_utility: async () => {
      throw new Error("temporary utility read failure");
    },
  });
  assert.equal(result.status, "UTILITY_SUMMARY_READ_FAILED_ALLOW_RELEASED_KNOWLEDGE");
  assert.equal(result.block_reuse, false);
  assert.equal(result.learned_knowledge.knowledge.length, 1);
  assert.equal(result.governance.utility_read_failure_can_block_reuse, false);
});

test("mission preparation applies mature negative utility before Code consumes learned knowledge", async () => {
  const learned = hybridKnowledge();
  let utilityCalls = 0;
  const result = await prepareAvantiqoIntelligenceCodeMission({
    mission: {
      id: "mission-utility-suppression",
      objective: "Extend the existing governed runtime.",
      business_intent: "Reuse only knowledge that remains safe under mature utility evidence.",
    },
    complexity_class: "medium",
    dependencies: {
      evaluateReusableKnowledge: async () => ({
        status: "REUSED_VERIFIED_KNOWLEDGE",
        learned_knowledge: learned,
      }),
      evaluateKnowledgeUtilityReuse: async ({ learned_knowledge }) => {
        utilityCalls += 1;
        return assessAvantiqoCodeMissionKnowledgeUtilityReuse({
          learned_knowledge,
          utility_summary: utilitySummaryFor(learned_knowledge),
        });
      },
      assessRepository: async () => repositoryAssessment(),
    },
  });

  assert.equal(utilityCalls, 1);
  assert.equal(result.status, "READY_FOR_CODE");
  assert.equal(result.knowledge_utility_reuse_policy.block_reuse, true);
  assert.equal(result.mission_context.learned_knowledge.status, "NO_RELEVANT_VERIFIED_KNOWLEDGE");
  assert.equal(result.mission_context.learned_knowledge.knowledge.length, 0);
  assert.equal(result.governance.mature_negative_utility_can_suppress_hybrid_reuse, true);
  assert.equal(result.governance.canonical_product_authority_affected_by_utility, false);
  assert.equal(result.governance.web_research_automatically_performed, false);
  assert.equal(result.governance.database_write_performed, false);
});
