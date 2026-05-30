import { supabase } from "@/lib/supabase";

export async function registerWorkflow({
  tenantId,
  workflowName,
  workflowType,
  workflowDefinition,
}) {
  const { data, error } =
    await supabase
      .from(
        "orchestration_workflows"
      )
      .insert({
        tenant_id: tenantId,
        workflow_name:
          workflowName,
        workflow_type:
          workflowType,
        workflow_definition:
          workflowDefinition,
      })
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}
