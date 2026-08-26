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
          outcome: call.outcome || "succeeded",
          code: call.code || null,
        })),
      }],
    },
    critique_repair: null,
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

test("required research passes only after a successful governed research observation", () => {
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
    phases: phaseCalls([{ name: "operator_web_research", outcome: "succeeded" }]),
  });

  assert.equal(gated.goal_status, "completed");
  assert.equal(gated.epistemic_state.gate_passed, true);
  assert.equal(gated.epistemic_state.research_tool_observed, true);
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

test("explicit research semantics can certify a generic tool name", () => {
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
      outcome: "succeeded",
    }]),
  });

  assert.equal(gated.goal_status, "in_progress");
  assert.equal(gated.epistemic_state.research_tool_observed, false);
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
