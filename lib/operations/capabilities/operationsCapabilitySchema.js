const JSON_TYPE_BY_FIELD_TYPE = Object.freeze({
  number: "number",
  checkbox: "boolean",
});

function jsonType(field) {
  return JSON_TYPE_BY_FIELD_TYPE[field?.type] || "string";
}

export function fieldsToJsonSchema(fields = [], { required = [] } = {}) {
  const properties = {};

  for (const field of fields) {
    if (!field?.name) continue;

    const property = { type: jsonType(field) };

    if (field.label) property.description = field.label;
    if (Array.isArray(field.options) && field.options.length) {
      property.enum = field.options
        .map((option) => option?.value)
        .filter((value) => value !== undefined && value !== null);
    }

    properties[field.name] = property;
  }

  const requiredNames = [
    ...new Set([
      ...required,
      ...fields.filter((field) => field?.required && field?.name).map((field) => field.name),
    ]),
  ].filter((name) => name in properties || required.includes(name));

  return {
    type: "object",
    properties,
    ...(requiredNames.length ? { required: requiredNames } : {}),
    additionalProperties: true,
  };
}

export function filterableFieldNames(fields = []) {
  return fields
    .filter((field) => field?.name && field.storage === "column")
    .map((field) => field.name);
}

export default fieldsToJsonSchema;
