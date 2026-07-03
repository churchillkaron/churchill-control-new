import { supabaseAdmin } from "@/lib/shared/supabase/admin";

/**
 * APPROVAL LOGS - ORGANIZATION BASED
 */

export async function createApprovalLog({
  organizationId,
  entityType,
  entityId,
  fromStatus,
  toStatus,
  actedBy,
  role,
  notes,
}) {
  const payload = {
    organization_id: organizationId,
    entity_type: entityType,
    entity_id: entityId,
    from_status: fromStatus,
    to_status: toStatus,
    acted_by: actedBy,
    role,
    notes: notes || null,
  };

  const { data, error } = await supabaseAdmin
    .from("approval_logs")
    .insert(payload)
    .select()
    .single();

  if (error) throw error;

  return data;
}
