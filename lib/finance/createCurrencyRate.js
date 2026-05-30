import { supabase } from "@/lib/supabase";

export async function createCurrencyRate(data) {
  const { data: rate, error } = await supabase
    .from("currency_rates")
    .insert(data)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return rate;
}
