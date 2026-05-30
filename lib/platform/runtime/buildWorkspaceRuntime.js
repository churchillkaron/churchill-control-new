import {
  buildAccessRuntime,
} from "./buildAccessRuntime";

import {
  buildOrganizationTree,
} from "./buildOrganizationTree";

import {
  buildModuleRuntime,
} from "./buildModuleRuntime";

import {
  buildNavigationRuntime,
} from "./buildNavigationRuntime";

import {
  resolveOrganizationAccess,
} from "@/lib/platform/governance/resolveOrganizationAccess";

import {
  buildOrganizationRuntime,
} from "@/lib/platform/runtime/buildOrganizationRuntime";

export async function buildWorkspaceRuntime({
  userEmail,
  organizationId,
}) {

  const access =
    await buildAccessRuntime({
      userEmail,
    });

  if (!access.success) {
    return access;
  }

  const resolvedOrganizations =
    await resolveOrganizationAccess({

      memberships:
        access.memberships,

      isSuperAdmin:
        access.isSuperAdmin,

      tenantId:
        access.tenantId,

    });

  if (!resolvedOrganizations.success) {
    return resolvedOrganizations;
  }

  const organizationIds =

    resolvedOrganizations
      .organizations
      .map(
        item => item.id
      );

  const organizationTree =
    await buildOrganizationTree({

      organizationIds,

    });

  const preferredOrganizationId =
    organizationId ||
    access.activeOrganizationId;

  const activeOrganization =

    preferredOrganizationId

      ? (
          organizationTree.organizations.find(
            item =>
              item.id ===
              preferredOrganizationId
          ) ||

          resolvedOrganizations.organizations.find(
            item =>
              item.id ===
              preferredOrganizationId
          ) ||

          null
        )

      : (
          organizationTree.organizations[0] ||
          resolvedOrganizations.organizations[0] ||
          null
        );

  const navigation =
    await buildNavigationRuntime({

      organization:
        activeOrganization,

      activeTenantId:
        access.tenantId,

      role:
        access.role,

    });

  const organizationRuntimes =
    await Promise.all(

      organizationTree.organizations.map(
        async organization => {

          return await buildOrganizationRuntime({

            organization,

            access,

            organizationTree:
              organizationTree.tree,

            modules:
              (
                await buildModuleRuntime({

                  tenantId:
                    organization.tenant_id,

                  organizationId:
                    organization.id,

                })
              ).modules,

          });

        }
      )

    );

  return {

    success: true,

    access,

    organizations:
      organizationTree.organizations,

    organizationTree:
      organizationTree.tree,

    activeOrganization,

    modules:
      activeOrganization
        ? (
            await buildModuleRuntime({

              tenantId:
                activeOrganization.tenant_id,

              organizationId:
                activeOrganization.id,

            })
          ).modules
        : [],

    navigation:
      navigation.navigation,

    organizationRuntimes,

  };

}
