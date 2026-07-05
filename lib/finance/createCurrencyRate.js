import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function createCurrencyRate(data) {
  const { data: rate, error } = await supabaseAdmin
    .from("currency_rates")
    .insert(data)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return rate;
}
