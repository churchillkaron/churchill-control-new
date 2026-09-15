import {
  agreementWithAutonomousRun,
  createOperatorAutonomousRun,
} from "@/lib/operator/contracts/OperatorAutonomousRun";

const RECOMMENDATION_KEY = "recommended_action";
const RECOMMENDATION_SELECTION_STATES = new Set(["PROPOSED", "SELECTED"]);
export const OPERATOR_RECOMMENDATION_PROOF_CONTRACT =
  "AVANTIQO_OPERATOR_RECOMMENDATION_PROOF_V1";
const RECOMMENDATION_EVIDENCE_CLASSES = new Set([
  "LIVE_EVIDENCE_BACKED",
  "CONTEXTUAL_INFERENCE",
  "SELECTED_REFINEMENT",
  "UNCLASSIFIED_RECOMMENDATION",
]);

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

function recommendationId() {
  const random = Math.random().toString(36).slice(2, 10);
  return `operator_recommendation_${Date.now()}_${random}`;
}

function selectionState(value) {
  const normalized = text(value, 40).toUpperCase();
  return RECOMMENDATION_SELECTION_STATES.has(normalized) ? normalized : null;
}

function canonicalRecommendationValue(value) {
  if (Array.isArray(value)) return value.map(canonicalRecommendationValue);
  if (value === null || value === undefined) return value ?? null;
  if (typeof value !== "object") return value;

  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .filter(
        (key) =>
          value[key] !== undefined && typeof value[key] !== "function",
      )
      .map((key) => [key, canonicalRecommendationValue(value[key])]),
  );
}

function sameRecommendationValue(left, right) {
  return (
    JSON.stringify(canonicalRecommendationValue(left)) ===
    JSON.stringify(canonicalRecommendationValue(right))
  );
}

function normalizedProofDependency(value = {}) {
  const source = object(value);
  const id = text(source.id || source.evidence_id, 160);
  if (!id) return null;
  return {
    id,
    source_kind: text(source.source_kind || source.kind, 80) || null,
    capability_key: text(source.capability_key, 300) || null,
    payload: object(source.payload),
    required: source.required !== false,
    verified: source.verified === true,
    current: source.current !== false,
    superseded: source.superseded === true,
    volatility: text(source.volatility, 40).toLowerCase() || "unknown",
    observed_at: text(source.observed_at || source.observedAt, 120) || null,
    ...(Number.isFinite(Number(source.max_age_ms ?? source.maxAgeMs))
      ? { max_age_ms: Math.max(0, Number(source.max_age_ms ?? source.maxAgeMs)) }
      : {}),
  };
}

function normalizedProofCondition(value = {}) {
  const source = object(value);
  const id = text(source.id || source.condition_id, 160);
  if (!id) return null;
  return {
    id,
    title: text(source.title || source.description, 500) || null,
    required: source.required !== false,
    verified: source.verified === true,
    status: text(source.status, 40).toLowerCase() || "unknown",
    volatility: text(source.volatility, 40).toLowerCase() || "unknown",
    observed_at: text(source.observed_at || source.observedAt, 120) || null,
    ...(Number.isFinite(Number(source.max_age_ms ?? source.maxAgeMs))
      ? { max_age_ms: Math.max(0, Number(source.max_age_ms ?? source.maxAgeMs)) }
      : {}),
  };
}

function uniqueText(values, limit = 400, maximum = 12) {
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

export function normalizeOperatorRecommendationProof(value = {}) {
  const source = object(value);
  const evidenceClass = text(source.evidence_class, 80).toUpperCase();
  const strongestAlternative = object(source.strongest_alternative);
  return {
    contract: OPERATOR_RECOMMENDATION_PROOF_CONTRACT,
    evidence_class: RECOMMENDATION_EVIDENCE_CLASSES.has(evidenceClass)
      ? evidenceClass
      : "UNCLASSIFIED_RECOMMENDATION",
    evidence_refs: uniqueText(source.evidence_refs, 180, 12),
    evidence_dependencies: list(source.evidence_dependencies)
      .slice(0, 20)
      .map(normalizedProofDependency)
      .filter(Boolean),
    validity_conditions: list(source.validity_conditions)
      .slice(0, 16)
      .map(normalizedProofCondition)
      .filter(Boolean),
    basis: text(source.basis, 1200) || null,
    strongest_alternative: text(
      strongestAlternative.description || source.strongest_alternative,
      900,
    ) || null,
    strongest_alternative_capability_key:
      text(strongestAlternative.capability_key, 300) ||
      text(source.strongest_alternative_capability_key, 300) ||
      null,
    critical_uncertainty: text(source.critical_uncertainty, 900) || null,
    falsification_condition: text(source.falsification_condition, 900) || null,
    next_proof_step: text(source.next_proof_step, 900) || null,
    as_of: text(source.as_of, 80) || new Date().toISOString(),
    requires_revalidation: source.requires_revalidation !== false,
    execution_proof: false,
    authority_effect: "NONE",
  };
}

function defaultRecommendationProof(recommendation = {}) {
  const source = object(recommendation);
  const sourceKind = text(source.source, 120).toLowerCase();
  return normalizeOperatorRecommendationProof({
    evidence_class: sourceKind.includes("refinement")
      ? "SELECTED_REFINEMENT"
      : "UNCLASSIFIED_RECOMMENDATION",
    basis: text(source.reason || source.description, 1200) || null,
    requires_revalidation: true,
    next_proof_step: source.verify_after
      ? text(source.verify_after?.description, 900) || null
      : null,
  });
}

function normalizedVerification(value) {
  const candidate = object(value);
  const capabilityKey = text(candidate.capability_key, 240);
  if (!capabilityKey) return null;

  return {
    capability_key: capabilityKey,
    description:
      text(candidate.description || candidate.label, 600) ||
      "Verify the recommended action took effect",
    payload: object(candidate.payload),
  };
}

export function normalizeOperatorRecommendation(value = {}) {
  const candidate = object(value);
  const capabilityKey = text(candidate.capability_key, 240);
  if (!capabilityKey) return null;

  const verifyAfter = normalizedVerification(candidate.verify_after);
  const normalizedSelectionState = selectionState(candidate.selection_state);
  const proof = Object.keys(object(candidate.proof)).length
    ? normalizeOperatorRecommendationProof(candidate.proof)
    : null;

  return {
    recommendation_id: text(candidate.recommendation_id, 160) || null,
    selection_state: normalizedSelectionState,
    capability_key: capabilityKey,
    description:
      text(candidate.description, 600) ||
      text(candidate.reason, 600) ||
      "Recommended business action",
    payload: object(candidate.payload),
    reason: text(candidate.reason, 800) || null,
    original_message: text(candidate.original_message, 4000) || null,
    objective: text(candidate.objective, 1200) || null,
    source: text(candidate.source, 80) || "operator_recommendation",
    created_at: text(candidate.created_at, 80) || new Date().toISOString(),
    ...(proof ? { proof } : {}),
    ...(verifyAfter ? { verify_after: verifyAfter } : {}),
  };
}

export function operatorRecommendationFromAgreementState(agreementState = {}) {
  const recommendation = normalizeOperatorRecommendation(
    object(agreementState)?.[RECOMMENDATION_KEY],
  );
  if (!recommendation) return null;

  if (recommendation.selection_state === "PROPOSED") {
    return recommendation;
  }

  const runStatus = text(agreementState?.autonomous_run?.status, 40).toLowerCase();
  if (["cancelled", "completed"].includes(runStatus)) return null;

  return recommendation;
}

export function operatorRecommendationMatchesPendingExecution(
  agreementState = {},
  recommendation = null,
) {
  const current = object(agreementState);
  const normalized = normalizeOperatorRecommendation(
    recommendation || current[RECOMMENDATION_KEY],
  );
  if (!normalized || normalized.selection_state === "PROPOSED") return false;

  const pending = object(current.pending_execution);
  const recommendationBindingId = text(normalized.recommendation_id, 160);
  const pendingBindingId = text(pending.recommendation_id, 160);
  if (recommendationBindingId || pendingBindingId) {
    if (
      !recommendationBindingId ||
      recommendationBindingId !== pendingBindingId
    ) {
      return false;
    }
  }

  if (text(pending.capability_key, 240) !== normalized.capability_key) {
    return false;
  }
  if (!sameRecommendationValue(pending.payload, normalized.payload)) {
    return false;
  }

  const run = object(current.autonomous_run);
  if (!text(run.run_id, 240)) return false;
  if (text(run.run_kind, 40).toLowerCase() !== "single_action") return false;
  if (
    ["cancelled", "completed", "superseded"].includes(
      text(run.status, 40).toLowerCase(),
    )
  ) {
    return false;
  }

  const requestedAction = list(run.planned_steps).find(
    (step) => text(step?.id) === "requested_action",
  );
  if (!requestedAction) return false;
  if (
    text(requestedAction.capability_key, 240) !== normalized.capability_key
  ) {
    return false;
  }
  return sameRecommendationValue(
    requestedAction.payload,
    normalized.payload,
  );
}

export function operatorRecommendationIsProposal(
  agreementState = {},
  recommendation = null,
) {
  const current = object(agreementState);
  const normalized = normalizeOperatorRecommendation(
    recommendation || current[RECOMMENDATION_KEY],
  );
  if (!normalized || normalized.selection_state !== "PROPOSED") return false;
  if (operatorRecommendationMatchesPendingExecution(current, normalized)) return false;

  if (text(current.pending_execution?.capability_key, 240)) return false;

  const run = object(current.autonomous_run);
  const runStatus = text(run.status, 40).toLowerCase();
  const activeRun = Boolean(
    text(run.run_id, 240) &&
      !["cancelled", "completed", "superseded"].includes(runStatus),
  );
  return !activeRun;
}

export function clearOperatorRecommendation(agreementState = {}) {
  const current = object(agreementState);
  const recommendation = normalizeOperatorRecommendation(
    current[RECOMMENDATION_KEY],
  );
  const exactBinding = Boolean(
    recommendation &&
      operatorRecommendationMatchesPendingExecution(current, recommendation),
  );
  const next = { ...current };
  delete next[RECOMMENDATION_KEY];

  if (!recommendation || !exactBinding) return next;

  delete next.pending_execution;
  delete next.autonomous_run;
  return next;
}

export function agreementWithOperatorRecommendationProposal(
  agreementState = {},
  recommendation,
) {
  const normalized = normalizeOperatorRecommendation(recommendation);
  if (!normalized) return object(agreementState);

  const cleared = clearOperatorRecommendation(agreementState);
  const proposedRecommendation = {
    ...normalized,
    proof: normalized.proof || defaultRecommendationProof(normalized),
    recommendation_id:
      text(normalized.recommendation_id, 160) || recommendationId(),
    selection_state: "PROPOSED",
  };

  return {
    ...cleared,
    [RECOMMENDATION_KEY]: proposedRecommendation,
  };
}

export function agreementWithOperatorRecommendation(
  agreementState = {},
  recommendation,
  { objective = null, evidenceSteps = [] } = {},
) {
  const normalized = normalizeOperatorRecommendation(recommendation);
  if (!normalized) return object(agreementState);

  const cleared = clearOperatorRecommendation(agreementState);
  const boundRecommendation = {
    ...normalized,
    proof: normalized.proof || defaultRecommendationProof(normalized),
    recommendation_id:
      text(normalized.recommendation_id, 160) || recommendationId(),
    selection_state: "SELECTED",
  };
  const pendingExecution = {
    recommendation_id: boundRecommendation.recommendation_id,
    capability_key: boundRecommendation.capability_key,
    description: boundRecommendation.description,
    payload: boundRecommendation.payload,
    reason: boundRecommendation.reason || boundRecommendation.description,
    original_message: boundRecommendation.original_message,
    recommendation_proof: boundRecommendation.proof || null,
    ...(boundRecommendation.verify_after
      ? { verify_after: boundRecommendation.verify_after }
      : {}),
  };

  const withRecommendation = {
    ...cleared,
    [RECOMMENDATION_KEY]: boundRecommendation,
    pending_execution: pendingExecution,
  };

  return agreementWithAutonomousRun(
    withRecommendation,
    createOperatorAutonomousRun({
      objective:
        text(objective, 1200) ||
        boundRecommendation.objective ||
        boundRecommendation.original_message ||
        boundRecommendation.description,
      evidenceSteps: list(evidenceSteps),
      pendingExecution,
    }),
  );
}