import { supabase } from "@/lib/supabase";

export async function executeWorkflow({
  tenantId,
  workflowId,
  executionReference,
}) {
  const workflow =
    await supabase
      .from(
        "orchestration_workflows"
      )
      .select("*")
      .eq("id", workflowId)
      .single();

  if (!workflow.data) {
    throw new Error(
      "Workflow not found"
    );
  }

  const execution =
    await supabase
      .from(
        "orchestration_workflow_executions"
      )
      .insert({
        tenant_id: tenantId,
        workflow_id:
          workflowId,
        execution_reference:
          executionReference,
      })
      .select()
      .single();

  const steps =
    workflow.data
      .workflow_definition
      ?.steps || [];

  const completed = [];

  for (const step of steps) {
    completed.push({
      step:
        step.name ||
        "unnamed",
      status: "completed",
    });
  }

  await supabase
    .from(
      "orchestration_workflow_executions"
    )
    .update({
      execution_status:
        "completed",
      execution_result: {
        completed,
      },
      completed_at:
        new Date().toISOString(),
    })
    .eq("id", execution.data.id);

  return {
    executionId:
      execution.data.id,
    completed,
  };
}
