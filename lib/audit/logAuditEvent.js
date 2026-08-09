import { createAuditLog } from "@/lib/platform/audit/createAuditLog";

export default async function logAuditEvent(input = {}) {
  return createAuditLog({
    organizationId:
      input.organization_id ?? input.organizationId ?? null,
    entityType: input.entity_type ?? input.entityType ?? null,
    entityId: input.entity_id ?? input.entityId ?? null,
    actionType: input.action_type ?? input.actionType ?? null,
    performedBy: input.performed_by ?? input.performedBy ?? null,
    performedByName:
      input.performed_by_name ??
      input.performedByName ??
      "SYSTEM",
    oldData: input.old_data ?? input.oldData ?? null,
    newData: input.new_data ?? input.newData ?? null,
    metadata: input.metadata ?? {},
  });
}
