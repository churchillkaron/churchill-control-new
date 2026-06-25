export function createExecutionContext({
  organizationId,
  actor = null,
  workspace = null,
  permissions = [],
  installedModules = [],
  featureFlags = {},
  locale = "en-US",
  currency = "THB",
  timezone = "Asia/Bangkok",
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
