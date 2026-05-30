import {
  getServerCurrentUser,
} from "@/lib/auth/getServerCurrentUser";

import {
  getTenantId,
} from "@/lib/shared/tenant/getTenantId";

export async function requireTenantAccess() {

  const user =
    await getServerCurrentUser();

  if (!user) {

    throw new Error(
      "Unauthorized"
    );

  }

  const tenantId =
    await getTenantId();

  if (!tenantId) {

    throw new Error(
      "Tenant not found"
    );

  }

  if (
    user.role ===
    "SUPER_ADMIN"
  ) {

    return {

      user,
      tenantId,

    };

  }

  if (
    user.tenant_id !==
    tenantId
  ) {

    throw new Error(
      "Forbidden"
    );

  }

  return {

    user,
    tenantId,

  };

}
