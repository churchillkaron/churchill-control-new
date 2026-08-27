import assert from "node:assert/strict";
import test from "node:test";
import {
  applyAvantiqoEpistemicCompletionGate,
} from "../lib/intelligence/runtime/AvantiqoEpistemicCompletionGateRuntime.mjs";

function result(overrides = {}) {
  return {
    response: "done",
    goal_status: "completed",
    confidence: 0.94,
    self_check: { passed: true, issues: [] },
    repair_needed: false,
    next_step: null,
    epistemic_state: {
      information_sufficient: true,
      research_status: "satisfied",
      live_read_status: "not_required",
      verification_status: "not_required",
      conflict_status: "resolved",
      unresolved_contradictions: [],
      critical_assumptions: [],
      unresolved_questions: [],
      stop_reason: "sufficient_evidence",
    },
    ...overrides,
  };
}

function phases(calls) {
  return {
    reason_act_observe: {
      transcript: [{
        turn: 1,
        tool_calls: calls.map((call, index) => ({
          id: `call-${index + 1}`,
          name: call.name || "research_evidence",
          epistemic_roles: call.epistemic_roles || ["research"],
          epistemic_evidence: call.epistemic_evidence,
          outcome: call.outcome || "succeeded",
          code: call.code || null,
        })),
      }],
    },
    critique_repair: null,
  };
}

function evidence(overrides = {}) {
  return {
    contract: "AVANTIQO_SAFE_EPISTEMIC_EVIDENCE_SUMMARY_V1",
    source_count: 3,
    independent_source_count: 3,
    official_primary_source_count: 1,
    claim_count: 2,
    source_backed_claim_count: 2,
    conflict_count: 0,
    raw_research_persisted: false,
    ...overrides,
  };
}

const conflictRoute = {
  requirements: { research_required: true },
  signals: {},
  reasons: [{ code: "CONFLICTING_EVIDENCE" }],
};

test("model declaration alone cannot resolve conflicting evidence", () => {
  const gated = applyAvantiqoEpistemicCompletionGate({
    result: result(),
    route: conflictRoute,
    phases: phases([]),
  });

  assert.equal(gated.goal_status, "in_progress");
  assert.equal(gated.epistemic_state.conflict_resolution_required, true);
  assert.equal(gated.epistemic_state.conflict_resolution_proven, false);
  assert.equal(
    gated.epistemic_state.conflict_resolution_evidence_reason,
    "NO_TRUSTED_RECONCILIATION_EVIDENCE",
  );
  assert.ok(
    gated.epistemic_state.gate_violations.includes(
      "EPISTEMIC_CONFLICT_RESOLUTION_UNPROVEN",
    ),
  );
});

test("later trusted evidence can reconcile an observed research conflict", () => {
  const gated = applyAvantiqoEpistemicCompletionGate({
    result: result(),
    route: conflictRoute,
    phases: phases([
      {
        epistemic_evidence: evidence({
          source_count: 4,
          independent_source_count: 4,
          conflict_count: 1,
        }),
      },
      {
        epistemic_evidence: evidence({
          source_count: 5,
          independent_source_count: 5,
          official_primary_source_count: 2,
          conflict_count: 0,
        }),
      },
    ]),
  });

  assert.equal(gated.goal_status, "completed");
  assert.equal(gated.epistemic_state.gate_passed, true);
  assert.equal(gated.epistemic_state.conflict_observed_in_evidence, true);
  assert.equal(gated.epistemic_state.conflict_resolution_proven, true);
  assert.match(
    gated.epistemic_state.conflict_resolution_evidence_reason,
    /^TRUSTED_RECONCILIATION_/,
  );
  assert.equal(gated.epistemic_state.conflict_evidence_sequence, 0);
  assert.equal(gated.epistemic_state.conflict_resolution_sequence, 1);
});

test("conflict remains unresolved when later evidence is not strong enough", () => {
  const gated = applyAvantiqoEpistemicCompletionGate({
    result: result(),
    route: conflictRoute,
    phases: phases([
      {
        epistemic_evidence: evidence({ conflict_count: 1 }),
      },
      {
        epistemic_evidence: evidence({
          source_count: 1,
          independent_source_count: 1,
          official_primary_source_count: 0,
          source_backed_claim_count: 0,
          conflict_count: 0,
        }),
      },
    ]),
  });

  assert.equal(gated.goal_status, "in_progress");
  assert.equal(gated.epistemic_state.conflict_resolution_proven, false);
  assert.equal(
    gated.epistemic_state.conflict_resolution_evidence_reason,
    "NO_TRUSTED_LATER_RECONCILIATION",
  );
});

test("latest successful research round controls diminishing-returns proof", () => {
  const gated = applyAvantiqoEpistemicCompletionGate({
    result: result({
      epistemic_state: {
        ...result().epistemic_state,
        conflict_status: "none",
        stop_reason: "diminishing_returns",
      },
    }),
    route: {
      requirements: { research_required: true },
      signals: {},
      reasons: [],
    },
    phases: phases([
      {
        epistemic_evidence: evidence({ conflict_count: 1 }),
      },
      {
        epistemic_evidence: evidence({
          source_count: 4,
          independent_source_count: 4,
          conflict_count: 0,
          marginal_utility_contract: "AVANTIQO_RESEARCH_MARGINAL_UTILITY_V1",
          research_round: 2,
          marginal_comparison_available: true,
          marginal_new_source_count: 0,
          marginal_new_independent_source_count: 0,
          marginal_new_source_backed_claim_count: 0,
          marginal_uncertainty_reduction_count: 0,
          marginal_follow_up_reduction_count: 0,
          marginal_conflict_reduction_count: 0,
        }),
      },
    ]),
  });

  assert.equal(gated.goal_status, "completed");
  assert.equal(gated.epistemic_state.research_evidence_sequence, 1);
  assert.equal(gated.epistemic_state.research_stop_proven, true);
  assert.equal(
    gated.epistemic_state.research_stop_evidence_reason,
    "OBSERVED_ZERO_MARGINAL_RESEARCH_UTILITY",
  );
});
