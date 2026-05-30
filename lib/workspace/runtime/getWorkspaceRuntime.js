import {
  getActiveOrganization,
} from "@/lib/workspace/getActiveOrganization";

import {
  getWorkspaceModules,
} from "./getWorkspaceModules";

export async function getWorkspaceRuntime({
  organizationId,
}) {

  const organization =

    await getActiveOrganization(
      organizationId
    );

  if (!organization) {

    return null;

  }

  const modules =

    await getWorkspaceModules({

      tenantId:
        organization.tenant_id,

      organizationId:
        organization.id,

      industry:
        organization.industry ||
        null,

    });

  return {

    organization,

    tenantId:
      organization.tenant_id,

    organizationId:
      organization.id,

    organizationType:
      organization.organization_type,

    industry:
      organization.industry ||
      null,

    modules,

  };

}
