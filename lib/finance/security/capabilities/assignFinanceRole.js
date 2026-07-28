import { assignFinanceRoleRecord } from "@/lib/finance/security/repositories/FinancePermissionRepository";

export async function assignFinanceRole({
  organizationId,
  userId,
  roleId,
  assignedBy = "system",
}) {
  return await assignFinanceRoleRecord({
    organizationId,
    userId,
    roleId,
    assignedBy,
  });
}
