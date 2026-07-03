import { assignFinanceRoleRecord } from "@/lib/finance/security/repositories/FinancePermissionRepository";

export async function assignFinanceRole({
  userId,
  roleId,
  permissionId = null,
  assignedBy = "system",
}) {
  return await assignFinanceRoleRecord({
    userId,
    roleId,
    permissionId,
    assignedBy,
  });
}
