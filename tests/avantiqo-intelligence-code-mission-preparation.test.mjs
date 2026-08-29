import assert from "node:assert/strict";
import test from "node:test";

import {
  AVANTIQO_INTELLIGENCE_CODE_MISSION_PREPARATION_CONTRACT,
  prepareAvantiqoIntelligenceCodeMission,
} from "../lib/intelligence/runtime/AvantiqoIntelligenceCodeMissionPreparationRuntime.js";
import {
  AVANTIQO_INTELLIGENCE_CODE_MISSION_CONTRACT,
  createAvantiqoIntelligenceCodeMissionContext,
} from "../lib/intelligence/runtime/AvantiqoIntelligenceCodeMissionRuntime.js";

const HEAD = "b".repeat(40);
const MISSION = {
  id: "mission-unified-preparation",
  objective: "Extend Avantiqo through the existing canonical Intelligence and Code architecture.",
  business_intent: "Keep one governed Intelligence ecosystem without duplicate planners or memory systems.",
};

function repositoryAssessment(head = HEAD) {
  return {
    contract: "AVANTIQO_PRODUCT_REPOSITORY_ASSESSMENT_V1",
    status: "REPOSITORY_ASSESSMENT_ONLY_NOT_CERTIFICATION",
    repository_snapshot: {
      generated_at: "2026-08-29T04:00:00.000Z",
      repository_url: "https://github.com/churchillkaron/churchill-control-new.git",
      ref: "main",
      current_main_head: head,
      clean_checkout: true,
      tracked_file_count: 7000,
      requested_focus: MISSION.objective,
      bounded_repository_evidence: true,
      dynamic_repository_evidence: true,
      cross_surface_repository_evidence: true,
      full_repository_certification: false,
      evidence_files: [{
        file_path: "lib/intelligence/runtime/AvantiqoIntelligenceCodeMissionRuntime.js",
        found: true,
        start_line: 1,
        end_line: 100,
        total_lines: 400,
        content: "export const AVANTIQO_INTELLIGENCE_CODE_MISSION_CONTRACT = 'AVANTIQO_INTELLIGENCE_CODE_MISSION_V1';",
      }],
      dynamic_evidence_expansion: { files: [] },
    },
    assessment: {
      executive_summary: "Current canonical Intelligence mission runtime exists.",
      repository_observations: ["Unified mission contract is present."],
      gaps: [],
      completion_criteria: ["Preserve the canonical mission contract."],
    },
    objective_selection: {
      selected_objective: MISSION.objective,
      selected_evidence_paths: [
        "lib/intelligence/runtime/AvantiqoIntelligenceCodeMissionRuntime.js",
      ],
      selected_completion_criteria: ["Preserve the canonical mission contract."],
    },
    evidence_limits: ["Bounded repository assessment is not full certification."],
  };
}

function reusableKnowledge() {
  return {
    evaluated: true,
    status: "REUSED_VERIFIED_KNOWLEDGE",
    knowledge: [{
      id: "knowledge-1",
      subject: "Unified Intelligence architecture",
      content: "Reuse the existing canonical mission and learning handoff runtimes.",
      verification_status: "HYBRID_VERIFIED_PLATFORM_KNOWLEDGE",
      reusable: true,
      confidence: 0.95,
      verified_at: "2026-08-28T00:00:00.000Z",
      provenance: { source: "avantiqo_explicit_final_knowledge_release" },
      sources: [{ url: "https://example.com/evidence" }],
    }],
    provenance_contracts: [
      "AVANTIQO_KNOWLEDGE_ROUTER_V3",
      "AVANTIQO_HYBRID_KNOWLEDGE_RETRIEVAL_V1",
    ],
    freshness_checked: true,
    evidence_graph_checked: true,
    fresh_research_performed: false,
    stale_knowledge_reused: false,
    knowledge_authorizes_execution: false,
  };
}

function completeSystemReasoning() {
  return {
    reasoning_scope: ["architecture", "cross-system impact"],
    architecture_recommendation:
      "Extend the existing unified Intelligence mission preparation and Code execution path rather than creating another planner.",
    future_predictable_requirements: [
      "Additional Code entrypoints can consume the same canonical prepared mission context.",
    ],
    impact_graph: {
      nodes: ["learning", "general", "code"],
      edges: [
        { from: "learning", to: "general" },
        { from: "general", to: "code" },
      ],
    },
    affected_domains: ["intelligence", "platform"],
    affected_capabilities: ["code_ai_autonomous"],
    shared_primitives: ["AVANTIQO_INTELLIGENCE_CODE_MISSION_V1"],
    domain_ownership: [{ owner: "intelligence", primitive: "mission-context" }],
    data_lifecycle_implications: [],
    api_contracts: [],
    security_permissions: ["Knowledge cannot authorize writes."],
    business_accounting_invariants: [],
    integration_implications: [],
    backward_compatibility: ["Legacy Code calls remain valid."],
    performance_implications: ["Simple missions skip Learning retrieval."],
    reporting_analytics_implications: [],
    automation_ai_hooks: [],
    expensive_to_change_decisions: ["One canonical mission contract."],
    invariants: [
      "Current repository state remains execution authority.",
      "No automatic knowledge promotion occurs.",
    ],
    risks: [],
    completion_criteria: [
      "Large missions reach Code through one reconciled canonical mission context.",
    ],
    verification_requirements: [
      "Run deterministic mission preparation and Code handoff contract tests.",
    ],
  };
}

function largeMissionContext(learnedKnowledge = reusableKnowledge()) {
  return createAvantiqoIntelligenceCodeMissionContext({
    mission: MISSION,
    complexity: {
      class: "large",
      classification_source: "GENERAL_INTELLIGENCE_SIGNIFICANT_CODE_MISSION",
    },
    learned_knowledge: learnedKnowledge,
    repository_context: {
      repository_url: "https://github.com/churchillkaron/churchill-control-new.git",
      ref: "main",
      head_sha: HEAD,
      observed_at: "2026-08-29T04:00:00.000Z",
    },
    system_reasoning: completeSystemReasoning(),
  });
}

test("simple mission skips Learning and General but still binds exact repository authority", async () => {
  let knowledgeCalls = 0;
  let generalCalls = 0;
  let assessmentCalls = 0;
  const result = await prepareAvantiqoIntelligenceCodeMission({
    mission: MISSION,
    complexity_class: "simple",
    dependencies: {
      evaluateReusableKnowledge: async () => {
        knowledgeCalls += 1;
        throw new Error("must not be called");
      },
      runSystemReasoning: async () => {
        generalCalls += 1;
        throw new Error("must not be called");
      },
      assessRepository: async () => {
        assessmentCalls += 1;
        return repositoryAssessment();
      },
    },
  });

  assert.equal(result.contract, AVANTIQO_INTELLIGENCE_CODE_MISSION_PREPARATION_CONTRACT);
  assert.equal(result.status, "READY_FOR_CODE");
  assert.equal(result.route, "DIRECT_CODE_AFTER_REPOSITORY_ASSESSMENT");
  assert.equal(result.mission_context.contract, AVANTIQO_INTELLIGENCE_CODE_MISSION_CONTRACT);
  assert.equal(result.mission_context.complexity.class, "simple");
  assert.equal(result.mission_context.learned_knowledge.status, "NOT_EVALUATED");
  assert.equal(result.mission_context.repository_context.head_sha, HEAD);
  assert.equal(knowledgeCalls, 0);
  assert.equal(generalCalls, 0);
  assert.equal(assessmentCalls, 1);
  assert.equal(result.governance.simple_learning_retrieval_skipped, true);
  assert.equal(result.governance.web_research_automatically_performed, false);
});

test("medium mission evaluates reusable Learning once and does not invoke General", async () => {
  let knowledgeCalls = 0;
  let generalCalls = 0;
  const result = await prepareAvantiqoIntelligenceCodeMission({
    mission: MISSION,
    complexity_class: "medium",
    dependencies: {
      evaluateReusableKnowledge: async ({ payload }) => {
        knowledgeCalls += 1;
        assert.equal(payload.query, MISSION.objective);
        return {
          learned_knowledge: reusableKnowledge(),
          status: "REUSED_VERIFIED_KNOWLEDGE",
        };
      },
      runSystemReasoning: async () => {
        generalCalls += 1;
        throw new Error("must not be called");
      },
      assessRepository: async () => repositoryAssessment(),
    },
  });

  assert.equal(result.route, "LEARNING_THEN_CODE_AFTER_REPOSITORY_ASSESSMENT");
  assert.equal(result.mission_context.complexity.class, "medium");
  assert.equal(result.mission_context.learned_knowledge.status, "REUSED_VERIFIED_KNOWLEDGE");
  assert.equal(result.mission_context.learned_knowledge.knowledge.length, 1);
  assert.equal(result.general_system_reasoning.performed, false);
  assert.equal(knowledgeCalls, 1);
  assert.equal(generalCalls, 0);
  assert.equal(result.governance.reusable_knowledge_evaluation_performed, true);
});

test("large mission evaluates Learning once and invokes the existing General runtime once", async () => {
  let knowledgeCalls = 0;
  let generalCalls = 0;
  let assessmentCalls = 0;
  const learnedKnowledge = reusableKnowledge();
  const result = await prepareAvantiqoIntelligenceCodeMission({
    mission: MISSION,
    complexity_class: "large",
    dependencies: {
      evaluateReusableKnowledge: async () => {
        knowledgeCalls += 1;
        return { learned_knowledge: learnedKnowledge };
      },
      assessRepository: async () => {
        assessmentCalls += 1;
        throw new Error("preparer must not duplicate General repository assessment");
      },
      runSystemReasoning: async ({ mission, learned_knowledge }) => {
        generalCalls += 1;
        assert.deepEqual(mission, MISSION);
        assert.equal(learned_knowledge.status, "REUSED_VERIFIED_KNOWLEDGE");
        return {
          contract: "AVANTIQO_INTELLIGENCE_CODE_MISSION_SYSTEM_REASONING_V1",
          status: "READY_FOR_CODE",
          mission_context: largeMissionContext(learned_knowledge),
          repository_assessment: {
            current_main_head: HEAD,
            observed_at: "2026-08-29T04:00:00.000Z",
          },
        };
      },
    },
  });

  assert.equal(result.route, "LEARNING_THEN_GENERAL_THEN_CODE");
  assert.equal(result.mission_context.complexity.class, "large");
  assert.equal(result.mission_context.system_reasoning.architecture_recommendation.length > 0, true);
  assert.equal(result.general_system_reasoning.performed, true);
  assert.equal(knowledgeCalls, 1);
  assert.equal(generalCalls, 1);
  assert.equal(assessmentCalls, 0);
  assert.equal(result.governance.code_execution_started, false);
  assert.equal(result.governance.knowledge_promotion_performed, false);
});

test("preparation fails closed without explicit complexity or with non-full repository lineage", async () => {
  await assert.rejects(
    prepareAvantiqoIntelligenceCodeMission({
      mission: MISSION,
      dependencies: { assessRepository: async () => repositoryAssessment() },
    }),
    /AVANTIQO_INTELLIGENCE_CODE_MISSION_PREPARATION_COMPLEXITY_REQUIRED/,
  );

  await assert.rejects(
    prepareAvantiqoIntelligenceCodeMission({
      mission: MISSION,
      complexity_class: "simple",
      dependencies: {
        assessRepository: async () => repositoryAssessment("abc1234"),
      },
    }),
    /AVANTIQO_INTELLIGENCE_CODE_MISSION_PREPARATION_FULL_REPOSITORY_HEAD_REQUIRED/,
  );
});
