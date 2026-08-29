import assert from "node:assert/strict";
import test from "node:test";

import {
  AVANTIQO_INTELLIGENCE_CODE_MISSION_SYSTEM_REASONING_CONTRACT,
  avantiqoCodeMissionSystemReasoningSystemPrompt,
  buildAvantiqoCodeMissionSystemReasoningEnvelope,
  compactAvantiqoCodeMissionRepositoryAssessment,
  finalizeAvantiqoIntelligenceCodeMissionSystemReasoning,
  runAvantiqoIntelligenceCodeMissionSystemReasoning,
} from "../lib/intelligence/runtime/AvantiqoIntelligenceCodeMissionSystemReasoningRuntime.js";
import {
  AVANTIQO_INTELLIGENCE_CODE_MISSION_CONTRACT,
} from "../lib/intelligence/runtime/AvantiqoIntelligenceCodeMissionRuntime.js";

const HEAD = "a".repeat(40);
const MISSION = {
  id: "mission-shared-identity-foundation",
  objective: "Introduce one canonical platform-wide identity model without duplicating existing primitives.",
  business_intent: "Create a durable shared identity foundation for future Avantiqo capabilities.",
};

function learnedKnowledge() {
  return {
    evaluated: true,
    status: "NO_RELEVANT_VERIFIED_KNOWLEDGE",
    freshness_checked: true,
    evidence_graph_checked: true,
    fresh_research_performed: false,
    provenance_contracts: ["AVANTIQO_KNOWLEDGE_ROUTER_V3"],
    knowledge: [],
  };
}

function repositoryAssessment() {
  return {
    contract: "AVANTIQO_PRODUCT_REPOSITORY_ASSESSMENT_V1",
    status: "REPOSITORY_ASSESSMENT_ONLY_NOT_CERTIFICATION",
    repository_snapshot: {
      generated_at: "2026-08-29T00:00:00.000Z",
      repository_url: "https://github.com/churchillkaron/churchill-control-new.git",
      ref: "main",
      current_main_head: HEAD,
      clean_checkout: true,
      tracked_file_count: 7000,
      requested_focus: MISSION.objective,
      bounded_repository_evidence: true,
      dynamic_repository_evidence: true,
      cross_surface_repository_evidence: true,
      full_repository_certification: false,
      evidence_files: [{
        file_path: "lib/platform/runtime/PlatformDomainRuntime.js",
        found: true,
        start_line: 1,
        end_line: 80,
        total_lines: 300,
        content: "export const existingPlatformPrimitive = true;",
      }],
      dynamic_evidence_expansion: {
        files: [{
          file_path: "lib/intelligence/runtime/AvantiqoProductConstitution.js",
          found: true,
          discovery_queries: ["architecture"],
          discovery_sources: ["deterministic"],
          start_line: 1,
          end_line: 80,
          total_lines: 100,
          content: "Self-Learning, General Intelligence and Code Intelligence are specialized responsibilities inside one ecosystem.",
        }],
      },
    },
    assessment: {
      executive_summary: "Bounded current-main evidence reviewed.",
      repository_observations: ["Existing shared platform primitives are present."],
      gaps: ["Identity foundation requires cross-system contract reasoning."],
      engineering_objective: "A DIFFERENT PRODUCT AUTONOMY OBJECTIVE THAT MUST NOT REPLACE THE USER MISSION",
      completion_criteria: ["Product autonomy criterion unrelated to the user mission."],
    },
    objective_selection: {
      selected_objective: "A DIFFERENT PRODUCT AUTONOMY OBJECTIVE THAT MUST NOT REPLACE THE USER MISSION",
      selected_evidence_paths: ["lib/platform/runtime/PlatformDomainRuntime.js"],
      selected_completion_criteria: ["Unrelated selected criterion."],
    },
    evidence_limits: [
      "Repository checkout evidence is not build evidence.",
      "The bounded evidence set is not a complete source-code certification.",
    ],
  };
}

function completeSystemReasoning() {
  return {
    reasoning_scope: [
      "architecture",
      "domain ownership",
      "database/schema",
      "APIs/contracts",
      "permissions/security",
      "backward compatibility",
      "tests",
    ],
    architecture_recommendation:
      "Extend the existing canonical platform identity primitive and keep one shared identity contract rather than introducing a competing domain-local identity runtime.",
    future_predictable_requirements: [
      "Multiple channels and capabilities will need stable actor and organization identity references.",
    ],
    impact_graph: {
      nodes: ["identity", "business-context", "permissions", "api-contracts"],
      edges: [
        { from: "identity", to: "permissions", consequence: "authorization lookups depend on stable identity" },
      ],
      repository_evidence_paths: ["lib/platform/runtime/PlatformDomainRuntime.js"],
      predicted_consequences: ["Consumers must migrate through compatibility-safe shared contracts."],
    },
    affected_domains: ["platform", "administration"],
    affected_capabilities: ["identity", "authorization"],
    shared_primitives: ["BusinessContext", "canonical identity contract"],
    domain_ownership: [{ owner: "platform", primitive: "identity" }],
    data_lifecycle_implications: ["Identity references require stable lifecycle semantics."],
    api_contracts: [{ contract: "shared identity", compatibility: "backward compatible migration" }],
    security_permissions: ["Identity changes must not broaden permissions."],
    business_accounting_invariants: ["Identity migration must not alter accounting ownership or organization scope."],
    integration_implications: ["External channel mappings must resolve to canonical identities."],
    backward_compatibility: ["Existing identifiers require an explicit compatibility path."],
    performance_implications: ["Avoid repeated cross-table identity resolution on hot paths."],
    reporting_analytics_implications: ["Historical attribution must remain stable."],
    automation_ai_hooks: ["Automation identities must obey the same permission contract."],
    expensive_to_change_decisions: ["Canonical identity key and ownership boundaries."],
    invariants: [
      "Organization scope never derives from an unverified identity claim.",
      "One canonical identity contract remains the shared source of truth.",
    ],
    risks: [{ risk: "compatibility drift", mitigation: "explicit compatibility verification" }],
    completion_criteria: [
      "The intended identity outcome works end-to-end through the canonical platform contract without a parallel identity source of truth.",
    ],
    verification_requirements: [
      "Verify contract tests, affected authorization paths, compatibility behavior and final repository diff after the last mutation.",
    ],
  };
}

test("system reasoning prompt keeps General Intelligence out of Code implementation", () => {
  const prompt = avantiqoCodeMissionSystemReasoningSystemPrompt();
  assert.match(prompt, /NOT the coding agent/i);
  assert.match(prompt, /FUTURE-PROOF THE ARCHITECTURE, NOT THE FEATURE COUNT/i);
  assert.match(prompt, /cross-system impact reasoning/i);
  assert.match(prompt, /ONE reconciled system plan/i);
  assert.match(prompt, /Do not write source code/i);
});

test("repository assessment compaction preserves current-main evidence and evidence limits", () => {
  const compact = compactAvantiqoCodeMissionRepositoryAssessment(repositoryAssessment());
  assert.equal(compact.repository.current_main_head, HEAD);
  assert.equal(compact.repository.clean_checkout, true);
  assert.equal(compact.repository.full_repository_certification, false);
  assert.equal(compact.evidence_files.length, 2);
  assert.deepEqual(compact.evidence_limits, [
    "Repository checkout evidence is not build evidence.",
    "The bounded evidence set is not a complete source-code certification.",
  ]);
});

test("General envelope preserves the actual mission instead of repository assessment objective", () => {
  const envelope = buildAvantiqoCodeMissionSystemReasoningEnvelope({
    mission: MISSION,
    learned_knowledge: learnedKnowledge(),
    repository_assessment: repositoryAssessment(),
  });
  assert.equal(envelope.mission.objective, MISSION.objective);
  assert.notEqual(
    envelope.mission.objective,
    envelope.current_repository_evidence.assessment_selected_objective,
  );
  assert.equal(envelope.authority.repository_assessment_selected_objective_authoritative, false);
  assert.equal(envelope.authority.code_must_reinspect_before_mutation, true);
});

test("complete General system reasoning finalizes through the canonical Code mission contract", () => {
  const result = finalizeAvantiqoIntelligenceCodeMissionSystemReasoning({
    mission: MISSION,
    learned_knowledge: learnedKnowledge(),
    repository_assessment: repositoryAssessment(),
    structured_reasoning: completeSystemReasoning(),
  });
  assert.equal(result.contract, AVANTIQO_INTELLIGENCE_CODE_MISSION_SYSTEM_REASONING_CONTRACT);
  assert.equal(result.status, "READY_FOR_CODE");
  assert.equal(result.mission_context.contract, AVANTIQO_INTELLIGENCE_CODE_MISSION_CONTRACT);
  assert.equal(result.mission_context.mission.objective, MISSION.objective);
  assert.equal(result.mission_context.complexity.class, "large");
  assert.equal(result.mission_context.complexity.general_system_reasoning_required, true);
  assert.equal(result.mission_context.repository_context.head_sha, HEAD);
  assert.equal(result.governance.code_execution_started, false);
  assert.equal(result.governance.source_mutation_performed, false);
  assert.equal(result.governance.database_mutation_performed, false);
  assert.equal(result.governance.knowledge_promotion_performed, false);
});

test("incomplete General reasoning fails closed through the canonical mission contract", () => {
  const incomplete = {
    ...completeSystemReasoning(),
    impact_graph: {},
  };
  assert.throws(
    () => finalizeAvantiqoIntelligenceCodeMissionSystemReasoning({
      mission: MISSION,
      learned_knowledge: learnedKnowledge(),
      repository_assessment: repositoryAssessment(),
      structured_reasoning: incomplete,
    }),
    /AVANTIQO_INTELLIGENCE_CODE_MISSION_IMPACT_GRAPH_REQUIRED/,
  );
});

test("runtime composition reuses injected repository assessment and supervisor without execution side effects", async () => {
  const calls = [];
  const result = await runAvantiqoIntelligenceCodeMissionSystemReasoning({
    context: { organizationId: "11111111-1111-4111-8111-111111111111" },
    mission: MISSION,
    learned_knowledge: learnedKnowledge(),
    dependencies: {
      async assessRepository(input) {
        calls.push({ kind: "assessment", input });
        return repositoryAssessment();
      },
      async runStructuredSupervisor(input) {
        calls.push({ kind: "supervisor", input });
        return {
          contract: "AVANTIQO_STRUCTURED_INTELLIGENCE_SUPERVISOR_V1",
          mode: "deep",
          parsed: completeSystemReasoning(),
        };
      },
    },
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].kind, "assessment");
  assert.equal(calls[0].input.focus, MISSION.objective);
  assert.equal(calls[1].kind, "supervisor");
  assert.equal(calls[1].input.tools.length, 0);
  assert.equal(calls[1].input.authorization.allow_mutating_tools, false);
  assert.equal(result.status, "READY_FOR_CODE");
  assert.equal(result.reasoning_execution.code_reasoning_calls_consumed, 0);
  assert.equal(result.governance.code_execution_started, false);
});
