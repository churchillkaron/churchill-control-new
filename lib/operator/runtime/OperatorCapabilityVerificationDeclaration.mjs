const FORBIDDEN_PATH_SEGMENTS = new Set(["__proto__", "prototype", "constructor"]);
const MAX_BINDINGS = 8;
const MAX_PATHS_PER_BINDING = 8;
const MAX_PATH_DEPTH = 8;
const MAX_PATH_LENGTH = 240;

function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function schemaPropertyKeys(schema = {}) {
  return Object.keys(plainObject(schema).properties || {});
}

function safeKey(value) {
  const key = String(value ?? "").trim();
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(key) ? key : null;
}

export function safeVerificationPath(value) {
  const path = String(value ?? "").trim();
  if (!path || path.length > MAX_PATH_LENGTH) return null;
  const parts = path.split(".");
  if (parts.length > MAX_PATH_DEPTH || parts.some((part) => !safeKey(part) || FORBIDDEN_PATH_SEGMENTS.has(part))) return null;
  return parts.join(".");
}

function verifierFor(item, catalog, capabilityKey) {
  const verifier = catalog.find((candidate) => candidate.key === capabilityKey);
  if (!verifier || verifier.mode !== "read" || verifier.operator_enabled === false) return null;
  if (item.context_scope !== verifier.context_scope) return null;
  return verifier;
}
function normalizePaths(value) {
  const source = Array.isArray(value) ? value : [value];
  const paths = [...new Set(source.map(safeVerificationPath).filter(Boolean))];
  return paths.length && paths.length <= MAX_PATHS_PER_BINDING ? paths : null;
}

export function normalizeOperatorVerificationDeclaration(raw, item, catalog = []) {
  const declaration = plainObject(raw);
  const capabilityKey = String(declaration.capability_key ?? "").trim();
  const verifier = verifierFor(item, catalog, capabilityKey);
  if (!verifier) return null;
  const verifierKeys = new Set(schemaPropertyKeys(verifier.input_schema));
  const normalized = { capability_key: capabilityKey };
  let count = 0;

  const payloadKeys = Array.isArray(declaration.payload_keys) ? [...new Set(declaration.payload_keys.map(safeKey).filter(Boolean))] : [];
  if (payloadKeys.length) {
    if (payloadKeys.length > MAX_BINDINGS || payloadKeys.some((key) => !verifierKeys.has(key))) return null;
    normalized.payload_keys = payloadKeys;
    count += payloadKeys.length;
  }

  for (const field of ["payload_from_result", "payload_from_input"]) {
    const entries = Object.entries(plainObject(declaration[field]));
    if (!entries.length) continue;
    if (count + entries.length > MAX_BINDINGS) return null;
    const out = {};
    for (const [rawKey, value] of entries) {
      const key = safeKey(rawKey);
      if (!key || !verifierKeys.has(key)) return null;
      if (field === "payload_from_result") {
        const paths = normalizePaths(value);
        if (!paths) return null;
        out[key] = paths;
      } else {
        const sourceKey = safeKey(value);
        if (!sourceKey || !schemaPropertyKeys(item.input_schema).includes(sourceKey)) return null;
        out[key] = sourceKey;
      }
    }
    normalized[field] = out;
    count += entries.length;
  }
  const arrayEntries = Object.entries(plainObject(declaration.payload_array_from_result));
  if (arrayEntries.length) {
    if (count + arrayEntries.length > MAX_BINDINGS) return null;
    const out = {};
    for (const [rawKey, rawConfig] of arrayEntries) {
      const key = safeKey(rawKey);
      const config = plainObject(rawConfig);
      const path = safeVerificationPath(config.path);
      const itemPath = config.item_path === undefined ? null : safeVerificationPath(config.item_path);
      if (!key || !verifierKeys.has(key) || !path || (config.item_path !== undefined && !itemPath)) return null;
      out[key] = { path, ...(itemPath ? { item_path: itemPath } : {}), ...(config.allow_empty === true ? { allow_empty: true } : {}) };
    }
    normalized.payload_array_from_result = out;
    count += arrayEntries.length;
  }

  if (!count) return null;
  if (declaration.derivation) normalized.derivation = String(declaration.derivation).trim().slice(0, 160);
  return normalized;
}

export function inferredVerificationDeclaration(item, catalog = []) {
  if (!item || item.mode === "read") return null;
  const verifier = catalog.find((candidate) =>
    candidate.domain === item.domain && candidate.capability === item.capability && candidate.action === "read" && candidate.mode === "read"
  );
  if (!verifier || item.context_scope !== verifier.context_scope) return null;
  const writeKeys = new Set(schemaPropertyKeys(item.input_schema));
  const readKeys = schemaPropertyKeys(verifier.input_schema);
  const stableReadKeys = readKeys.filter((key) => /_id$/.test(key) || /_key$/.test(key) || /_reference$/.test(key) || key === "id");
  const locatorKeys = stableReadKeys.filter((key) => writeKeys.has(key));
  if (locatorKeys.length) return { capability_key: verifier.key, payload_keys: locatorKeys.slice(0, MAX_BINDINGS), derivation: "same_capability_registered_read_shared_locator" };
  const requiredReadKeys = Array.isArray(verifier.input_schema?.required) ? verifier.input_schema.required.filter((key) => stableReadKeys.includes(key)) : [];
  if (requiredReadKeys.length !== 1) return null;
  const resultKey = requiredReadKeys[0];
  return { capability_key: verifier.key, payload_from_result: { [resultKey]: [resultKey] }, derivation: "same_capability_registered_read_result_locator" };
}
