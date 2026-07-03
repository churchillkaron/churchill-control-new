export const CONNECTION_STATUS = {
  CONNECTED: "CONNECTED",
  DISCONNECTED: "DISCONNECTED",
  ERROR: "ERROR",
  PENDING: "PENDING",
};

export const AUTH_TYPES = {
  API_KEY: "API_KEY",
  OAUTH2: "OAUTH2",
  SERVICE_ACCOUNT: "SERVICE_ACCOUNT",
  TOKEN: "TOKEN",
  NONE: "NONE",
};

export function createIntegrationConnection(data = {}) {

  const now = new Date().toISOString();

  return {

    id:
      crypto.randomUUID(),

    organization_id:
      data.organization_id,

    category:
      data.category,

    provider:
      data.provider,

    display_name:
      data.display_name ||
      data.provider,

    enabled:
      data.enabled ?? true,

    status:
      data.status ||
      CONNECTION_STATUS.DISCONNECTED,

    authentication_type:
      data.authentication_type ||
      AUTH_TYPES.NONE,

    credentials:
      data.credentials || {},

    billing_mode:
      data.billing_mode ||
      "AVANTIQO",

    routing_policy:
      data.routing_policy ||
      "DEFAULT",

    health_status:
      "UNKNOWN",

    metadata:
      data.metadata || {},

    created_at:
      now,

    updated_at:
      now,

  };

}
