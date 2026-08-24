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

const CONTEXT_FIELD_RESOLVERS = Object.freeze({
  organizationid: (context) => context.organizationId ?? context.organization_id,
  organization_id: (context) => context.organization_id ?? context.organizationId,
  entityid: (context) => context.entityId ?? context.entity_id,
  entity_id: (context) => context.entity_id ?? context.entityId,
  periodid: (context) => context.periodId ?? context.period_id,
  period_id: (context) => context.period_id ?? context.periodId,
  partyid: (context) => context.partyId ?? context.party_id,
  party_id: (context) => context.party_id ?? context.partyId,
});

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

function validateValue(value, definition = {}) {
  const schema = object(definition);
  if (Array.isArray(schema.enum) && schema.enum.length) {
    if (!schema.enum.some((allowed) => Object.is(allowed, value))) {
      return "ENUM_VALUE_NOT_ALLOWED";
    }
  }
  const type = text(schema.type, 40).toLowerCase();
  if (type === "string") {
    if (typeof value !== "string" || !value.trim()) return "STRING_REQUIRED";
    if (schema.maxLength && value.length > Number(schema.maxLength)) {
      return "STRING_TOO_LONG";
    }
    const format = text(schema.format, 80).toLowerCase();
    if (format === "uuid" && !isUuid(value)) return "UUID_REQUIRED";
    if (format === "date" && !isIsoDate(value)) return "ISO_DATE_REQUIRED";
    return null;
  }
  if (type === "number") {
    return typeof value === "number" && Number.isFinite(value)
      ? null
      : "NUMBER_REQUIRED";
  }
  if (type === "integer") {
    return Number.isInteger(value) ? null : "INTEGER_REQUIRED";
  }
  if (type === "boolean") {
    return typeof value === "boolean" ? null : "BOOLEAN_REQUIRED";
  }
  if (!type) return null;
  return "UNSUPPORTED_INPUT_TYPE";
}

function contextValue(field, context) {
  const resolver = CONTEXT_FIELD_RESOLVERS[text(field, 240).toLowerCase()];
  return resolver ? resolver(object(context)) : undefined;
}

export function revalidateRecommendationRefinementInputs({
  state = null,
  capability = null,
  context = null,
} = {}) {
  const current = object(state);
  const currentCapability = object(capability);
  const capabilityKey = text(currentCapability.key, 240);
  const stateCapabilityKey = text(current.capability_key, 240);
  const base = {
    authorization_effect: "NONE",
    execution_authorized: false,
    pending_execution_created: false,
    autonomous_run_created: false,
    old_payload_reused: false,
    current_capability_revalidated: false,
    ready_for_governed_recommendation: false,
  };

  if (current.status !== "READY_FOR_CAPABILITY_REVALIDATION") {
    return {
      ...base,
      reason: "INPUT_STATE_NOT_READY_FOR_REVALIDATION",
      capability_key: stateCapabilityKey || null,
      payload: { ...object(current.partial_payload) },
      missing_required_fields: list(current.missing_required_fields),
      invalid_fields: [],
      schema_drift_detected: false,
    };
  }
  if (!capabilityKey || capabilityKey !== stateCapabilityKey) {
    return {
      ...base,
      reason: "CURRENT_CAPABILITY_MISSING_OR_CHANGED",
      capability_key: stateCapabilityKey || null,
      payload: { ...object(current.partial_payload) },
      missing_required_fields: [],
      invalid_fields: [],
      schema_drift_detected: true,
    };
  }

  const schema = object(currentCapability.input_schema);
  const properties = object(schema.properties);
  const payload = { ...object(current.partial_payload) };
  const required = list(schema.required)
    .map((field) => text(field, 240))
    .filter(Boolean);
  const missing = [];
  const invalid = [];
  const contextFields = [];

  for (const field of required) {
    const contextual = contextValue(field, context);
    if (contextual !== undefined && contextual !== null && text(contextual, 4000)) {
      contextFields.push(field);
      continue;
    }
    if (!Object.prototype.hasOwnProperty.call(payload, field)) {
      missing.push(field);
      continue;
    }
    const reason = validateValue(payload[field], properties[field]);
    if (reason) invalid.push({ field, reason });
  }

  for (const [field, value] of Object.entries(payload)) {
    if (!Object.prototype.hasOwnProperty.call(properties, field)) {
      invalid.push({ field, reason: "FIELD_NO_LONGER_IN_SCHEMA" });
      continue;
    }
    const reason = validateValue(value, properties[field]);
    if (reason && !invalid.some((item) => item.field === field)) {
      invalid.push({ field, reason });
    }
  }

  const schemaDrift = missing.length > 0 || invalid.length > 0;
  const ready = !schemaDrift;
  return {
    ...base,
    reason: ready ? null : "CURRENT_CAPABILITY_SCHEMA_REVALIDATION_FAILED",
    capability_key: capabilityKey,
    payload,
    missing_required_fields: missing,
    invalid_fields: invalid,
    context_fields_satisfied: contextFields,
    schema_drift_detected: schemaDrift,
    current_capability_revalidated: ready,
    ready_for_governed_recommendation: ready,
    requires_fresh_recommendation_binding: ready,
  };
}

export default revalidateRecommendationRefinementInputs;
