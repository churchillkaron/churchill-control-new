import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function createBudget(document) {
  const { data, error } = await supabaseAdmin
    .from("finance_budgets")
    .insert([document])
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}
