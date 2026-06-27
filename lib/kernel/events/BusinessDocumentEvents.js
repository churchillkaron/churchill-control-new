export function createBusinessDocumentEvent({
  organizationId,
  domain,
  boundedContext,
  documentType,
  documentId,
  eventType,
  payload = {},
  metadata = {},
}) {
  if (!organizationId) {
    throw new Error("organizationId required");
  }

  if (!eventType) {
    throw new Error("eventType required");
  }

  return {
    id:
      crypto.randomUUID(),

    organizationId,
    domain,
    boundedContext,
    documentType,
    documentId,
    eventType,
    payload,
    metadata,

    createdAt:
      new Date().toISOString(),
  };
}
