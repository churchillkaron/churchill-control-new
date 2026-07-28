import { grantFinancePermissionRecord } from "@/lib/finance/security/repositories/FinancePermissionRepository";

export async function grantFinancePermission({
  organizationId,
  roleId,
  permissionKey,
  grantedBy = "system",
}) {
  if (!organizationId) {
    throw new Error("organizationId required");
  }

  return await grantFinancePermissionRecord({
    organizationId,
    roleId,
    permissionKey,
    grantedBy,
  });
}
