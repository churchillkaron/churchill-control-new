import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabase } from "@/lib/supabase";

export async function createTaxRate(data) {
  const { data: tax, error } = await supabase
    .from("tax_rates")
    .insert(data)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return tax;
}
