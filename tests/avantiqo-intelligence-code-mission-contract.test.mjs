import assert from "node:assert/strict";
import test from "node:test";

import {
  AVANTIQO_CODE_MISSION_LEARNING_FEEDBACK_CONTRACT,
  AVANTIQO_INTELLIGENCE_CODE_MISSION_CONTRACT,
  createAvantiqoCodeMissionLearningFeedback,
  createAvantiqoIntelligenceCodeMissionContext,
} from "../lib/intelligence/runtime/AvantiqoIntelligenceCodeMissionRuntime.js";

const HEAD = "a".repeat(40);

function repositoryContext() {
  return {
    repository_url: "https://github.com/example/avantiqo",
    ref: "main",
    head_sha: HEAD,
    observed_at: "2026-08-29T00:00:00.000Z",
  };
}

function baseMission(complexity = "simple") {
  return {
    mission: {
      id: `mission-${complexity}`,
      objective: "Implement the requested Avantiqo change end-to-end.",
      business_intent: "Deliver a correct maintainable platform capability.",
    },
    complexity_class: complexity,
    repository_context: repositoryContext(),
  };
}

function evaluatedKnowledge(status = "NO_RELEVANT_VERIFIED_KNOWLEDGE") {
  return {
    evaluated: true,
    status,
    knowledge: [],
    freshness_checked: true,
    evidence_graph_checked: true,
    fresh_research_performed: status === "FRESH_RESEARCH_REQUIRED",
  };
}

function completeSystemReasoning() {
  return {
    reasoning_scope: [
      "architecture",
      "domain ownership",
      "data",
      "apis",
      "security",
      "backward compatibility",
    ],
    architecture_recommendation:
      "Extend the existing shared platform primitive rather than creating a parallel subsystem.",
    future_predictable_requirements: [
      "The primitive must remain extensible without changing its fundamental identity.",
    ],
    impact_graph: {
      nodes: ["shared-runtime", "domain-capability", "verification"],
      edges: [
        ["shared-runtime", "domain-capability"],
        ["domain-capability", "verification"],
      ],
    },
    affected_domains: ["platform"],
    shared_primitives: ["existing-shared-runtime"],
    domain_ownership: [{ domain: "platform", owns: "shared-runtime" }],
    invariants: [
      "Current repository state remains authoritative.",
      "No duplicate platform primitive is introduced.",
    ],
    completion_criteria: [
      "The capability works end-to-end through the canonical architecture.",
    ],
    verification_requirements: [
      "Run deterministic targeted tests and inspect the final diff.",
    ],
  };
}

test("simple Code mission does not require General reasoning or learned knowledge", () => {
  const context = createAvantiqoIntelligenceCodeMissionContext(baseMission("simple"));

  assert.equal(context.contract, AVANTIQO_INTELLIGENCE_CODE_MISSION_CONTRACT);
  assert.equal(context.status, "READY_FOR_CODE");
  assert.equal(context.complexity.general_system_reasoning_required, false);
  assert.equal(context.complexity.learned_knowledge_required, false);
  assert.equal(context.repository_context.current_repository_is_execution_authority, true);
  assert.equal(context.repository_context.reconcile_again_before_mutation, true);
  assert.equal(context.code_execution.implementation_mode, "BATCHED_WORK_PACKAGES");
  assert.deepEqual(context.code_execution.normal_reasoning_call_target, { min: 1, max: 4 });
});

test("medium mission requires shared knowledge evaluation but not General system reasoning", () => {
  assert.throws(
    () => createAvantiqoIntelligenceCodeMissionContext(baseMission("medium")),
    /AVANTIQO_INTELLIGENCE_CODE_MISSION_KNOWLEDGE_EVALUATION_REQUIRED/,
  );

  const context = createAvantiqoIntelligenceCodeMissionContext({
    ...baseMission("medium"),
    learned_knowledge: evaluatedKnowledge(),
  });
  assert.equal(context.status, "READY_FOR_CODE");
  assert.equal(context.complexity.general_system_reasoning_required, false);
  assert.equal(context.complexity.learned_knowledge_required, true);
});

test("fresh research requirement fails closed until fresh research is performed", () => {
  const input = {
    ...baseMission("medium"),
    learned_knowledge: {
      ...evaluatedKnowledge("FRESH_RESEARCH_REQUIRED"),
      fresh_research_performed: false,
    },
  };

  assert.throws(
    () => createAvantiqoIntelligenceCodeMissionContext(input),
    /AVANTIQO_INTELLIGENCE_CODE_MISSION_FRESH_RESEARCH_REQUIRED_BEFORE_CODE/,
  );

  input.learned_knowledge.fresh_research_performed = true;
  assert.equal(
    createAvantiqoIntelligenceCodeMissionContext(input).status,
    "READY_FOR_CODE",
  );
});

test("unverified knowledge cannot claim reusable authority", () => {
  assert.throws(
    () => createAvantiqoIntelligenceCodeMissionContext({
      ...baseMission("medium"),
      learned_knowledge: {
        evaluated: true,
        status: "REUSED_VERIFIED_KNOWLEDGE",
        freshness_checked: true,
        knowledge: [{
          content: "A model suggested this pattern.",
          verification_status: "MODEL_OUTPUT_ONLY",
          reusable: true,
        }],
      },
    }),
    /AVANTIQO_INTELLIGENCE_CODE_MISSION_KNOWLEDGE_NOT_VERIFIED/,
  );
});

test("large mission fails closed without complete General system reasoning", () => {
  const common = {
    ...baseMission("large"),
    learned_knowledge: evaluatedKnowledge(),
  };

  assert.throws(
    () => createAvantiqoIntelligenceCodeMissionContext(common),
    /AVANTIQO_INTELLIGENCE_CODE_MISSION_GENERAL_SYSTEM_REASONING_REQUIRED/,
  );

  assert.throws(
    () => createAvantiqoIntelligenceCodeMissionContext({
      ...common,
      system_reasoning: {
        ...completeSystemReasoning(),
        impact_graph: {},
      },
    }),
    /AVANTIQO_INTELLIGENCE_CODE_MISSION_IMPACT_GRAPH_REQUIRED/,
  );

  const context = createAvantiqoIntelligenceCodeMissionContext({
    ...common,
    system_reasoning: completeSystemReasoning(),
  });
  assert.equal(context.status, "READY_FOR_CODE");
  assert.equal(context.complexity.general_system_reasoning_required, true);
  assert.equal(
    context.system_reasoning.future_proof_architecture_not_feature_count,
    true,
  );
  assert.equal(context.governance.one_avantiqo_intelligence_ecosystem, true);
});

test("verified Code result becomes a learning candidate, never trusted knowledge directly", () => {
  const missionContext = createAvantiqoIntelligenceCodeMissionContext({
    ...baseMission("large"),
    learned_knowledge: evaluatedKnowledge(),
    system_reasoning: completeSystemReasoning(),
  });

  const feedback = createAvantiqoCodeMissionLearningFeedback({
    mission_context: missionContext,
    verified_result: {
      verified: true,
      repository_head_verified: HEAD,
      verification_evidence: [
        { command: "node --test", passed: true },
        { check: "final-diff", passed: true },
      ],
    },
    learning: {
      alternatives_rejected: ["parallel duplicate runtime"],
      dependencies_discovered: ["shared-runtime"],
      files_components_involved: ["lib/example.js", "tests/example.test.mjs"],
      tests_that_mattered: ["targeted contract test"],
      approaches_that_did_not_work: ["one-file local patch"],
      boundary_conditions: ["shared contracts require cross-system verification"],
    },
  });

  assert.equal(feedback.contract, AVANTIQO_CODE_MISSION_LEARNING_FEEDBACK_CONTRACT);
  assert.equal(feedback.status, "LEARNING_EVIDENCE_CANDIDATE_READY");
  assert.equal(feedback.eligible_for_learning_review, true);
  assert.equal(feedback.epistemic_state, "EVIDENCE_CANDIDATE_NOT_RELEASED");
  assert.equal(feedback.reusable_platform_knowledge, false);
  assert.equal(feedback.knowledge_router_reuse_allowed, false);
  assert.equal(feedback.automatic_knowledge_promotion, false);
  assert.equal(feedback.learning_path.direct_trusted_knowledge_write_allowed, false);
  assert.equal(feedback.learning_path.explicit_governed_release_required, true);
  assert.deepEqual(feedback.candidate.alternatives_rejected, ["parallel duplicate runtime"]);
});

test("unverified Code result cannot enter learning review", () => {
  const missionContext = createAvantiqoIntelligenceCodeMissionContext(baseMission("simple"));
  const feedback = createAvantiqoCodeMissionLearningFeedback({
    mission_context: missionContext,
    verified_result: {
      verified: false,
      verification_evidence: [],
    },
  });

  assert.equal(feedback.status, "NOT_ELIGIBLE_UNVERIFIED_RESULT");
  assert.equal(feedback.eligible_for_learning_review, false);
  assert.equal(feedback.candidate, null);
  assert.equal(feedback.reusable_platform_knowledge, false);
});
