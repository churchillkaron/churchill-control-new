import { supabase } from "@/lib/supabase";

export async function runYearEndClose({
  tenantId,
}) {
  const { data, error } = await supabase
    .from("accounting_workflows")
    .insert({
      tenant_id: tenantId,
      workflow_name: "Year End Close",
      workflow_type: "year_end_close",
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
