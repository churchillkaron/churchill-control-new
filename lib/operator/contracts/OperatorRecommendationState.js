import {
  agreementWithAutonomousRun,
  createOperatorAutonomousRun,
} from "@/lib/operator/contracts/OperatorAutonomousRun";

const RECOMMENDATION_KEY = "recommended_action";

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

  return {
    recommendation_id: text(candidate.recommendation_id, 160) || null,
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
    ...(verifyAfter ? { verify_after: verifyAfter } : {}),
  };
}

export function operatorRecommendationFromAgreementState(agreementState = {}) {
  const recommendation = normalizeOperatorRecommendation(
    object(agreementState)?.[RECOMMENDATION_KEY],
  );
  if (!recommendation) return null;

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
  if (!normalized) return false;

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

export function clearOperatorRecommendation(agreementState = {}) {
  const current = object(agreementState);
  const recommendation = normalizeOperatorRecommendation(
    current[RECOMMENDATION_KEY],
  );
  const next = { ...current };
  delete next[RECOMMENDATION_KEY];

  if (!recommendation) return next;

  const pending = object(next.pending_execution);
  if (text(pending.capability_key) === recommendation.capability_key) {
    delete next.pending_execution;
  }

  const run = object(next.autonomous_run);
  const requestedAction = list(run.planned_steps).find(
    (step) => text(step?.id) === "requested_action",
  );
  if (
    text(run.run_kind).toLowerCase() === "single_action" &&
    text(requestedAction?.capability_key) === recommendation.capability_key &&
    ["active", "awaiting_confirmation", "superseded"].includes(
      text(run.status).toLowerCase(),
    )
  ) {
    delete next.autonomous_run;
  }

  return next;
}

export function agreementWithOperatorRecommendation(
  agreementState = {},
  recommendation,
  { objective = null, evidenceSteps = [] } = {},
) {
  const normalized = normalizeOperatorRecommendation(recommendation);
  if (!normalized) return object(agreementState);

  const boundRecommendation = {
    ...normalized,
    recommendation_id:
      text(normalized.recommendation_id, 160) || recommendationId(),
  };
  const pendingExecution = {
    recommendation_id: boundRecommendation.recommendation_id,
    capability_key: boundRecommendation.capability_key,
    description: boundRecommendation.description,
    payload: boundRecommendation.payload,
    reason: boundRecommendation.reason || boundRecommendation.description,
    original_message: boundRecommendation.original_message,
    ...(boundRecommendation.verify_after
      ? { verify_after: boundRecommendation.verify_after }
      : {}),
  };

  const withRecommendation = {
    ...object(agreementState),
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
