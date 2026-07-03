import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { createApprovalLog } from "@/lib/shared/approvals/createApprovalLog";

const ROLE_HIERARCHY = {
  staff: 0,
  manager: 1,
  owner: 2,
  SUPER_ADMIN: 3,
};

export async function executeApproval({
  organizationId,
  workflowRequestId,
  actedBy,
  notes,
}) {
  const { data: request, error } = await supabaseAdmin
    .from("approval_requests")
    .select("*")
    .eq("id", workflowRequestId)
    .single();

  if (error) throw error;
  if (!request) throw new Error("Approval request not found");

  const { data: workflow, error: workflowError } = await supabaseAdmin
    .from("approval_workflows")
    .select("*")
    .eq("id", request.workflow_id)
    .eq("active", true)
    .single();

  if (workflowError) throw workflowError;
  if (!workflow) throw new Error("Workflow not found");

  const steps = workflow.approval_steps || [];
  const currentStepIndex = request.current_step || 0;
  const currentStep = steps[currentStepIndex];

  if (!currentStep) {
    throw new Error("Invalid step");
  }

  if (
    (ROLE_HIERARCHY[actedBy.role] || 0) <
    (ROLE_HIERARCHY[currentStep.role] || 0)
  ) {
    throw new Error("Insufficient role");
  }

  const prevStatus = request.status;
  let nextIndex = currentStepIndex + 1;

  let nextStatus =
    nextIndex < steps.length
      ? steps[nextIndex].status || "pending"
      : "approved";

  const { error: updateError } = await supabaseAdmin
    .from("approval_requests")
    .update({
      status: nextStatus,
      current_step: nextIndex,
      approved_by: actedBy.id,
      approved_at: new Date().toISOString(),
    })
    .eq("id", workflowRequestId);

  if (updateError) throw updateError;

  await createApprovalLog({
    organizationId,
    entityType: request.reference_table,
    entityId: request.reference_id,
    fromStatus: prevStatus,
    toStatus: nextStatus,
    actedBy: actedBy.id,
    role: actedBy.role,
    notes,
  });

  return {
    success: true,
    workflowRequestId,
    status: nextStatus,
  };
}
