import assert from "node:assert/strict";
import test from "node:test";
import {
  createAvantiqoResearchMarginalUtilityTracker,
} from "../lib/intelligence/runtime/AvantiqoResearchMarginalUtilityRuntime.mjs";
import {
  applyAvantiqoEpistemicCompletionGate,
} from "../lib/intelligence/runtime/AvantiqoEpistemicCompletionGateRuntime.mjs";

function researchResult({ sources, claims, uncertainty = [], followUps = [], conflicts = 0 } = {}) {
  return {
    ok: true,
    result: {
      sources,
      claims,
      uncertainty,
      follow_up_queries: followUps,
      evidence: {
        provider_source_count: sources.length,
        returned_source_count: sources.length,
      },
      evidence_graph: {
        conflicted_claim_count: conflicts,
        relevant_conflict_count: conflicts,
      },
    },
  };
}

function source(url) {
  return { url, official: false, primary: false };
}

function claim(text, sourceUrl) {
  return {
    claim: text,
    verification_status: "SOURCE_BACKED",
    source_urls: [sourceUrl],
  };
}

function completedResult(stopReason = "diminishing_returns") {
  return {
    response: "done",
    goal_status: "completed",
    confidence: 0.92,
    self_check: { passed: true, issues: [] },
    repair_needed: false,
    next_step: null,
    epistemic_state: {
      information_sufficient: true,
      research_status: "satisfied",
      live_read_status: "not_required",
      verification_status: "not_required",
      conflict_status: "none",
      unresolved_contradictions: [],
      critical_assumptions: [],
      unresolved_questions: [],
      stop_reason: stopReason,
    },
  };
}

function safeEvidence(overrides = {}) {
  return {
    contract: "AVANTIQO_SAFE_EPISTEMIC_EVIDENCE_SUMMARY_V1",
    source_count: 2,
    independent_source_count: 2,
    official_primary_source_count: 0,
    claim_count: 1,
    source_backed_claim_count: 1,
    unresolved_uncertainty_count: 0,
    follow_up_query_count: 0,
    conflict_count: 0,
    raw_research_persisted: false,
    ...overrides,
  };
}

function phases(evidence) {
  return {
    reason_act_observe: {
      transcript: [{
        turn: 1,
        tool_calls: [{
          id: "research-1",
          name: "operator_live_read",
          epistemic_roles: ["research"],
          outcome: "succeeded",
          code: null,
          epistemic_evidence: evidence,
        }],
      }],
    },
    critique_repair: null,
  };
}

const route = {
  requirements: { research_required: true },
  signals: {},
  reasons: [],
};

test("marginal tracker compares only complete later research rounds and persists counts only", () => {
  const tracker = createAvantiqoResearchMarginalUtilityTracker();
  const first = tracker.observe(researchResult({
    sources: [source("https://a.example/one"), source("https://b.example/two")],
    claims: [claim("claim one", "https://a.example/one")],
  }));
  const second = tracker.observe(researchResult({
    sources: [source("https://a.example/one"), source("https://b.example/two")],
    claims: [claim("claim one", "https://a.example/one")],
  }));

  assert.equal(first.marginal_comparison_available, false);
  assert.equal(second.marginal_comparison_available, true);
  assert.equal(second.research_round, 2);
  assert.equal(second.marginal_new_source_count, 0);
  assert.equal(second.marginal_new_independent_source_count, 0);
  assert.equal(second.marginal_new_source_backed_claim_count, 0);
  assert.equal(second.raw_research_persisted, false);
  assert.equal(JSON.stringify(second).includes("a.example"), false);
  assert.equal(JSON.stringify(second).includes("claim one"), false);
});

test("marginal tracker detects material value in a later research round", () => {
  const tracker = createAvantiqoResearchMarginalUtilityTracker();
  tracker.observe(researchResult({
    sources: [source("https://a.example/one"), source("https://b.example/two")],
    claims: [claim("claim one", "https://a.example/one")],
    uncertainty: ["unknown one"],
  }));
  const second = tracker.observe(researchResult({
    sources: [
      source("https://a.example/one"),
      source("https://b.example/two"),
      source("https://c.example/three"),
    ],
    claims: [
      claim("claim one", "https://a.example/one"),
      claim("claim two", "https://c.example/three"),
    ],
    uncertainty: [],
  }));

  assert.equal(second.marginal_comparison_available, true);
  assert.equal(second.marginal_new_source_count, 1);
  assert.equal(second.marginal_new_independent_source_count, 1);
  assert.equal(second.marginal_new_source_backed_claim_count, 1);
  assert.equal(second.marginal_uncertainty_reduction_count, 1);
});

test("source sufficiency alone cannot prove diminishing returns", () => {
  const gated = applyAvantiqoEpistemicCompletionGate({
    result: completedResult(),
    route,
    phases: phases(safeEvidence()),
  });

  assert.equal(gated.goal_status, "in_progress");
  assert.equal(gated.epistemic_state.research_stop_proven, true);
  assert.equal(gated.epistemic_state.diminishing_returns_proven, false);
  assert.equal(
    gated.epistemic_state.diminishing_returns_evidence_reason,
    "MARGINAL_UTILITY_ATTESTATION_REQUIRED",
  );
  assert.ok(
    gated.epistemic_state.gate_violations.includes(
      "EPISTEMIC_RESEARCH_DIMINISHING_RETURNS_UNPROVEN",
    ),
  );
});

test("observed zero marginal utility can prove diminishing returns", () => {
  const gated = applyAvantiqoEpistemicCompletionGate({
    result: completedResult(),
    route,
    phases: phases(safeEvidence({
      marginal_utility_contract: "AVANTIQO_RESEARCH_MARGINAL_UTILITY_V1",
      research_round: 2,
      marginal_comparison_available: true,
      marginal_new_source_count: 0,
      marginal_new_independent_source_count: 0,
      marginal_new_source_backed_claim_count: 0,
      marginal_uncertainty_reduction_count: 0,
      marginal_follow_up_reduction_count: 0,
      marginal_conflict_reduction_count: 0,
    })),
  });

  assert.equal(gated.goal_status, "completed");
  assert.equal(gated.epistemic_state.gate_passed, true);
  assert.equal(gated.epistemic_state.diminishing_returns_proven, true);
  assert.equal(
    gated.epistemic_state.diminishing_returns_evidence_reason,
    "OBSERVED_ZERO_MARGINAL_RESEARCH_UTILITY",
  );
});

test("latest research round with material gain cannot claim diminishing returns", () => {
  const gated = applyAvantiqoEpistemicCompletionGate({
    result: completedResult(),
    route,
    phases: phases(safeEvidence({
      marginal_utility_contract: "AVANTIQO_RESEARCH_MARGINAL_UTILITY_V1",
      research_round: 2,
      marginal_comparison_available: true,
      marginal_new_source_count: 1,
      marginal_new_independent_source_count: 1,
      marginal_new_source_backed_claim_count: 1,
      marginal_uncertainty_reduction_count: 0,
      marginal_follow_up_reduction_count: 0,
      marginal_conflict_reduction_count: 0,
    })),
  });

  assert.equal(gated.goal_status, "in_progress");
  assert.equal(gated.epistemic_state.diminishing_returns_proven, false);
  assert.equal(
    gated.epistemic_state.diminishing_returns_evidence_reason,
    "LATEST_RESEARCH_ROUND_STILL_ADDS_MATERIAL_VALUE",
  );
});

test("sufficient evidence remains distinct from diminishing returns", () => {
  const gated = applyAvantiqoEpistemicCompletionGate({
    result: completedResult("sufficient_evidence"),
    route,
    phases: phases(safeEvidence()),
  });

  assert.equal(gated.goal_status, "completed");
  assert.equal(gated.epistemic_state.research_stop_proven, true);
});
