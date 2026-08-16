"use client";

import { useBusinessContext } from "@/app/providers/BusinessContextProvider";

function resolveId(value, fallback = null) {
  if (!value) return fallback;
  if (typeof value === "string") return value;
  return value.id || value.entity_id || fallback;
}

export function useOrganizationRuntime() {
  const context = useBusinessContext();
  const entity = context?.entity || null;

  return {
    ready: context?.ready || false,
    loading: context?.loading || false,
    organization: context?.organization || null,
    organizations:
      context?.organizations ||
      (context?.organization ? [context.organization] : []),
    navigation: context?.navigation || {
      domains: [],
      solutions: [],
      tree: [],
    },
    role: context?.role || null,
    staff: context?.staff || null,
    user: context?.user || null,
    entity,
    entities:
      context?.entities ||
      (entity ? [entity] : []),
    entityId: resolveId(entity, context?.entity_id || null),
    legalEntityId: resolveId(entity, context?.entity_id || null),
    period: context?.period || null,
    periodId: resolveId(context?.period, context?.period_id || null),
    modules: context?.modules || [],
    permissions: context?.permissions || [],
    runtime: context || null,
  };
}
