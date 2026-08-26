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

function count(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return 0;
  return Math.floor(number);
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

function normalizedRoles(value) {
  return [...new Set(
    list(value)
      .map((role) => text(role, 80).toLowerCase())
      .filter(Boolean),
  )].slice(0, 8);
}

function normalizedEvidence(value) {
  const evidence = object(value);
  if (!Object.keys(evidence).length) return null;
  return {
    contract: text(evidence.contract, 160) || null,
    source_count: count(evidence.source_count),
    independent_source_count: count(evidence.independent_source_count),
    official_primary_source_count: count(evidence.official_primary_source_count),
    claim_count: count(evidence.claim_count),
    source_backed_claim_count: count(evidence.source_backed_claim_count),
    unresolved_uncertainty_count: count(evidence.unresolved_uncertainty_count),
    follow_up_query_count: count(evidence.follow_up_query_count),
    conflict_count: count(evidence.conflict_count),
    provider_search_observed: evidence.provider_search_observed === true,
    quality_verified: evidence.quality_verified === true,
    canonical_authority: evidence.canonical_authority === true,
    verified_knowledge_reuse: evidence.verified_knowledge_reuse === true,
    raw_research_persisted: evidence.raw_research_persisted === true,
  };
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
          mutates: typeof call?.mutates === "boolean" ? call.mutates : null,
          epistemic_roles: normalizedRoles(call?.epistemic_roles),
          epistemic_evidence: normalizedEvidence(call?.epistemic_evidence),
          outcome: text(call?.outcome, 40).toLowerCase() || "unknown",
          code: text(call?.code, 160) || null,
        });
        sequence += 1;
      });
    }
  }
  return rows;
}

function nameMatches(call, pattern) {
  const normalizedName = call.name.replace(/[_./:-]+/g, " ");
  return pattern.test(normalizedName);
}

function epistemicRoleMatches(call, role, pattern) {
  if (call.epistemic_roles.length > 0) {
    return call.epistemic_roles.includes(role);
  }
  return nameMatches(call, pattern);
}

function mutationMatches(call) {
  if (call.mutates === true) return true;
  if (call.mutates === false) return false;
  return nameMatches(call, MUTATION_TOOL_PATTERN);
}

function successfulMatching(calls, matcher, afterSequence = -1) {
  return calls.find((call) =>
    call.sequence > afterSequence &&
    call.outcome === "succeeded" &&
    matcher(call)
  ) || null;
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

function researchEvidence(calls) {
  return successfulMatching(
    calls,
    (call) => epistemicRoleMatches(call, "research", RESEARCH_TOOL_PATTERN),
  );
}

function researchStoppingEvidence(call) {
  const evidence = object(call?.epistemic_evidence);
  if (!Object.keys(evidence).length) {
    return { proven: false, reason: "NO_SAFE_RESEARCH_EVIDENCE_SUMMARY" };
  }
  if (evidence.raw_research_persisted === true) {
    return { proven: false, reason: "RAW_RESEARCH_SUMMARY_FORBIDDEN" };
  }
  if (evidence.conflict_count > 0) {
    return { proven: false, reason: "RESEARCH_CONFLICT_REMAINS" };
  }
  if (evidence.canonical_authority === true || evidence.verified_knowledge_reuse === true) {
    return { proven: true, reason: "VERIFIED_KNOWLEDGE_AUTHORITY" };
  }
  if (evidence.quality_verified === true) {
    return { proven: true, reason: "MECHANISM_QUALITY_VERIFIED" };
  }
  const independentlySupported =
    evidence.source_count >= 2 &&
    evidence.independent_source_count >= 2 &&
    (
      evidence.source_backed_claim_count >= 1 ||
      evidence.official_primary_source_count >= 1
    );
  return independentlySupported
    ? { proven: true, reason: "INDEPENDENT_SOURCE_SUPPORT" }
    : { proven: false, reason: "INDEPENDENT_SUPPORT_INSUFFICIENT" };
}

function liveReadEvidence(calls) {
  return successfulMatching(
    calls,
    (call) => epistemicRoleMatches(call, "live_read", LIVE_READ_TOOL_PATTERN),
  );
}

function verificationToolEvidence(calls, afterSequence = -1) {
  return successfulMatching(
    calls,
    (call) => epistemicRoleMatches(call, "verification", VERIFICATION_TOOL_PATTERN),
    afterSequence,
  );
}

function verificationEvidence({ route, calls }) {
  const signals = object(object(route).signals);
  if (signals.mutation_intent === true) {
    const mutation = successfulMatching(calls, mutationMatches);
    if (!mutation) return { observed: false, mutation_observed: false, post_mutation_observed: false };
    const verification = verificationToolEvidence(calls, mutation.sequence);
    return {
      observed: Boolean(verification),
      mutation_observed: true,
      post_mutation_observed: Boolean(verification),
    };
  }
  return {
    observed: Boolean(verificationToolEvidence(calls)),
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
  const successfulCalls = calls.filter((call) => call.outcome === "succeeded");
  const blockedCalls = calls.filter((call) => call.outcome === "blocked");
  const failedCalls = calls.filter((call) => call.outcome === "failed");
  const researchCall = researchEvidence(calls);
  const researchObserved = Boolean(researchCall);
  const researchStop = researchStoppingEvidence(researchCall);
  const liveReadObserved = Boolean(liveReadEvidence(calls));
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
      requirements.research_required === true &&
      declared.stop_reason === "diminishing_returns" &&
      !researchStop.proven
    ) {
      violations.push("EPISTEMIC_RESEARCH_DIMINISHING_RETURNS_UNPROVEN");
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
      successful_tool_calls: successfulCalls.length,
      blocked_tool_calls: blockedCalls.length,
      failed_tool_calls: failedCalls.length,
      research_tool_observed: researchObserved,
      research_stop_proven: researchStop.proven,
      research_stop_evidence_reason: researchStop.reason,
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
