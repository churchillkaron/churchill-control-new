import assert from "node:assert/strict";
import test from "node:test";

import {
  createAvantiqoIntelligenceCodeMissionContext,
} from "../lib/intelligence/runtime/AvantiqoIntelligenceCodeMissionRuntime.js";
import {
  AVANTIQO_CODE_MISSION_KNOWLEDGE_UTILITY_FEEDBACK_CONTRACT,
  buildAvantiqoVerifiedCodeMissionKnowledgeUtilityObservation,
  handoffVerifiedCodeMissionToLearning,
} from "../lib/intelligence/runtime/AvantiqoCodeMissionLearningHandoffRuntime.js";

const ORGANIZATION_ID = "11111111-1111-4111-8111-111111111111";
const HEAD = "a".repeat(40);

function missionContext({ reused = true } = {}) {
  return createAvantiqoIntelligenceCodeMissionContext({
    mission: {
      id: "mission-code-knowledge-utility-feedback",
      objective: "Reuse the canonical verified runtime pattern and close the mission safely.",
      business_intent: "Verify whether reused platform knowledge remains useful in Code missions.",
    },
    complexity_class: "medium",
    repository_context: {
      repository_url: "https://github.com/example/avantiqo",
      ref: "main",
      head_sha: HEAD,
      observed_at: "2026-08-29T00:00:00.000Z",
    },
    learned_knowledge: reused
      ? {
          evaluated: true,
          status: "REUSED_VERIFIED_KNOWLEDGE",
          freshness_checked: true,
          evidence_graph_checked: true,
          fresh_research_performed: false,
          knowledge: [
            {
              id: "released-knowledge-shared-runtime",
              subject: "Canonical shared runtime reuse",
              content: "Reuse the canonical shared runtime instead of creating a duplicate local abstraction.",
              verification_status: "HYBRID_VERIFIED_PLATFORM_KNOWLEDGE",
              reusable: true,
              confidence: 0.96,
              provenance: {
                topic_key: "code:canonical-shared-runtime",
                authority: "HYBRID_VERIFIED_PLATFORM_KNOWLEDGE",
                release_contract: "AVANTIQO_FINAL_KNOWLEDGE_RELEASE_V1",
              },
            },
          ],
        }
      : {
          evaluated: true,
          status: "NO_RELEVANT_VERIFIED_KNOWLEDGE",
          freshness_checked: true,
          evidence_graph_checked: true,
          fresh_research_performed: false,
          knowledge: [],
        },
  });
}

function verifiedCodeResult(overrides = {}) {
  const state = {
    base_commit: HEAD,
    status: "completed",
    files_changed: ["lib/intelligence/runtime/SharedRuntime.js"],
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
    failures: [],
    evidence: [
      {
        kind: "operation",
        action: "diff",
        status: "completed",
        operation_id: "diff-1",
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
      worldclass_quality: { verified: true, blockers: [] },
      product_completion_criteria: { required: false, verified: true },
      blockers: [],
      ...overrides.employee_completion,
    },
    state,
  };
}

function fakeCandidateDatabase() {
  const state = { rows: [], table: null };
  const client = {
    from(table) {
      state.table = table;
      return {
        upsert(row) {
          state.rows.push(row);
          return {
            select() {
              return {
                async single() {
                  return {
                    data: {
                      id: "candidate-1",
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

test("verified Code completion projects reused knowledge into observational utility feedback", () => {
  const projected = buildAvantiqoVerifiedCodeMissionKnowledgeUtilityObservation({
    mission_context: missionContext(),
    code_result: verifiedCodeResult(),
  });

  assert.equal(
    projected.contract,
    AVANTIQO_CODE_MISSION_KNOWLEDGE_UTILITY_FEEDBACK_CONTRACT,
  );
  assert.equal(projected.applicable, true);
  assert.equal(projected.status, "READY_FOR_OBSERVATIONAL_UTILITY_FEEDBACK");
  assert.match(
    projected.observation_key,
    /^verified-code-knowledge-utility:platform\.code_ai_autonomous\.execute:/,
  );
  assert.equal(projected.decision.knowledge_reuse.reused, true);
  assert.equal(projected.decision.knowledge_reuse.knowledge.length, 1);
  assert.equal(
    projected.execution.capability.key,
    "platform.code_ai_autonomous.execute",
  );
  assert.equal(projected.execution.capability.mode, "write");
  assert.equal(projected.execution.post_action_verification.status, "completed");
  assert.equal(projected.governance.relationship, "OBSERVATIONAL_ASSOCIATION_ONLY");
  assert.equal(projected.governance.causal_attribution_allowed, false);
  assert.equal(projected.governance.raw_reasoning_included, false);
  assert.equal(projected.governance.raw_source_code_included, false);
  assert.equal(projected.governance.automatic_knowledge_promotion, false);
});

test("verified Code handoff records one idempotent utility receipt for reused knowledge", async () => {
  const database = fakeCandidateDatabase();
  const observed = [];
  const recorder = async (input) => {
    observed.push(input);
    return {
      written: true,
      idempotent_observation: true,
      memory_key: "knowledge-utility:stable",
      receipt_fingerprint: "receipt-1",
    };
  };

  const result = await handoffVerifiedCodeMissionToLearning({
    mission_context: missionContext(),
    code_result: verifiedCodeResult(),
    persist: true,
    database: database.client,
    organization_id: ORGANIZATION_ID,
    knowledge_utility_recorder: recorder,
  });

  assert.equal(result.status, "VERIFIED_CODE_LEARNING_HANDOFF_COMPLETE");
  assert.equal(result.evidence_candidate_written, true);
  assert.equal(database.state.rows.length, 1);
  assert.equal(database.state.rows[0].memory_scope, "platform_learning_evidence_candidates");
  assert.equal(observed.length, 1);
  assert.equal(observed[0].observation_key.includes(HEAD), true);
  assert.equal(observed[0].decision.knowledge_reuse.reused, true);
  assert.equal(observed[0].execution.status, "completed");
  assert.equal(result.knowledge_utility.status, "OBSERVATIONAL_UTILITY_FEEDBACK_RECORDED");
  assert.equal(result.knowledge_utility.written, true);
  assert.equal(result.knowledge_utility.idempotent_observation, true);
  assert.equal(result.governance.knowledge_utility_observation_write, true);
  assert.equal(result.governance.knowledge_utility_is_observational_only, true);
  assert.equal(result.governance.knowledge_utility_causal_attribution_allowed, false);
  assert.equal(result.governance.reusable_platform_knowledge_written, false);
  assert.equal(result.governance.automatic_knowledge_promotion, false);
});

test("mission without reused knowledge keeps the existing candidate-only handoff", async () => {
  const database = fakeCandidateDatabase();
  let recorderCalls = 0;
  const result = await handoffVerifiedCodeMissionToLearning({
    mission_context: missionContext({ reused: false }),
    code_result: verifiedCodeResult(),
    persist: true,
    database: database.client,
    organization_id: ORGANIZATION_ID,
    knowledge_utility_recorder: async () => {
      recorderCalls += 1;
      throw new Error("recorder must not be called without reused knowledge");
    },
  });

  assert.equal(result.status, "VERIFIED_CODE_LEARNING_HANDOFF_COMPLETE");
  assert.equal(result.evidence_candidate_written, true);
  assert.equal(recorderCalls, 0);
  assert.equal(result.knowledge_utility.status, "NOT_APPLICABLE_NO_REUSED_KNOWLEDGE");
  assert.equal(result.knowledge_utility.written, false);
  assert.equal(result.governance.knowledge_utility_observation_write, false);
  assert.equal(database.state.rows.length, 1);
});

test("preview and unverified Code results never write utility observations", async () => {
  let recorderCalls = 0;
  const recorder = async () => {
    recorderCalls += 1;
    return { written: true };
  };

  const preview = await handoffVerifiedCodeMissionToLearning({
    mission_context: missionContext(),
    code_result: verifiedCodeResult(),
    persist: false,
    knowledge_utility_recorder: recorder,
  });
  assert.equal(preview.status, "VERIFIED_CODE_LEARNING_FEEDBACK_PREVIEW");
  assert.equal(preview.knowledge_utility.status, "PREVIEW_NO_UTILITY_WRITE");

  const unverified = await handoffVerifiedCodeMissionToLearning({
    mission_context: missionContext(),
    code_result: verifiedCodeResult({
      employee_completion: {
        complete: false,
        verified: false,
        final_diff_observed: false,
      },
    }),
    persist: true,
    knowledge_utility_recorder: recorder,
  });
  assert.equal(unverified.eligible_for_learning_feedback, false);
  assert.equal(
    unverified.knowledge_utility.status,
    "NOT_ELIGIBLE_CODE_RESULT_NOT_VERIFIED_COMPLETE",
  );
  assert.equal(recorderCalls, 0);
});

test("utility recorder failure does not invalidate verified Code learning handoff", async () => {
  const database = fakeCandidateDatabase();
  const result = await handoffVerifiedCodeMissionToLearning({
    mission_context: missionContext(),
    code_result: verifiedCodeResult(),
    persist: true,
    database: database.client,
    organization_id: ORGANIZATION_ID,
    knowledge_utility_recorder: async () => {
      throw new Error("synthetic utility storage failure");
    },
  });

  assert.equal(result.status, "VERIFIED_CODE_LEARNING_HANDOFF_COMPLETE");
  assert.equal(result.evidence_candidate_written, true);
  assert.equal(result.knowledge_utility.status, "OBSERVATIONAL_UTILITY_FEEDBACK_FAILED");
  assert.equal(result.knowledge_utility.written, false);
  assert.match(result.knowledge_utility.failure_reason, /synthetic utility storage failure/);
  assert.equal(
    result.knowledge_utility.governance.verified_code_result_remains_valid,
    true,
  );
  assert.equal(
    result.knowledge_utility.governance.learning_candidate_handoff_remains_independent,
    true,
  );
});
