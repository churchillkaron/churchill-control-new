import {
  supabaseAdmin,
} from "@/lib/shared/supabase/admin";

export async function createApprovalRequest({
  organizationId,
  workflowType,
  referenceTable,
  referenceId,
  requestedBy = null,
}) {
  if (!organizationId) {
    throw new Error("organizationId required");
  }

  if (!workflowType) {
    throw new Error("workflowType required");
  }

  if (!referenceTable) {
    throw new Error("referenceTable required");
  }

  if (!referenceId) {
    throw new Error("referenceId required");
  }

  const {
    data: workflow,
    error: workflowError,
  } = await supabaseAdmin
    .from("approval_workflows")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("workflow_type", workflowType)
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (workflowError) {
    throw workflowError;
  }

  if (!workflow) {
    const error = new Error(
      `No active approval workflow configured for ${workflowType}`
    );
    error.status = 409;
    throw error;
  }

  const {
    data,
    error,
  } = await supabaseAdmin
    .from("approval_requests")
    .insert({
      organization_id: organizationId,
      workflow_id: workflow.id,
      reference_table: referenceTable,
      reference_id: referenceId,
      current_step: 0,
      status: "pending",
      requested_by: requestedBy,
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}
