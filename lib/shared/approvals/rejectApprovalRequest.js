import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { createApprovalLog } from "@/lib/shared/approvals/createApprovalLog";

export async function rejectApprovalRequest({
  organizationId,
  workflowRequestId,
  actedBy,
  reason,
}) {
  const { data: request, error } = await supabaseAdmin
    .from("approval_requests")
    .select("*")
    .eq("id", workflowRequestId)
    .single();

  if (error) throw error;

  const { error: updateError } = await supabaseAdmin
    .from("approval_requests")
    .update({
      status: "rejected",
      rejected_by: actedBy.id,
      rejected_at: new Date().toISOString(),
      rejection_reason: reason || null,
    })
    .eq("id", workflowRequestId);

  if (updateError) throw updateError;

  await createApprovalLog({
    organizationId,
    entityType: request.reference_table,
    entityId: request.reference_id,
    fromStatus: request.status,
    toStatus: "rejected",
    actedBy: actedBy.id,
    role: actedBy.role,
    notes: reason,
  });

  return {
    success: true,
    workflowRequestId,
    status: "rejected",
  };
}
