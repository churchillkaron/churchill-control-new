import {
  getOrganizationIndustries,
} from "@/lib/platform/industries/getOrganizationIndustries";

import {
  getWorkspaceDefinition,
} from "@/lib/platform/workspaces/getWorkspaceDefinition";

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

  const industryRuntime =
    await getOrganizationIndustries({

      organizationId:
        organization.id,

    });

  if (!industryRuntime.success) {
    return industryRuntime;
  }

  const dashboards =
    industryRuntime.runtimes.flatMap(
      runtime =>
        runtime.dashboards || []
    );

  const industryModules =
    industryRuntime.runtimes.flatMap(
      runtime =>
        runtime.modules || []
    );

  const workspaceDefinitions =
    industryRuntime.runtimes
      .map(runtime =>
        getWorkspaceDefinition(
          runtime.id
        )
      )
      .filter(Boolean);

  return {

    success: true,

    activeOrganization:
      organization,

    visibleOrganizations: [
      organization,
    ],

    organizationTree,

    modules,

    dashboards,

    industries:
      industryRuntime.industries,

    industryRuntimes:
      industryRuntime.runtimes,

    workspaceDefinitions,

    industryModules,

    organizationType:
      organization.organization_type,

    tenantId:
      organization.tenant_id,

  };

}
