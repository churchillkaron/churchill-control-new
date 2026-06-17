import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabase } from "@/lib/supabase";

export async function runAutoPostingWorkflow({
  tenantId,
}) {
  const { data, error } = await supabase
    .from("accounting_workflows")
    .insert({
      tenant_id: tenantId,
      workflow_name: "Auto Journal Posting",
      workflow_type: "journal_automation",
      status: "completed",
      last_run_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}
