export function createDocument({
  definition,
  organizationId,
  data = {},
}) {
  if (!organizationId) {
    throw new Error("organizationId required");
  }

  const now = new Date().toISOString();

  return {
    documentType: definition.type,
    domain: definition.domain,
    version: definition.version,

    organizationId,

    status: definition.defaultStatus,

    createdAt: now,
    updatedAt: now,

    metadata: {},

    relationships: {},

    ...data,
  };
}
