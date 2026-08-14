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

export async function listBudgets({
  organization_id,
  entity_id = null,
  period_id = null,
}) {
  if (!organization_id) throw new Error("organization_id required");

  let query = supabaseAdmin
    .from("finance_budgets")
    .select("*")
    .eq("organization_id", organization_id);

  if (entity_id) {
    query = query.eq("entity_id", entity_id);
  }

  if (period_id) {
    query = query.eq("period_id", period_id);
  }

  const { data, error } = await query.order("created_at", { ascending: false });

  if (error) throw error;

  return data || [];
}
