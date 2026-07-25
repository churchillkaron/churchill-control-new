export function createExecutionContext({
  organizationId,
  entityId = null,
  periodId = null,
  country = null,
  actor = null,
  workspace = null,
  permissions = [],
  installedModules = [],
  featureFlags = {},
  locale = null,
  currency = null,
  timezone = null,
  requestId = null,
  correlationId = null,
  metadata = {},
}) {
  if (!organizationId) {
    throw new Error("organizationId required");
  }

  const now = new Date().toISOString();

  return {
    organizationId,
    organization: {
      id: organizationId,
    },
    entityId,
    periodId,
    country,
    actor,
    workspace,
    permissions:
      Array.isArray(permissions)
        ? permissions
        : [],
    installedModules:
      Array.isArray(installedModules)
        ? installedModules
        : [],
    featureFlags:
      featureFlags || {},
    locale,
    currency,
    timezone,
    requestId:
      requestId ||
      crypto.randomUUID(),
    correlationId:
      correlationId ||
      requestId ||
      crypto.randomUUID(),
    metadata:
      metadata || {},
    createdAt:
      now,
  };
}
