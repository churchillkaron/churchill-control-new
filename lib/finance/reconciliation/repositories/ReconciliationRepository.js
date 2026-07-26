import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function listReconciliations({ organization_id, entity_id = null }) {
  if (!organization_id) {
    throw new Error("organization_id required");
  }

  let query = supabaseAdmin
    .from("finance_bank_reconciliation_runs")
    .select("*")
    .eq("organization_id", organization_id)
    .order("created_at", { ascending: false });

  if (entity_id) {
    query = query.eq("entity_id", entity_id);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return data || [];
}
