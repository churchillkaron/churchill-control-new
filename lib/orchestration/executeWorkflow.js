import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function executeWorkflow({
  organizationId,
  workflowId,
  executionReference = null,
  inputPayload = {},
  triggerSource = "API",
}) {
  if (!organizationId) {
    throw new Error("organizationId required");
  }

  if (!workflowId) {
    throw new Error("workflowId required");
  }

  const { data: workflow, error: workflowError } = await supabaseAdmin
    .from("enterprise_workflows")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("id", workflowId)
    .eq("active", true)
    .maybeSingle();

  if (workflowError) {
    throw workflowError;
  }

  if (!workflow) {
    throw new Error("Workflow not found");
  }

  const payload = {
    ...(inputPayload && typeof inputPayload === "object" ? inputPayload : {}),
    ...(executionReference ? { execution_reference: executionReference } : {}),
  };

  const { data: run, error: runError } = await supabaseAdmin
    .from("enterprise_workflow_runs")
    .insert({
      organization_id: organizationId,
      enterprise_workflow_id: workflowId,
      run_status: "PENDING",
      trigger_source: triggerSource,
      input_payload: payload,
      started_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (runError) {
    throw runError;
  }

  return {
    executionId: run.id,
    status: run.run_status,
    workflowId,
    organizationId,
  };
}
