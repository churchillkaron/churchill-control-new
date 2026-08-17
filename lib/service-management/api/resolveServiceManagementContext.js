import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

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

  return {
    success: true,
    access,
    context: {
      organization_id: access.organizationId,
      entity_id: value(input, "entityId", "entity_id"),
      period_id: value(input, "periodId", "period_id"),
      actor_id: access.user?.id || null,
      permissions: access.permissions || [],
      role: access.role || null,
    },
  };
}

export function searchParamsToServiceInput(searchParams) {
  return Object.fromEntries(searchParams.entries());
}

export default resolveServiceManagementContext;
