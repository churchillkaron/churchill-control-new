import { grantFinancePermissionRecord } from "@/lib/finance/security/repositories/FinancePermissionRepository";

export async function grantFinancePermission({
  roleId,
  permissionKey,
  grantedBy = "system",
}) {
  return await grantFinancePermissionRecord({
    roleId,
    permissionKey,
    grantedBy,
  });
}
