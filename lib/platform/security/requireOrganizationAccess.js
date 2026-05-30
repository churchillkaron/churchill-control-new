import {
  getServerCurrentUser,
} from "@/lib/auth/getServerCurrentUser";

import {
  buildAccessRuntime,
} from "@/lib/platform/runtime/buildAccessRuntime";

import {
  resolveOrganizationAccess,
} from "@/lib/platform/governance/resolveOrganizationAccess";

export async function requireOrganizationAccess({

  organizationId,

}) {

  const user =
    await getServerCurrentUser();

  if (!user?.email) {

    return {
      success: false,
      status: 401,
      error: "Unauthorized",
    };

  }

  const access =
    await buildAccessRuntime({

      userEmail:
        user.email,

    });

  if (!access.success) {

    return {
      success: false,
      status: 403,
      error:
        access.error,
    };

  }

  const organizations =
    await resolveOrganizationAccess({

      memberships:
        access.memberships,

      isSuperAdmin:
        access.isSuperAdmin,

      tenantId:
        access.tenantId,

    });

  if (
    !organizations.success
  ) {

    return {
      success: false,
      status: 403,
      error:
        organizations.error,
    };

  }

  const organization =
    organizations.organizations.find(
      item =>
        item.id ===
        organizationId
    );

  if (!organization) {

    return {
      success: false,
      status: 403,
      error:
        "Organization access denied",
    };

  }

  return {

    success: true,

    user,

    organization,

    tenantId:
      organization.tenant_id,

    role:
      access.role,

    memberships:
      access.memberships,

  };

}
