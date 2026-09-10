import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function callerOrigin(request) {
  if (!request?.url) return null;
  try {
    return new URL(request.url).origin;
  } catch {
    return null;
  }
}

function callerCookie(request) {
  try {
    return request?.headers?.get?.("cookie") || null;
  } catch {
    return null;
  }
}

function inputValue(payload, key) {
  const value = payload?.[key];
  if (value === undefined || value === null || value === "") return null;
  if (["string", "number", "boolean"].includes(typeof value)) return String(value);
  return null;
}

export function createOperatorAuthenticatedRouteReadCapability({
  domain,
  capability,
  action = "read",
  description,
  endpoint,
  permissions = [],
  tags = [],
  contextScope = "organization",
  inputSchema = { type: "object", properties: {}, additionalProperties: false },
  queryFields = [],
}) {
  const manifest = defineCapability({
    domain,
    capability,
    action,
    description,
    permissions,
    events: [],
    tags: [...tags, "read"],
    transactional: false,
    aiEnabled: false,
    operatorEnabled: true,
    operatorMode: "read",
    operatorAutoExecute: true,
    operatorRequiresConfirmation: false,
    risk: "low",
    contextScope,
    inputSchema,
  });

  async function execute({ context, payload = {} }) {
    const request = context?.callerRequest;
    const organizationId = text(context?.organizationId, 160);
    const origin = callerOrigin(request);
    if (!request || !origin || !organizationId) {
      throw new Error("OPERATOR_AUTHENTICATED_ROUTE_READ_CONTEXT_REQUIRED");
    }

    const url = new URL(endpoint, origin);
    url.searchParams.set("organizationId", organizationId);
    if (context?.entityId) url.searchParams.set("entityId", text(context.entityId, 160));
    if (context?.periodId) url.searchParams.set("periodId", text(context.periodId, 160));

    for (const key of queryFields) {
      const value = inputValue(payload, key);
      if (value !== null) url.searchParams.set(key, value);
    }

    const cookie = callerCookie(request);
    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      headers: { Accept: "application/json", ...(cookie ? { cookie } : {}) },
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || body?.success === false) {
      const error = new Error(body?.error || `${domain}.${capability}.${action} read failed`);
      error.status = response.status;
      throw error;
    }
    return body;
  }

  return { manifest, execute };
}

export default createOperatorAuthenticatedRouteReadCapability;
