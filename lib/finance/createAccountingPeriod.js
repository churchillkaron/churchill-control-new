import { supabase } from "@/lib/supabase";

export async function createAccountingPeriod(data) {
  const { data: period, error } = await supabase
    .from("accounting_periods")
    .insert(data)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return period;
}
