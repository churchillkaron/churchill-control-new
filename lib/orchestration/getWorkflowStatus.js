import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function getWorkflowStatus({
  organizationId,
  executionId,
}) {
  if (!organizationId) {
    throw new Error("organizationId required");
  }

  if (!executionId) {
    throw new Error("executionId required");
  }

  const { data, error } = await supabaseAdmin
    .from("enterprise_workflow_runs")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("id", executionId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error("Workflow execution not found");
  }

  return data;
}
