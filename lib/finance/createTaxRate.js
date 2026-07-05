import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function createTaxRate(data) {
  const { data: tax, error } = await supabaseAdmin
    .from("tax_rates")
    .insert(data)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return tax;
}
