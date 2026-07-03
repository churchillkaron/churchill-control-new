"use client";

import { useMemo } from "react";
import { useBusinessContext } from "@/app/providers/BusinessContextProvider";

export function useActiveOrganization() {
  const context = useBusinessContext();
  const organization = context?.organization || null;

  return useMemo(() => {
    if (!organization) {
      return {
        organization: null,
        organizationId: null,
        organizationType: null,
        industries: [],
        dashboards: [],
        modules: [],
        visibleOrganizations: [],
        permissions: [],
        industryRuntimes: [],
      };
    }

    return {
      organization,
      organizationId: organization.id || null,
      organizationType:
        organization.organizationType ||
        organization.organization_type ||
        null,
      industries:
        context?.industries ||
        organization.industries ||
        [],
      dashboards:
        context?.dashboards ||
        organization.dashboards ||
        [],
      modules:
        context?.modules ||
        organization.modules ||
        [],
      visibleOrganizations:
        context?.organizations ||
        organization.visibleOrganizations ||
        [organization],
      permissions:
        context?.permissions ||
        organization.permissions ||
        [],
      industryRuntimes:
        context?.industryRuntimes ||
        organization.industryRuntimes ||
        [],
    };
  }, [context, organization]);
}
