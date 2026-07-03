export function createERPContext(input = {}) {
  return {
    user: input.user || null,
    organization_id: input.organization_id || input.organizationId || null,
    entity_id: input.entity_id || input.entityId || null,
    period_id: input.period_id || input.periodId || null,
    country: input.country || null,
    currency: input.currency || null,
    permissions: input.permissions || [],
    workspace: input.workspace || null,
    route: input.route || [],
  };
}
