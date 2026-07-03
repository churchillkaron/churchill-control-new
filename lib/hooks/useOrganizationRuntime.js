"use client";

import { useBusinessContext } from "@/app/providers/BusinessContextProvider";

export function useOrganizationRuntime() {
  const context = useBusinessContext();

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
    entity: context?.entity || null,
    period: context?.period || null,
    modules: context?.modules || [],
    permissions: context?.permissions || [],
    runtime: context || null,
  };
}
