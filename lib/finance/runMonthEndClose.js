import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabase } from "@/lib/supabase";

export async function runMonthEndClose({
  organizationId,
}) {
  const { data, error } = await supabase
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
