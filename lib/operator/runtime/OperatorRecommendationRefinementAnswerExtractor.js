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

function normalizedKey(value) {
  return text(value, 240)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function stripQuotes(value) {
  const clean = text(value, 4000);
  if (
    (clean.startsWith('"') && clean.endsWith('"')) ||
    (clean.startsWith("'") && clean.endsWith("'"))
  ) {
    return clean.slice(1, -1);
  }
  return clean;
}

function exactEnum(value, allowed) {
  const clean = stripQuotes(value);
  return list(allowed).find(
    (candidate) => String(candidate).toLowerCase() === clean.toLowerCase(),
  );
}

function parseExplicitValue(value, definition = {}) {
  const schema = object(definition);
  if (Array.isArray(schema.enum) && schema.enum.length) {
    const matched = exactEnum(value, schema.enum);
    return matched === undefined
      ? { parsed: false, reason: "ENUM_VALUE_NOT_EXPLICITLY_MATCHED" }
      : { parsed: true, value: matched };
  }

  const type = text(schema.type, 40).toLowerCase();
  const clean = stripQuotes(value);
  if (type === "number") {
    if (!/^-?(?:\d+\.?\d*|\.\d+)$/.test(clean)) {
      return { parsed: false, reason: "EXPLICIT_NUMBER_REQUIRED" };
    }
    const number = Number(clean);
    return Number.isFinite(number)
      ? { parsed: true, value: number }
      : { parsed: false, reason: "EXPLICIT_NUMBER_REQUIRED" };
  }
  if (type === "integer") {
    if (!/^-?\d+$/.test(clean)) {
      return { parsed: false, reason: "EXPLICIT_INTEGER_REQUIRED" };
    }
    return { parsed: true, value: Number(clean) };
  }
  if (type === "boolean") {
    if (/^true$/i.test(clean)) return { parsed: true, value: true };
    if (/^false$/i.test(clean)) return { parsed: true, value: false };
    return { parsed: false, reason: "EXPLICIT_BOOLEAN_REQUIRED" };
  }
  if (type === "string" || !type) {
    return clean
      ? { parsed: true, value: clean }
      : { parsed: false, reason: "EXPLICIT_STRING_REQUIRED" };
  }
  return { parsed: false, reason: "UNSUPPORTED_INPUT_TYPE" };
}

export function extractRecommendationRefinementInputAnswers({
  message,
  clarification = null,
  capability = null,
} = {}) {
  const fields = list(clarification?.fields);
  const properties = object(capability?.input_schema?.properties);
  const aliases = new Map();
  for (const field of fields) {
    const fieldName = text(field?.field, 240);
    if (!fieldName) continue;
    aliases.set(normalizedKey(fieldName), fieldName);
    const label = text(field?.label, 240);
    if (label) aliases.set(normalizedKey(label), fieldName);
  }

  const answers = {};
  const rejected = [];
  const segments = text(message, 8000)
    .split(/[;\n]+/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  for (const segment of segments) {
    const match = segment.match(/^([^:=]{1,240})\s*[:=]\s*(.+)$/);
    if (!match) {
      rejected.push({ segment, reason: "EXPLICIT_FIELD_ASSIGNMENT_REQUIRED" });
      continue;
    }
    const requestedField = aliases.get(normalizedKey(match[1]));
    if (!requestedField) {
      rejected.push({ segment, reason: "FIELD_NOT_REQUESTED" });
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(answers, requestedField)) {
      rejected.push({ segment, reason: "DUPLICATE_FIELD_ASSIGNMENT" });
      continue;
    }
    const parsed = parseExplicitValue(match[2], properties[requestedField]);
    if (!parsed.parsed) {
      rejected.push({ segment, field: requestedField, reason: parsed.reason });
      continue;
    }
    answers[requestedField] = parsed.value;
  }

  return {
    accepted: rejected.length === 0 && Object.keys(answers).length > 0,
    answers,
    rejected_segments: rejected,
    requested_fields: fields.map((field) => text(field?.field, 240)).filter(Boolean),
    inference_used: false,
    unrequested_fields_accepted: false,
    authorization_effect: "NONE",
    execution_authorized: false,
    pending_execution_created: false,
    autonomous_run_created: false,
  };
}

export default extractRecommendationRefinementInputAnswers;
