import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { resolveStaffPortalEffectivePermissions } from "@/lib/people/portal/StaffPortalPermissionRuntime";
import {
  assertServiceManagementAccess,
  serviceManagementModeForRequest,
} from "@/lib/service-management/api/ServiceManagementAccessPolicy";

function value(source, camel, snake) {
  return source?.[camel] || source?.[snake] || null;
}

export async function resolveServiceManagementContext({ request, input = {} }) {
  const organizationId = value(input, "organizationId", "organization_id");
  const access = await requireOrganizationAccess({
    organizationId,
    request,
  });

  if (!access.success) return access;

  const effective = await resolveStaffPortalEffectivePermissions({
    organizationId: access.organizationId,
    userId: access.user?.id || access.userId || null,
    role: access.role || access.staff?.role || null,
    basePermissions: access.permissions || [],
  });
  const effectiveAccess = {
    ...access,
    permissions: effective.permissions,
    access: {
      ...(access.access || {}),
      permissions: effective.permissions,
    },
  };
  const accessMode = serviceManagementModeForRequest(request);
  assertServiceManagementAccess({ access: effectiveAccess, mode: accessMode });

  return {
    success: true,
    access: effectiveAccess,
    accessMode,
    permissionSources: effective.sources,
    context: {
      organization_id: access.organizationId,
      entity_id: value(input, "entityId", "entity_id"),
      period_id: value(input, "periodId", "period_id"),
      actor_id: access.user?.id || null,
      staff_id: access.staff?.id || null,
      permissions: effective.permissions,
      role: access.role || null,
    },
  };
}

export function searchParamsToServiceInput(searchParams) {
  return Object.fromEntries(searchParams.entries());
}

export default resolveServiceManagementContext;
