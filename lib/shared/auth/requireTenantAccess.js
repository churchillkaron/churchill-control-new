import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

export async function requireTenantAccess({
  organizationId,
} = {}) {

  if (!organizationId) {
    throw new Error(
      "organizationId required"
    );
  }

  const access =
    await requireOrganizationAccess({
      organizationId,
    });

  if (!access.success) {
    throw new Error(
      access.error ||
      "Tenant access denied"
    );
  }

  return {
    user:
      access.user,
    tenantId:
      access.tenantId,
    organization:
      access.organization,
    role:
      access.role,
  };

}
