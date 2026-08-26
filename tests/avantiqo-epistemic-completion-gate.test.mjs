import assert from "node:assert/strict";
import test from "node:test";
import {
  AVANTIQO_EPISTEMIC_COMPLETION_GATE_CONTRACT,
  applyAvantiqoEpistemicCompletionGate,
} from "../lib/intelligence/runtime/AvantiqoEpistemicCompletionGateRuntime.mjs";

function baseResult(overrides = {}) {
  return {
    response: "done",
    goal_status: "completed",
    confidence: 0.94,
    self_check: { passed: true, issues: [] },
    repair_needed: false,
    next_step: null,
    epistemic_state: {
      information_sufficient: true,
      research_status: "not_required",
      live_read_status: "not_required",
      verification_status: "not_required",
      conflict_status: "none",
      unresolved_contradictions: [],
      critical_assumptions: [],
      unresolved_questions: [],
      stop_reason: "sufficient_evidence",
    },
    ...overrides,
  };
}

function phaseCalls(calls) {
  return {
    reason_act_observe: {
      transcript: [{
        turn: 1,
        tool_calls: calls.map((call, index) => ({
          id: call.id || `c${index + 1}`,
          name: call.name,
          ...(typeof call.mutates === "boolean" ? { mutates: call.mutates } : {}),
          ...(Array.isArray(call.epistemic_roles)
            ? { epistemic_roles: call.epistemic_roles }
            : {}),
          ...(call.epistemic_evidence
            ? { epistemic_evidence: call.epistemic_evidence }
            : {}),
          outcome: call.outcome || "succeeded",
          code: call.code || null,
        })),
      }],
    },
    critique_repair: null,
  };
}

function safeResearchEvidence(overrides = {}) {
  return {
    contract: "AVANTIQO_SAFE_EPISTEMIC_EVIDENCE_SUMMARY_V1",
    source_count: 3,
    independent_source_count: 3,
    official_primary_source_count: 1,
    claim_count: 2,
    source_backed_claim_count: 2,
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
    raw_research_persisted: false,
    ...overrides,
  };
}

test("epistemic completion gate exposes the canonical contract", () => {
  assert.equal(
    AVANTIQO_EPISTEMIC_COMPLETION_GATE_CONTRACT,
    "AVANTIQO_EPISTEMIC_COMPLETION_GATE_V1",
  );
});

test("required research cannot be certified from a model claim alone", () => {
  const result = baseResult({
    epistemic_state: {
      ...baseResult().epistemic_state,
      research_status: "satisfied",
    },
  });
  const gated = applyAvantiqoEpistemicCompletionGate({
    result,
    route: {
      requirements: { research_required: true },
      signals: {},
      reasons: [],
    },
    phases: phaseCalls([]),
  });

  assert.equal(gated.goal_status, "in_progress");
  assert.equal(gated.repair_needed, true);
  assert.equal(gated.epistemic_state.gate_passed, false);
  assert.ok(
    gated.epistemic_state.gate_violations.includes(
      "EPISTEMIC_RESEARCH_REQUIREMENT_UNSATISFIED",
    ),
  );
  assert.ok(gated.confidence <= 0.58);
});

test("successful research without safe quality proof cannot certify sufficient evidence", () => {
  const result = baseResult({
    epistemic_state: {
      ...baseResult().epistemic_state,
      research_status: "satisfied",
      stop_reason: "sufficient_evidence",
    },
  });
  const gated = applyAvantiqoEpistemicCompletionGate({
    result,
    route: {
      requirements: { research_required: true },
      signals: {},
      reasons: [],
    },
    phases: phaseCalls([{ name: "operator_web_research", outcome: "succeeded" }]),
  });

  assert.equal(gated.goal_status, "in_progress");
  assert.equal(gated.epistemic_state.research_tool_observed, true);
  assert.equal(gated.epistemic_state.research_stop_proven, false);
  assert.equal(
    gated.epistemic_state.research_stop_evidence_reason,
    "NO_SAFE_RESEARCH_EVIDENCE_SUMMARY",
  );
  assert.ok(
    gated.epistemic_state.gate_violations.includes(
      "EPISTEMIC_RESEARCH_SUFFICIENT_EVIDENCE_UNPROVEN",
    ),
  );
});

test("source-backed governed research can certify sufficient evidence", () => {
  const result = baseResult({
    epistemic_state: {
      ...baseResult().epistemic_state,
      research_status: "satisfied",
      stop_reason: "sufficient_evidence",
    },
  });
  const gated = applyAvantiqoEpistemicCompletionGate({
    result,
    route: {
      requirements: { research_required: true },
      signals: {},
      reasons: [],
    },
    phases: phaseCalls([{
      name: "operator_web_research",
      outcome: "succeeded",
      epistemic_evidence: safeResearchEvidence(),
    }]),
  });

  assert.equal(gated.goal_status, "completed");
  assert.equal(gated.epistemic_state.gate_passed, true);
  assert.equal(gated.epistemic_state.research_tool_observed, true);
  assert.equal(gated.epistemic_state.research_stop_proven, true);
});

test("canonical authority can certify sufficient evidence without public source counts", () => {
  const result = baseResult({
    epistemic_state: {
      ...baseResult().epistemic_state,
      research_status: "satisfied",
      stop_reason: "sufficient_evidence",
    },
  });
  const gated = applyAvantiqoEpistemicCompletionGate({
    result,
    route: {
      requirements: { research_required: true },
      signals: {},
      reasons: [],
    },
    phases: phaseCalls([{
      name: "collect_context",
      epistemic_roles: ["research"],
      outcome: "succeeded",
      epistemic_evidence: safeResearchEvidence({
        source_count: 0,
        independent_source_count: 0,
        official_primary_source_count: 0,
        claim_count: 1,
        source_backed_claim_count: 0,
        canonical_authority: true,
      }),
    }]),
  });

  assert.equal(gated.goal_status, "completed");
  assert.equal(gated.epistemic_state.research_stop_proven, true);
  assert.equal(
    gated.epistemic_state.research_stop_evidence_reason,
    "VERIFIED_KNOWLEDGE_AUTHORITY",
  );
});

test("blocked or failed research attempts never satisfy an evidence obligation", () => {
  for (const outcome of ["blocked", "failed"]) {
    const result = baseResult({
      epistemic_state: {
        ...baseResult().epistemic_state,
        research_status: "satisfied",
      },
    });
    const gated = applyAvantiqoEpistemicCompletionGate({
      result,
      route: {
        requirements: { research_required: true },
        signals: {},
        reasons: [],
      },
      phases: phaseCalls([{ name: "operator_web_research", outcome }]),
    });

    assert.equal(gated.goal_status, "in_progress");
    assert.equal(gated.epistemic_state.research_tool_observed, false);
    assert.ok(
      gated.epistemic_state.gate_violations.includes(
        "EPISTEMIC_RESEARCH_REQUIREMENT_UNSATISFIED",
      ),
    );
  }
});

test("explicit research semantics can certify a generic tool name with source-backed proof", () => {
  const result = baseResult({
    epistemic_state: {
      ...baseResult().epistemic_state,
      research_status: "satisfied",
    },
  });
  const gated = applyAvantiqoEpistemicCompletionGate({
    result,
    route: {
      requirements: { research_required: true },
      signals: {},
      reasons: [],
    },
    phases: phaseCalls([{
      name: "collect_context",
      epistemic_roles: ["research"],
      epistemic_evidence: safeResearchEvidence(),
      outcome: "succeeded",
    }]),
  });

  assert.equal(gated.goal_status, "completed");
  assert.equal(gated.epistemic_state.research_tool_observed, true);
});

test("explicit epistemic roles override misleading research-like names", () => {
  const result = baseResult({
    epistemic_state: {
      ...baseResult().epistemic_state,
      research_status: "satisfied",
    },
  });
  const gated = applyAvantiqoEpistemicCompletionGate({
    result,
    route: {
      requirements: { research_required: true },
      signals: {},
      reasons: [],
    },
    phases: phaseCalls([{
      name: "operator_web_research",
      epistemic_roles: ["verification"],
      epistemic_evidence: safeResearchEvidence(),
      outcome: "succeeded",
    }]),
  });

  assert.equal(gated.goal_status, "in_progress");
  assert.equal(gated.epistemic_state.research_tool_observed, false);
});

test("diminishing returns cannot be claimed without safe evidence-quality proof", () => {
  const result = baseResult({
    epistemic_state: {
      ...baseResult().epistemic_state,
      research_status: "satisfied",
      stop_reason: "diminishing_returns",
    },
  });
  const gated = applyAvantiqoEpistemicCompletionGate({
    result,
    route: {
      requirements: { research_required: true },
      signals: {},
      reasons: [],
    },
    phases: phaseCalls([{
      name: "operator_web_research",
      epistemic_roles: ["research"],
      outcome: "succeeded",
    }]),
  });

  assert.equal(gated.goal_status, "in_progress");
  assert.equal(gated.epistemic_state.research_stop_proven, false);
  assert.equal(
    gated.epistemic_state.research_stop_evidence_reason,
    "NO_SAFE_RESEARCH_EVIDENCE_SUMMARY",
  );
  assert.ok(
    gated.epistemic_state.gate_violations.includes(
      "EPISTEMIC_RESEARCH_DIMINISHING_RETURNS_UNPROVEN",
    ),
  );
});

test("independent source support can prove a diminishing-returns research stop", () => {
  const result = baseResult({
    epistemic_state: {
      ...baseResult().epistemic_state,
      research_status: "satisfied",
      stop_reason: "diminishing_returns",
    },
  });
  const gated = applyAvantiqoEpistemicCompletionGate({
    result,
    route: {
      requirements: { research_required: true },
      signals: {},
      reasons: [],
    },
    phases: phaseCalls([{
      name: "collect_context",
      epistemic_roles: ["research"],
      outcome: "succeeded",
      epistemic_evidence: safeResearchEvidence(),
    }]),
  });

  assert.equal(gated.goal_status, "completed");
  assert.equal(gated.epistemic_state.gate_passed, true);
  assert.equal(gated.epistemic_state.research_stop_proven, true);
  assert.equal(
    gated.epistemic_state.research_stop_evidence_reason,
    "INDEPENDENT_SOURCE_SUPPORT",
  );
});

test("conflicted research cannot prove diminishing returns even with many sources", () => {
  const result = baseResult({
    epistemic_state: {
      ...baseResult().epistemic_state,
      research_status: "satisfied",
      stop_reason: "diminishing_returns",
    },
  });
  const gated = applyAvantiqoEpistemicCompletionGate({
    result,
    route: {
      requirements: { research_required: true },
      signals: {},
      reasons: [],
    },
    phases: phaseCalls([{
      name: "collect_context",
      epistemic_roles: ["research"],
      outcome: "succeeded",
      epistemic_evidence: safeResearchEvidence({
        source_count: 5,
        independent_source_count: 5,
        source_backed_claim_count: 4,
        conflict_count: 1,
      }),
    }]),
  });

  assert.equal(gated.goal_status, "in_progress");
  assert.equal(gated.epistemic_state.research_stop_proven, false);
  assert.equal(
    gated.epistemic_state.research_stop_evidence_reason,
    "RESEARCH_CONFLICT_REMAINS",
  );
});

test("quality verification without source proof cannot stop research", () => {
  const result = baseResult({
    epistemic_state: {
      ...baseResult().epistemic_state,
      research_status: "satisfied",
      stop_reason: "diminishing_returns",
    },
  });
  const gated = applyAvantiqoEpistemicCompletionGate({
    result,
    route: {
      requirements: { research_required: true },
      signals: {},
      reasons: [],
    },
    phases: phaseCalls([{
      name: "mechanism_probe",
      epistemic_roles: ["research"],
      outcome: "succeeded",
      epistemic_evidence: safeResearchEvidence({
        source_count: 0,
        independent_source_count: 0,
        official_primary_source_count: 0,
        source_backed_claim_count: 0,
        quality_verified: true,
      }),
    }]),
  });

  assert.equal(gated.goal_status, "in_progress");
  assert.equal(gated.epistemic_state.research_stop_proven, false);
  assert.equal(
    gated.epistemic_state.research_stop_evidence_reason,
    "QUALITY_VERIFICATION_WITHOUT_SOURCE_PROOF",
  );
});

test("source-backed mechanism quality can prove a research stop", () => {
  const result = baseResult({
    epistemic_state: {
      ...baseResult().epistemic_state,
      research_status: "satisfied",
      stop_reason: "diminishing_returns",
    },
  });
  const gated = applyAvantiqoEpistemicCompletionGate({
    result,
    route: {
      requirements: { research_required: true },
      signals: {},
      reasons: [],
    },
    phases: phaseCalls([{
      name: "mechanism_probe",
      epistemic_roles: ["research"],
      outcome: "succeeded",
      epistemic_evidence: safeResearchEvidence({
        independent_source_count: 1,
        official_primary_source_count: 0,
        quality_verified: true,
      }),
    }]),
  });

  assert.equal(gated.goal_status, "completed");
  assert.equal(gated.epistemic_state.research_stop_proven, true);
  assert.equal(
    gated.epistemic_state.research_stop_evidence_reason,
    "SOURCE_BACKED_MECHANISM_SUPPORT",
  );
});

test("mutation completion requires successful mutation and later successful verification", () => {
  const result = baseResult({
    epistemic_state: {
      ...baseResult().epistemic_state,
      verification_status: "verified",
    },
  });
  const route = {
    requirements: { verification_required: true },
    signals: { mutation_intent: true },
    reasons: [],
  };

  const unverified = applyAvantiqoEpistemicCompletionGate({
    result,
    route,
    phases: phaseCalls([{ name: "update_customer", outcome: "succeeded" }]),
  });
  assert.equal(unverified.goal_status, "in_progress");
  assert.ok(
    unverified.epistemic_state.gate_violations.includes(
      "EPISTEMIC_POST_MUTATION_VERIFICATION_UNSATISFIED",
    ),
  );

  const blockedVerification = applyAvantiqoEpistemicCompletionGate({
    result,
    route,
    phases: phaseCalls([
      { name: "update_customer", outcome: "succeeded" },
      { name: "read_customer_status", outcome: "blocked" },
    ]),
  });
  assert.equal(blockedVerification.goal_status, "in_progress");

  const verified = applyAvantiqoEpistemicCompletionGate({
    result,
    route,
    phases: phaseCalls([
      { name: "update_customer", outcome: "succeeded" },
      { name: "read_customer_status", outcome: "succeeded" },
    ]),
  });
  assert.equal(verified.goal_status, "completed");
  assert.equal(verified.epistemic_state.gate_passed, true);
  assert.equal(verified.epistemic_state.post_mutation_verification_observed, true);
});

test("semantic mutation evidence works even when the tool name looks read-only", () => {
  const result = baseResult({
    epistemic_state: {
      ...baseResult().epistemic_state,
      verification_status: "verified",
    },
  });
  const gated = applyAvantiqoEpistemicCompletionGate({
    result,
    route: {
      requirements: { verification_required: true },
      signals: { mutation_intent: true },
      reasons: [],
    },
    phases: phaseCalls([
      { name: "perform_operation", mutates: true, outcome: "succeeded" },
      {
        name: "observe_operation",
        mutates: false,
        epistemic_roles: ["verification"],
        outcome: "succeeded",
      },
    ]),
  });

  assert.equal(gated.goal_status, "completed");
  assert.equal(gated.epistemic_state.mutation_tool_observed, true);
  assert.equal(gated.epistemic_state.post_mutation_verification_observed, true);
});

test("explicit non-mutating semantics override misleading write-like names", () => {
  const result = baseResult({
    epistemic_state: {
      ...baseResult().epistemic_state,
      verification_status: "verified",
    },
  });
  const gated = applyAvantiqoEpistemicCompletionGate({
    result,
    route: {
      requirements: { verification_required: true },
      signals: { mutation_intent: true },
      reasons: [],
    },
    phases: phaseCalls([
      { name: "update_customer", mutates: false, outcome: "succeeded" },
      {
        name: "verify_customer",
        mutates: false,
        epistemic_roles: ["verification"],
        outcome: "succeeded",
      },
    ]),
  });

  assert.equal(gated.goal_status, "in_progress");
  assert.equal(gated.epistemic_state.mutation_tool_observed, false);
  assert.ok(
    gated.epistemic_state.gate_violations.includes(
      "EPISTEMIC_POST_MUTATION_VERIFICATION_UNSATISFIED",
    ),
  );
});

test("unresolved conflicting evidence prevents a completed conclusion", () => {
  const result = baseResult({
    epistemic_state: {
      ...baseResult().epistemic_state,
      conflict_status: "unresolved",
      unresolved_contradictions: [
        "Source A and source B disagree on the decisive claim",
      ],
    },
  });
  const gated = applyAvantiqoEpistemicCompletionGate({
    result,
    route: {
      requirements: {},
      signals: {},
      reasons: [{ code: "CONFLICTING_EVIDENCE" }],
    },
    phases: phaseCalls([]),
  });

  assert.equal(gated.goal_status, "in_progress");
  assert.ok(
    gated.epistemic_state.gate_violations.includes(
      "EPISTEMIC_CONFLICT_UNRESOLVED",
    ),
  );
  assert.ok(gated.confidence <= 0.55);
});

test("insufficient information or unfinished research blocks completion", () => {
  const result = baseResult({
    epistemic_state: {
      ...baseResult().epistemic_state,
      information_sufficient: false,
      stop_reason: "more_research_needed",
    },
  });
  const gated = applyAvantiqoEpistemicCompletionGate({
    result,
    route: { requirements: {}, signals: {}, reasons: [] },
    phases: phaseCalls([]),
  });

  assert.equal(gated.goal_status, "in_progress");
  assert.ok(
    gated.epistemic_state.gate_violations.includes(
      "EPISTEMIC_INFORMATION_INSUFFICIENT",
    ),
  );
  assert.ok(
    gated.epistemic_state.gate_violations.includes(
      "EPISTEMIC_RESEARCH_STOP_CONDITION_NOT_MET",
    ),
  );
});
