import { supabase } from "@/lib/supabase";

export async function getWorkflowStatus({
  tenantId,
  executionId,
}) {
  const { data, error } =
    await supabase
      .from(
        "orchestration_workflow_executions"
      )
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("id", executionId)
      .single();

  if (error) {
    throw error;
  }

  return data;
}
