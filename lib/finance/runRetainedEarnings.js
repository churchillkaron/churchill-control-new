import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabase } from "@/lib/supabase";

export async function runRetainedEarnings({
  tenantId,
  fiscalYear,
  netIncome,
}) {
  const { data, error } = await supabase
    .from("retained_earnings_entries")
    .insert({
      tenant_id: tenantId,
      fiscal_year: fiscalYear,
      net_income: netIncome,
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}
