export function defineDocument(config) {
  const {
    type,
    domain,
    name,
    version = "1.0.0",
    lifecycle = [],
    defaultStatus,
    schema = {},
    events = {},
    relationships = {},
  } = config;

  if (!type) throw new Error("Document type required");
  if (!domain) throw new Error("Document domain required");
  if (!defaultStatus) throw new Error("Default status required");

  return {
    type,
    domain,
    name,
    version,
    lifecycle,
    defaultStatus,
    schema,
    events,
    relationships,
  };
}
