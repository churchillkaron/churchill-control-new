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
  // The originating HTTP request, when a capability needs to call an internal
  // API on the caller's behalf. Carried so those calls run with the user's own
  // session and existing authorization checks instead of elevated credentials.
  callerRequest = null,
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
    callerRequest,
    createdAt:
      now,
  };
}
