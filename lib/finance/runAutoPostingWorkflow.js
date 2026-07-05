import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function runAutoPostingWorkflow({
  organizationId,
}) {
  const { data, error } = await supabaseAdmin
    .from("accounting_workflows")
    .insert({
      organization_id: organizationId,
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
