export function requireBusinessContext(input = {}) {
  const context =
    input.businessContext ||
    input.context ||
    input;

  const organization_id =
    context.organization_id ||
    context.organizationId ||
    context.organization?.id ||
    null;

  const entity_id =
    context.entity_id ||
    context.entityId ||
    context.entity?.id ||
    null;

  const period_id =
    context.period_id ||
    context.periodId ||
    context.period?.id ||
    null;

  if (!organization_id) {
    throw new Error(
      "BusinessContext: organization_id required"
    );
  }

  return {
    ...context,
    organization_id,
    entity_id,
    period_id,
    country:
      context.country ||
      context.organization?.country ||
      context.entity?.country ||
      null,
    currency:
      context.currency ||
      context.organization?.default_currency ||
      context.entity?.currency ||
      null,
    permissions:
      context.permissions || [],
  };
}
