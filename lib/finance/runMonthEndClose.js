import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function runMonthEndClose({
  organizationId,
}) {
  const { data, error } = await supabaseAdmin
    .from("accounting_workflows")
    .insert({
      organization_id: organizationId,
      workflow_name: "Month End Close",
      workflow_type: "month_end_close",
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
