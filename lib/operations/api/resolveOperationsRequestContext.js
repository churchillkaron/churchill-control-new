import { resolveBusinessContext } from "@/lib/business-context/resolveBusinessContext";
import {
  authorizeOperationsAccess,
  OPERATIONS_ACTIONS,
} from "@/lib/operations/security/OperationsAuthorizationPolicy";

function value(source, camel, snake) {
  return source?.[camel] || source?.[snake] || null;
}

export async function resolveOperationsRequestContext({
  request,
  input = {},
  capabilityId = null,
  action = OPERATIONS_ACTIONS.VIEW,
  command = null,
  authorize = true,
}) {
  const resolved = await resolveBusinessContext({
    organizationId: value(input, "organizationId", "organization_id"),
    entityId: value(input, "entityId", "entity_id"),
    periodId: value(input, "periodId", "period_id"),
    request,
  });

  if (!resolved.success) {
    return resolved;
  }

  const authorization = authorizeOperationsAccess({
    permissions: resolved.permissions || [],
    capabilityId,
    action,
    command,
  });

  if (authorize && !authorization.allowed) {
    return {
      success: false,
      status: 403,
      error: "Operations permission required",
      authorization,
      required_permissions: authorization.required_permissions,
    };
  }

  return {
    success: true,
    access: resolved.access,
    user: resolved.user,
    authorization,
    context: {
      organization_id: resolved.organizationId,
      entity_id: resolved.entityId,
      period_id: resolved.periodId,
      country: resolved.country,
      currency: resolved.currency,
      locale: resolved.locale,
      timezone: resolved.timezone,
      permissions: resolved.permissions || [],
      role: resolved.role || null,
      actor_id: resolved.user?.id || null,
    },
  };
}

export function searchParamsToObject(searchParams) {
  return Object.fromEntries(searchParams.entries());
}

export default resolveOperationsRequestContext;
