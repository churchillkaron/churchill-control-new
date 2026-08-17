const FIELD_TYPES = new Set([
  "text",
  "textarea",
  "number",
  "select",
  "checkbox",
  "date",
  "datetime",
  "measurement",
  "photo",
  "signature",
  "file",
]);

function text(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function code(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeOptions(options) {
  if (!Array.isArray(options)) return [];
  return options
    .map((option) => {
      if (typeof option === "string") {
        const value = text(option);
        return value ? { value, label: value } : null;
      }
      const value = text(option?.value);
      const label = text(option?.label) || value;
      return value ? { value, label } : null;
    })
    .filter(Boolean);
}

function normalizeField(field, index) {
  const label = text(field?.label);
  const key = code(field?.key || field?.name || label);
  const requestedType = text(field?.type)?.toLowerCase();
  const type = FIELD_TYPES.has(requestedType) ? requestedType : "text";

  if (!label || !key) {
    const error = new Error(`Execution template field ${index + 1} requires label and key.`);
    error.status = 400;
    throw error;
  }

  return Object.freeze({
    key,
    label,
    type,
    required: Boolean(field?.required),
    section: text(field?.section) || "Service",
    help_text: text(field?.help_text || field?.helpText),
    unit: text(field?.unit),
    options: type === "select" ? normalizeOptions(field?.options) : [],
    order: (index + 1) * 10,
  });
}

export function createServiceExecutionTemplateDocument(input = {}) {
  const name = text(input.name);
  const templateCode = code(input.code || name);
  const fieldSchema = Array.isArray(input.field_schema || input.fieldSchema)
    ? (input.field_schema || input.fieldSchema).map(normalizeField)
    : [];

  if (!name || !templateCode) {
    const error = new Error("Execution template requires name and code.");
    error.status = 400;
    throw error;
  }

  const keys = fieldSchema.map((field) => field.key);
  if (new Set(keys).size !== keys.length) {
    const error = new Error("Execution template field keys must be unique.");
    error.status = 400;
    throw error;
  }

  return Object.freeze({
    code: templateCode,
    name,
    description: text(input.description),
    industry_key: code(input.industry_key || input.industryKey) || "generic-service",
    field_schema: fieldSchema,
    evidence_requirements: Object.freeze({
      before_photos: Boolean(input.evidence_requirements?.before_photos),
      after_photos: Boolean(input.evidence_requirements?.after_photos),
      customer_signature: Boolean(input.evidence_requirements?.customer_signature),
      technician_signature: Boolean(input.evidence_requirements?.technician_signature),
      location_confirmation: Boolean(input.evidence_requirements?.location_confirmation),
    }),
    completion_rules: Object.freeze({
      require_all_mandatory_fields: true,
      allow_follow_up: input.completion_rules?.allow_follow_up !== false,
      require_outcome: input.completion_rules?.require_outcome !== false,
    }),
    instructions: text(input.instructions),
  });
}

export default createServiceExecutionTemplateDocument;
