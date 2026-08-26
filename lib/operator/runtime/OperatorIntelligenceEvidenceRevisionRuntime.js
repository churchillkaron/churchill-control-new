import {
  assessOperatorIntelligencePlan,
  buildOperatorIntelligencePlan,
  reviseOperatorIntelligencePlan,
} from "./OperatorIntelligencePlanGraphRuntime.js";

export const OPERATOR_INTELLIGENCE_EVIDENCE_REVISION_CONTRACT =
  "AVANTIQO_OPERATOR_INTELLIGENCE_EVIDENCE_REVISION_V1";

const MAX_REPLANS = 6;
const DEFAULT_MAX_REPLANS = 3;
const TRUSTED_SUCCESS = new Set(["completed", "verified"]);
const TRUSTED_VERIFICATION = new Set(["pass", "not_required"]);
const PLAN_IMPACTS = new Set([
  "none",
  "supports",
  "contradicts",
  "invalidates",
  "material_change",
]);
const REPLAN_IMPACTS = new Set(["contradicts", "invalidates", "material_change"]);

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, parsed));
}

function uniqueText(values, limit = 800, maximum = 10) {
  const output = [];
  const seen = new Set();
  for (const value of list(values)) {
    const clean = text(value, limit);
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    output.push(clean);
    if (output.length >= maximum) break;
  }
  return output;
}

function normalizedImpact(value) {
  const impact = text(value, 80).toLowerCase();
  return PLAN_IMPACTS.has(impact) ? impact : "none";
}

function normalizeEvidenceObservation(value = {}) {
  const source = object(value);
  const status = text(source.status, 60).toLowerCase();
  const verificationStatus = text(source.verification_status, 60).toLowerCase();
  const contradictions = uniqueText(source.contradictions, 800, 10);
  const invalidatedAssumptions = uniqueText(
    source.invalidated_assumptions || source.invalidates_assumptions,
    800,
    10,
  );
  const planImpact = normalizedImpact(source.plan_impact || source.plan_effect);
  const trusted = TRUSTED_SUCCESS.has(status) &&
    TRUSTED_VERIFICATION.has(verificationStatus);
  const explicitReplan = source.requires_replan === true;
  const invalidatesPlan = trusted && Boolean(
    explicitReplan ||
    REPLAN_IMPACTS.has(planImpact) ||
    contradictions.length ||
    invalidatedAssumptions.length
  );

  return {
    step_id: text(source.step_id || source.id, 120),
    status,
    verification_status: verificationStatus,
    trusted,
    plan_impact: planImpact,
    requires_replan: explicitReplan,
    contradictions,
    invalidated_assumptions: invalidatedAssumptions,
    revision_reason: text(source.revision_reason || source.reason, 1000) || null,
    evidence: uniqueText(source.evidence, 1000, 10),
    invalidates_plan: invalidatesPlan,
  };
}

function planInvalidations(observations = []) {
  return list(observations)
    .map(normalizeEvidenceObservation)
    .filter((observation) => observation.step_id && observation.invalidates_plan)
    .slice(0, 12)
    .map((observation) => ({
      step_id: observation.step_id,
      plan_impact: observation.plan_impact,
      contradictions: observation.contradictions,
      invalidated_assumptions: observation.invalidated_assumptions,
      revision_reason: observation.revision_reason,
      evidence: observation.evidence,
      trusted_observation: true,
    }));
}

function verificationBlockedReadySteps(plan = {}, assessment = {}) {
  const proofGapIds = new Set(
    list(assessment.verification_proof_gaps)
      .map((gap) => text(gap?.step_id, 120))
      .filter(Boolean),
  );
  if (!proofGapIds.size) return [];

  const stepById = new Map(
    list(object(plan).steps)
      .map((step) => object(step))
      .map((step) => [text(step.id, 120), step])
      .filter(([id]) => id),
  );

  return list(assessment.ready_step_ids)
    .map((id) => text(id, 120))
    .filter(Boolean)
    .map((id) => {
      const step = stepById.get(id);
      const dependencies = list(step?.depends_on)
        .map((dependency) => text(dependency, 120))
        .filter((dependency) => proofGapIds.has(dependency));
      return dependencies.length
        ? {
            step_id: id,
            reason: "DEPENDENCY_VERIFICATION_NOT_PROVEN",
            dependencies,
          }
        : null;
    })
    .filter(Boolean);
}

function replanTriggers(baseAssessment, invalidations) {
  const triggers = [];
  if (list(baseAssessment.failed_step_ids).length) triggers.push("execution_failure");
  if (list(baseAssessment.blocked_steps).length) triggers.push("blocked_dependency");
  if (invalidations.length) triggers.push("plan_invalidating_evidence");
  return triggers;
}

export function assessOperatorIntelligencePlanWithEvidenceRevision({
  plan = {},
  observations = [],
} = {}) {
  const base = assessOperatorIntelligencePlan({ plan, observations });
  const invalidations = planInvalidations(observations);
  const verificationBlocked = verificationBlockedReadySteps(plan, base);
  const verificationBlockedIds = new Set(
    verificationBlocked.map((item) => item.step_id),
  );
  const baseReady = list(base.ready_step_ids)
    .map((id) => text(id, 120))
    .filter(Boolean);
  const verificationSafeReady = baseReady.filter(
    (id) => !verificationBlockedIds.has(id),
  );
  const invalidated = invalidations.length > 0;
  const safeReady = invalidated ? [] : verificationSafeReady;
  const staleReady = invalidated ? verificationSafeReady : [];
  const completionProven = base.completion_proven === true && !invalidated;
  const requiresReplan = base.requires_replan === true || invalidated;

  return {
    ...base,
    evidence_revision_contract: OPERATOR_INTELLIGENCE_EVIDENCE_REVISION_CONTRACT,
    status: completionProven
      ? "COMPLETION_PROVEN"
      : requiresReplan
        ? "REPLAN_REQUIRED"
        : "IN_PROGRESS",
    completion_proven: completionProven,
    ready_step_ids: safeReady,
    stale_ready_step_ids: staleReady,
    verification_blocked_steps: verificationBlocked,
    plan_invalidations: invalidations,
    requires_replan: requiresReplan,
    replan_triggers: replanTriggers(base, invalidations),
    governance: {
      ...object(base.governance),
      successful_evidence_can_invalidate_plan: true,
      plan_invalidating_evidence_requires_replan: true,
      stale_ready_steps_suppressed_after_invalidation: true,
      unverified_evidence_cannot_invalidate_plan: true,
      unverified_dependencies_cannot_release_downstream_steps: true,
      raw_reasoning_persisted: false,
    },
  };
}

function completedStepSignature(value = {}) {
  const step = object(value);
  return JSON.stringify({
    id: text(step.id, 120),
    kind: text(step.kind || step.type, 80).toLowerCase(),
    title: text(step.title || step.description, 500),
    capability_key: text(step.capability_key, 300) || null,
    mutates: step.mutates === true ||
      text(step.kind || step.type, 80).toLowerCase() === "action_candidate",
  });
}

function evidenceReplanReason(invalidations) {
  const explicit = invalidations
    .map((item) => text(item.revision_reason, 500))
    .filter(Boolean);
  if (explicit.length) return explicit.join("; ").slice(0, 800);
  const compact = invalidations
    .map((item) => `${item.step_id}:${item.plan_impact}`)
    .join(", ");
  return `Verified evidence invalidated the active plan: ${compact}`.slice(0, 800);
}

export function reviseOperatorIntelligencePlanWithEvidenceRevision({
  plan = {},
  revised_steps = [],
  observations = [],
  replan_reason = null,
} = {}) {
  const source = object(plan);
  const assessment = assessOperatorIntelligencePlanWithEvidenceRevision({
    plan: source,
    observations,
  });

  if (assessment.completion_proven) {
    return {
      status: "REPLAN_NOT_REQUIRED_COMPLETION_ALREADY_PROVEN",
      plan: source,
      assessment,
    };
  }

  if (!assessment.plan_invalidations.length) {
    const baseRevision = reviseOperatorIntelligencePlan({
      plan: source,
      revised_steps,
      observations,
      replan_reason,
    });
    return {
      ...baseRevision,
      evidence_revision_contract: OPERATOR_INTELLIGENCE_EVIDENCE_REVISION_CONTRACT,
      evidence_driven_replan: false,
    };
  }

  const revision = boundedInteger(source.revision, 0, 0, MAX_REPLANS);
  const maxReplans = boundedInteger(
    source.max_replans,
    DEFAULT_MAX_REPLANS,
    0,
    MAX_REPLANS,
  );
  if (revision >= maxReplans) {
    return {
      status: "REPLAN_BUDGET_EXHAUSTED",
      plan: source,
      assessment,
      blocked: true,
      evidence_revision_contract: OPERATOR_INTELLIGENCE_EVIDENCE_REVISION_CONTRACT,
      evidence_driven_replan: true,
    };
  }

  const oldById = new Map(
    list(source.steps)
      .map((step) => object(step))
      .map((step) => [text(step.id, 120), step])
      .filter(([id]) => id),
  );
  const candidateById = new Map(
    list(revised_steps)
      .map((step) => object(step))
      .map((step) => [text(step.id, 120), step])
      .filter(([id]) => id),
  );
  const completedIds = new Set(
    list(assessment.completed_step_ids)
      .map((id) => text(id, 120))
      .filter(Boolean),
  );
  const historyIssues = [];

  for (const id of completedIds) {
    const before = oldById.get(id);
    const after = candidateById.get(id);
    if (!after) {
      historyIssues.push({
        code: "COMPLETED_STEP_REMOVED_DURING_EVIDENCE_REPLAN",
        step_id: id,
      });
      continue;
    }
    if (completedStepSignature(before) !== completedStepSignature(after)) {
      historyIssues.push({
        code: "COMPLETED_STEP_REWRITTEN_DURING_EVIDENCE_REPLAN",
        step_id: id,
      });
    }
  }

  if (historyIssues.length) {
    return {
      status: "REPLAN_REJECTED_COMPLETED_HISTORY_MUTATION",
      plan: source,
      assessment,
      issues: historyIssues,
      blocked: true,
      evidence_revision_contract: OPERATOR_INTELLIGENCE_EVIDENCE_REVISION_CONTRACT,
      evidence_driven_replan: true,
    };
  }

  const revised = buildOperatorIntelligencePlan({
    goal: source.goal,
    brief: { completion_test: source.completion_criteria },
    plan_steps: list(revised_steps),
    revision: revision + 1,
    max_replans: maxReplans,
    parent_plan_id: source.plan_id,
    replan_reason:
      text(replan_reason, 800) ||
      evidenceReplanReason(assessment.plan_invalidations),
  });

  return {
    status: revised.valid ? "REPLAN_ACCEPTED" : "REPLAN_INVALID",
    plan: revised,
    previous_assessment: assessment,
    preserved_completed_step_ids: [...completedIds],
    blocked: revised.valid !== true,
    evidence_revision_contract: OPERATOR_INTELLIGENCE_EVIDENCE_REVISION_CONTRACT,
    evidence_driven_replan: true,
  };
}

export const OperatorIntelligenceEvidenceRevisionRuntime = Object.freeze({
  contract: OPERATOR_INTELLIGENCE_EVIDENCE_REVISION_CONTRACT,
  assess: assessOperatorIntelligencePlanWithEvidenceRevision,
  revise: reviseOperatorIntelligencePlanWithEvidenceRevision,
});
