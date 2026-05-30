import { supabase } from "@/lib/supabase";

export async function getWorkflowHistory({
  tenantId,
}) {
  const { data, error } =
    await supabase
      .from(
        "accounting_workflow_runs"
      )
      .select("*")
      .eq("tenant_id", tenantId)
      .order("started_at", {
        ascending: false,
      });

  if (error) {
    throw error;
  }

  return data;
}
