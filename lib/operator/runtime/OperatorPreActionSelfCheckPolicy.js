function text(value, limit = 1600) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function normalized(value) {
  return text(value, 5000)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\u0e00-\u0e7f\s_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function explicitRepeatRequest(message) {
  const source = normalized(message);
  return /\b(again|repeat|retry|rerun|re-run|run again|do it again|redo|recreate|once more|igen|upprepa|forsok igen|gor om|kör igen|kor igen)\b/.test(source);
}

function capabilityKey(execution = {}) {
  return text(
    execution?.capability?.key ||
      execution?.capability_key ||
      execution?.requested_capability_key,
    300,
  );
}

function sameMaterialPayload(left, right) {
  function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (value === null || value === undefined) return value ?? null;
    if (typeof value !== "object") return value;

    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .filter((key) => ![
          "organizationId", "organization_id", "entityId", "entity_id",
          "periodId", "period_id", "partyId", "party_id",
        ].includes(key))
        .map((key) => [key, canonical(value[key])]),
    );
  }

  return JSON.stringify(canonical(object(left))) === JSON.stringify(canonical(object(right)));
}

function duplicateCompletedExecution({ decision, capability, projectState, message }) {
  if (!capability || text(capability.mode).toLowerCase() === "read") return false;
  if (explicitRepeatRequest(message)) return false;

  const previous = object(projectState?.last_execution);
  if (text(previous.status).toLowerCase() !== "completed") return false;
  if (capabilityKey(previous) !== text(capability.key)) return false;

  const previousPayload =
    previous.requested_payload ||
    previous.payload ||
    previous.input ||
    previous.execution_payload;

  // When exact prior payload evidence is unavailable, do not guess that the
  // action is a duplicate. Completed-step memory may guide reasoning, but it
  // cannot independently block execution.
  if (!previousPayload || typeof previousPayload !== "object") return false;

  return sameMaterialPayload(previousPayload, decision?.execution?.payload);
}

export function evaluateOperatorPreAction({
  decision = {},
  capability = null,
  projectState = {},
  entityId = null,
  message = "",
} = {}) {
  const normalizedDecision = object(decision);
  const execution = object(normalizedDecision.execution);
  const intent = text(normalizedDecision.intent, 40).toLowerCase();
  const proposedKey = text(execution.capability_key, 300);

  if (intent !== "execute") {
    return { allowed: true, reason: "NO_EXECUTION_PROPOSED", severity: "none" };
  }

  if (!proposedKey) {
    return {
      allowed: false,
      reason: "EXECUTION_CAPABILITY_REQUIRED",
      severity: "structural",
      response_text: "I need to identify the exact registered capability before I can execute this safely.",
    };
  }

  if (!capability || text(capability.key) !== proposedKey) {
    return {
      allowed: false,
      reason: "EXECUTION_CAPABILITY_NOT_AVAILABLE",
      severity: "structural",
      response_text: "I could not match that proposed action to a currently available Operator capability, so I will not execute it.",
    };
  }

  if (object(normalizedDecision.clarification).required === true) {
    return {
      allowed: false,
      reason: "EXECUTE_AND_CLARIFY_CONTRADICTION",
      severity: "structural",
      response_text: text(normalizedDecision.clarification?.question) || "I need the missing information before I can execute this safely.",
    };
  }

  if (text(normalizedDecision.navigation?.target_id)) {
    return {
      allowed: false,
      reason: "EXECUTE_AND_NAVIGATE_CONTRADICTION",
      severity: "structural",
      response_text: "I will not combine an execution with a separate navigation decision in the same proposed action.",
    };
  }

  if (
    text(capability.context_scope).toLowerCase() === "entity" &&
    !text(entityId)
  ) {
    return {
      allowed: false,
      reason: "ENTITY_CONTEXT_REQUIRED",
      severity: "scope",
      response_text: "Which legal entity should I use for this request?",
      clarification: {
        required: true,
        question: "Which legal entity should I use for this request?",
        options: [],
      },
    };
  }

  if (duplicateCompletedExecution({
    decision: normalizedDecision,
    capability,
    projectState,
    message,
  })) {
    return {
      allowed: false,
      reason: "EXACT_COMPLETED_ACTION_ALREADY_EXECUTED",
      severity: "duplicate_side_effect",
      response_text: "That exact side-effecting action already completed with the same material payload. I will not repeat it unless you explicitly ask me to run it again.",
    };
  }

  const plan = list(normalizedDecision.plan);
  const duplicatePlanIds = new Set();
  const seenPlanIds = new Set();
  for (const step of plan) {
    const id = text(step?.id, 160);
    if (!id) continue;
    if (seenPlanIds.has(id)) duplicatePlanIds.add(id);
    seenPlanIds.add(id);
  }
  if (duplicatePlanIds.size) {
    return {
      allowed: false,
      reason: "PLAN_STEP_ID_CONTRADICTION",
      severity: "structural",
      response_text: "The proposed plan contains duplicate step identities, so I will not execute it until the plan is internally consistent.",
    };
  }

  return {
    allowed: true,
    reason: "PRE_ACTION_SELF_CHECK_PASSED",
    severity: "none",
    capability_key: proposedKey,
    side_effecting: text(capability.mode).toLowerCase() !== "read",
  };
}

export function applyOperatorPreActionSelfCheck({
  decision = {},
  capability = null,
  projectState = {},
  entityId = null,
  message = "",
} = {}) {
  const result = evaluateOperatorPreAction({
    decision,
    capability,
    projectState,
    entityId,
    message,
  });

  if (result.allowed) {
    return {
      decision,
      self_check: result,
    };
  }

  const clarification = result.clarification || {
    required: true,
    question: result.response_text,
    options: [],
  };

  return {
    decision: {
      ...object(decision),
      intent: "clarify",
      response_text: result.response_text,
      confidence: Math.max(0.95, Number(decision?.confidence || 0)),
      clarification,
      navigation: { target_id: null },
      execution: {
        capability_key: null,
        payload: {},
        reason: result.reason,
      },
      plan: list(decision?.plan),
    },
    self_check: result,
  };
}
