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
  const stableReadKeys = readKeys.filter((key) =>
    /_id$/.test(key) || /_key$/.test(key) || /_reference$/.test(key) || key === "id"
  );
  const locatorKeys = stableReadKeys.filter((key) => writeKeys.has(key));
  if (locatorKeys.length) {
    return {
      capability_key: verifier.key,
      payload_keys: locatorKeys.slice(0, 8),
      derivation: "same_capability_registered_read_shared_locator",
    };
  }
  const requiredReadKeys = Array.isArray(verifier.input_schema?.required)
    ? verifier.input_schema.required.filter((key) => stableReadKeys.includes(key))
    : [];
  if (requiredReadKeys.length !== 1) return null;
  const resultKey = requiredReadKeys[0];
  return {
    capability_key: verifier.key,
    payload_from_result: { [resultKey]: [resultKey] },
    derivation: "same_capability_registered_read_result_locator",
  };
}
