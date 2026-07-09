import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function createBudget(document) {
  const { data, error } = await supabaseAdmin
    .from("finance_budgets")
    .insert([document])
    .select()
    .single();

  if (error) throw error;

  return data;
}

export async function listBudgets({ organization_id }) {
  if (!organization_id) throw new Error("organization_id required");

  const { data, error } = await supabaseAdmin
    .from("finance_budgets")
    .select("*")
    .eq("organization_id", organization_id)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return data || [];
}
