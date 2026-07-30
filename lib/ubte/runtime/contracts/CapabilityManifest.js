function text(value, field) {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    throw new Error(`CAPABILITY_MANIFEST_${field.toUpperCase()}_REQUIRED`);
  }
  return normalized;
}

function uniqueStrings(value = [], field) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new Error(`CAPABILITY_MANIFEST_${field.toUpperCase()}_ARRAY_REQUIRED`);
  }

  const items = value.map((item) => String(item ?? "").trim());
  if (items.some((item) => !item)) {
    throw new Error(`CAPABILITY_MANIFEST_${field.toUpperCase()}_VALUE_REQUIRED`);
  }
  return [...new Set(items)];
}

function optionalBoolean(value, fallback = false) {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "boolean") {
    throw new Error("CAPABILITY_MANIFEST_BOOLEAN_REQUIRED");
  }
  return value;
}

function freeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const child of Object.values(value)) freeze(child);
  return value;
}

export function defineCapability(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("CAPABILITY_MANIFEST_OBJECT_REQUIRED");
  }

  const domain = text(input.domain, "domain");
  const capability = text(input.capability, "capability");
  const action = text(input.action, "action");
  const description = String(input.description ?? "").trim();
  const permissions = uniqueStrings(input.permissions, "permissions");
  const events = uniqueStrings(input.events, "events");
  const tags = uniqueStrings(input.tags, "tags");

  const manifest = {
    ...input,
    domain,
    capability,
    action,
    key: `${domain}.${capability}.${action}`,
    description,
    permissions,
    events,
    tags,
    transactional: optionalBoolean(input.transactional, false),
    audiservice_unit: optionalBoolean(input.audiservice_unit, false),
    aiEnabled: optionalBoolean(input.aiEnabled, false),
  };

  return freeze(manifest);
}
