export function createBusinessDocument({
  id,
  organizationId,
  domain,
  boundedContext,
  documentType,
  status = "draft",
  payload = {},
  metadata = {},
}) {
  if (!organizationId) {
    throw new Error("organizationId required");
  }

  if (!domain) {
    throw new Error("domain required");
  }

  if (!documentType) {
    throw new Error("documentType required");
  }

  return {
    id:
      id ||
      crypto.randomUUID(),

    organizationId,
    domain,
    boundedContext,
    documentType,
    status,
    payload,
    metadata,

    version: 1,

    createdAt:
      new Date().toISOString(),

    updatedAt:
      new Date().toISOString(),
  };
}

export function transitionBusinessDocument({
  document,
  to,
}) {
  if (!document) {
    throw new Error("document required");
  }

  if (!to) {
    throw new Error("target status required");
  }

  return {
    ...document,
    status: to,
    version:
      Number(document.version || 1) + 1,
    updatedAt:
      new Date().toISOString(),
  };
}
