import { assignFinanceRoleAssignmentRecord } from "@/lib/finance/security/repositories/FinanceRoleAssignmentRepository";

export async function assignFinanceRole({
  organizationId,
  userId,
  roleId,
  assignedBy = "system",
}) {
  return await assignFinanceRoleAssignmentRecord({
    organizationId,
    userId,
    roleId,
    assignedBy,
  });
}
