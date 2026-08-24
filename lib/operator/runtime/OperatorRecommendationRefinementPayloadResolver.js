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

const CONTEXT_FIELDS = new Set([
  "organizationid",
  "organization_id",
  "entityid",
  "entity_id",
  "periodid",
  "period_id",
  "partyid",
  "party_id",
]);

const SAFE_DIRECTION_TEXT_FIELDS = new Set([
  "focus",
  "objective",
  "instruction",
  "instructions",
  "description",
  "reason",
  "query",
  "message",
  "text",
  "topic",
  "subject",
]);

function normalizedField(value) {
  return text(value, 240).toLowerCase();
}

function propertySchema(schema, field) {
  return object(object(schema).properties)[field] || null;
}

function isSafeDirectionTextField(field, definition) {
  const name = normalizedField(field);
  const property = object(definition);
  const type = text(property.type, 40).toLowerCase();
  if (!SAFE_DIRECTION_TEXT_FIELDS.has(name)) return false;
  if (type && type !== "string") return false;
  if (Array.isArray(property.enum) && property.enum.length) return false;
  if (property.format) return false;
  return true;
}

export function resolveRecommendationRefinementPayload({
  proposal = null,
  capability = null,
} = {}) {
  const proposalText = text(proposal?.proposal_text, 4000);
  const schema = object(capability?.input_schema);
  const required = list(schema.required).map((field) => text(field, 240)).filter(Boolean);
  const payload = {};
  const derivedFields = [];
  const contextFields = [];
  const missingRequiredFields = [];

  for (const field of required) {
    const normalized = normalizedField(field);
    if (CONTEXT_FIELDS.has(normalized)) {
      contextFields.push(field);
      continue;
    }

    const definition = propertySchema(schema, field);
    if (
      proposalText &&
      isSafeDirectionTextField(field, definition)
    ) {
      const maxLength = Number(object(definition).maxLength || 0);
      payload[field] = maxLength > 0
        ? proposalText.slice(0, Math.max(1, Math.min(maxLength, 4000)))
        : proposalText;
      derivedFields.push(field);
      continue;
    }

    missingRequiredFields.push(field);
  }

  return {
    payload,
    ready: missingRequiredFields.length === 0,
    derived_fields: derivedFields,
    context_fields: contextFields,
    missing_required_fields: missingRequiredFields,
    old_payload_reused: false,
    guessed_identifiers: false,
    guessed_numbers: false,
    guessed_dates: false,
    guessed_enums: false,
    guessed_booleans: false,
    source: "selected_refinement_schema_safe_payload",
  };
}

export default resolveRecommendationRefinementPayload;
