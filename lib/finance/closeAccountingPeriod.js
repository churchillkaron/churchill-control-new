import { supabase } from "@/lib/supabase";

export async function closeAccountingPeriod(periodId) {
  const { data, error } = await supabase
    .from("accounting_periods")
    .update({
      status: "closed",
      closed_at: new Date().toISOString(),
    })
    .eq("id", periodId)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}
