import {
  resolveOrganizationAccess,
} from "@/lib/platform/governance/resolveOrganizationAccess";

import {
  getOrganizationIndustries,
} from "@/lib/platform/industries/getOrganizationIndustries";

export async function buildOrganizationRuntime({

  organization,

  access,

  organizationTree,

  modules,

}) {

  if (!organization) {

    return {
      success: false,
      error: "Missing organization",
    };

  }

  // =====================================
  // ORGANIZATION ACCESS
  // =====================================

  const resolved =
    await resolveOrganizationAccess({

      memberships:
        access.memberships,

      isSuperAdmin:
        access.isSuperAdmin,

      tenantId:
        access.tenantId,

    });

  if (!resolved.success) {
    return resolved;
  }

  // =====================================
  // INDUSTRY GOVERNANCE
  // =====================================

  const industryRuntime =
    await getOrganizationIndustries({

      organizationId:
        organization.id,

    });

  if (!industryRuntime.success) {
    return industryRuntime;
  }

  // =====================================
  // VISIBLE ORGANIZATIONS
  // =====================================

  const visibleOrganizations =

    resolved.organizations.filter(
      item => {

        // SELF

        if (
          item.id ===
          organization.id
        ) {
          return true;
        }

        // CHILDREN

        if (
          item.parent_organization_id ===
          organization.id
        ) {
          return true;
        }

        // ACCOUNTING SCOPE

        if (
          organization.organization_type ===
          "accounting_firm"
        ) {

          return (
            item.parent_organization_id ===
            organization.parent_organization_id
          );

        }

        return false;

      }
    );

  // =====================================
  // INDUSTRY DASHBOARDS
  // =====================================

  const dashboards =

    industryRuntime.runtimes.flatMap(
      runtime =>
        runtime.dashboards || []
    );

  // =====================================
  // INDUSTRY MODULES
  // =====================================

  const industryModules =

    industryRuntime.runtimes.flatMap(
      runtime =>
        runtime.modules || []
    );

  return {

    success: true,

    activeOrganization:
      organization,

    visibleOrganizations,

    organizationTree,

    modules,

    dashboards,

    industries:
      industryRuntime.industries,

    industryRuntimes:
      industryRuntime.runtimes,

    industryModules,

    organizationType:
      organization.organization_type,

    tenantId:
      organization.tenant_id,

  };

}
