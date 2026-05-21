import {
  getCurrentUser,
} from "@/lib/auth/getCurrentUser";

import {
  getTenantId,
} from "@/lib/shared/tenant/getTenantId";

export async function requireTenantAccess() {

  const user =
    await getCurrentUser();

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
