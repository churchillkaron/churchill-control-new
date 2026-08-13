export function toOperationsContext(context = {}, payload = {}) {
  const organizationId =
    context.organizationId ||
    context.organization?.id ||
    payload.organizationId ||
    payload.organization_id ||
    null;

  if (!organizationId) {
    throw new Error("OPERATIONS_ORGANIZATION_REQUIRED");
  }

  const entityId =
    context.entityId ||
    payload.entityId ||
    payload.entity_id ||
    null;

  return {
    organization_id: organizationId,
    entity_id: entityId,
    permissions: Array.isArray(context.permissions) ? context.permissions : [],
    user_id: context.actor?.id || context.actor?.user_id || null,
  };
}

export function unwrapOperationsResponse(response) {
  if (response?.status && response.status >= 400) {
    const error = new Error(
      response.body?.error || "Operations request failed",
    );
    error.status = response.status;
    throw error;
  }

  return response?.body ?? null;
}

export default toOperationsContext;
