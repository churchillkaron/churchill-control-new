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

const CREATIVE_CONTEXT_CAPABILITY_KEYS = new Set([
  "creative.studio.prepareProject",
  "creative.studio.inspectProject",
  "creative.production.inspect",
  "creative.production.run",
]);

const CREATIVE_CONTEXT_PROGRESS_PREFIX = "Active Creative context:";

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

function creativeContext(value) {
  const candidate = object(value);
  const creativeProjectId = text(candidate.creative_project_id, 180);
  if (!creativeProjectId) return null;

  return {
    creative_project_id: creativeProjectId,
    creative_mission_id: text(candidate.creative_mission_id, 180) || null,
    creative_brief_id: text(candidate.creative_brief_id, 180) || null,
    creative_state_id: text(candidate.creative_state_id, 180) || null,
    request_ref: text(candidate.request_ref, 220) || null,
    production_type: text(candidate.production_type, 80) || null,
    project_status: text(candidate.project_status, 80) || null,
    production_status: text(candidate.production_status, 80) || null,
    source_capability: text(candidate.source_capability, 140) || null,
    verified_at: text(candidate.verified_at, 80) || null,
  };
}

function capabilityKey(execution = {}) {
  const capability = object(execution.capability);
  const explicit = text(capability.key, 160);
  if (explicit) return explicit;

  const domain = text(capability.domain, 80);
  const name = text(capability.capability, 80);
  const action = text(capability.action, 80);
  return domain && name && action ? `${domain}.${name}.${action}` : null;
}

function creativeResultObject(value) {
  let current = object(value);
  for (let depth = 0; depth < 5; depth += 1) {
    if (text(current.creative_project_id, 180)) return current;
    const nested = object(current.result);
    if (!Object.keys(nested).length) return null;
    current = nested;
  }
  return null;
}

function creativeContextFromOutput(value, sourceCapability, verifiedAt) {
  const output = creativeResultObject(value);
  if (!output) return null;

  return creativeContext({
    creative_project_id: output.creative_project_id,
    creative_mission_id: output.creative_mission_id,
    creative_brief_id: output.creative_brief_id,
    creative_state_id: output.creative_state_id,
    request_ref: output.request_ref,
    production_type: output.production_type,
    project_status: output.project_status,
    production_status:
      sourceCapability === "creative.production.inspect" ||
      sourceCapability === "creative.production.run"
        ? output.status
        : null,
    source_capability: sourceCapability,
    verified_at: verifiedAt,
  });
}

function mergeCreativeContexts(previousValue, nextValue) {
  const previous = creativeContext(previousValue);
  const next = creativeContext(nextValue);
  if (!next) return previous;
  if (!previous || previous.creative_project_id !== next.creative_project_id) {
    return next;
  }

  return creativeContext({
    ...previous,
    ...Object.fromEntries(
      Object.entries(next).filter(([, value]) => value !== null && value !== ""),
    ),
  });
}

function verifiedCreativeContextFromExecution(executionValue) {
  const execution = object(executionValue);
  const verifiedAt = new Date().toISOString();
  const directKey = capabilityKey(execution);

  if (CREATIVE_CONTEXT_CAPABILITY_KEYS.has(directKey)) {
    return creativeContextFromOutput(execution.result, directKey, verifiedAt);
  }

  if (directKey !== "platform.operator_mission.execute") return null;

  const missionResult = creativeResultObject(execution.result) ||
    object(object(execution.result).result);
  const steps = Array.isArray(missionResult.steps) ? missionResult.steps : [];
  let context = null;

  for (const step of steps) {
    const stepKey = text(step?.capability_key, 160);
    if (!CREATIVE_CONTEXT_CAPABILITY_KEYS.has(stepKey)) continue;

    const verified = creativeContextFromOutput(
      step?.verification,
      stepKey,
      verifiedAt,
    );
    const executed = creativeContextFromOutput(
      step?.result,
      stepKey,
      verifiedAt,
    );
    context = mergeCreativeContexts(context, verified || executed);
  }

  return context;
}

function withCreativeContextProgress(summaryValue, contextValue) {
  const context = creativeContext(contextValue);
  if (!context) return text(summaryValue, 1200) || null;

  const existing = text(summaryValue, 760)
    .split("\n")
    .map((line) => line.trim())
    .filter(
      (line) =>
        line && !line.startsWith(CREATIVE_CONTEXT_PROGRESS_PREFIX),
    )
    .join("\n");

  const details = [
    `project=${context.creative_project_id}`,
    context.creative_mission_id ? `mission=${context.creative_mission_id}` : null,
    context.request_ref ? `request_ref=${context.request_ref}` : null,
    context.production_type ? `type=${context.production_type}` : null,
    context.production_status ? `production=${context.production_status}` : null,
  ]
    .filter(Boolean)
    .join("; ");
  const marker = `${CREATIVE_CONTEXT_PROGRESS_PREFIX} ${details}. Server-verified continuity only; it never authorizes generation, spend, publication, or another write.`;

  return [existing, marker].filter(Boolean).join("\n").slice(0, 1200) || null;
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
  const nextActivity = object(activity);
  const verifiedCreativeContext = verifiedCreativeContextFromExecution(
    nextActivity.last_execution,
  );
  const nextCreativeContext = mergeCreativeContexts(
    previous.creative_context,
    verifiedCreativeContext,
  );

  const merged = {
    ...previous,
    ...proposed,
    ...nextActivity,
    ...(nextCreativeContext ? { creative_context: nextCreativeContext } : {}),
    updated_at: new Date().toISOString(),
  };

  if (nextCreativeContext) {
    merged.progress_summary = withCreativeContextProgress(
      merged.progress_summary,
      nextCreativeContext,
    );
  }

  return merged;
}

export const OPERATOR_PROJECT_STATUSES = Object.freeze(
  Array.from(PROJECT_STATUSES),
);
