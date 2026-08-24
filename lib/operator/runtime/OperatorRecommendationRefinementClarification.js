function text(value, limit = 1200) {
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

function fieldLabel(field, definition = null) {
  const property = object(definition);
  return (
    text(property.title, 160) ||
    text(field, 160).replaceAll("_", " ")
  );
}

function missingFieldEvidence(capability, fields) {
  const properties = object(capability?.input_schema?.properties);
  return list(fields).map((field) => {
    const definition = object(properties[field]);
    return {
      field,
      label: fieldLabel(field, definition),
      type: text(definition.type, 60) || null,
      format: text(definition.format, 80) || null,
      enum_values: list(definition.enum)
        .map((value) => text(value, 240))
        .filter(Boolean)
        .slice(0, 20),
      description: text(definition.description, 400) || null,
    };
  });
}

export function buildRecommendationRefinementClarification({
  plan = null,
} = {}) {
  const current = object(plan);
  const capability = object(current.capability);
  const capabilityName =
    text(capability.name, 240) ||
    text(capability.description, 240) ||
    text(capability.key, 240) ||
    "the selected action";

  if (!capability.key) {
    return {
      required: true,
      reason: "CAPABILITY_NOT_STRONGLY_RESOLVED",
      question:
        "Which exact registered action should this selected direction become? I do not have one strong capability match yet.",
      fields: [],
      capability_key: null,
      authorization_effect: "NONE",
      execution_authorized: false,
      pending_execution_created: false,
      autonomous_run_created: false,
    };
  }

  const missing = list(current.missing_required_fields)
    .map((field) => text(field, 240))
    .filter(Boolean);
  if (!missing.length) {
    return {
      required: false,
      reason: null,
      question: null,
      fields: [],
      capability_key: text(capability.key, 240),
      authorization_effect: "NONE",
      execution_authorized: false,
      pending_execution_created: false,
      autonomous_run_created: false,
    };
  }

  const fields = missingFieldEvidence(capability, missing);
  const labels = fields.map((field) => field.label).filter(Boolean);
  const question = labels.length === 1
    ? `I can prepare ${capabilityName}, but I still need the exact ${labels[0]}. What should it be?`
    : `I can prepare ${capabilityName}, but I still need these exact inputs: ${labels.join(", ")}. Please provide them; I will not guess missing values.`;

  return {
    required: true,
    reason: "REQUIRED_INPUTS_MISSING",
    question: question.slice(0, 1200),
    fields,
    capability_key: text(capability.key, 240),
    authorization_effect: "NONE",
    execution_authorized: false,
    pending_execution_created: false,
    autonomous_run_created: false,
  };
}

export default buildRecommendationRefinementClarification;
