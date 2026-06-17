import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { createApprovalLog } from "@/lib/shared/approvals/createApprovalLog";

export async function rejectApprovalRequest({
  workflowRequestId,
  actedBy,
  reason,
}) {
  const { data: request, error: requestError } =
    await supabaseAdmin
      .from("approval_requests")
      .select("*")
      .eq("id", workflowRequestId)
      .single();

  if (requestError) throw requestError;
  if (!request) throw new Error("Approval request not found");

  const { error: updateError } =
    await supabaseAdmin
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
    tenantId: request.tenant_id,
    entityType: request.reference_table,
    entityId: request.reference_id,
    fromStatus: request.status,
    toStatus: "rejected",
    actedBy: actedBy.id,
    role: actedBy.role,
    notes: reason || null,
  });

  return {
    success: true,
    workflowRequestId,
    status: "rejected",
  };
}
