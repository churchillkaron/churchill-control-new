import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabase } from "@/lib/supabase";

export async function runPeriodClose({
  tenantId,
  accountingPeriodId,
  notes,
}) {
  const { data, error } = await supabase
    .from("period_closing_logs")
    .insert({
      tenant_id: tenantId,
      accounting_period_id: accountingPeriodId,
      notes,
      closing_status: "completed",
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}
