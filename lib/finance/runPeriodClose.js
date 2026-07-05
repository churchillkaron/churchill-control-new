import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function runPeriodClose({
  organizationId,
  accountingPeriodId,
  notes,
}) {
  const { data, error } = await supabaseAdmin
    .from("period_closing_logs")
    .insert({
      organization_id: organizationId,
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
