import { resolveBusinessContext } from "@/lib/business-context/resolveBusinessContext";

function value(source, camel, snake) {
  return source?.[camel] || source?.[snake] || null;
}

export async function resolveOperationsRequestContext({
  request,
  input = {},
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

  return {
    success: true,
    access: resolved.access,
    user: resolved.user,
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
