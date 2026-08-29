import assert from "node:assert/strict";
import test from "node:test";

import {
  createAvantiqoIntelligenceCodeMissionContext,
} from "../lib/intelligence/runtime/AvantiqoIntelligenceCodeMissionRuntime.js";
import {
  bindAvantiqoIntelligenceCodeMissionExecution,
  AVANTIQO_INTELLIGENCE_CODE_MISSION_EXECUTION_BINDING_CONTRACT,
} from "../lib/intelligence/runtime/AvantiqoIntelligenceCodeMissionExecutionBindingRuntime.js";

const HEAD = "a".repeat(40);
const REPOSITORY = "https://github.com/example/avantiqo";
const OBJECTIVE = "Implement the requested Avantiqo capability end-to-end.";

function repositoryContext() {
  return {
    repository_url: REPOSITORY,
    ref: "main",
    head_sha: HEAD,
    observed_at: "2026-08-29T00:00:00.000Z",
  };
}

function knowledgeContext() {
  return {
    evaluated: true,
    status: "REUSED_VERIFIED_KNOWLEDGE",
    freshness_checked: true,
    evidence_graph_checked: true,
    knowledge: [{
      id: "knowledge-shared-runtime",
      subject: "Shared runtime reuse",
      content: "Extend the canonical shared primitive instead of creating a parallel subsystem.",
      verification_status: "RELEASED_MONITORED",
      reusable: true,
      confidence: 0.98,
    }],
  };
}

function systemReasoning() {
  return {
    reasoning_scope: ["architecture", "security", "data", "verification"],
    architecture_recommendation:
      "Extend the existing shared platform runtime and keep one canonical owner.",
    future_predictable_requirements: ["The shared runtime must remain extensible."],
    impact_graph: {
      nodes: ["shared-runtime", "code-capability", "learning"],
      edges: [["shared-runtime", "code-capability"], ["code-capability", "learning"]],
    },
    affected_domains: ["platform"],
    affected_capabilities: ["platform.code_ai_autonomous.execute"],
    shared_primitives: ["existing-shared-runtime"],
    domain_ownership: [{ domain: "platform", owns: "shared-runtime" }],
    invariants: [
      "Current repository state remains authoritative.",
      "No duplicate platform primitive is introduced.",
    ],
    completion_criteria: [
      "The capability remains on the canonical shared runtime.",
      "Deterministic verification proves the integrated behavior.",
    ],
    verification_requirements: [
      "Run targeted tests and inspect the final diff.",
    ],
  };
}

function canonicalLargeMission() {
  return createAvantiqoIntelligenceCodeMissionContext({
    mission: {
      id: "mission-unified-code-execution",
      objective: OBJECTIVE,
      business_intent: "Ship one coherent verified platform implementation.",
    },
    complexity_class: "large",
    repository_context: repositoryContext(),
    learned_knowledge: knowledgeContext(),
    system_reasoning: systemReasoning(),
  });
}

test("canonical unified mission binds Learning and General context into existing Code execution", () => {
  const binding = bindAvantiqoIntelligenceCodeMissionExecution({
    mission_context: canonicalLargeMission(),
    objective: OBJECTIVE,
    repository_url: `${REPOSITORY}.git`,
    ref: "main",
    objective_context: {
      completion_criterion_1: "Preserve the existing public API.",
    },
  });

  assert.equal(binding.contract, AVANTIQO_INTELLIGENCE_CODE_MISSION_EXECUTION_BINDING_CONTRACT);
  assert.equal(binding.status, "BOUND_FOR_CODE_EXECUTION");
  assert.equal(binding.repository.expected_head, HEAD);
  assert.equal(binding.repository.pre_mutation_reconciliation_required, true);
  assert.equal(binding.objective_context.repository_head_observed, HEAD);
  assert.match(binding.code_objective, /AVANTIQO UNIFIED INTELLIGENCE CONTEXT/);
  assert.match(binding.code_objective, /existing shared platform runtime/i);
  assert.match(binding.code_objective, /existing-shared-runtime/);
  assert.match(binding.code_objective, /verified reusable knowledge/i);
  assert.ok(binding.code_objective.length <= 5000);
  assert.equal(binding.context_consumption.learned_knowledge_evaluated, true);
  assert.equal(binding.context_consumption.reusable_knowledge_item_count, 1);
  assert.equal(binding.context_consumption.general_system_reasoning_consumed, true);
  assert.equal(binding.context_consumption.general_completion_criteria_bound, 2);
  assert.equal(binding.context_consumption.additional_reasoning_call_required, false);
  assert.equal(binding.governance.model_call_performed, false);
  assert.equal(binding.governance.provider_call_performed, false);
  assert.equal(binding.governance.source_mutation_performed, false);
  assert.equal(binding.governance.database_write_performed, false);

  const criteria = [1, 2, 3, 4, 5, 6]
    .map((index) => binding.objective_context[`completion_criterion_${index}`])
    .filter(Boolean);
  assert.ok(criteria.includes("Preserve the existing public API."));
  assert.ok(criteria.includes("The capability remains on the canonical shared runtime."));
  assert.ok(criteria.includes("Deterministic verification proves the integrated behavior."));
});

test("simple unified mission adds no fake General reasoning and still binds exact repository head", () => {
  const mission = createAvantiqoIntelligenceCodeMissionContext({
    mission: { id: "mission-simple", objective: OBJECTIVE },
    complexity_class: "simple",
    repository_context: repositoryContext(),
  });
  const binding = bindAvantiqoIntelligenceCodeMissionExecution({
    mission_context: mission,
    objective: OBJECTIVE,
    repository_url: REPOSITORY,
    ref: "main",
  });

  assert.equal(binding.objective_context.repository_head_observed, HEAD);
  assert.equal(binding.context_consumption.general_system_reasoning_consumed, false);
  assert.equal(binding.context_consumption.reusable_knowledge_item_count, 0);
  assert.equal(binding.context_consumption.additional_reasoning_call_required, false);
});

test("execution binding fails closed on objective, repository, ref, or repository-head conflict", () => {
  const mission = canonicalLargeMission();

  assert.throws(
    () => bindAvantiqoIntelligenceCodeMissionExecution({
      mission_context: mission,
      objective: "Different objective",
      repository_url: REPOSITORY,
      ref: "main",
    }),
    /AVANTIQO_INTELLIGENCE_CODE_MISSION_EXECUTION_OBJECTIVE_MISMATCH/,
  );
  assert.throws(
    () => bindAvantiqoIntelligenceCodeMissionExecution({
      mission_context: mission,
      objective: OBJECTIVE,
      repository_url: "https://github.com/example/different",
      ref: "main",
    }),
    /AVANTIQO_INTELLIGENCE_CODE_MISSION_EXECUTION_REPOSITORY_MISMATCH/,
  );
  assert.throws(
    () => bindAvantiqoIntelligenceCodeMissionExecution({
      mission_context: mission,
      objective: OBJECTIVE,
      repository_url: REPOSITORY,
      ref: "different-ref",
    }),
    /AVANTIQO_INTELLIGENCE_CODE_MISSION_EXECUTION_REF_MISMATCH/,
  );
  assert.throws(
    () => bindAvantiqoIntelligenceCodeMissionExecution({
      mission_context: mission,
      objective: OBJECTIVE,
      repository_url: REPOSITORY,
      ref: "main",
      objective_context: { repository_head_observed: "b".repeat(40) },
    }),
    /AVANTIQO_INTELLIGENCE_CODE_MISSION_EXECUTION_OBJECTIVE_CONTEXT_HEAD_MISMATCH/,
  );
});

test("public unified execution requires an exact full repository head", () => {
  const mission = createAvantiqoIntelligenceCodeMissionContext({
    mission: { id: "mission-short-head", objective: OBJECTIVE },
    complexity_class: "simple",
    repository_context: {
      ...repositoryContext(),
      head_sha: "abcdef1",
    },
  });

  assert.throws(
    () => bindAvantiqoIntelligenceCodeMissionExecution({
      mission_context: mission,
      objective: OBJECTIVE,
      repository_url: REPOSITORY,
      ref: "main",
    }),
    /AVANTIQO_INTELLIGENCE_CODE_MISSION_EXECUTION_FULL_REPOSITORY_HEAD_REQUIRED/,
  );
});
