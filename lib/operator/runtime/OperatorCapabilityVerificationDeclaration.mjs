function schemaPropertyKeys(schema = {}) {
  const properties = schema && typeof schema === "object" && !Array.isArray(schema) ? schema.properties : null;
  return properties && typeof properties === "object" && !Array.isArray(properties) ? Object.keys(properties) : [];
}

export function inferredVerificationDeclaration(item, catalog = []) {
  if (!item || item.mode === "read") return null;
  const verifier = catalog.find((candidate) =>
    candidate.domain === item.domain && candidate.capability === item.capability && candidate.action === "read" && candidate.mode === "read"
  );
  if (!verifier) return null;
  const writeKeys = new Set(schemaPropertyKeys(item.input_schema));
  const readKeys = schemaPropertyKeys(verifier.input_schema);
  const locatorKeys = readKeys.filter((key) =>
    writeKeys.has(key) && (/_id$/.test(key) || /_key$/.test(key) || /_reference$/.test(key) || key === "id")
  );
  if (!locatorKeys.length) return null;
  return {
    capability_key: verifier.key,
    payload_keys: locatorKeys.slice(0, 8),
    derivation: "same_capability_registered_read_shared_locator",
  };
}
