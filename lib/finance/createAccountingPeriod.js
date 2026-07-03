import {
  supabaseAdmin,
} from "@/lib/shared/supabase/admin";

export async function createAccountingPeriod(data) {
  const { data: period, error } =
    await supabaseAdmin
      .from("accounting_periods")
      .insert(data)
      .select()
      .single();

  if (error) {
    throw error;
  }

  return period;
}
