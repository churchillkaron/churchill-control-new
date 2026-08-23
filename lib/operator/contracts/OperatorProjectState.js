import {
  normalizeOperatorBusinessThesis,
} from "@/lib/operator/contracts/OperatorBusinessThesis";

const PROJECT_STATUSES = new Set([
  "idle",
  "discussing",
  "active",
  "blocked",
  "awaiting_confirmation",
  "completed",
  "cancelled",
]);

function text(value, limit = 1200) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function hasOwn(source, key) {
  return Object.prototype.hasOwnProperty.call(source, key);
}

function strings(value, limit = 10, itemLimit = 500) {
  if (!Array.isArray(value)) return [];

  return value
    .slice(0, limit)
    .map((item) => text(item, itemLimit))
    .filter(Boolean);
}

function previousStrings(source, key, fallback, objectiveChanged) {
  if (hasOwn(source, key)) return strings(source[key]);
  if (objectiveChanged) return [];
  return strings(fallback[key]);
}

function confidence(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(1, numeric));
}

function systemSnapshot(value) {
  const snapshot = object(value);
  const snapshotId = text(snapshot.snapshot_id, 100);
  if (!snapshotId) return null;

  return {
    snapshot_id: snapshotId,
    phase: text(snapshot.phase, 40) || null,
    status: text(snapshot.status, 40) || null,
    checked_at: text(snapshot.checked_at, 80) || null,
    diagnosis_codes: strings(snapshot.diagnosis_codes, 20, 100),
    verification_required: snapshot.verification_required === true,
  };
}

function decisionSupersession(value) {
  const candidate = object(value);
  const previous = text(candidate.previous, 500);
  const replacement = text(candidate.replacement, 500);
  const source = text(candidate.source, 120);
  if (!previous || !replacement || previous === replacement || !source) {
    return null;
  }
  return {
    previous,
    replacement,
    source,
  };
}

function normalizedStatus(value, fallback = "idle") {
  const candidate = text(value, 40).toLowerCase();
  if (PROJECT_STATUSES.has(candidate)) return candidate;

  const previous = text(fallback, 40).toLowerCase();
  return PROJECT_STATUSES.has(previous) ? previous : "idle";
}

export function normalizeOperatorProjectState(
  value,
  { previousState = {} } = {},
) {
  const source = object(value);
  if (!Object.keys(source).length) return {};

  const previous = object(previousState);
  const hasObjective = hasOwn(source, "objective") || hasOwn(source, "goal");
  const objective = hasObjective
    ? text(source.objective ?? source.goal, 600)
    : text(previous.objective, 600);
  const objectiveChanged = hasObjective && objective !== text(previous.objective, 600);

  let status = normalizedStatus(
    source.status,
    objectiveChanged
      ? objective
        ? "discussing"
        : "idle"
      : previous.status,
  );

  let userConfirmedComplete = hasOwn(source, "user_confirmed_complete")
    ? source.user_confirmed_complete === true
    : !objectiveChanged && previous.user_confirmed_complete === true;

  if (!objective && !["cancelled", "completed"].includes(status)) {
    status = "idle";
  }

  if (status === "completed" && !userConfirmedComplete) {
    status = "awaiting_confirmation";
  }

  if (status !== "completed") {
    userConfirmedComplete = false;
  }

  const businessThesis = hasOwn(source, "business_thesis")
    ? normalizeOperatorBusinessThesis(source.business_thesis)
    : normalizeOperatorBusinessThesis(previous.business_thesis);

  const nextDecisionSupersession = hasOwn(source, "last_decision_supersession")
    ? decisionSupersession(source.last_decision_supersession)
    : objectiveChanged
      ? null
      : decisionSupersession(previous.last_decision_supersession);

  return {
    objective: objective || null,
    status,
    success_criteria: previousStrings(
      source,
      "success_criteria",
      previous,
      objectiveChanged,
    ),
    constraints: previousStrings(
      source,
      "constraints",
      previous,
      objectiveChanged,
    ),
    decisions: previousStrings(
      source,
      "decisions",
      previous,
      objectiveChanged,
    ),
    assumptions: previousStrings(
      source,
      "assumptions",
      previous,
      objectiveChanged,
    ),
    risks: previousStrings(
      source,
      "risks",
      previous,
      objectiveChanged,
    ),
    opportunities: previousStrings(
      source,
      "opportunities",
      previous,
      objectiveChanged,
    ),
    completed_steps: previousStrings(
      source,
      "completed_steps",
      previous,
      objectiveChanged,
    ),
    progress_summary: hasOwn(source, "progress_summary")
      ? text(source.progress_summary, 1200) || null
      : objectiveChanged
        ? null
        : text(previous.progress_summary, 1200) || null,
    next_step: hasOwn(source, "next_step")
      ? text(source.next_step, 600) || null
      : objectiveChanged
        ? null
        : text(previous.next_step, 600) || null,
    recommended_next_move: hasOwn(source, "recommended_next_move")
      ? text(source.recommended_next_move, 800) || null
      : objectiveChanged
        ? null
        : text(previous.recommended_next_move, 800) || null,
    recommendation_reason: hasOwn(source, "recommendation_reason")
      ? text(source.recommendation_reason, 1200) || null
      : objectiveChanged
        ? null
        : text(previous.recommendation_reason, 1200) || null,
    recommendation_confidence: hasOwn(source, "recommendation_confidence")
      ? confidence(source.recommendation_confidence, null)
      : objectiveChanged
        ? null
        : confidence(previous.recommendation_confidence, null),
    business_thesis: businessThesis,
    open_questions: previousStrings(
      source,
      "open_questions",
      previous,
      objectiveChanged,
    ),
    blocker: hasOwn(source, "blocker")
      ? text(source.blocker, 600) || null
      : objectiveChanged
        ? null
        : text(previous.blocker, 600) || null,
    last_system_snapshot:
      systemSnapshot(source.last_system_snapshot) ||
      (objectiveChanged ? null : systemSnapshot(previous.last_system_snapshot)),
    last_decision_supersession: nextDecisionSupersession,
    user_confirmed_complete: userConfirmedComplete,
  };
}

export function mergeOperatorProjectState(
  previousState,
  proposedState,
  activity = {},
) {
  const previous = object(previousState);
  const proposed = normalizeOperatorProjectState(proposedState, {
    previousState: previous,
  });

  return {
    ...previous,
    ...proposed,
    ...object(activity),
    updated_at: new Date().toISOString(),
  };
}

export const OPERATOR_PROJECT_STATUSES = Object.freeze(
  Array.from(PROJECT_STATUSES),
);
