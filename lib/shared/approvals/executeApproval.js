const ROLE_HIERARCHY = {
  staff: 0,
  manager: 1,
  owner: 2,
  SUPER_ADMIN: 3
};

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { createApprovalLog } from "@/lib/shared/approvals/createApprovalLog";

// Executes a single approval step using the real database workflow engine
export async function executeApproval({
  tenantId,
  workflowRequestId,
  actedBy,
  notes,
}) {

  console.log(
    "EXECUTE_APPROVAL_INPUT",
    JSON.stringify(
      {
        tenantId,
        workflowRequestId,
        actedBy,
        notes,
      },
      null,
      2
    )
  );

  // 1. Load the approval request
  const { data: request, error: requestError } = await supabaseAdmin
    .from("approval_requests")
    .select("*")
    .eq("id", workflowRequestId)
    .single();

  if (requestError) throw requestError;
  if (!request) throw new Error("Approval request not found");

  // 2. Load the workflow definition
  const { data: workflow, error: workflowError } = await supabaseAdmin
    .from("approval_workflows")
    .select("id, workflow_type, approval_steps, active")
    .eq("id", request.workflow_id)
    .eq("active", true)
    .single();

  if (workflowError) throw workflowError;
  if (!workflow) throw new Error("Active workflow not found");

  const steps = workflow.approval_steps || [];
  const currentStepIndex = request.current_step || 0;
  const currentStep = steps[currentStepIndex];

  if (!currentStep) {
    throw new Error("No current approval step defined");
  }

  // 3. Validate that the acting role matches the step
  if ((ROLE_HIERARCHY[actedBy.role] || 0) < (ROLE_HIERARCHY[currentStep.role] || 0)) {
    throw new Error(
      `Role ${actedBy.role} cannot approve this step; required role: ${currentStep.role}`
    );
  }

  const previousStatus = request.status;
  let nextStepIndex = currentStepIndex + 1;
  let nextStatus = request.status;

  // 4. Determine next status
  if (nextStepIndex < steps.length) {
    nextStatus = steps[nextStepIndex].status || "pending";
  } else {
    nextStatus = "approved";
    nextStepIndex = steps.length;
  }

  // 5. Update the approval request
  const { error: updateError } = await supabaseAdmin
    .from("approval_requests")
    .update({
      status: nextStatus,
      current_step: nextStepIndex,
      approved_by: actedBy.id,
      approved_at: new Date().toISOString(),
    })
    .eq("id", workflowRequestId);

  if (updateError) throw updateError;

  // 6. Create approval log
  await createApprovalLog({
    tenantId: request.tenant_id || request.tenantId,
    entityType: request.reference_table,
    entityId: request.reference_id,
    fromStatus: previousStatus,
    toStatus: nextStatus,
    actedBy: actedBy.id,
    role: actedBy.role,
    notes: notes || null,
  });

  return {
    success: true,
    workflowRequestId: request.id,
    previous_status: previousStatus,
    next_status: nextStatus,
    current_step: nextStepIndex,
  };
}
