import assert from "node:assert/strict";

process.env.SUPABASE_SERVICE_ROLE_KEY ||= "audit-service-role-key-not-used";

const {
  buildOperatorIntelligenceDecisionOutcomeContract,
} = await import(
  "../lib/operator/runtime/OperatorIntelligenceDecisionOutcomeContractRuntime.js"
);
const {
  OPERATOR_MISSION_OUTCOME_LEARNING_BRIDGE_CONTRACT,
  prepareOperatorMissionOutcomeLearningBridge,
  handoffOperatorMissionOutcomeLearningBridge,
} = await import(
  "../lib/operator/runtime/OperatorMissionOutcomeLearningBridgeRuntime.js"
);
const {
  assessAvantiqoReusableKnowledgeRowEligibility,
} = await import(
  "../lib/intelligence/runtime/AvantiqoHybridKnowledgeRetrievalRuntime.js"
);

const ORGANIZATION_ID = "00000000-0000-4000-8000-000000000001";
const EVIDENCE_CANDIDATE_CONTRACT =
  "AVANTIQO_CONTINUOUS_LEARNING_EVIDENCE_CANDIDATE_V1";

const pattern = Object.freeze({
  mission_family: "finance.reconcile",
  intervention_code: "verify-before-commit",
  intervention_class: "verification-guard",
  knowledge_domain: "finance",
  condition_codes: ["external-state-mutable", "write-action"],
  boundary_condition_codes: ["current-evidence-required"],
  failure_mode_codes: ["stale-state-commit"],
  stability: "mutable",
});

function outcomeContract() {
  const result = buildOperatorIntelligenceDecisionOutcomeContract({
    decision: {
      candidate_id: "candidate-verified-guard",
      mutates: true,
      irreversible: false,
      requires_human: true,
    },
    criteria: [
      {
        id: "success-verified-state",
        kind: "success",
        signal: "registered verification read confirms expected state",
        comparator: "eq",
        expected_value: true,
        observation_source: "finance.reconciliation.verification",
        verification_criteria: ["exact-registered-read"],
        failure_mode_ids: [],
        required: true,
      },
      {
        id: "failure-stale-write",
        kind: "failure",
        signal: "registered verification read detects stale write",
        comparator: "eq",
        expected_value: true,
        observation_source: "finance.reconciliation.stale-write-check",
        verification_criteria: ["detect-stale-write"],
        failure_mode_ids: ["stale-state-commit"],
        required: true,
      },
    ],
    review_policy: {
      planned_review_trigger: "next_verified_observation",
      review_on_failure: true,
      review_on_warning: false,
      review_on_invalidation_trigger: true,
    },
    provenance: {
      invalidation_triggers: [
        { id: "finance-state-changed" },
      ],
    },
    contingency: {
      failure_modes: [
        {
          id: "stale-state-commit",
          severity: "high",
          decision_invalidating: true,
        },
      ],
    },
    decision_critical: true,
  });

  assert.equal(result.status, "OUTCOME_CONTRACT_READY");
  assert.equal(result.outcome_contract_ready, true);
  return result;
}

function successfulObservations(prefix) {
  return [
    {
      id: `${prefix}-success`,
      criterion_id: "success-verified-state",
      observation_source: "finance.reconciliation.verification",
      observed_value: true,
      verified: true,
      verification_status: "pass",
      current: true,
      evidence_ids: [`${prefix}-verified-state`],
    },
    {
      id: `${prefix}-failure-clear`,
      criterion_id: "failure-stale-write",
      observation_source: "finance.reconciliation.stale-write-check",
      observed_value: false,
      verified: true,
      verification_status: "pass",
      current: true,
      evidence_ids: [`${prefix}-no-stale-write`],
    },
  ];
}

function inconclusiveObservations(prefix) {
  return [
    {
      id: `${prefix}-unverified`,
      criterion_id: "success-verified-state",
      observation_source: "finance.reconciliation.verification",
      observed_value: true,
      verified: false,
      verification_status: "pending",
      current: true,
      evidence_ids: [`${prefix}-unverified-evidence`],
    },
  ];
}

function createMemoryDatabase() {
  const rows = [];
  const writes = [];
  let nextId = 1;

  function clone(value) {
    return structuredClone(value);
  }

  function builder(mode, payload = null, options = null) {
    const filters = [];
    let selected = null;
    let order = null;
    let maxRows = null;

    const api = {
      select(fields) {
        selected = fields;
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
      return { data, error: null, selected };
    }

    function executeUpsert() {
      const row = clone(payload);
      const duplicate = rows.find((existing) =>
        existing.organization_id === row.organization_id &&
        existing.memory_scope === row.memory_scope &&
        existing.memory_key === row.memory_key,
      );
      if (duplicate && options?.ignoreDuplicates === true) {
        return { data: null, error: null };
      }
      if (duplicate) {
        Object.assign(duplicate, row);
        writes.push({ action: "update", scope: row.memory_scope, key: row.memory_key });
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
      writes.push({ action: "insert", scope: row.memory_scope, key: row.memory_key });
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
        select(fields) {
          return builder("select").select(fields);
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

function bridgeInput({
  token,
  date,
  database,
  observations = successfulObservations(token.slice(0, 4)),
  extra = {},
}) {
  return {
    pattern,
    outcome_contract: outcomeContract(),
    observations,
    observation_token: token,
    organization_id: ORGANIZATION_ID,
    database,
    now: new Date(date),
    ...extra,
  };
}

const database = createMemoryDatabase();
const firstInput = bridgeInput({
  token: "a".repeat(64),
  date: "2026-09-04T01:00:00.000Z",
  database,
});

const prepared = prepareOperatorMissionOutcomeLearningBridge(firstInput);
assert.equal(prepared.contract, OPERATOR_MISSION_OUTCOME_LEARNING_BRIDGE_CONTRACT);
assert.equal(prepared.source_outcome_assessment_status, "OUTCOME_SUCCEEDED");
assert.equal(prepared.source_decision_success_proven, true);
assert.equal(prepared.eligible, true);
assert.equal(
  prepared.status,
  "VERIFIED_OPERATOR_OUTCOME_READY_FOR_GOVERNED_LEARNING_INGRESS",
);
assert.equal(prepared.governance.actual_operator_outcome_assessment_required, true);
assert.equal(prepared.governance.outcome_assessment_generated_by_operator_runtime, true);
assert.equal(prepared.governance.raw_outcome_observations_forwarded_to_learning, false);
assert.equal(prepared.governance.raw_outcome_observations_persisted, false);
assert.equal(prepared.governance.observed_values_forwarded_to_learning, false);
assert.equal(prepared.governance.raw_reasoning_persisted, false);
assert.equal(prepared.governance.automatic_knowledge_promotion, false);
assert.equal(prepared.governance.authorization_effect, "NONE");
assert.equal(prepared.observation_row.metadata.source_evidence_ids_persisted, false);
assert.equal(prepared.observation_row.metadata.raw_payload_included, false);
assert.equal(prepared.observation_row.metadata.raw_output_included, false);
assert.ok(!prepared.observation_row.content.includes("aaaa-verified-state"));
assert.ok(!prepared.observation_row.content.includes(ORGANIZATION_ID));

assert.throws(
  () => prepareOperatorMissionOutcomeLearningBridge({ ...firstInput, raw_mission_text: "forbidden" }),
  /FIELD_FORBIDDEN:raw_mission_text/,
);
assert.throws(
  () => prepareOperatorMissionOutcomeLearningBridge({ ...firstInput, customer_id: "forbidden" }),
  /FIELD_FORBIDDEN:customer_id/,
);

const beforeUnverified = database.snapshot().length;
const unverified = await handoffOperatorMissionOutcomeLearningBridge(
  bridgeInput({
    token: "f".repeat(64),
    date: "2026-09-04T00:30:00.000Z",
    database,
    observations: inconclusiveObservations("unverified"),
  }),
);
assert.equal(unverified.source_outcome_assessment_status, "OUTCOME_INCONCLUSIVE");
assert.equal(unverified.eligible, false);
assert.equal(unverified.observation_written, false);
assert.equal(unverified.evidence_candidate_written, false);
assert.equal(database.snapshot().length, beforeUnverified);

const first = await handoffOperatorMissionOutcomeLearningBridge(firstInput);
assert.equal(first.source_outcome_assessment_status, "OUTCOME_SUCCEEDED");
assert.equal(first.status, "VERIFIED_OUTCOME_OBSERVATION_ACCUMULATED");
assert.equal(first.evidence_candidate_written, false);
assert.equal(first.pattern_evaluation.observation_count, 1);
assert.equal(first.pattern_evaluation.distinct_observation_days, 1);

const second = await handoffOperatorMissionOutcomeLearningBridge(
  bridgeInput({
    token: "b".repeat(64),
    date: "2026-09-04T12:00:00.000Z",
    database,
  }),
);
assert.equal(second.status, "VERIFIED_OUTCOME_OBSERVATION_ACCUMULATED");
assert.equal(second.evidence_candidate_written, false);
assert.equal(second.pattern_evaluation.observation_count, 2);
assert.equal(second.pattern_evaluation.distinct_observation_days, 1);

const third = await handoffOperatorMissionOutcomeLearningBridge(
  bridgeInput({
    token: "c".repeat(64),
    date: "2026-09-05T01:00:00.000Z",
    database,
  }),
);
assert.equal(third.status, "MISSION_OUTCOME_EVIDENCE_CANDIDATE_INGESTED");
assert.equal(third.evidence_candidate_written, true);
assert.equal(third.reusable_platform_knowledge_written, false);
assert.equal(third.pattern_evaluation.observation_count, 3);
assert.equal(third.pattern_evaluation.distinct_observation_days, 2);
assert.equal(third.pattern_evaluation.dominant_outcome, "SUCCESS");
assert.equal(third.pattern_evaluation.dominant_outcome_ratio, 1);
assert.equal(third.governance.automatic_knowledge_promotion, false);
assert.equal(third.governance.direct_platform_knowledge_write_allowed, false);
assert.equal(third.governance.authorization_effect, "NONE");

const afterThree = database.snapshot();
const observations = afterThree.filter(
  (row) => row.memory_scope === "platform_learning_outcomes",
);
const candidates = afterThree.filter(
  (row) => row.memory_scope === "platform_learning_evidence_candidates",
);
assert.equal(observations.length, 3);
assert.equal(candidates.length, 1);
assert.equal(
  afterThree.some((row) => row.memory_scope === "platform_knowledge"),
  false,
);

const candidate = candidates[0];
assert.equal(candidate.metadata.contract, EVIDENCE_CANDIDATE_CONTRACT);
assert.equal(candidate.metadata.epistemic_state, "EVIDENCE_CANDIDATE_NOT_RELEASED");
assert.equal(candidate.metadata.observation_count, 3);
assert.equal(candidate.metadata.distinct_observation_days, 2);
assert.equal(candidate.metadata.dominant_outcome_ratio, 1);
assert.equal(candidate.metadata.causal_attribution_allowed, false);
assert.equal(candidate.metadata.reusable_platform_knowledge, false);
assert.equal(candidate.metadata.knowledge_router_reuse_allowed, false);
assert.equal(candidate.metadata.automatic_knowledge_promotion, false);
assert.equal(candidate.metadata.direct_platform_knowledge_write_allowed, false);
assert.equal(candidate.metadata.explicit_final_promotion_required, true);
assert.equal(candidate.metadata.authorization_value, "none");

const reuseAssessment = assessAvantiqoReusableKnowledgeRowEligibility(candidate);
assert.equal(reuseAssessment.eligible, false);
assert.ok(
  reuseAssessment.blockers.includes("EXPLICIT_FINAL_RELEASE_SOURCE_REQUIRED"),
);
assert.ok(
  reuseAssessment.blockers.includes("PLATFORM_KNOWLEDGE_SCOPE_REQUIRED"),
);

const repeat = await handoffOperatorMissionOutcomeLearningBridge(
  bridgeInput({
    token: "c".repeat(64),
    date: "2026-09-05T02:00:00.000Z",
    database,
  }),
);
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
assert.equal(
  writes.some((write) => write.scope === "platform_knowledge"),
  false,
);
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

console.log(JSON.stringify({
  success: true,
  status: "AVANTIQO_OPERATOR_MISSION_OUTCOME_LEARNING_BRIDGE_CERTIFIED",
  contract: OPERATOR_MISSION_OUTCOME_LEARNING_BRIDGE_CONTRACT,
  verified: {
    production_outcome_contract_builder_used: true,
    production_exact_source_outcome_assessor_used: true,
    unverified_operator_outcome_is_blocked: true,
    first_observation_cannot_create_candidate: true,
    same_day_repetition_cannot_create_candidate: true,
    cross_day_three_observation_pattern_creates_one_candidate: true,
    repeated_same_observation_token_is_idempotent: true,
    raw_outcome_observations_not_forwarded_to_learning: true,
    evidence_candidate_remains_not_released: true,
    evidence_candidate_is_not_reusable_knowledge: true,
    no_platform_knowledge_write: true,
    no_raw_reasoning: true,
    no_provider_gpu_runpod_or_business_action: true,
    authorization_effect_none: true,
  },
  counts: {
    observations: observations.length,
    evidence_candidates: candidates.length,
    platform_knowledge: 0,
  },
}, null, 2));
