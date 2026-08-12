import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { createApprovalLog } from "@/lib/shared/approvals/createApprovalLog";

const WORKFORCE_CLOCK_IN_EXCEPTION_REFERENCE = "workforce_clock_in_exception";

export async function rejectApprovalRequest({
  organizationId,
  workflowRequestId,
  actedBy,
  reason,
}) {
  if (!organizationId) {
    throw new Error("organizationId required");
  }

  const { data: request, error } = await supabaseAdmin
    .from("approval_requests")
    .select("*")
    .eq("id", workflowRequestId)
    .eq("organization_id", organizationId)
    .single();

  if (error) throw error;
  if (!request) throw new Error("Approval request not found");

  if (request.reference_table === WORKFORCE_CLOCK_IN_EXCEPTION_REFERENCE) {
    const dedicatedFlowError = new Error(
      "Workforce clock-in exceptions must be reviewed from Workforce Attendance"
    );
    dedicatedFlowError.status = 409;
    dedicatedFlowError.code = "WORKFORCE_CLOCK_IN_EXCEPTION_DEDICATED_REVIEW_REQUIRED";
    throw dedicatedFlowError;
  }

  const { error: updateError } = await supabaseAdmin
    .from("approval_requests")
    .update({
      status: "rejected",
      rejected_by: actedBy.id,
      rejected_at: new Date().toISOString(),
      rejection_reason: reason || null,
    })
    .eq("id", workflowRequestId)
    .eq("organization_id", organizationId);

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
