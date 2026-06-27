import {
  DocumentTypeRegistry,
} from "../registry/DocumentTypeRegistry";

export function createDocument({
  type,
  organizationId,
  payload = {},
}) {

  const definition =
    DocumentTypeRegistry.get(type);

  if (!definition) {
    throw new Error(
      `Unknown document type: ${type}`
    );
  }

  return {
    id: crypto.randomUUID(),

    organizationId,

    domain:
      definition.domain,

    boundedContext:
      definition.context,

    documentType:
      definition.id,

    lifecycle:
      definition.lifecycle,

    status:
      definition.lifecycle.states[0],

    payload,

    version: 1,

    createdAt:
      new Date().toISOString(),

    updatedAt:
      new Date().toISOString(),
  };
}
