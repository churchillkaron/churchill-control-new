"use client";

import { useMemo } from "react";
import { useOrganization } from "@/app/providers/OrganizationProvider";

export function useActiveOrganization() {
  const context = useOrganization();

  const organization = context?.organization || null;

  return useMemo(() => {
    if (!organization) {
      return {
        activeOrganization: null,
        organizationId: null,
        tenantId: null,
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
      activeOrganization: organization,
      organizationId: organization.id || null,
      tenantId: organization.tenant_id || organization.tenantId || null,
      organizationType:
        organization.organizationType ||
        organization.organization_type ||
        null,

      industries: organization.industries || [],
      dashboards: organization.dashboards || [],
      modules: organization.modules || [],
      visibleOrganizations: organization.visibleOrganizations || [],
      permissions: organization.permissions || [],
      industryRuntimes: organization.industryRuntimes || [],
    };
  }, [organization]);
}
