import { resolveBusinessContext } from "@/lib/business-context/resolveBusinessContext";
import {
  authorizeOperationsAccess,
  OPERATIONS_ACTIONS,
} from "@/lib/operations/security/OperationsAuthorizationPolicy";
import {
  resolveUserOperationsPermissions,
} from "@/lib/operations/security/OperationsPermissionRepository";

function value(source, camel, snake) {
  return source?.[camel] || source?.[snake] || null;
}

function unique(values) {
  return [...new Set((values || []).filter(Boolean))];
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

  const assignedPermissions = resolved.user?.id
    ? await resolveUserOperationsPermissions({
        organizationId: resolved.organizationId,
        userId: resolved.user.id,
      })
    : [];
  const permissions = unique([
    ...(resolved.permissions || []),
    ...assignedPermissions,
  ]);

  const authorization = authorizeOperationsAccess({
    permissions,
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
    assigned_operations_permissions: assignedPermissions,
    context: {
      organization_id: resolved.organizationId,
      entity_id: resolved.entityId,
      period_id: resolved.periodId,
      country: resolved.country,
      currency: resolved.currency,
      locale: resolved.locale,
      timezone: resolved.timezone,
      permissions,
      role: resolved.role || null,
      actor_id: resolved.user?.id || null,
    },
  };
}

export function searchParamsToObject(searchParams) {
  return Object.fromEntries(searchParams.entries());
}

export default resolveOperationsRequestContext;
