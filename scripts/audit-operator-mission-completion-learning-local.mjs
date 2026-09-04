import assert from "node:assert/strict";

process.env.SUPABASE_SERVICE_ROLE_KEY ||= "audit-service-role-key-not-used";
process.env.AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID ||=
  "00000000-0000-4000-8000-000000000001";

const {
  OPERATOR_MISSION_OUTCOME_LEARNING_PROJECTION_CONTRACT,
  prepareOperatorMissionOutcomeLearningProjection,
} = await import(
  "../lib/operator/runtime/OperatorMissionOutcomeLearningProjectionRuntime.js"
);
const {
  OPERATOR_MISSION_OUTCOME_LEARNING_SETTLEMENT_CONTRACT,
  settleOperatorMissionOutcomeLearning,
} = await import(
  "../lib/operator/runtime/OperatorMissionOutcomeLearningSettlementRuntime.js"
);
const {
  assessAvantiqoReusableKnowledgeRowEligibility,
} = await import(
  "../lib/intelligence/runtime/AvantiqoHybridKnowledgeRetrievalRuntime.js"
);

const FINAL_STEP_ID = "write-final";

const steps = Object.freeze([
  {
    id: "read-current",
    capability_key: "finance.state.read",
    payload: {},
  },
  {
    id: FINAL_STEP_ID,
    capability_key: "finance.reconcile.execute",
    payload: {},
    verify_after: {
      capability_key: "finance.reconcile.verify",
      description: "Verify reconciliation result",
      payload: {},
    },
  },
]);

const specification = Object.freeze({
  pattern: {
    mission_family: "finance.reconcile",
    intervention_code: "verify-before-commit",
    intervention_class: "verification-guard",
    knowledge_domain: "finance",
    condition_codes: ["external-state-mutable", "write-action"],
    boundary_condition_codes: ["current-evidence-required"],
    failure_mode_codes: ["stale-state-commit"],
    stability: "mutable",
  },
  criteria: [
    {
      id: "success-state",
      kind: "success",
      comparator: "eq",
      expected_value: true,
      source_step_id: FINAL_STEP_ID,
      source_path: "success_state",
    },
    {
      id: "failure-stale",
      kind: "failure",
      comparator: "eq",
      expected_value: true,
      source_step_id: FINAL_STEP_ID,
      source_path: "stale_write",
    },
  ],
});

function createMemoryDatabase() {
  const rows = [];
  const writes = [];
  let nextId = 1;

  function clone(value) {
    return structuredClone(value);
  }

  function builder(mode, payload = null, options = null) {
    const filters = [];
    let order = null;
    let maxRows = null;

    const api = {
      select() {
        return api;
      },
      eq(field, value) {
        filters.push([field, value]);
        return api;
      },
      order(field, config = {}) {
        order = { field, ascending: config.ascending === true };
        return api;
      },
      limit(value) {
        maxRows = Number(value);
        return Promise.resolve(executeSelect());
      },
      maybeSingle() {
        if (mode !== "upsert") {
          throw new Error("AUDIT_DB_MAYBE_SINGLE_ONLY_AFTER_UPSERT");
        }
        return Promise.resolve(executeUpsert());
      },
    };

    function rowValue(row, field) {
      if (field.startsWith("metadata->>")) {
        return row.metadata?.[field.slice("metadata->>".length)];
      }
      return row[field];
    }

    function matches(row) {
      return filters.every(([field, value]) => rowValue(row, field) === value);
    }

    function executeSelect() {
      let data = rows.filter(matches).map(clone);
      if (order) {
        data.sort((a, b) => {
          const left = String(rowValue(a, order.field) ?? "");
          const right = String(rowValue(b, order.field) ?? "");
          const comparison = left.localeCompare(right);
          return order.ascending ? comparison : -comparison;
        });
      }
      if (Number.isFinite(maxRows)) data = data.slice(0, maxRows);
      return { data, error: null };
    }

    function executeUpsert() {
      const row = clone(payload);
      const duplicate = rows.find(
        (existing) =>
          existing.organization_id === row.organization_id &&
          existing.memory_scope === row.memory_scope &&
          existing.memory_key === row.memory_key,
      );
      if (duplicate && options?.ignoreDuplicates === true) {
        return { data: null, error: null };
      }
      if (duplicate) {
        Object.assign(duplicate, row);
        writes.push({ action: "update", scope: row.memory_scope });
        return {
          data: { id: duplicate.id, memory_key: duplicate.memory_key },
          error: null,
        };
      }
      const stored = {
        id: `audit-${nextId++}`,
        created_at: row.updated_at,
        ...row,
      };
      rows.push(stored);
      writes.push({ action: "insert", scope: row.memory_scope });
      return {
        data: { id: stored.id, memory_key: stored.memory_key },
        error: null,
      };
    }

    return api;
  }

  return {
    from(table) {
      assert.equal(table, "intelligence_memories");
      return {
        upsert(row, options) {
          return builder("upsert", row, options);
        },
        select() {
          return builder("select").select();
        },
      };
    },
    snapshot() {
      return rows.map(clone);
    },
    writes() {
      return writes.map(clone);
    },
  };
}

function completedMission(verification = {}) {
  return {
    status: "completed",
    mission_mode: "durable_registered_sequence",
    all_steps_preflighted: true,
    total_steps: 2,
    completed_steps: 2,
    remaining_steps: 0,
    current_step_id: null,
    steps: [
      {
        id: "read-current",
        capability_key: "finance.state.read",
        status: "completed",
        result: { bounded: true },
      },
      {
        id: FINAL_STEP_ID,
        capability_key: "finance.reconcile.execute",
        status: "completed",
        result: { raw_write_result_should_never_be_forwarded: "customer-private-value" },
        verification: {
          success_state: true,
          stale_write: false,
          customer_name: "forbidden-customer-name",
          raw_payload: { forbidden: true },
          ...verification,
        },
      },
    ],
  };
}

function pausedMission() {
  return {
    ...completedMission(),
    status: "paused",
    pause_reason: "verification",
    completed_steps: 1,
    remaining_steps: 1,
    current_step_id: FINAL_STEP_ID,
  };
}

const projection = prepareOperatorMissionOutcomeLearningProjection({
  specification,
  steps,
});
assert.equal(
  projection.contract,
  OPERATOR_MISSION_OUTCOME_LEARNING_PROJECTION_CONTRACT,
);
assert.equal(projection.status, "READY_FOR_VERIFIED_MISSION_COMPLETION");
assert.equal(projection.governance.final_registered_verification_only, true);
assert.equal(projection.governance.freeform_mission_text_used, false);
assert.equal(projection.governance.raw_write_result_used, false);
assert.equal(projection.outcome_contract.status, "OUTCOME_CONTRACT_READY");

assert.throws(
  () =>
    prepareOperatorMissionOutcomeLearningProjection({
      specification: {
        ...specification,
        criteria: [
          specification.criteria[0],
          {
            ...specification.criteria[1],
            source_path: "customer_name",
          },
        ],
      },
      steps,
    }),
  /SOURCE_PATH_SENSITIVE/,
);
assert.throws(
  () =>
    prepareOperatorMissionOutcomeLearningProjection({
      specification: {
        ...specification,
        raw_mission_text: "forbidden",
      },
      steps,
    }),
  /SPEC_FIELD_FORBIDDEN:raw_mission_text/,
);
assert.throws(
  () =>
    prepareOperatorMissionOutcomeLearningProjection({
      specification: {
        ...specification,
        criteria: specification.criteria.map((criterion) => ({
          ...criterion,
          source_step_id: "read-current",
        })),
      },
      steps,
    }),
  /FINAL_VERIFICATION_SOURCE_REQUIRED/,
);

const database = createMemoryDatabase();
const noProjection = await settleOperatorMissionOutcomeLearning({
  projection: null,
  mission_result: completedMission(),
  observation_token: "0".repeat(64),
  database,
  now: new Date("2026-09-04T00:00:00.000Z"),
});
assert.equal(noProjection.contract, OPERATOR_MISSION_OUTCOME_LEARNING_SETTLEMENT_CONTRACT);
assert.equal(noProjection.status, "NOT_REQUESTED");
assert.equal(database.snapshot().length, 0);

const paused = await settleOperatorMissionOutcomeLearning({
  projection,
  mission_result: pausedMission(),
  observation_token: "f".repeat(64),
  database,
  now: new Date("2026-09-04T00:30:00.000Z"),
});
assert.equal(paused.status, "FAILED_CLOSED_NO_LEARNING_WRITE");
assert.equal(paused.observation_written, false);
assert.equal(database.snapshot().length, 0);

const first = await settleOperatorMissionOutcomeLearning({
  projection,
  mission_result: completedMission(),
  observation_token: "a".repeat(64),
  database,
  now: new Date("2026-09-04T01:00:00.000Z"),
});
assert.equal(first.source_outcome_assessment_status, "OUTCOME_SUCCEEDED");
assert.equal(first.status, "VERIFIED_OUTCOME_OBSERVATION_ACCUMULATED");
assert.equal(first.observation_written, true);
assert.equal(first.evidence_candidate_written, false);
assert.equal(first.pattern_evaluation.observation_count, 1);
assert.equal(first.pattern_evaluation.distinct_observation_days, 1);
assert.equal(first.governance.raw_write_result_forwarded_to_learning, false);
assert.equal(first.governance.raw_verification_result_forwarded_to_learning, false);
assert.equal(first.governance.customer_organization_forwarded_to_learning, false);

const second = await settleOperatorMissionOutcomeLearning({
  projection,
  mission_result: completedMission(),
  observation_token: "b".repeat(64),
  database,
  now: new Date("2026-09-04T12:00:00.000Z"),
});
assert.equal(second.status, "VERIFIED_OUTCOME_OBSERVATION_ACCUMULATED");
assert.equal(second.evidence_candidate_written, false);
assert.equal(second.pattern_evaluation.observation_count, 2);
assert.equal(second.pattern_evaluation.distinct_observation_days, 1);

const third = await settleOperatorMissionOutcomeLearning({
  projection,
  mission_result: completedMission(),
  observation_token: "c".repeat(64),
  database,
  now: new Date("2026-09-05T01:00:00.000Z"),
});
assert.equal(third.status, "MISSION_OUTCOME_EVIDENCE_CANDIDATE_INGESTED");
assert.equal(third.evidence_candidate_written, true);
assert.equal(third.reusable_platform_knowledge_written, false);
assert.equal(third.pattern_evaluation.observation_count, 3);
assert.equal(third.pattern_evaluation.distinct_observation_days, 2);
assert.equal(third.pattern_evaluation.dominant_outcome, "SUCCESS");
assert.equal(third.pattern_evaluation.dominant_outcome_ratio, 1);

const rows = database.snapshot();
const observations = rows.filter(
  (row) => row.memory_scope === "platform_learning_outcomes",
);
const candidates = rows.filter(
  (row) => row.memory_scope === "platform_learning_evidence_candidates",
);
assert.equal(observations.length, 3);
assert.equal(candidates.length, 1);
assert.equal(rows.some((row) => row.memory_scope === "platform_knowledge"), false);
assert.equal(
  rows.some((row) => String(row.content || "").includes("customer-private-value")),
  false,
);
assert.equal(
  rows.some((row) => String(row.content || "").includes("forbidden-customer-name")),
  false,
);

const candidate = candidates[0];
assert.equal(candidate.metadata.epistemic_state, "EVIDENCE_CANDIDATE_NOT_RELEASED");
assert.equal(candidate.metadata.causal_attribution_allowed, false);
assert.equal(candidate.metadata.reusable_platform_knowledge, false);
assert.equal(candidate.metadata.knowledge_router_reuse_allowed, false);
assert.equal(candidate.metadata.automatic_knowledge_promotion, false);
assert.equal(candidate.metadata.explicit_final_promotion_required, true);

const reuse = assessAvantiqoReusableKnowledgeRowEligibility(candidate);
assert.equal(reuse.eligible, false);
assert.ok(reuse.blockers.includes("EXPLICIT_FINAL_RELEASE_SOURCE_REQUIRED"));
assert.ok(reuse.blockers.includes("PLATFORM_KNOWLEDGE_SCOPE_REQUIRED"));

const repeat = await settleOperatorMissionOutcomeLearning({
  projection,
  mission_result: completedMission(),
  observation_token: "c".repeat(64),
  database,
  now: new Date("2026-09-05T02:00:00.000Z"),
});
assert.equal(repeat.pattern_evaluation.observation_count, 3);
assert.equal(
  database.snapshot().filter(
    (row) => row.memory_scope === "platform_learning_outcomes",
  ).length,
  3,
);
assert.equal(
  database.snapshot().filter(
    (row) => row.memory_scope === "platform_learning_evidence_candidates",
  ).length,
  1,
);

const writes = database.writes();
assert.equal(writes.some((write) => write.scope === "platform_knowledge"), false);
assert.equal(
  writes.filter((write) => write.scope === "platform_learning_outcomes").length,
  3,
);
assert.equal(
  writes.filter(
    (write) => write.scope === "platform_learning_evidence_candidates",
  ).length,
  1,
);

console.log(
  JSON.stringify(
    {
      success: true,
      status: "AVANTIQO_OPERATOR_VERIFIED_MISSION_COMPLETION_LEARNING_CERTIFIED",
      projection_contract: OPERATOR_MISSION_OUTCOME_LEARNING_PROJECTION_CONTRACT,
      settlement_contract: OPERATOR_MISSION_OUTCOME_LEARNING_SETTLEMENT_CONTRACT,
      verified: {
        explicit_structured_learning_projection_required: true,
        invalid_projection_fails_before_business_execution: true,
        sensitive_verification_paths_blocked: true,
        final_registered_verification_only: true,
        paused_mission_cannot_write_learning: true,
        mission_without_projection_cannot_write_learning: true,
        production_outcome_assessor_reached_through_bridge: true,
        first_observation_cannot_create_candidate: true,
        same_day_repetition_cannot_create_candidate: true,
        cross_day_three_observation_pattern_creates_one_candidate: true,
        same_observation_token_is_idempotent: true,
        raw_write_result_not_forwarded_or_persisted: true,
        raw_verification_result_not_forwarded_or_persisted: true,
        customer_organization_not_forwarded_to_learning: true,
        evidence_candidate_is_not_reusable_knowledge: true,
        no_platform_knowledge_write: true,
        no_provider_gpu_runpod_or_business_action_from_learning: true,
        authorization_effect_none: true,
      },
      counts: {
        observations: observations.length,
        evidence_candidates: candidates.length,
        platform_knowledge: 0,
      },
    },
    null,
    2,
  ),
);
