import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAvantiqoCodeMissionLearningEvidenceCandidateRow,
  ingestAvantiqoCodeMissionLearningFeedback,
  AVANTIQO_CODE_MISSION_LEARNING_INGRESS_CONTRACT,
} from "../lib/intelligence/runtime/AvantiqoCodeMissionLearningIngressRuntime.js";
import {
  AVANTIQO_CODE_MISSION_LEARNING_FEEDBACK_CONTRACT,
} from "../lib/intelligence/runtime/AvantiqoIntelligenceCodeMissionRuntime.js";

const ORGANIZATION_ID = "11111111-1111-4111-8111-111111111111";
const REPOSITORY_HEAD = "a".repeat(40);

function verifiedFeedback() {
  return {
    contract: AVANTIQO_CODE_MISSION_LEARNING_FEEDBACK_CONTRACT,
    mission_id: "mission-shared-runtime-repair",
    verified_result: true,
    reusable_platform_knowledge: false,
    knowledge_router_reuse_allowed: false,
    automatic_knowledge_promotion: false,
    automatic_training_effect: "NONE",
    production_model_promotion_effect: "NONE",
    authorization_effect: "NONE",
    status: "LEARNING_EVIDENCE_CANDIDATE_READY",
    eligible_for_learning_review: true,
    epistemic_state: "EVIDENCE_CANDIDATE_NOT_RELEASED",
    candidate: {
      architecture_chosen:
        "Reuse the existing shared runtime and extend its canonical contract.",
      alternatives_rejected: ["parallel duplicate runtime"],
      dependencies_discovered: ["shared-runtime", "canonical-registry"],
      affected_domains: ["platform", "code"],
      affected_capabilities: ["platform.code_ai_autonomous.execute"],
      files_components_involved: [
        "lib/intelligence/runtime/SharedRuntime.js",
        "tests/shared-runtime.test.mjs",
      ],
      tests_that_mattered: ["shared runtime contract test"],
      failure_repair_relationships: [{
        failure: "duplicate local contract drifted from shared runtime",
        repair: "reused canonical shared contract",
      }],
      cross_system_consequences: [
        "Code and General Intelligence now consume the same canonical runtime contract.",
      ],
      reusable_implementation_pattern:
        "Extend canonical shared primitives rather than creating a domain-local duplicate.",
      final_successful_verification: [
        { command: "node", args: ["--test", "tests/shared-runtime.test.mjs"], passed: true, exit_code: 0 },
        { check: "final-diff", passed: true },
      ],
      boundary_conditions: [
        "The shared primitive must remain the canonical owner of the contract.",
      ],
      approaches_that_did_not_work: ["one-file local duplicate"],
      repository_head_verified: REPOSITORY_HEAD,
    },
  };
}

function fakeDatabase() {
  const state = { rows: [], table: null, options: null };
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
                      id: "candidate-row-1",
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

test("verified Code feedback becomes an existing continuous-learning evidence candidate", () => {
  const first = buildAvantiqoCodeMissionLearningEvidenceCandidateRow({
    feedback: verifiedFeedback(),
    organization_id: ORGANIZATION_ID,
    now: new Date("2026-08-29T00:00:00.000Z"),
  });
  const second = buildAvantiqoCodeMissionLearningEvidenceCandidateRow({
    feedback: verifiedFeedback(),
    organization_id: ORGANIZATION_ID,
    now: new Date("2026-08-29T01:00:00.000Z"),
  });

  assert.equal(first.memory_scope, "platform_learning_evidence_candidates");
  assert.equal(first.memory_type, "evidence");
  assert.equal(first.metadata.contract, "AVANTIQO_CONTINUOUS_LEARNING_EVIDENCE_CANDIDATE_V1");
  assert.equal(first.metadata.ingress_contract, AVANTIQO_CODE_MISSION_LEARNING_INGRESS_CONTRACT);
  assert.equal(first.metadata.epistemic_state, "EVIDENCE_CANDIDATE_NOT_RELEASED");
  assert.equal(first.metadata.next_stage_contract, "AVANTIQO_LEARNING_EVIDENCE_CANDIDATE_BRIDGE_V1");
  assert.equal(first.metadata.requires_epistemic_promotion_pipeline, true);
  assert.equal(first.metadata.direct_platform_knowledge_write_allowed, false);
  assert.equal(first.metadata.reusable_platform_knowledge, false);
  assert.equal(first.metadata.knowledge_router_reuse_allowed, false);
  assert.equal(first.metadata.automatic_knowledge_promotion, false);
  assert.equal(first.metadata.automatic_model_weight_mutation, false);
  assert.equal(first.metadata.customer_private_content_included, false);
  assert.equal(first.metadata.raw_reasoning_persisted, false);
  assert.equal(first.metadata.code_mission_repository_head_verified, REPOSITORY_HEAD);
  assert.equal(first.metadata.source_count, 2);
  assert.equal(first.metadata.verified_execution_evidence_present, true);
  assert.equal(first.memory_key, second.memory_key, "same mission evidence must be idempotently keyed");
  assert.match(first.content, /canonical shared primitives/i);
});

test("ingress writes only the evidence-candidate scope and does not promote knowledge", async () => {
  const database = fakeDatabase();
  const result = await ingestAvantiqoCodeMissionLearningFeedback({
    feedback: verifiedFeedback(),
    organization_id: ORGANIZATION_ID,
    database: database.client,
  });

  assert.equal(result.success, true);
  assert.equal(result.status, "EVIDENCE_CANDIDATE_INGESTED");
  assert.equal(result.evidence_candidate_written, true);
  assert.equal(result.reusable_platform_knowledge_written, false);
  assert.equal(result.next_stage_contract, "AVANTIQO_LEARNING_EVIDENCE_CANDIDATE_BRIDGE_V1");
  assert.equal(database.state.table, "intelligence_memories");
  assert.equal(database.state.rows.length, 1);
  assert.equal(database.state.rows[0].memory_scope, "platform_learning_evidence_candidates");
  assert.deepEqual(database.state.options, {
    onConflict: "organization_id,memory_scope,memory_key",
  });
  assert.equal(result.governance.model_call_performed, false);
  assert.equal(result.governance.research_performed, false);
  assert.equal(result.governance.runpod_job_submitted, false);
  assert.equal(result.governance.automatic_training_started, false);
  assert.equal(result.governance.automatic_knowledge_promotion, false);
});

test("unverified Code feedback is rejected before database mutation", async () => {
  const database = fakeDatabase();
  const feedback = {
    ...verifiedFeedback(),
    verified_result: false,
    status: "NOT_ELIGIBLE_UNVERIFIED_RESULT",
    eligible_for_learning_review: false,
    epistemic_state: "UNVERIFIED_EXECUTION_EVIDENCE",
    candidate: null,
  };

  assert.equal(
    buildAvantiqoCodeMissionLearningEvidenceCandidateRow({
      feedback,
      organization_id: ORGANIZATION_ID,
    }),
    null,
  );

  const result = await ingestAvantiqoCodeMissionLearningFeedback({
    feedback,
    organization_id: ORGANIZATION_ID,
    database: database.client,
  });

  assert.equal(result.status, "NOT_ELIGIBLE_UNVERIFIED_RESULT");
  assert.equal(result.written, false);
  assert.equal(result.evidence_candidate_written, false);
  assert.equal(result.reusable_platform_knowledge_written, false);
  assert.equal(database.state.rows.length, 0);
});

test("feedback claiming reusable or automatic promotion authority is rejected", () => {
  for (const override of [
    { reusable_platform_knowledge: true },
    { knowledge_router_reuse_allowed: true },
    { automatic_knowledge_promotion: true },
  ]) {
    const feedback = { ...verifiedFeedback(), ...override };
    assert.equal(
      buildAvantiqoCodeMissionLearningEvidenceCandidateRow({
        feedback,
        organization_id: ORGANIZATION_ID,
      }),
      null,
    );
  }
});
