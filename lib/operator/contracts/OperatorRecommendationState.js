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

  const pendingExecution = {
    capability_key: normalized.capability_key,
    description: normalized.description,
    payload: normalized.payload,
    reason: normalized.reason || normalized.description,
    original_message: normalized.original_message,
    ...(normalized.verify_after
      ? { verify_after: normalized.verify_after }
      : {}),
  };

  const withRecommendation = {
    ...object(agreementState),
    [RECOMMENDATION_KEY]: normalized,
    pending_execution: pendingExecution,
  };

  return agreementWithAutonomousRun(
    withRecommendation,
    createOperatorAutonomousRun({
      objective:
        text(objective, 1200) ||
        normalized.objective ||
        normalized.original_message ||
        normalized.description,
      evidenceSteps: list(evidenceSteps),
      pendingExecution,
    }),
  );
}
