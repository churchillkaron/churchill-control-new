import assert from "node:assert/strict";
import {
  buildAvantiqoMissionOutcomeLearningObservation,
  ingestAvantiqoMissionOutcomeLearning,
} from "../lib/intelligence/runtime/AvantiqoMissionOutcomeLearningRuntime.js";

const ORGANIZATION_ID = "00000000-0000-4000-8000-000000000001";
const OUTCOME_CONTRACT = "AVANTIQO_OPERATOR_INTELLIGENCE_DECISION_OUTCOME_CONTRACT_V1";
const OUTCOME_ASSESSMENT = "AVANTIQO_OPERATOR_INTELLIGENCE_DECISION_OUTCOME_ASSESSMENT_V1";

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
  return {
    contract: OUTCOME_CONTRACT,
    status: "OUTCOME_CONTRACT_READY",
    outcome_contract_ready: true,
    decision_critical: true,
    decision: {
      candidate_id: "candidate-history-window",
      mutates: true,
      irreversible: false,
      requires_human: true,
    },
    criteria: [
      {
        id: "success-verified-state",
        kind: "success",
        comparator: "eq",
        required: true,
        verification_criteria: ["exact-registered-read"],
        failure_mode_ids: [],
      },
      {
        id: "failure-stale-write",
        kind: "failure",
        comparator: "eq",
        required: true,
        verification_criteria: ["detect-stale-write"],
        failure_mode_ids: ["stale-state-commit"],
      },
    ],
  };
}

function successAssessment() {
  return {
    contract: OUTCOME_ASSESSMENT,
    status: "OUTCOME_SUCCEEDED",
    outcome: "success",
    decision_success_proven: true,
    review_required: false,
    criterion_results: [
      {
        id: "success-verified-state",
        kind: "success",
        required: true,
        status: "SATISFIED",
        exact_source_observation_count: 1,
        evidence_ids: ["evidence-success"],
      },
      {
        id: "failure-stale-write",
        kind: "failure",
        required: true,
        status: "NOT_SATISFIED",
        exact_source_observation_count: 1,
        evidence_ids: ["evidence-failure-clear"],
      },
    ],
  };
}

function observation(token, date) {
  const built = buildAvantiqoMissionOutcomeLearningObservation({
    pattern,
    outcome_contract: outcomeContract(),
    outcome_assessment: successAssessment(),
    observation_token: token,
    organization_id: ORGANIZATION_ID,
    now: new Date(date),
  });
  assert.equal(built.eligible, true);
  return built;
}

function createRangeDatabase(seedRows = [], { countSequence = null } = {}) {
  const rows = seedRows.map((row, index) => ({
    id: row.id || `seed-${index + 1}`,
    created_at: row.created_at || row.updated_at,
    ...structuredClone(row),
  }));
  const writes = [];
  let nextId = 1;
  let countReadIndex = 0;

  function clone(value) {
    return structuredClone(value);
  }

  function builder(mode, payload = null, options = null, selectOptions = null) {
    const filters = [];
    const ordering = [];

    const api = {
      select(_columns, optionsArg = null) {
        return builder(mode, payload, options, optionsArg);
      },
      eq(field, value) {
        filters.push([field, value]);
        return api;
      },
      order(field, config = {}) {
        ordering.push({ field, ascending: config.ascending === true });
        return api;
      },
      range(from, to) {
        assert.equal(mode, "select");
        return Promise.resolve(executeSelect(from, to));
      },
      limit(value) {
        assert.equal(mode, "select");
        return Promise.resolve(executeSelect(0, Number(value) - 1));
      },
      maybeSingle() {
        assert.equal(mode, "upsert");
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

    function executeSelect(from, to) {
      let data = rows.filter(matches).map(clone);
      if (ordering.length) {
        data.sort((leftRow, rightRow) => {
          for (const order of ordering) {
            const left = String(rowValue(leftRow, order.field) ?? "");
            const right = String(rowValue(rightRow, order.field) ?? "");
            const comparison = left.localeCompare(right);
            if (comparison !== 0) return order.ascending ? comparison : -comparison;
          }
          return 0;
        });
      }
      const realCount = data.length;
      const countRequested = selectOptions?.count === "exact";
      let reportedCount = countRequested ? realCount : null;
      if (countRequested && Array.isArray(countSequence) && countSequence.length) {
        reportedCount = countSequence[Math.min(countReadIndex, countSequence.length - 1)];
        countReadIndex += 1;
      }
      data = data.slice(Math.max(0, from), Math.max(0, to) + 1);
      return { data, count: reportedCount, error: null };
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
        return { data: { id: duplicate.id, memory_key: duplicate.memory_key }, error: null };
      }
      const stored = {
        id: `audit-history-${nextId++}`,
        created_at: row.updated_at,
        ...row,
      };
      rows.push(stored);
      writes.push({ action: "insert", scope: row.memory_scope });
      return { data: { id: stored.id, memory_key: stored.memory_key }, error: null };
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
        select(columns, options) {
          return builder("select", null, null, options).select(columns, options);
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

function poisonRow(row, id, date) {
  const poisoned = structuredClone(row);
  poisoned.id = id;
  poisoned.created_at = date;
  poisoned.updated_at = date;
  poisoned.metadata.observed_at = date;
  poisoned.metadata.observed_day = date.slice(0, 10);
  poisoned.metadata.outcome_assessment_structural_fingerprint = "x".repeat(64);
  return poisoned;
}

const oldOne = observation("a".repeat(64), "2026-09-01T08:00:00.000Z");
const oldTwo = observation("b".repeat(64), "2026-09-02T08:00:00.000Z");
const poisonTemplate = observation("d".repeat(64), "2026-09-03T08:00:00.000Z");
const poisonedNewerOne = poisonRow(
  poisonTemplate.row,
  "poison-1",
  "2026-09-04T10:00:00.000Z",
);
const poisonedNewerTwo = poisonRow(
  poisonTemplate.row,
  "poison-2",
  "2026-09-04T09:00:00.000Z",
);

const crowdingDatabase = createRangeDatabase([
  poisonedNewerOne,
  poisonedNewerTwo,
  { ...structuredClone(oldTwo.row), id: "valid-2", created_at: oldTwo.row.updated_at },
  { ...structuredClone(oldOne.row), id: "valid-1", created_at: oldOne.row.updated_at },
]);
const crowdingResult = await ingestAvantiqoMissionOutcomeLearning({
  pattern,
  outcome_contract: outcomeContract(),
  outcome_assessment: successAssessment(),
  observation_token: "c".repeat(64),
  organization_id: ORGANIZATION_ID,
  database: crowdingDatabase,
  now: new Date("2026-09-05T08:00:00.000Z"),
  limits: {
    max_pattern_observations: 3,
    history_page_size: 2,
    max_history_pages: 10,
    max_raw_history_scan: 20,
    min_observations: 3,
    min_distinct_observation_days: 2,
    min_dominant_outcome_ratio: 0.8,
  },
});
assert.equal(crowdingResult.status, "MISSION_OUTCOME_EVIDENCE_CANDIDATE_INGESTED");
assert.equal(crowdingResult.evidence_candidate_written, true);
assert.equal(crowdingResult.pattern_evaluation.history_scan_complete, true);
assert.equal(crowdingResult.pattern_evaluation.raw_rows_scanned, 5);
assert.equal(crowdingResult.pattern_evaluation.total_matching_rows, 5);
assert.ok(crowdingResult.pattern_evaluation.history_pages_scanned >= 3);
assert.equal(crowdingResult.pattern_evaluation.observation_count, 3);
assert.equal(crowdingResult.pattern_evaluation.excluded_observation_count, 2);
assert.equal(crowdingResult.pattern_evaluation.eligible_for_evidence_candidate, true);
assert.equal(
  crowdingDatabase.snapshot().filter(
    (row) => row.memory_scope === "platform_learning_evidence_candidates",
  ).length,
  1,
);

const scanLimitSeed = [];
for (let index = 0; index < 5; index += 1) {
  const built = observation(
    String(index + 1).repeat(64),
    `2026-09-0${index + 1}T08:00:00.000Z`,
  );
  scanLimitSeed.push({
    ...structuredClone(built.row),
    id: `scan-limit-${index + 1}`,
    created_at: built.row.updated_at,
  });
}
const scanLimitDatabase = createRangeDatabase(scanLimitSeed);
const scanLimitResult = await ingestAvantiqoMissionOutcomeLearning({
  pattern,
  outcome_contract: outcomeContract(),
  outcome_assessment: successAssessment(),
  observation_token: "f".repeat(64),
  organization_id: ORGANIZATION_ID,
  database: scanLimitDatabase,
  now: new Date("2026-09-06T08:00:00.000Z"),
  limits: {
    max_pattern_observations: 3,
    history_page_size: 2,
    max_history_pages: 10,
    max_raw_history_scan: 4,
    min_observations: 3,
    min_distinct_observation_days: 2,
    min_dominant_outcome_ratio: 0.8,
  },
});
assert.equal(scanLimitResult.status, "VERIFIED_OUTCOME_HISTORY_SCAN_INCOMPLETE");
assert.equal(scanLimitResult.evidence_candidate_written, false);
assert.equal(scanLimitResult.pattern_evaluation.history_scan_complete, false);
assert.equal(scanLimitResult.pattern_evaluation.scan_limit_exceeded, true);
assert.equal(
  scanLimitDatabase.snapshot().filter(
    (row) => row.memory_scope === "platform_learning_evidence_candidates",
  ).length,
  0,
);

const countChangeSeed = [
  { ...structuredClone(oldOne.row), id: "count-1", created_at: oldOne.row.updated_at },
  { ...structuredClone(oldTwo.row), id: "count-2", created_at: oldTwo.row.updated_at },
];
const countChangeDatabase = createRangeDatabase(countChangeSeed, {
  countSequence: [3, 4, 4, 4],
});
const countChangeResult = await ingestAvantiqoMissionOutcomeLearning({
  pattern,
  outcome_contract: outcomeContract(),
  outcome_assessment: successAssessment(),
  observation_token: "e".repeat(64),
  organization_id: ORGANIZATION_ID,
  database: countChangeDatabase,
  now: new Date("2026-09-05T09:00:00.000Z"),
  limits: {
    max_pattern_observations: 3,
    history_page_size: 2,
    max_history_pages: 10,
    max_raw_history_scan: 20,
    min_observations: 3,
    min_distinct_observation_days: 2,
    min_dominant_outcome_ratio: 0.8,
  },
});
assert.equal(countChangeResult.status, "VERIFIED_OUTCOME_HISTORY_SCAN_INCOMPLETE");
assert.equal(countChangeResult.evidence_candidate_written, false);
assert.equal(countChangeResult.pattern_evaluation.history_scan_complete, false);
assert.equal(countChangeResult.pattern_evaluation.history_count_stable, false);
assert.equal(
  countChangeDatabase.snapshot().filter(
    (row) => row.memory_scope === "platform_learning_evidence_candidates",
  ).length,
  0,
);

console.log(JSON.stringify({
  success: true,
  status: "AVANTIQO_MISSION_OUTCOME_HISTORY_WINDOW_INTEGRITY_CERTIFIED",
  verified: {
    history_scan_uses_ordered_range_pagination: true,
    exact_matching_row_count_required: true,
    stable_row_identity_required_across_pages: true,
    complete_history_scan_required_before_candidate: true,
    raw_rows_before_valid_evidence_do_not_crowd_out_unique_votes: true,
    unique_observation_limit_applied_after_history_scan: true,
    raw_scan_limit_fails_closed_before_candidate: true,
    count_change_during_scan_fails_closed: true,
    incomplete_history_never_writes_evidence_candidate: true,
    evidence_candidate_remains_non_reusable: true,
    provider_gpu_modal_execution_performed: false,
  },
  cases: 3,
}, null, 2));
