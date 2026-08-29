import assert from "node:assert/strict";
import test from "node:test";

import {
  createAvantiqoIntelligenceCodeMissionContext,
} from "../lib/intelligence/runtime/AvantiqoIntelligenceCodeMissionRuntime.js";
import {
  AVANTIQO_CODE_MISSION_LEARNING_HANDOFF_CONTRACT,
  buildAvantiqoVerifiedCodeMissionLearningFeedback,
  handoffVerifiedCodeMissionToLearning,
} from "../lib/intelligence/runtime/AvantiqoCodeMissionLearningHandoffRuntime.js";

const ORGANIZATION_ID = "11111111-1111-4111-8111-111111111111";
const HEAD = "a".repeat(40);

function missionContext() {
  return createAvantiqoIntelligenceCodeMissionContext({
    mission: {
      id: "mission-unified-intelligence-learning-handoff",
      objective: "Extend the canonical shared runtime without duplicating platform primitives.",
      business_intent: "Ship the capability through the unified Avantiqo Intelligence architecture.",
    },
    complexity_class: "large",
    repository_context: {
      repository_url: "https://github.com/example/avantiqo",
      ref: "main",
      head_sha: HEAD,
      observed_at: "2026-08-29T00:00:00.000Z",
    },
    learned_knowledge: {
      evaluated: true,
      status: "NO_RELEVANT_VERIFIED_KNOWLEDGE",
      knowledge: [],
      freshness_checked: true,
      evidence_graph_checked: true,
      fresh_research_performed: false,
    },
    system_reasoning: {
      reasoning_scope: [
        "architecture",
        "domain ownership",
        "shared runtimes",
        "security",
        "backward compatibility",
      ],
      architecture_recommendation:
        "Extend the canonical shared runtime and preserve one governed implementation path.",
      future_predictable_requirements: [
        "Future domains must reuse the same contract rather than fork it.",
      ],
      impact_graph: {
        nodes: ["shared-runtime", "code", "learning"],
        edges: [
          ["shared-runtime", "code"],
          ["code", "learning"],
        ],
      },
      affected_domains: ["platform", "intelligence"],
      affected_capabilities: ["platform.code_ai_autonomous.execute"],
      shared_primitives: ["canonical-shared-runtime"],
      domain_ownership: [{ domain: "platform", owns: "canonical-shared-runtime" }],
      data_lifecycle_implications: ["Only verified completion evidence enters learning review."],
      security_permissions: ["Learning feedback never grants execution authority."],
      business_accounting_invariants: [],
      integration_implications: ["Existing Code capability remains the execution boundary."],
      backward_compatibility: ["Existing non-unified Code missions remain unaffected."],
      performance_implications: ["No additional reasoning call is required for handoff."],
      reporting_analytics_implications: [],
      automation_ai_hooks: ["Verified missions may feed evidence candidates deterministically."],
      invariants: [
        "Current repository evidence is authoritative.",
        "No direct trusted-knowledge write is allowed.",
      ],
      completion_criteria: [
        "The canonical shared runtime is implemented and deterministically verified.",
      ],
      verification_requirements: [
        "Run targeted verification and inspect the final diff.",
      ],
    },
  });
}

function verifiedCodeResult(overrides = {}) {
  const state = {
    base_commit: HEAD,
    status: "completed",
    files_changed: [
      "lib/intelligence/runtime/SharedRuntime.js",
      "tests/shared-runtime.test.mjs",
    ],
    verification: [
      {
        operation_id: "verify-1",
        command: "node",
        args: ["--test", "tests/shared-runtime.test.mjs"],
        exit_code: 0,
        passed: true,
        status: "completed",
      },
    ],
    failures: [
      {
        operation_id: "apply-1",
        action: "apply_files",
        message: "A local duplicate initially violated the canonical shared contract.",
      },
    ],
    evidence: [
      {
        kind: "operation",
        action: "diff",
        status: "completed",
        operation_id: "diff-1",
      },
      {
        kind: "product_completion_criteria_evidence",
        contract: "AVANTIQO_CODE_AI_EMPLOYEE_CRITERIA_EVIDENCE_V1",
        verified: true,
        criteria_count: 1,
      },
    ],
    ...overrides.state,
  };

  return {
    success: true,
    contract: "AVANTIQO_CODE_AI_EMPLOYEE_RUNTIME_V1",
    status: "completed",
    employee_completion: {
      contract: "AVANTIQO_CODE_AI_EMPLOYEE_COMPLETION_V1",
      complete: true,
      changed: true,
      verified: true,
      final_diff_observed: true,
      low_level_completed: true,
      files_changed: state.files_changed,
      worldclass_quality: {
        verified: true,
        blockers: [],
      },
      product_completion_criteria: {
        required: true,
        verified: true,
      },
      blockers: [],
      ...overrides.employee_completion,
    },
    state,
    ...Object.fromEntries(
      Object.entries(overrides).filter(([key]) => !["state", "employee_completion"].includes(key)),
    ),
  };
}

function fakeDatabase() {
  const state = { table: null, rows: [], options: null };
  const client = {
    from(table) {
      state.table = table;
      return {
        upsert(row, options) {
          state.rows.push(row);
          state.options = options;
          return {
            select() {
              return {
                async single() {
                  return {
                    data: {
                      id: "learning-candidate-1",
                      memory_key: row.memory_key,
                      subject: row.subject,
                      metadata: row.metadata,
                      created_at: row.updated_at,
                      updated_at: row.updated_at,
                    },
                    error: null,
                  };
                },
              };
            },
          };
        },
      };
    },
  };
  return { client, state };
}

test("verified Code employee completion becomes learning feedback without another model call", () => {
  const prepared = buildAvantiqoVerifiedCodeMissionLearningFeedback({
    mission_context: missionContext(),
    code_result: verifiedCodeResult(),
  });

  assert.equal(prepared.contract, AVANTIQO_CODE_MISSION_LEARNING_HANDOFF_CONTRACT);
  assert.equal(prepared.status, "VERIFIED_CODE_LEARNING_FEEDBACK_READY");
  assert.equal(prepared.eligible_for_learning_feedback, true);
  assert.equal(prepared.repository.matched, true);
  assert.equal(prepared.feedback.verified_result, true);
  assert.equal(prepared.feedback.epistemic_state, "EVIDENCE_CANDIDATE_NOT_RELEASED");
  assert.equal(prepared.feedback.reusable_platform_knowledge, false);
  assert.equal(prepared.feedback.knowledge_router_reuse_allowed, false);
  assert.equal(prepared.feedback.automatic_knowledge_promotion, false);
  assert.deepEqual(prepared.feedback.candidate.files_components_involved, [
    "lib/intelligence/runtime/SharedRuntime.js",
    "tests/shared-runtime.test.mjs",
  ]);
  assert.match(prepared.feedback.candidate.tests_that_mattered[0], /node --test/);
  assert.equal(prepared.governance.model_call_performed, false);
  assert.equal(prepared.governance.provider_call_performed, false);
  assert.equal(prepared.governance.supabase_write_performed, false);
  assert.equal(prepared.governance.source_code_persisted_to_learning, false);
  assert.equal(prepared.governance.raw_patch_persisted_to_learning, false);
  assert.equal(prepared.governance.trusted_knowledge_written, false);
});

test("repository head mismatch blocks learning handoff", () => {
  const prepared = buildAvantiqoVerifiedCodeMissionLearningFeedback({
    mission_context: missionContext(),
    code_result: verifiedCodeResult({
      state: { base_commit: "b".repeat(40) },
    }),
  });

  assert.equal(prepared.eligible_for_learning_feedback, false);
  assert.equal(prepared.feedback, null);
  assert.ok(prepared.blockers.includes("MISSION_REPOSITORY_HEAD_MISMATCH"));
  assert.equal(prepared.governance.supabase_write_performed, false);
});

test("incomplete or unverified Code result cannot enter learning feedback", () => {
  const prepared = buildAvantiqoVerifiedCodeMissionLearningFeedback({
    mission_context: missionContext(),
    code_result: verifiedCodeResult({
      employee_completion: {
        complete: false,
        verified: false,
        final_diff_observed: false,
      },
    }),
  });

  assert.equal(prepared.eligible_for_learning_feedback, false);
  assert.equal(prepared.feedback, null);
  assert.ok(prepared.blockers.includes("CODE_EMPLOYEE_COMPLETE_REQUIRED"));
  assert.ok(prepared.blockers.includes("DETERMINISTIC_VERIFICATION_REQUIRED"));
  assert.ok(prepared.blockers.includes("FINAL_DIFF_REQUIRED"));
});

test("successful handoff persists only an unreleased evidence candidate", async () => {
  const database = fakeDatabase();
  const result = await handoffVerifiedCodeMissionToLearning({
    mission_context: missionContext(),
    code_result: verifiedCodeResult(),
    persist: true,
    database: database.client,
    organization_id: ORGANIZATION_ID,
  });

  assert.equal(result.status, "VERIFIED_CODE_LEARNING_HANDOFF_COMPLETE");
  assert.equal(result.persisted, true);
  assert.equal(result.evidence_candidate_written, true);
  assert.equal(result.reusable_platform_knowledge_written, false);
  assert.equal(result.next_stage_contract, "AVANTIQO_LEARNING_EVIDENCE_CANDIDATE_BRIDGE_V1");
  assert.equal(database.state.table, "intelligence_memories");
  assert.equal(database.state.rows.length, 1);
  assert.equal(database.state.rows[0].memory_scope, "platform_learning_evidence_candidates");
  assert.equal(
    database.state.rows[0].metadata.epistemic_state,
    "EVIDENCE_CANDIDATE_NOT_RELEASED",
  );
  assert.equal(database.state.rows[0].metadata.reusable_platform_knowledge, false);
  assert.equal(database.state.rows[0].metadata.automatic_knowledge_promotion, false);
  assert.equal(result.governance.evidence_candidate_write_only, true);
  assert.equal(result.governance.trusted_knowledge_written, false);
});

test("preview mode creates feedback but performs no database write", async () => {
  const database = fakeDatabase();
  const result = await handoffVerifiedCodeMissionToLearning({
    mission_context: missionContext(),
    code_result: verifiedCodeResult(),
    persist: false,
    database: database.client,
    organization_id: ORGANIZATION_ID,
  });

  assert.equal(result.status, "VERIFIED_CODE_LEARNING_FEEDBACK_PREVIEW");
  assert.equal(result.persisted, false);
  assert.equal(database.state.rows.length, 0);
  assert.equal(result.governance.supabase_write_performed, false);
});
