import { supabaseAdmin }
from "@/lib/shared/supabase/admin";

export async function createApprovalLog({

  tenantId,

  entityType,

  entityId,

  fromStatus,

  toStatus,

  actedBy,

  role,

  notes,

}) {

  const payload = {

    tenant_id:
      tenantId,

    entity_type:
      entityType,

    entity_id:
      entityId,

    from_status:
      fromStatus,

    to_status:
      toStatus,

    acted_by:
      actedBy,

    role,

    notes:
      notes || null,

  };

  const {
    data,
    error,
  } = await supabaseAdmin

    .from(
      "approval_logs"
    )

    .insert(payload)

    .select()

    .single();

  if (error) {

    throw error;

  }

  return data;

}