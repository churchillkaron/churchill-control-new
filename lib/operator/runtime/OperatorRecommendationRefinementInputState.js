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

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    text(value, 80),
  );
}

function isIsoDate(value) {
  const clean = text(value, 40);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) return false;
  const parsed = new Date(`${clean}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === clean;
}

function validationDefinition(value = {}) {
  const schema = object(value);
  return {
    type: text(schema.type, 40) || null,
    format: text(schema.format, 80) || null,
    enum: Array.isArray(schema.enum) ? [...schema.enum] : null,
    maxLength: Number.isFinite(Number(schema.maxLength))
      ? Number(schema.maxLength)
      : null,
  };
}

function capabilityInputContract(capability = {}) {
  const schema = object(capability?.input_schema);
  const properties = object(schema.properties);
  const required = list(schema.required).map((field) => text(field, 240)).filter(Boolean);
  return JSON.stringify({
    required,
    properties: Object.fromEntries(
      required.map((field) => [field, validationDefinition(properties[field])]),
    ),
  });
}

function proposalMatchesState(state, proposal) {
  const current = object(state);
  const candidate = object(proposal);
  const stateId = text(current.proposal_id, 160);
  const proposalId = text(candidate.proposal_id, 160);
  const stateText = text(current.proposal_text, 4000);
  const proposalText = text(candidate.proposal_text, 4000);
  if (stateId && stateId !== proposalId) return false;
  if (stateText && stateText !== proposalText) return false;
  return Boolean(stateId || stateText) && Boolean(proposalId || proposalText);
}

function validateValue(value, definition = {}) {
  const schema = object(definition);
  const type = text(schema.type, 40).toLowerCase();
  if (Array.isArray(schema.enum) && schema.enum.length) {
    if (!schema.enum.some((allowed) => Object.is(allowed, value))) {
      return { valid: false, reason: "ENUM_VALUE_NOT_ALLOWED" };
    }
  }
  if (type === "string") {
    if (typeof value !== "string" || !value.trim()) {
      return { valid: false, reason: "STRING_REQUIRED" };
    }
    if (schema.maxLength && value.length > Number(schema.maxLength)) {
      return { valid: false, reason: "STRING_TOO_LONG" };
    }
    const format = text(schema.format, 80).toLowerCase();
    if (format === "uuid" && !isUuid(value)) {
      return { valid: false, reason: "UUID_REQUIRED" };
    }
    if (format === "date" && !isIsoDate(value)) {
      return { valid: false, reason: "ISO_DATE_REQUIRED" };
    }
    return { valid: true, value: value.trim() };
  }
  if (type === "number") {
    return typeof value === "number" && Number.isFinite(value)
      ? { valid: true, value }
      : { valid: false, reason: "NUMBER_REQUIRED" };
  }
  if (type === "integer") {
    return Number.isInteger(value)
      ? { valid: true, value }
      : { valid: false, reason: "INTEGER_REQUIRED" };
  }
  if (type === "boolean") {
    return typeof value === "boolean"
      ? { valid: true, value }
      : { valid: false, reason: "BOOLEAN_REQUIRED" };
  }
  return { valid: false, reason: "UNSUPPORTED_INPUT_TYPE" };
}

export function createRecommendationRefinementInputState({
  proposal = null,
  plan = null,
} = {}) {
  const current = object(plan);
  const capability = object(current.capability);
  const capabilityKey = text(capability.key, 240);
  const proposalId = text(proposal?.proposal_id, 160);
  const proposalText = text(proposal?.proposal_text, 4000);
  const missing = list(current.missing_required_fields)
    .map((field) => text(field, 240))
    .filter(Boolean);
  if (!capabilityKey || !missing.length || (!proposalId && !proposalText)) return null;

  return {
    status: "AWAITING_REQUIRED_INPUTS",
    proposal_id: proposalId || null,
    proposal_text: proposalText || null,
    capability_key: capabilityKey,
    capability_input_contract: capabilityInputContract(capability),
    partial_payload: { ...object(current.payload) },
    missing_required_fields: missing,
    answered_fields: [],
    authorization_effect: "NONE",
    execution_authorized: false,
    pending_execution_created: false,
    autonomous_run_created: false,
    old_payload_reused: false,
    requires_capability_revalidation: true,
    created_at: new Date().toISOString(),
  };
}

export function applyRecommendationRefinementInputAnswers({
  state = null,
  proposal = null,
  capability = null,
  answers = null,
} = {}) {
  const current = object(state);
  const schema = object(capability?.input_schema);
  const properties = object(schema.properties);
  const capabilityKey = text(capability?.key, 240);
  if (
    current.status !== "AWAITING_REQUIRED_INPUTS" ||
    !proposalMatchesState(current, proposal) ||
    !capabilityKey ||
    capabilityKey !== text(current.capability_key, 240)
  ) {
    return {
      accepted: false,
      reason: "REFINEMENT_INPUT_STATE_MISMATCH",
      state: current,
      rejected_fields: [],
    };
  }
  if (
    text(current.capability_input_contract, 12000) !==
    capabilityInputContract(capability)
  ) {
    return {
      accepted: false,
      reason: "REFINEMENT_INPUT_SCHEMA_CHANGED",
      state: current,
      rejected_fields: [],
    };
  }

  const missing = new Set(
    list(current.missing_required_fields)
      .map((field) => text(field, 240))
      .filter(Boolean),
  );
  const supplied = object(answers);
  const acceptedPayload = { ...object(current.partial_payload) };
  const answered = new Set(list(current.answered_fields).map((field) => text(field, 240)));
  const rejectedFields = [];

  for (const [field, value] of Object.entries(supplied)) {
    if (!missing.has(field)) {
      rejectedFields.push({ field, reason: "FIELD_NOT_REQUESTED" });
      continue;
    }
    const validation = validateValue(value, properties[field]);
    if (!validation.valid) {
      rejectedFields.push({ field, reason: validation.reason });
      continue;
    }
    acceptedPayload[field] = validation.value;
    answered.add(field);
    missing.delete(field);
  }

  const complete = missing.size === 0;
  const nextState = {
    ...current,
    status: complete ? "READY_FOR_CAPABILITY_REVALIDATION" : "AWAITING_REQUIRED_INPUTS",
    partial_payload: acceptedPayload,
    missing_required_fields: Array.from(missing),
    answered_fields: Array.from(answered),
    authorization_effect: "NONE",
    execution_authorized: false,
    pending_execution_created: false,
    autonomous_run_created: false,
    old_payload_reused: false,
    requires_capability_revalidation: true,
    updated_at: new Date().toISOString(),
  };

  return {
    accepted: rejectedFields.length === 0 && Object.keys(supplied).length > 0,
    reason: rejectedFields.length ? "INVALID_OR_UNREQUESTED_INPUTS" : null,
    complete,
    state: nextState,
    rejected_fields: rejectedFields,
  };
}

export default {
  createRecommendationRefinementInputState,
  applyRecommendationRefinementInputAnswers,
};
