import requireAuth from "./requireAuth";
import resolveTenant from "@/lib/tenant/resolveTenant";

export default async function requireTenantAccess(
  tenantId
) {

  const session =
    await requireAuth();

  if (
    !session?.authenticated
  ) {

    return {
      allowed: false,
      reason:
        "UNAUTHENTICATED",
    };
  }

  const tenant =
    await resolveTenant(
      session.user.id
    );

  if (
    !tenant.success
  ) {

    return {
      allowed: false,
      reason:
        "TENANT_LOOKUP_FAILED",
    };
  }

  const allowed =
    tenant.tenant_id ===
    tenantId;

  return {
    allowed,
    tenant_id:
      tenant.tenant_id,
    user:
      session.user,
  };
}
