export const AVANTIQO_EPISTEMIC_COMPLETION_GATE_CONTRACT =
  "AVANTIQO_EPISTEMIC_COMPLETION_GATE_V1";

const RESEARCH_TOOL_PATTERN = /\b(research|search|web|evidence|browse|retrieve|retrieval|lookup|fetch|query)\b/i;
const LIVE_READ_TOOL_PATTERN = /\b(read|fetch|get|lookup|search|research|evidence|retrieve|browse|query|inspect|list|status)\b/i;
const MUTATION_TOOL_PATTERN = /\b(create|update|delete|remove|send|publish|deploy|commit|approve|pay|charge|refund|book|schedule|cancel|change|write|execute|run|apply|mutate)\b/i;
const VERIFICATION_TOOL_PATTERN = /\b(verify|validate|check|confirm|inspect|read|fetch|get|status|test|query|list|search|evidence)\b/i;
const ALLOWED_RESEARCH_STATUS = new Set(["not_required", "satisfied", "missing", "inconclusive"]);
const ALLOWED_LIVE_READ_STATUS = new Set(["not_required", "satisfied", "missing", "inconclusive"]);
const ALLOWED_VERIFICATION_STATUS = new Set(["not_required", "verified", "missing", "failed", "inconclusive"]);
const ALLOWED_CONFLICT_STATUS = new Set(["none", "resolved", "unresolved"]);
const ALLOWED_STOP_REASONS = new Set([
  "not_required",
  "sufficient_evidence",
  "diminishing_returns",
  "blocked",
  "more_research_needed",
]);

function text(value, limit = 12000) {
  return String(value ?? "").trim().slice(0, limit);
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function bounded(value, fallback = 0.5) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(1, number));
}

function normalizedStatus(value, allowed, fallback) {
  const status = text(value, 80).toLowerCase();
  return allowed.has(status) ? status : fallback;
}

function normalizedStrings(value, maximum = 12) {
  return list(value)
    .map((item) => text(typeof item === "string" ? item : item?.text || item?.statement || item?.claim, 1200))
    .filter(Boolean)
    .slice(0, maximum);
}

function flattenToolCalls(phases = {}) {
  const rows = [];
  let sequence = 0;
  for (const phaseName of ["reason_act_observe", "critique_repair"]) {
    const phase = object(object(phases)[phaseName]);
    for (const turn of list(phase.transcript)) {
      const turnNumber = Number(turn?.turn || 0);
      list(turn?.tool_calls).forEach((call, order) => {
        const name = text(call?.name, 240);
        if (!name) return;
        rows.push({
          sequence,
          phase: phaseName,
          turn: turnNumber,
          order,
          name,
        });
        sequence += 1;
      });
    }
  }
  return rows;
}

function observedMatching(calls, pattern, afterSequence = -1) {
  return calls.find((call) => {
    const normalizedName = call.name.replace(/[_./:-]+/g, " ");
    return call.sequence > afterSequence && pattern.test(normalizedName);
  }) || null;
}

function routeHasReason(route, code) {
  return list(object(route).reasons).some((reason) => text(reason?.code, 120) === code);
}

function declaredEpistemicState(result = {}) {
  const declared = object(object(result).epistemic_state);
  return {
    information_sufficient: declared.information_sufficient === false
      ? false
      : declared.information_sufficient === true
        ? true
        : null,
    research_status: normalizedStatus(declared.research_status, ALLOWED_RESEARCH_STATUS, "missing"),
    live_read_status: normalizedStatus(declared.live_read_status, ALLOWED_LIVE_READ_STATUS, "missing"),
    verification_status: normalizedStatus(declared.verification_status, ALLOWED_VERIFICATION_STATUS, "missing"),
    conflict_status: normalizedStatus(declared.conflict_status, ALLOWED_CONFLICT_STATUS, "none"),
    unresolved_contradictions: normalizedStrings(declared.unresolved_contradictions, 12),
    critical_assumptions: normalizedStrings(declared.critical_assumptions, 12),
    unresolved_questions: normalizedStrings(declared.unresolved_questions, 12),
    stop_reason: normalizedStatus(declared.stop_reason, ALLOWED_STOP_REASONS, "not_required"),
  };
}

function verificationEvidence({ route, calls }) {
  const signals = object(object(route).signals);
  if (signals.mutation_intent === true) {
    const mutation = observedMatching(calls, MUTATION_TOOL_PATTERN);
    if (!mutation) return { observed: false, mutation_observed: false, post_mutation_observed: false };
    const verification = observedMatching(calls, VERIFICATION_TOOL_PATTERN, mutation.sequence);
    return {
      observed: Boolean(verification),
      mutation_observed: true,
      post_mutation_observed: Boolean(verification),
    };
  }
  return {
    observed: Boolean(observedMatching(calls, VERIFICATION_TOOL_PATTERN)),
    mutation_observed: false,
    post_mutation_observed: false,
  };
}

function confidenceCapFor(violations) {
  if (violations.some((code) => code.includes("CONFLICT"))) return 0.55;
  if (violations.some((code) => code.includes("INFORMATION_INSUFFICIENT"))) return 0.55;
  if (violations.some((code) => code.includes("RESEARCH"))) return 0.58;
  if (violations.some((code) => code.includes("LIVE_READ"))) return 0.58;
  if (violations.some((code) => code.includes("VERIFICATION"))) return 0.6;
  return 0.62;
}

export function applyAvantiqoEpistemicCompletionGate({
  result = {},
  route = {},
  phases = {},
} = {}) {
  const normalizedResult = object(result);
  const requirements = object(object(route).requirements);
  const declared = declaredEpistemicState(normalizedResult);
  const calls = flattenToolCalls(phases);
  const researchObserved = Boolean(observedMatching(calls, RESEARCH_TOOL_PATTERN));
  const liveReadObserved = Boolean(observedMatching(calls, LIVE_READ_TOOL_PATTERN));
  const verification = verificationEvidence({ route, calls });
  const conflictExpected = routeHasReason(route, "CONFLICTING_EVIDENCE") || declared.unresolved_contradictions.length > 0;
  const violations = [];
  const completionClaimed = text(normalizedResult.goal_status, 40).toLowerCase() === "completed";

  if (completionClaimed) {
    if (
      requirements.research_required === true &&
      (declared.research_status !== "satisfied" || !researchObserved)
    ) {
      violations.push("EPISTEMIC_RESEARCH_REQUIREMENT_UNSATISFIED");
    }
    if (
      requirements.live_read_required === true &&
      (declared.live_read_status !== "satisfied" || !liveReadObserved)
    ) {
      violations.push("EPISTEMIC_LIVE_READ_REQUIREMENT_UNSATISFIED");
    }
    if (
      requirements.verification_required === true &&
      (declared.verification_status !== "verified" || !verification.observed)
    ) {
      violations.push(
        object(object(route).signals).mutation_intent === true
          ? "EPISTEMIC_POST_MUTATION_VERIFICATION_UNSATISFIED"
          : "EPISTEMIC_VERIFICATION_REQUIREMENT_UNSATISFIED",
      );
    }
    if (conflictExpected && declared.conflict_status !== "resolved") {
      violations.push("EPISTEMIC_CONFLICT_UNRESOLVED");
    }
    if (declared.unresolved_contradictions.length > 0) {
      violations.push("EPISTEMIC_CONTRADICTIONS_REMAIN");
    }
    if (declared.information_sufficient === false) {
      violations.push("EPISTEMIC_INFORMATION_INSUFFICIENT");
    }
    if (declared.stop_reason === "more_research_needed") {
      violations.push("EPISTEMIC_RESEARCH_STOP_CONDITION_NOT_MET");
    }
  }

  const uniqueViolations = [...new Set(violations)];
  const gatePassed = uniqueViolations.length === 0;
  const selfCheck = object(normalizedResult.self_check);
  const existingIssues = normalizedStrings(selfCheck.issues, 12);
  const confidence = bounded(normalizedResult.confidence, 0.5);
  const cappedConfidence = gatePassed
    ? confidence
    : Math.min(confidence, confidenceCapFor(uniqueViolations));
  const originalNextStep = text(normalizedResult.next_step, 1200) || null;

  return {
    ...normalizedResult,
    goal_status: completionClaimed && !gatePassed ? "in_progress" : normalizedResult.goal_status,
    confidence: Number(cappedConfidence.toFixed(4)),
    self_check: {
      ...selfCheck,
      passed: gatePassed ? selfCheck.passed !== false : false,
      issues: [...new Set([...existingIssues, ...uniqueViolations])].slice(0, 16),
    },
    repair_needed: normalizedResult.repair_needed === true || !gatePassed,
    next_step: !gatePassed && !originalNextStep
      ? `Satisfy epistemic completion gate: ${uniqueViolations.join(", ")}`
      : originalNextStep,
    epistemic_state: {
      ...declared,
      gate_contract: AVANTIQO_EPISTEMIC_COMPLETION_GATE_CONTRACT,
      gate_passed: gatePassed,
      gate_violations: uniqueViolations,
      observed_tool_calls: calls.length,
      research_tool_observed: researchObserved,
      live_read_tool_observed: liveReadObserved,
      verification_tool_observed: verification.observed,
      mutation_tool_observed: verification.mutation_observed,
      post_mutation_verification_observed: verification.post_mutation_observed,
    },
  };
}

export const AvantiqoEpistemicCompletionGateRuntime = Object.freeze({
  contract: AVANTIQO_EPISTEMIC_COMPLETION_GATE_CONTRACT,
  apply: applyAvantiqoEpistemicCompletionGate,
});
